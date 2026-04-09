"""
Auto-discover templates from the backend/templates/ directory.

Scans *.json files, validates them through TemplateConfig, and builds
a mapping of {template_filename: display_name}.

Display names are derived from filenames: strip .json, capitalize first letter.
Deployment names use the same stem in lowercase.
"""
import json
from collections.abc import Callable
from pathlib import Path
from app.template_models import TemplateConfig

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

_SKIP_TEMPLATES = {"custom-engine.json"} # not tested/validated, and not needed in the dropdowns


def _is_audio_template(filename: str) -> bool:
    """Audio templates are currently identified by whisper-* naming."""
    return filename.startswith("whisper-")


def _display_name_from_filename(filename: str) -> str:
    """'deepseek-7b-sglang.json' -> 'Deepseek-7b-sglang'"""
    stem = filename.removesuffix(".json")
    return stem[0].upper() + stem[1:]


def _display_name_from_template(filename: str, data: dict) -> str:
    """Prefer explicit template display_name, then fallback to filename-derived name."""
    display_name = data.get("display_name")
    if isinstance(display_name, str) and display_name.strip():
        return display_name.strip()
    return _display_name_from_filename(filename)


def _deployment_name_from_filename(filename: str) -> str:
    """'deepseek-7b-sglang.json' -> 'deepseek-7b-sglang'"""
    return filename.removesuffix(".json").lower()


def _raise_duplicate_display_names(duplicates: list[tuple[str, str, str]]) -> None:
    """Raise a clear error when duplicate template display names are detected."""
    if not duplicates:
        return

    details = "; ".join(
        f"'{display_name}' used by {first_file} and {second_file}"
        for display_name, first_file, second_file in duplicates
    )
    raise ValueError(f"Duplicate template display_name values found: {details}")


def _discover_templates_with_predicate(should_include: Callable[[str], bool]) -> dict[str, str]:
    """Shared discovery pipeline for template scans with filename-level filtering."""
    result: dict[str, str] = {}
    seen_display_names: dict[str, str] = {}
    duplicate_display_names: list[tuple[str, str, str]] = []
    if not TEMPLATES_DIR.is_dir():
        return result

    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        if path.name in _SKIP_TEMPLATES:
            continue
        if not should_include(path.name):
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            TemplateConfig(**data)
            display_name = _display_name_from_template(path.name, data)
            normalized_display_name = display_name.strip().lower()
            existing_file = seen_display_names.get(normalized_display_name)
            if existing_file:
                duplicate_display_names.append((display_name, existing_file, path.name))
                continue
            seen_display_names[normalized_display_name] = path.name
            result[path.name] = display_name
        except Exception as exc:
            print(f"Skipping invalid template '{path.name}': {exc}")
            continue

    _raise_duplicate_display_names(duplicate_display_names)
    return result


def discover_templates(include_audio: bool = False) -> dict[str, str]:
    """
    Scan TEMPLATES_DIR for *.json, validate each, return {filename: display_name}.
    Skips files in _SKIP_TEMPLATES and invalid templates.

    Args:
        include_audio: If False, exclude audio/whisper templates.
    """
    if include_audio:
        return _discover_templates_with_predicate(lambda _filename: True)
    return _discover_templates_with_predicate(lambda filename: not _is_audio_template(filename))


def discover_audio_templates() -> dict[str, str]:
    """
    Scan TEMPLATES_DIR for audio *.json templates only, return {filename: display_name}.
    Skips files in _SKIP_TEMPLATES and invalid templates.
    """
    return _discover_templates_with_predicate(_is_audio_template)


_cache: dict[str, str] | None = None
_audio_cache: dict[str, str] | None = None


def get_template_map() -> dict[str, str]:
    """Return the cached {template_filename: display_name} mapping."""
    global _cache
    if _cache is None:
        _cache = discover_templates()
    return _cache


def get_audio_template_map() -> dict[str, str]:
    """Return cached audio {template_filename: display_name} mapping."""
    global _audio_cache
    if _audio_cache is None:
        _audio_cache = discover_audio_templates()
    return _audio_cache


def refresh() -> dict[str, str]:
    """Re-scan the templates directory and update the cache."""
    global _cache, _audio_cache
    _cache = discover_templates()
    _audio_cache = discover_audio_templates()
    return _cache
