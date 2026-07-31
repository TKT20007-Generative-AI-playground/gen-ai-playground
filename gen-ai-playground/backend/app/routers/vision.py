"""Vision endpoints."""
import json
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import settings
from app.dependencies import get_current_user, get_admin_user, get_container_handler, validate_csrf_token
from app.models import UserInfo, VisionChatRequest, DeployModelRequest, DeploymentStatusResponse
from app.template_discovery import _deployment_name_from_filename, get_vision_template_configs, get_vision_template_map
from app.verda_service import verda_service
from app.container_handler import ContainerHandler

router = APIRouter(prefix="/vision", tags=["vision"])


def _inference_headers() -> dict[str, str]:
    token = settings.VERDA_INFERENCE_KEY or settings.VERDA_API_KEY
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def _vision_deployment_names() -> set[str]:
    return {
        _deployment_name_from_filename(template_name)
        for template_name in get_vision_template_map().keys()
    }


def _resolve_vision_template_name(model: str) -> str | None:
    """Resolve a display name or deployment name to a template filename."""
    model = model.strip()
    normalized_model = re.sub(r"[^a-z0-9]", "", model.lower())
    for template_name, display_name in get_vision_template_map().items():
        normalized_display_name = re.sub(r"[^a-z0-9]", "", display_name.lower())
        deployment_name = _deployment_name_from_filename(template_name)
        if display_name == model or template_name == model or deployment_name == model.lower():
            return template_name
        if normalized_display_name == normalized_model:
            return template_name
    return None


@router.get("/models")
def list_available_vision_models(current_user: UserInfo = Depends(get_current_user)):
    """List all available vision model templates."""
    available_models = verda_service.available_models(get_vision_template_map())
    return {"available_models": available_models}


@router.get("/model-statuses")
def get_vision_model_statuses(current_user: UserInfo = Depends(get_current_user)) -> dict[str, str]:
    """Return live/starting/offline status for each known vision model."""
    template_map = get_vision_template_map()
    statuses: dict[str, str] = {display_name: "offline" for display_name in template_map.values()}

    try:
        deployments = verda_service.list_deployments()
    except RuntimeError:
        return statuses

    template_deployment_map = {
        _deployment_name_from_filename(template_name): display_name
        for template_name, display_name in template_map.items()
    }

    for deployment in deployments:
        deployment_name = deployment.get("name")
        if not deployment_name:
            continue

        display_name = template_deployment_map.get(deployment_name.lower())
        if not display_name:
            continue

        try:
            deployment_status = verda_service.get_deployment_status(deployment_name)
            status_str = deployment_status.get("status")
            if status_str == "healthy":
                statuses[display_name] = "live"
            elif status_str in {"error", "unknown", "no_deployment"}:
                statuses[display_name] = "offline"
            else:
                statuses[display_name] = "starting"
        except RuntimeError:
            statuses[display_name] = "offline"

    return statuses


@router.post("/deploy", response_model=DeploymentStatusResponse)
def deploy_vision_model(
    request: DeployModelRequest,
    current_user: UserInfo = Depends(get_admin_user),
    _: None = Depends(validate_csrf_token),
    container_handler: ContainerHandler = Depends(get_container_handler),
):
    """Deploy a vision model from template."""
    print(f"User {current_user.username} requesting vision model deployment: {request.model_path}")
    template = _resolve_vision_template_name(request.model_path)
    if not template:
        supported = list(get_vision_template_map().values())
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported vision model: {request.model_path}. Supported models: {supported}",
        )

    try:
        result = verda_service.deploy_from_template(
            template_json=template,
            deployment_name=request.deployment_name,
            container_handler=container_handler,
        )
        return DeploymentStatusResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/stream")
async def vision_stream(
    stream_req: VisionChatRequest,
    request: Request,
    current_user: UserInfo = Depends(get_current_user),
    container_handler: ContainerHandler = Depends(get_container_handler),
):
    """
    Stream vision model generation responses token-by-token using Server-Sent Events (SSE).
    """
    model_path = stream_req.model_path
    deployment_name = stream_req.deployment_name
    max_tokens = stream_req.max_tokens

    # Resolve the model_path and deployment_name from the display name if needed
    template_name = _resolve_vision_template_name(deployment_name)
    if template_name:
        expected_dep = _deployment_name_from_filename(template_name)
        cfg = get_vision_template_configs().get(template_name)
        if cfg and not model_path:
            model_path = cfg.model
    else:
        # Fallback: try to resolve model_path from the deployment name directly
        deployment_to_model_path = {
            _deployment_name_from_filename(tn): cfg.model
            for tn, cfg in get_vision_template_configs().items()
        }
        resolved = deployment_to_model_path.get(deployment_name.lower())
        if resolved:
            model_path = resolved
        expected_dep = deployment_name.lower()

    if not model_path:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not resolve model_path for deployment '{deployment_name}'. "
                "Provide model_path in request body or ensure deployment name matches a known template."
            ),
        )

    messages = [m.model_dump() for m in stream_req.messages]

    # Find the running deployment
    try:
        deployments = verda_service.list_deployments()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Could not reach deployment service.",
        )

    existing = None
    for d in deployments:
        if d.get("name", "").lower() == expected_dep:
            existing = d
            break

    if not existing:
        dep_names = [d.get("name", "?") for d in deployments]
        raise HTTPException(
            status_code=503,
            detail=f"Vision model '{deployment_name}' is not deployed. Available deployments: {dep_names}",
        )

    deployment_name = existing["name"]
    container_handler.set_latest_request_timestamp(deployment_name)

    base_url = (existing.get("endpoint_url", "") or "").rstrip("/")
    if not base_url:
        raise HTTPException(status_code=503, detail="Deployment endpoint URL is missing")

    normalized_base_url = base_url[:-3] if base_url.endswith("/v1") else base_url
    target_url = f"{normalized_base_url}/v1/chat/completions"

    request_payload = {
        "model": model_path,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": stream_req.temperature,
        "top_p": stream_req.top_p,
        "stream": True,
    }

    upstream_timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=5.0)

    print(f"Vision stream: target_url={target_url} model_path={model_path} deployment={expected_dep}", flush=True)

    async def chunk_generator():
        print("Vision stream: chunk_generator started", flush=True)
        try:
            async with httpx.AsyncClient(timeout=upstream_timeout) as async_client:
                async with async_client.stream(
                    "POST",
                    target_url,
                    json=request_payload,
                    headers=_inference_headers(),
                ) as upstream_response:
                    print(f"Vision stream upstream: status={upstream_response.status_code} url={target_url}", flush=True)

                    if upstream_response.status_code != 200:
                        err_text = await upstream_response.aread()
                        error_detail = err_text.decode("utf-8", errors="replace")
                        print(f"Vision stream upstream error: status={upstream_response.status_code} body={error_detail[:500]}", flush=True)
                        yield f"data: {json.dumps({'error': error_detail})}\n\n"
                        return

                    chunk_count = 0
                    async for chunk in upstream_response.aiter_lines():
                        if await request.is_disconnected():
                            print("Vision stream: client disconnected", flush=True)
                            break
                        if chunk:
                            if chunk_count < 3:
                                print(f"Vision stream upstream chunk[{chunk_count}]: {chunk[:200]}", flush=True)
                            chunk_count += 1
                            yield chunk + "\n\n"
                    print(f"Vision stream upstream: done, total chunks={chunk_count}", flush=True)
        except httpx.RequestError as e:
            print(f"Vision stream upstream connection error: {e}", flush=True)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        except Exception as e:
            print(f"Vision stream unexpected error: {e}", flush=True)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(chunk_generator(), media_type="text/event-stream")
