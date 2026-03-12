"""
Auto-discover templates from the backend/templates/ directory.

Scans *.json files, validates them through TemplateConfig, and builds
a mapping of {template_filename: display_name}.

Display names are derived from filenames: strip .json, capitalize first letter.
Deployment names use the same stem in lowercase.
"""
import json
from pathlib import Path
from app.template_models import TemplateConfig

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

_SKIP_TEMPLATES = {"custom-engine.json"} # not tested/validated, and not needed in the dropdowns


def _display_name_from_filename(filename: str) -> str:
    """'deepseek-7b-sglang.json' -> 'Deepseek-7b-sglang'"""
    stem = filename.removesuffix(".json")
    return stem[0].upper() + stem[1:]


def _deployment_name_from_filename(filename: str) -> str:
    """'deepseek-7b-sglang.json' -> 'deepseek-7b-sglang'"""
    return filename.removesuffix(".json").lower()


def discover_templates() -> tuple[dict[str, str], dict[str, TemplateConfig]]:
    """
    Scan TEMPLATES_DIR for *.json, validate each.
    Returns ({filename: display_name}, {filename: TemplateConfig}).
    Skips files in _SKIP_TEMPLATES and invalid templates.
    """
    names: dict[str, str] = {}
    configs: dict[str, TemplateConfig] = {}
    if not TEMPLATES_DIR.is_dir():
        return names, configs

    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        if path.name in _SKIP_TEMPLATES:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            cfg = TemplateConfig(**data)
            names[path.name] = _display_name_from_filename(path.name)
            configs[path.name] = cfg
        except Exception:
            continue

    return names, configs


_cache: dict[str, str] | None = None
_config_cache: dict[str, TemplateConfig] | None = None


def _ensure_cache() -> None:
    global _cache, _config_cache
    if _cache is None:
        _cache, _config_cache = discover_templates()


def get_template_map() -> dict[str, str]:
    """Return the cached {template_filename: display_name} mapping."""
    _ensure_cache()
    return _cache  # type: ignore[return-value]


def get_template_configs() -> dict[str, TemplateConfig]:
    """Return the cached {template_filename: TemplateConfig} mapping."""
    _ensure_cache()
    return _config_cache  # type: ignore[return-value]


def refresh() -> dict[str, str]:
    """Re-scan the templates directory and update the cache."""
    global _cache, _config_cache
    _cache, _config_cache = discover_templates()
    return _cache
