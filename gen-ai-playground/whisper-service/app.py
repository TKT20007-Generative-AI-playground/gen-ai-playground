from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from faster_whisper import WhisperModel


DEFAULT_MODEL_NAME = "openai/whisper-large-v3-turbo"

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
    normalized_model = _normalize_model_name(settings.model_size)
    return {
        "status": "ok",
        "configured_model": settings.model_size,
        "model": normalized_model,
        "resolved_model": _resolve_model_name(settings.model_size),
        "device": settings.device,
        "compute_type": settings.compute_type,
        "model_loaded": _state["model"] is not None,
    }


@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str | None = None,
    task: str = "transcribe",
    beam_size: int = 5,
    vad_filter: bool = True,
) -> dict[str, Any]:
    if task not in {"transcribe", "translate"}:
        raise HTTPException(status_code=400, detail="task must be either 'transcribe' or 'translate'")

    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File too large. Max size is {settings.max_upload_mb} MB")

    suffix = os.path.splitext(file.filename or "audio.bin")[1]

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            temp_path = tmp.name

        model = _get_model()
        segments, info = model.transcribe(
            temp_path,
            language=language,
            task=task,
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

        return {
            "text": "".join(full_text_parts).strip(),
            "language": getattr(info, "language", None),
            "duration": getattr(info, "duration", None),
            "segments": output_segments,
            "configured_model": settings.model_size,
            "model": _normalize_model_name(settings.model_size),
            "resolved_model": _resolve_model_name(settings.model_size),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        if "temp_path" in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
