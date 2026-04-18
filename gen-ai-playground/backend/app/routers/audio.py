"""Audio transcription routes."""

import math
import os
import time
from datetime import datetime, timezone
from typing import Any, BinaryIO, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pymongo.database import Database
from pymongo.errors import PyMongoError

from app.config import settings
from app.database import get_database
from app.dependencies import get_admin_user, get_current_user, validate_csrf_token
from app.models import DeployModelRequest, DeploymentStatusResponse, HistoryResponseAudio, UserInfo
from app.template_discovery import _deployment_name_from_filename, get_audio_template_map
from app.verda_service import verda_service


router = APIRouter(prefix="/audio", tags=["audio"])
WHISPER_TIMEOUT_SECONDS = 300.0
MAX_AUDIO_UPLOAD_MB = settings.MAX_AUDIO_UPLOAD_MB
MAX_AUDIO_UPLOAD_BYTES = MAX_AUDIO_UPLOAD_MB * 1024 * 1024


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
            f"Audio deployment exists{requested_model_msg} but is not healthy yet. "
            "Please wait and try again."
        ),
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
    file_obj: BinaryIO,
    file_name: str,
    file_content_type: str,
) -> dict[str, Any]:
    tried: list[str] = []
    headers = _inference_headers()
    async with httpx.AsyncClient(timeout=WHISPER_TIMEOUT_SECONDS) as client:
        for path in paths:
            file_obj.seek(0, os.SEEK_SET)
            files = {
                "file": (
                    file_name,
                    file_obj,
                    file_content_type,
                )
            }

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


def _validate_upload_size(file: UploadFile) -> None:
    file_obj = file.file
    current_pos = file_obj.tell()
    file_obj.seek(0, os.SEEK_END)
    size_bytes = file_obj.tell()
    file_obj.seek(current_pos, os.SEEK_SET)

    if size_bytes > MAX_AUDIO_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size is {MAX_AUDIO_UPLOAD_MB} MB",
        )


def _safe_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _normalize_transcription_source(source: str | None) -> str | None:
    if not isinstance(source, str):
        return None

    normalized = source.strip().lower()
    if normalized in {"uploaded", "recording"}:
        return normalized

    return None


def _normalize_whisper_model_identifier(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    cleaned = value.strip()
    if not cleaned:
        return None

    if cleaned.lower().startswith("openai/"):
        return cleaned.split("/", 1)[1]

    return cleaned


def _resolve_audio_history_model_label(
    requested_model: str | None,
    result_model: Any,
    deployment_name: str,
) -> str:
    for candidate in (requested_model, result_model, deployment_name):
        normalized = _normalize_whisper_model_identifier(candidate)
        if normalized:
            return normalized
    return "unknown"


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
async def audio_health(
    model_path: str | None = None,
    _current_user: UserInfo = Depends(get_current_user),
) -> dict[str, Any]:
    """Health check against the selected (or first available) deployed audio container."""
    deployment_name, endpoint_url = _resolve_audio_endpoint(model_path=model_path, require_healthy=False)
    try:
        deployment_status = verda_service.get_deployment_status(deployment_name)
    except RuntimeError:
        return {
            "status": "ok",
            "deployment": {
                "name": deployment_name,
                "status": "unknown",
            },
            "whisper": {
                "status": "unavailable",
                "detail": "Unable to fetch deployment status from Verda.",
            },
        }

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
    source: str | None = Form(None),
    run_id: str | None = Form(None),
    beam_size: int = Form(5, ge=1, le=10),
    vad_filter: bool = Form(True),
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(validate_csrf_token),
) -> dict[str, Any]:
    """Proxy file transcription to a selected deployed Verda audio container."""
    deployment_name, endpoint_url = _resolve_audio_endpoint(model_path=model_path, require_healthy=True)
    normalized_source = _normalize_transcription_source(source)
    normalized_run_id = (run_id or "").strip()[:128] or None

    print(
        "Audio transcription requested by user: "
        f"{current_user.username} (deployment: {deployment_name}, model_path: {model_path})"
    )
    _validate_upload_size(file)

    form_data: dict[str, str] = {
        "task": "transcribe",
        "beam_size": str(beam_size),
        "vad_filter": "true" if vad_filter else "false",
    }
    if language:
        form_data["language"] = language

    started_at = time.perf_counter()
    try:
        result = await _post_with_fallback_paths(
            endpoint_url,
            ["transcribe", "predict", ""],
            form_data,
            file.file,
            file.filename or "audio.bin",
            file.content_type or "application/octet-stream",
        )

        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        transcription_time_ms = _safe_int(result.get("transcription_time_ms"))
        if transcription_time_ms is None:
            transcription_time_ms = elapsed_ms

        normalized_result_model = _normalize_whisper_model_identifier(result.get("model"))
        if normalized_result_model:
            result["model"] = normalized_result_model

        history_model_label = _resolve_audio_history_model_label(
            requested_model=model_path,
            result_model=result.get("model"),
            deployment_name=deployment_name,
        )

        try:
            input_name = (file.filename or "").strip() or None
            if normalized_source == "recording":
                input_name = None

            history_record = {
                "type": "transcription",
                "transcription_text": result.get("text", ""),
                "model": history_model_label,
                "timestamp": datetime.utcnow(),
                "username": current_user.username,
                "run_id": normalized_run_id,
                "input_name": input_name,
                "language": result.get("language"),
                "duration": result.get("duration"),
                "transcription_time_ms": transcription_time_ms,
                "source": normalized_source,
            }
            db.audio_transcriptions.insert_one(history_record)
        except (PyMongoError, TypeError, ValueError) as exc:
            print(f"Failed to save audio transcription to MongoDB: {exc}")

        return result
    except httpx.HTTPStatusError as exc:
        try:
            payload = exc.response.json()
            detail = payload.get("detail", payload)
        except ValueError:
            detail = exc.response.text or "Whisper transcription failed"
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Whisper service unavailable: {exc}") from exc


@router.get("/history-sidebar")
def get_audio_history_sidebar(
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    limit: int = Query(15, ge=1, le=200),
) -> dict[str, list[dict[str, Any]]]:
    records = list(
        db.audio_transcriptions.find(
            {"username": current_user.username},
            {
                "_id": 0,
                "type": 1,
                "transcription_text": 1,
                "model": 1,
                "timestamp": 1,
                "username": 1,
                "run_id": 1,
                "input_name": 1,
                "language": 1,
                "duration": 1,
                "transcription_time_ms": 1,
                "source": 1,
            },
        )
        .sort("timestamp", -1)
        .limit(limit)
    )

    return {"history": records}


@router.get("/history", response_model=HistoryResponseAudio)
def get_audio_history(
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

    total = db.audio_transcriptions.count_documents(query)
    if total == 0:
        return HistoryResponseAudio(history=[], total=0, page=page, total_pages=0)

    total_pages = math.ceil(total / page_size)
    page = min(page, total_pages)
    start = (page - 1) * page_size

    try:
        history = list(
            db.audio_transcriptions.find(
                query,
                {
                    "_id": 0,
                    "type": 1,
                    "transcription_text": 1,
                    "model": 1,
                    "timestamp": 1,
                    "username": 1,
                    "run_id": 1,
                    "input_name": 1,
                    "language": 1,
                    "duration": 1,
                    "transcription_time_ms": 1,
                    "source": 1,
                },
            )
            .sort("timestamp", -1)
            .skip(start)
            .limit(page_size)
        )

        return HistoryResponseAudio(
            history=history,
            total=total,
            page=page,
            total_pages=total_pages,
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail=f"Error getting audio history: {exc}") from exc
