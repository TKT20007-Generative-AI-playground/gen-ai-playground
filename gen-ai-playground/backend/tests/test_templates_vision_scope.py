"""Vision template discovery cache regression tests."""

import json
from pathlib import Path

from app import template_discovery


def test_vision_refresh_rebuilds_config_cache(tmp_path: Path, monkeypatch):
    template = {
        "engine": "custom",
        "display_name": "Vision A",
        "model": "vision-model-v1",
        "gpu_types": ["l40s"],
        "custom": {"image": "repo/vision:v1"},
        "port": 9000,
    }
    template_path = tmp_path / "vision-a.json"
    template_path.write_text(json.dumps(template), encoding="utf-8")

    monkeypatch.setattr(template_discovery, "TEMPLATES_DIR", tmp_path)
    monkeypatch.setattr(template_discovery, "_vision_cache", None)
    monkeypatch.setattr(template_discovery, "_vision_config_cache", None)

    assert template_discovery.get_vision_template_configs()["vision-a.json"].model == "vision-model-v1"

    template["model"] = "vision-model-v2"
    template_path.write_text(json.dumps(template), encoding="utf-8")

    template_discovery.refresh()

    assert template_discovery.get_vision_template_configs()["vision-a.json"].model == "vision-model-v2"