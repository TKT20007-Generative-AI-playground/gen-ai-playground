import base64
import math
import re
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.database import Database
from pymongo.errors import PyMongoError

from app.config import settings
from app.database import get_database
from app.dependencies import get_admin_user, get_current_user, validate_csrf_token, get_container_handler
from app.models import (
    DeployModelRequest,
    DeploymentStatusResponse,
    HistoryResponseVideo,
    UserInfo,
    VideoGenerateRequest,
)
from app.template_discovery import _deployment_name_from_filename, get_video_template_map
from app.verda_service import verda_service
from app.container_handler import ContainerHandler


router = APIRouter(prefix="/video", tags=["video"])
VIDEO_TIMEOUT_SECONDS = 600.0
VIDEO_HISTORY_PROJECTION = {
    "_id": 0,
    "type": 1,
    "prompt": 1,
    "model": 1,
    "timestamp": 1,
    "username": 1,
    "video_data": 1,
    "mime_type": 1,
    "generation_time_ms": 1,
    "height": 1,
    "width": 1,
    "num_frames": 1,
    "fps": 1,
    "seed": 1,
}
VIDEO_MODEL_ALIASES = {
    "Wan 2.1 (1.3B)": "Wan2.1 T2V 1.3B",
    "Wan2.1 T2V 1.3B": "Wan 2.1 (1.3B)",
}


def _inference_headers() -> dict[str, str]:
    token = settings.VERDA_INFERENCE_KEY or settings.VERDA_API_KEY
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def _video_deployment_names() -> set[str]:
    return {
        _deployment_name_from_filename(template_name)
        for template_name in get_video_template_map().keys()
    }


def _resolve_video_template_name(model: str) -> str | None:
    model = model.strip()
    normalized_model = re.sub(r"[^a-z0-9]", "", model.lower())
    aliased_model = VIDEO_MODEL_ALIASES.get(model)
    for template_name, display_name in get_video_template_map().items():
        normalized_display_name = re.sub(r"[^a-z0-9]", "", display_name.lower())
        deployment_name = _deployment_name_from_filename(template_name)
        if display_name == model or display_name == aliased_model:
            return template_name
        if template_name == model or deployment_name == model.lower():
            return template_name
        if normalized_display_name == normalized_model:
            return template_name
    return None


def _resolve_video_endpoint(model_path: str | None = None, require_healthy: bool = True) -> tuple[str, str]:
    expected_names = _video_deployment_names()
    if model_path:
        template_name = _resolve_video_template_name(model_path)
        if not template_name:
            supported = list(get_video_template_map().values())
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported video model: {model_path}. Supported models: {supported}",
            )
        expected_names = {_deployment_name_from_filename(template_name)}

    deployments = verda_service.list_deployments()
    if not deployments or (len(deployments) == 1 and deployments[0].get("error")):
        raise HTTPException(
            status_code=503,
            detail="No Verda deployments found for video. Deploy a video container from dashboard first.",
        )

    candidates = [d for d in deployments if d.get("name", "").lower() in expected_names]
    if not candidates:
        requested_model_msg = f" for model '{model_path}'" if model_path else ""
        raise HTTPException(
            status_code=503,
            detail=(
                f"No deployed video container found{requested_model_msg}. "
                "Deploy a video model from dashboard first."
            ),
        )

    fallback_candidate: tuple[str, str] | None = None
    for deployment in candidates:
        deployment_name = deployment.get("name")
        endpoint_url = str(deployment.get("endpoint_url", "")).rstrip("/")
        if not deployment_name or not endpoint_url:
            continue

        status_str = None
        try:
            status_payload = verda_service.get_deployment_status(deployment_name)
            status_str = status_payload.get("status")
        except RuntimeError:
            status_str = None

        if status_str == "healthy":
            return deployment_name, endpoint_url

        if fallback_candidate is None:
            fallback_candidate = (deployment_name, endpoint_url)

        if require_healthy:
            continue

    if not require_healthy and fallback_candidate:
        return fallback_candidate

    requested_model_msg = f" for model '{model_path}'" if model_path else ""
    raise HTTPException(
        status_code=503,
        detail=(
            f"Video deployment exists{requested_model_msg} but is not healthy yet. "
            "Please wait and try again."
        ),
    )


def _video_url(base_url: str, path: str) -> str:
    base = base_url.rstrip("/")
    suffix = path if path.startswith("/") else f"/{path}"
    return f"{base}{suffix}"


def _validate_video_base64(video_base64: str) -> None:
    try:
        video_bytes = base64.b64decode(video_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=502, detail="Video service returned invalid video data")

    max_bytes = settings.MAX_VIDEO_OUTPUT_MB * 1024 * 1024
    if len(video_bytes) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Generated video is too large. Max size is {settings.MAX_VIDEO_OUTPUT_MB} MB",
        )


async def _post_video_generate(base_url: str, payload: dict[str, Any]) -> dict[str, Any]:
    tried: list[str] = []
    headers = _inference_headers()
    async with httpx.AsyncClient(timeout=VIDEO_TIMEOUT_SECONDS) as client:
        for path in ["/generate"]:
            url = _video_url(base_url, path)
            tried.append(url)
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code == 404:
                continue

            response.raise_for_status()
            return response.json()

    raise HTTPException(
        status_code=503,
        detail={
            "message": "Video generation endpoint was not found on deployed container.",
            "tried_urls": tried,
        },
    )


@router.get("/models")
def list_available_video_models(_current_user: UserInfo = Depends(get_current_user)):
    available_models = verda_service.available_models(get_video_template_map())
    return {"available_models": available_models}


@router.get("/model-statuses")
def get_video_model_statuses(_current_user: UserInfo = Depends(get_current_user)) -> dict[str, str]:
    template_map = get_video_template_map()
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
def deploy_video_model(
    request: DeployModelRequest,
    current_user: UserInfo = Depends(get_admin_user),
    _: None = Depends(validate_csrf_token),
    container_handler: ContainerHandler = Depends(get_container_handler),
):
    print(f"User {current_user.username} requesting video model deployment: {request.model_path}")
    template = _resolve_video_template_name(request.model_path)
    if not template:
        supported = list(get_video_template_map().values())
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video model: {request.model_path}. Supported models: {supported}",
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


@router.post("/generate")
async def generate_video(
    request: VideoGenerateRequest,
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(validate_csrf_token),
    container_handler: ContainerHandler = Depends(get_container_handler),
) -> dict[str, Any]:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    deployment_name, endpoint_url = _resolve_video_endpoint(model_path=request.model_path, require_healthy=True)
    payload = request.model_dump(exclude_none=True)
    payload.pop("model_path", None)

    start = time.perf_counter()
    
    #set latest request timestamp for the vid container 
    container_handler.set_latest_request_timestamp(deployment_name)
    try:
        result = await _post_video_generate(endpoint_url, payload)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Video generation failed: {exc.response.text}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Video generation request failed: {exc}") from exc

    video_base64 = result.get("video_base64")
    if not isinstance(video_base64, str) or not video_base64:
        raise HTTPException(status_code=502, detail="Video service response did not include video data")

    _validate_video_base64(video_base64)

    generation_time_ms = result.get("generation_time_ms")
    if not isinstance(generation_time_ms, int):
        generation_time_ms = int((time.perf_counter() - start) * 1000)

    model_name = result.get("model") or request.model_path or deployment_name
    history_record = {
        "type": "video",
        "prompt": prompt,
        "model": model_name,
        "deployment_name": deployment_name,
        "timestamp": datetime.now(timezone.utc),
        "username": current_user.username,
        "video_data": video_base64,
        "mime_type": result.get("mime_type") or "video/mp4",
        "generation_time_ms": generation_time_ms,
        "height": result.get("height"),
        "width": result.get("width"),
        "num_frames": result.get("num_frames"),
        "fps": result.get("fps"),
        "seed": result.get("seed"),
    }

    try:
        db.video_generations.insert_one(history_record)
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Failed to save video generation history") from exc

    response_payload = dict(result)
    response_payload["generation_time_ms"] = generation_time_ms
    response_payload["model"] = model_name
    return response_payload


@router.get("/history-sidebar")
def get_video_history_sidebar(
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    limit: int = Query(5, description="How many items to return (5, 10, or 15)"),
) -> dict[str, list[dict[str, Any]]]:
    if limit not in {5, 10, 15}:
        raise HTTPException(status_code=400, detail="limit must be one of: 5, 10, 15")

    records = list(
        db.video_generations.find(
            {"username": current_user.username},
            VIDEO_HISTORY_PROJECTION,
        )
        .sort("timestamp", -1)
        .limit(limit)
    )

    return {"history": records}


@router.get("/history", response_model=HistoryResponseVideo)
def get_video_history(
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    from_date: Optional[int] = Query(None, alias="from"),
    to_date: Optional[int] = Query(None, alias="to"),
    page: int = Query(1, alias="page", ge=1),
):
    page_size = 10
    query: dict[str, Any] = {"username": current_user.username}

    if from_date or to_date:
        date_filter: dict[str, datetime] = {}
        if from_date:
            date_filter["$gte"] = datetime.fromtimestamp(from_date / 1000, tz=timezone.utc)
        if to_date:
            date_filter["$lte"] = datetime.fromtimestamp(to_date / 1000, tz=timezone.utc)
        query["timestamp"] = date_filter

    total = db.video_generations.count_documents(query)
    if total == 0:
        return HistoryResponseVideo(history=[], total=0, page=page, total_pages=0)

    total_pages = math.ceil(total / page_size)
    page = min(page, total_pages)
    start = (page - 1) * page_size

    records = list(
        db.video_generations.find(query, VIDEO_HISTORY_PROJECTION)
        .sort("timestamp", -1)
        .skip(start)
        .limit(page_size)
    )

    return HistoryResponseVideo(history=records, total=total, page=page, total_pages=total_pages)


@router.get("/history-length")
def video_history_length(
    db: Database = Depends(get_database),
    current_user: UserInfo = Depends(get_current_user),
) -> dict[str, int]:
    length = db.video_generations.count_documents({"username": current_user.username})
    return {"length": length}
