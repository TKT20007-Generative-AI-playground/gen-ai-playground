"""Audio transcription routes."""

from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.config import settings
from app.dependencies import get_admin_user, get_current_user, validate_csrf_token
from app.models import DeployModelRequest, DeploymentStatusResponse, UserInfo
from app.template_discovery import get_audio_template_map, _deployment_name_from_filename
from app.verda_service import verda_service


router = APIRouter(prefix="/audio", tags=["audio"])
WHISPER_TIMEOUT_SECONDS = 300.0


def _inference_headers() -> dict[str, str]:
    token = settings.VERDA_INFERENCE_KEY or settings.VERDA_API_KEY
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def _audio_deployment_names() -> set[str]:
    return {
        _deployment_name_from_filename(template_name)
        for template_name in get_audio_template_map().keys()
    }


def _resolve_audio_endpoint(model_path: str | None = None, require_healthy: bool = True) -> tuple[str, str]:
    expected_names = _audio_deployment_names()
    if model_path:
        template_name = _resolve_audio_template_name(model_path)
        if not template_name:
            supported = list(get_audio_template_map().values())
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio model: {model_path}. Supported models: {supported}",
            )
        expected_names = {_deployment_name_from_filename(template_name)}

    deployments = verda_service.list_deployments()

    if not deployments or (len(deployments) == 1 and deployments[0].get("error")):
        raise HTTPException(
            status_code=503,
            detail="No Verda deployments found for audio. Deploy a Whisper container from dashboard first.",
        )

    candidates = [d for d in deployments if d.get("name", "").lower() in expected_names]
    if not candidates:
        requested_model_msg = f" for model '{model_path}'" if model_path else ""
        raise HTTPException(
            status_code=503,
            detail=(
                f"No deployed audio container found{requested_model_msg}. "
                "Deploy a Whisper model from dashboard first."
            ),
        )

    for deployment in candidates:
        deployment_name = deployment.get("name")
        endpoint_url = str(deployment.get("endpoint_url", "")).rstrip("/")
        if not deployment_name or not endpoint_url:
            continue

        if require_healthy:
            status_payload = verda_service.get_deployment_status(deployment_name)
            status_str = status_payload.get("status")
            if status_str != "healthy":
                continue

        return deployment_name, endpoint_url

    if require_healthy:
        requested_model_msg = f" for model '{model_path}'" if model_path else ""
        raise HTTPException(
            status_code=503,
            detail=(
                f"Audio deployment exists{requested_model_msg} but is not healthy yet. "
                "Please wait and try again."
            ),
        )

    raise HTTPException(
        status_code=503,
        detail="Audio deployment found but endpoint is unavailable.",
    )


def _whisper_url(base_url: str, path: str) -> str:
    base = base_url.rstrip("/")
    if not path:
        return base
    suffix = path if path.startswith("/") else f"/{path}"
    return f"{base}{suffix}"


async def _get_with_fallback_paths(base_url: str, paths: list[str]) -> dict[str, Any]:
    tried: list[str] = []
    headers = _inference_headers()
    async with httpx.AsyncClient(timeout=WHISPER_TIMEOUT_SECONDS) as client:
        for path in paths:
            url = _whisper_url(base_url, path)
            tried.append(url)
            response = await client.get(url, headers=headers)

            if response.status_code == 404:
                continue

            response.raise_for_status()
            return response.json()

    raise HTTPException(
        status_code=503,
        detail={
            "message": "Whisper health endpoint was not found on deployed container.",
            "tried_urls": tried,
        },
    )


async def _post_with_fallback_paths(
    base_url: str,
    paths: list[str],
    data: dict[str, str],
    files: dict[str, tuple[str, bytes, str]],
) -> dict[str, Any]:
    tried: list[str] = []
    headers = _inference_headers()
    async with httpx.AsyncClient(timeout=WHISPER_TIMEOUT_SECONDS) as client:
        for path in paths:
            url = _whisper_url(base_url, path)
            tried.append(url)
            response = await client.post(url, data=data, files=files, headers=headers)

            if response.status_code == 404:
                continue

            response.raise_for_status()
            return response.json()

    raise HTTPException(
        status_code=503,
        detail={
            "message": "Whisper transcribe endpoint was not found on deployed container.",
            "tried_urls": tried,
        },
    )


def _resolve_audio_template_name(model: str) -> str | None:
    model = model.strip()
    for template_name, display_name in get_audio_template_map().items():
        if display_name == model:
            return template_name
    return None


@router.get("/models")
def list_available_audio_models(_current_user: UserInfo = Depends(get_current_user)):
    """List audio model templates available for deployment."""
    available_models = verda_service.available_models(get_audio_template_map())
    return {"available_models": available_models}


@router.get("/model-statuses")
def get_audio_model_statuses(_current_user: UserInfo = Depends(get_current_user)) -> dict[str, str]:
    """Return live/starting/offline status for each known audio model."""
    template_map = get_audio_template_map()
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
def deploy_audio_model(
    request: DeployModelRequest,
    current_user: UserInfo = Depends(get_admin_user),
    _: None = Depends(validate_csrf_token),
):
    """Deploy an audio transcription model template on Verda."""
    print(f"User {current_user.username} requesting audio model deployment: {request.model_path}")
    template = _resolve_audio_template_name(request.model_path)
    if not template:
        supported = list(get_audio_template_map().values())
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio model: {request.model_path}. Supported models: {supported}",
        )

    try:
        result = verda_service.deploy_from_template(
            template_json=template,
            deployment_name=request.deployment_name,
        )
        return DeploymentStatusResponse(**result)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to deploy audio model: {exc}") from exc


@router.get("/health")
async def audio_health(model_path: str | None = None) -> dict[str, Any]:
    """Health check against the selected (or first available) deployed audio container."""
    deployment_name, endpoint_url = _resolve_audio_endpoint(model_path=model_path, require_healthy=False)
    deployment_status = verda_service.get_deployment_status(deployment_name)

    if deployment_status.get("status") != "healthy":
        return {
            "status": "ok",
            "deployment": deployment_status,
            "whisper": {
                "status": "unavailable",
                "detail": "Deployment is not healthy yet.",
            },
        }

    try:
        whisper_payload = await _get_with_fallback_paths(
            endpoint_url,
            ["health", ""],
        )
        return {
            "status": "ok",
            "deployment": deployment_status,
            "whisper": whisper_payload,
        }
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text or "Whisper health check failed"
        raise HTTPException(status_code=503, detail=detail) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Whisper service unavailable: {exc}") from exc


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    model_path: str | None = Form(None),
    language: str | None = Form(None),
    task: str = Form("transcribe"),
    beam_size: int = Form(5),
    vad_filter: bool = Form(True),
    current_user: UserInfo = Depends(get_current_user),
    _: None = Depends(validate_csrf_token),
) -> dict[str, Any]:
    """Proxy file transcription to a selected deployed Verda audio container."""
    if task not in {"transcribe", "translate"}:
        raise HTTPException(status_code=400, detail="task must be either 'transcribe' or 'translate'")

    deployment_name, endpoint_url = _resolve_audio_endpoint(model_path=model_path, require_healthy=True)

    print(
        "Audio transcription requested by user: "
        f"{current_user.username} (deployment: {deployment_name}, model_path: {model_path})"
    )
    file_bytes = await file.read()

    files = {
        "file": (
            file.filename or "audio.bin",
            file_bytes,
            file.content_type or "application/octet-stream",
        )
    }
    form_data: dict[str, str] = {
        "task": task,
        "beam_size": str(beam_size),
        "vad_filter": "true" if vad_filter else "false",
    }
    if language:
        form_data["language"] = language

    try:
        return await _post_with_fallback_paths(
            endpoint_url,
            ["transcribe", "predict", ""],
            form_data,
            files,
        )
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
            detail = payload.get("detail", payload)
        except ValueError:
            detail = exc.response.text or "Whisper transcription failed"
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Whisper service unavailable: {exc}") from exc
