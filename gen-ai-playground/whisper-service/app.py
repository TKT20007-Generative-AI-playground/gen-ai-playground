from __future__ import annotations

import logging
import os
import tempfile
import time
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

DEFAULT_MODEL_NAME = "whisper-large-v3-turbo"

# Common placeholder values people leave from copy/paste examples.
PLACEHOLDER_MODEL_NAMES = {
    "your_new_model_name",
    "your_model_name",
    "your-model-name",
    "model_name",
}


MODEL_ALIASES = {
    "openai/whisper-large-v3-turbo": "turbo",
    "whisper-large-v3-turbo": "turbo",
    "large-v3-turbo": "turbo",
    "openai/whisper-large-v3": "large-v3",
    "whisper-large-v3": "large-v3",
}


def _normalize_model_name(model_name: str) -> str:
    cleaned = model_name.strip().strip('"').strip("'")
    if not cleaned:
        return DEFAULT_MODEL_NAME
    if cleaned.lower() in PLACEHOLDER_MODEL_NAMES:
        return DEFAULT_MODEL_NAME
    return cleaned


def _canonical_model_name(model_name: str) -> str:
    normalized = _normalize_model_name(model_name)
    if normalized.lower().startswith("openai/"):
        return normalized.split("/", 1)[1]
    return normalized


def _resolve_model_name(model_name: str) -> str:
    normalized_name = _normalize_model_name(model_name)
    return MODEL_ALIASES.get(normalized_name.lower(), normalized_name)


@dataclass(frozen=True)
class WhisperSettings:
    model_size: str = os.getenv("WHISPER_MODEL", DEFAULT_MODEL_NAME)
    device: str = os.getenv("WHISPER_DEVICE", "cpu")
    compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    download_root: str | None = os.getenv("WHISPER_DOWNLOAD_ROOT")
    preload: bool = os.getenv("WHISPER_PRELOAD", "false").lower() == "true"
    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "50"))


settings = WhisperSettings()
app = FastAPI(title="Whisper Service", version="0.1.0")
_state: dict[str, WhisperModel | None] = {"model": None}


def _get_model() -> WhisperModel:
    model = _state["model"]
    if model is None:
        resolved_model_name = _resolve_model_name(settings.model_size)
        model = WhisperModel(
            resolved_model_name,
            device=settings.device,
            compute_type=settings.compute_type,
            download_root=settings.download_root,
        )
        _state["model"] = model
    return model


@app.on_event("startup")
def _startup() -> None:
    if settings.preload:
        _get_model()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "configured_model": settings.model_size,
        "model": _canonical_model_name(settings.model_size),
        "device": settings.device,
        "compute_type": settings.compute_type,
        "model_loaded": _state["model"] is not None,
    }


@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    beam_size: int = Form(5),
    vad_filter: bool = Form(True),
) -> dict[str, Any]:
    max_bytes = settings.max_upload_mb * 1024 * 1024

    suffix = os.path.splitext(file.filename or "audio.bin")[1]
    temp_path: str | None = None

    try:
        bytes_written = 0
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            temp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Max size is {settings.max_upload_mb} MB",
                    )
                tmp.write(chunk)

        model = _get_model()
        transcription_start = time.perf_counter()
        segments, info = model.transcribe(
            temp_path,
            language=language,
            task="transcribe",
            beam_size=beam_size,
            vad_filter=vad_filter,
        )

        output_segments = []
        full_text_parts = []
        for seg in segments:
            output_segments.append(
                {
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text,
                }
            )
            full_text_parts.append(seg.text)

        transcription_time_ms = int((time.perf_counter() - transcription_start) * 1000)

        return {
            "text": "".join(full_text_parts).strip(),
            "language": getattr(info, "language", None),
            "duration": getattr(info, "duration", None),
            "segments": output_segments,
            "transcription_time_ms": transcription_time_ms,
            "configured_model": settings.model_size,
            "model": _canonical_model_name(settings.model_size),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail="Transcription failed") from None
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)