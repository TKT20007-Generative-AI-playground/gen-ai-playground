"""Template validation/discovery tests for recent audio/custom template work."""

import json
from pathlib import Path

import pytest

from app.template_discovery import discover_templates, get_audio_template_map, get_video_template_map
from app.template_models import TemplateConfig


def test_custom_engine_requires_image():
    with pytest.raises(ValueError, match="custom.image"):
        TemplateConfig.model_validate(
            {
                "engine": "custom",
                "model": "whisper-large-v3-turbo",
                "custom": {},
            }
        )


def test_custom_engine_rejects_latest_image_tag():
    with pytest.raises(ValueError, match="latest"):
        TemplateConfig.model_validate(
            {
                "engine": "custom",
                "model": "whisper-large-v3-turbo",
                "custom": {"image": "repo/whisper-service:latest"},
            }
        )


def test_custom_engine_rejects_invalid_env_key():
    with pytest.raises(ValueError, match="invalid key"):
        TemplateConfig.model_validate(
            {
                "engine": "custom",
                "model": "whisper-large-v3-turbo",
                "custom": {
                    "image": "repo/whisper-service:v1",
                    "env": {
                        "BAD-KEY": "1",
                    },
                },
            }
        )


def test_discovery_fails_on_duplicate_display_names(tmp_path: Path, monkeypatch):
    from app import template_discovery

    duplicate_name = "Whisper Duplicate"

    first = {
        "engine": "custom",
        "display_name": duplicate_name,
        "model": "whisper-large-v3-turbo",
        "gpu_types": ["l40s"],
        "custom": {"image": "repo/whisper:v1"},
        "port": 9000,
    }

    second = {
        "engine": "custom",
        "display_name": duplicate_name,
        "model": "whisper-large-v3",
        "gpu_types": ["l40s"],
        "custom": {"image": "repo/whisper:v2"},
        "port": 9000,
    }

    (tmp_path / "whisper-one.json").write_text(json.dumps(first), encoding="utf-8")
    (tmp_path / "whisper-two.json").write_text(json.dumps(second), encoding="utf-8")

    monkeypatch.setattr(template_discovery, "TEMPLATES_DIR", tmp_path)

    with pytest.raises(ValueError, match="Duplicate template display_name"):
        discover_templates(include_audio=True)


def test_audio_map_keeps_audio_template_when_text_has_same_display_name(tmp_path: Path, monkeypatch):
    from app import template_discovery

    duplicate_name = "Shared Display Name"

    audio = {
        "engine": "custom",
        "display_name": duplicate_name,
        "model": "whisper-large-v3-turbo",
        "gpu_types": ["l40s"],
        "custom": {"image": "repo/whisper:v1"},
        "port": 9000,
    }

    text = {
        "engine": "custom",
        "display_name": duplicate_name,
        "model": "meta-llama/Llama-3.1-8B-Instruct",
        "gpu_types": ["l40s"],
        "custom": {"image": "repo/llm:v1"},
        "port": 9000,
    }

    (tmp_path / "whisper-one.json").write_text(json.dumps(audio), encoding="utf-8")
    (tmp_path / "llama-one.json").write_text(json.dumps(text), encoding="utf-8")

    monkeypatch.setattr(template_discovery, "TEMPLATES_DIR", tmp_path)
    monkeypatch.setattr(template_discovery, "_audio_cache", None)
    monkeypatch.setattr(template_discovery, "_cache", None)

    audio_map = get_audio_template_map()

    assert audio_map == {"whisper-one.json": duplicate_name}


def test_video_templates_are_split_from_text_and_audio_maps(tmp_path: Path, monkeypatch):
    from app import template_discovery

    video = {
        "engine": "custom",
        "display_name": "Wan Video",
        "model": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",
        "gpu_types": ["h100"],
        "custom": {"image": "repo/video:v1"},
        "port": 9000,
    }

    text = {
        "engine": "custom",
        "display_name": "Text Custom",
        "model": "meta-llama/Llama-3.1-8B-Instruct",
        "gpu_types": ["l40s"],
        "custom": {"image": "repo/llm:v1"},
        "port": 9000,
    }

    audio = {
        "engine": "custom",
        "display_name": "Whisper Tiny",
        "model": "tiny",
        "gpu_types": ["l40s"],
        "custom": {"image": "repo/whisper:v1"},
        "port": 9000,
    }

    (tmp_path / "video-wan.json").write_text(json.dumps(video), encoding="utf-8")
    (tmp_path / "llama-one.json").write_text(json.dumps(text), encoding="utf-8")
    (tmp_path / "whisper-one.json").write_text(json.dumps(audio), encoding="utf-8")

    monkeypatch.setattr(template_discovery, "TEMPLATES_DIR", tmp_path)
    monkeypatch.setattr(template_discovery, "_audio_cache", None)
    monkeypatch.setattr(template_discovery, "_video_cache", None)
    monkeypatch.setattr(template_discovery, "_cache", None)
    monkeypatch.setattr(template_discovery, "_config_cache", None)

    assert discover_templates() == {"llama-one.json": "Text Custom"}
    assert get_audio_template_map() == {"whisper-one.json": "Whisper Tiny"}
    assert get_video_template_map() == {"video-wan.json": "Wan Video"}
