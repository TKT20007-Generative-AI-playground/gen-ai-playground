from __future__ import annotations

import base64
import logging
import os
import tempfile
import time
from dataclasses import dataclass
from typing import Any

import torch
from diffusers import WanPipeline
from diffusers.utils import export_to_video
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import threading

logger = logging.getLogger(__name__)

DEFAULT_MODEL_NAME = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"

_inference_lock = threading.Lock()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class VideoSettings:
    model: str = os.getenv("VIDEO_MODEL", DEFAULT_MODEL_NAME)
    device: str = os.getenv("VIDEO_DEVICE", "cuda")
    dtype: str = os.getenv("VIDEO_DTYPE", "float16")
    height: int = _env_int("VIDEO_HEIGHT", 480)
    width: int = _env_int("VIDEO_WIDTH", 832)
    num_frames: int = _env_int("VIDEO_NUM_FRAMES", 49)
    num_inference_steps: int = _env_int("VIDEO_NUM_INFERENCE_STEPS", 20)
    guidance_scale: float = _env_float("VIDEO_GUIDANCE_SCALE", 5.0)
    fps: int = _env_int("VIDEO_FPS", 16)
    max_prompt_chars: int = _env_int("VIDEO_MAX_PROMPT_CHARS", 1500)
    max_output_mb: int = _env_int("VIDEO_MAX_OUTPUT_MB", 90)
    preload: bool = os.getenv("VIDEO_PRELOAD", "false").lower() == "true"
    cpu_offload: bool = os.getenv("VIDEO_CPU_OFFLOAD", "true").lower() == "true"


class VideoGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1500)
    negative_prompt: str | None = Field(default=None, max_length=1500)
    height: int | None = Field(default=None, ge=256, le=720)
    width: int | None = Field(default=None, ge=256, le=1280)
    num_frames: int | None = Field(default=None, ge=9, le=81)
    num_inference_steps: int | None = Field(default=None, ge=4, le=40)
    guidance_scale: float | None = Field(default=None, ge=1.0, le=12.0)
    seed: int | None = None


settings = VideoSettings()
app = FastAPI(title="Video Generator Service", version="0.1.0")
_state: dict[str, WanPipeline | None] = {"pipe": None}


def _torch_dtype() -> torch.dtype:
    if settings.dtype == "bfloat16":
        return torch.bfloat16
    if settings.dtype == "float32":
        return torch.float32
    return torch.float16


def _get_pipe() -> WanPipeline:
    pipe = _state["pipe"]
    if pipe is None:
        pipe = WanPipeline.from_pretrained(settings.model, torch_dtype=_torch_dtype())
        if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_tiling"):
            pipe.vae.enable_tiling()
        if settings.device == "cuda" and torch.cuda.is_available():
            if settings.cpu_offload:
                pipe.enable_model_cpu_offload()
            else:
                pipe.to("cuda")
        else:
            pipe.to("cpu")
        _state["pipe"] = pipe
    return pipe


@app.on_event("startup")
def _startup() -> None:
    if settings.preload:
        _get_pipe()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "configured_model": settings.model,
        "device": settings.device,
        "dtype": settings.dtype,
        "model_loaded": _state["pipe"] is not None,
        "cuda_available": torch.cuda.is_available(),
    }


@app.post("/generate")
def generate_video(request: VideoGenerateRequest) -> dict[str, Any]:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    if len(prompt) > settings.max_prompt_chars:
        raise HTTPException(status_code=413, detail="Prompt is too long")

    height = request.height or settings.height
    width = request.width or settings.width
    num_frames = request.num_frames or settings.num_frames
    num_inference_steps = request.num_inference_steps or settings.num_inference_steps
    guidance_scale = request.guidance_scale or settings.guidance_scale

    generator = None
    if request.seed is not None:
        device = "cuda" if settings.device == "cuda" and torch.cuda.is_available() else "cpu"
        generator = torch.Generator(device=device).manual_seed(request.seed)

    temp_path: str | None = None
    try:
        pipe = _get_pipe()
        generation_start = time.perf_counter()
        
        with _inference_lock:
            output = pipe(
                prompt=prompt,
                negative_prompt=request.negative_prompt,
                height=height,
                width=width,
                num_frames=num_frames,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                generator=generator,
            )

        frames = output.frames[0]
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            temp_path = tmp.name
        export_to_video(frames, temp_path, fps=settings.fps)

        with open(temp_path, "rb") as video_file:
            video_bytes = video_file.read()

        max_bytes = settings.max_output_mb * 1024 * 1024
        if len(video_bytes) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Generated video is too large. Max size is {settings.max_output_mb} MB",
            )

        return {
            "video_base64": base64.b64encode(video_bytes).decode("ascii"),
            "mime_type": "video/mp4",
            "model": settings.model,
            "height": height,
            "width": width,
            "num_frames": num_frames,
            "fps": settings.fps,
            "seed": request.seed,
            "generation_time_ms": int((time.perf_counter() - generation_start) * 1000),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Video generation failed")
        raise HTTPException(status_code=500, detail="Video generation failed") from None
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                logger.warning("Failed to remove temporary video file: %s", temp_path)
