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


def discover_templates() -> dict[str, str]:
    """
    Scan TEMPLATES_DIR for *.json, validate each, return {filename: display_name}.
    Skips files in _SKIP_TEMPLATES and invalid templates.
    """
    result: dict[str, str] = {}
    if not TEMPLATES_DIR.is_dir():
        return result

    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        if path.name in _SKIP_TEMPLATES:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            TemplateConfig(**data)
            result[path.name] = _display_name_from_filename(path.name)
        except Exception:
            continue

    return result


_cache: dict[str, str] | None = None


def get_template_map() -> dict[str, str]:
    """Return the cached {template_filename: display_name} mapping."""
    global _cache
    if _cache is None:
        _cache = discover_templates()
    return _cache


def refresh() -> dict[str, str]:
    """Re-scan the templates directory and update the cache."""
    global _cache
    _cache = discover_templates()
    return _cache
