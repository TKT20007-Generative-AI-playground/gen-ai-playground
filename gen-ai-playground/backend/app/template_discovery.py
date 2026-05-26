"""
Auto-discover templates from the backend/templates/ directory.

Scans *.json files, validates them through TemplateConfig, and builds
a mapping of {template_filename: display_name}.

Display names prefer the template "name" field when present; otherwise
they fall back to filename-derived names. Deployment names use the
same stem in lowercase.
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


def _is_video_template(filename: str) -> bool:
    return filename.startswith("video-")


def _is_text_template(filename: str) -> bool:
    return not _is_audio_template(filename) and not _is_video_template(filename)


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


def _discover_templates_with_predicate(should_include: Callable[[str], bool]) -> tuple[dict[str, str], dict[str, TemplateConfig]]:
    """Shared discovery pipeline for template scans with filename-level filtering."""
    names: dict[str, str] = {}
    configs: dict[str, TemplateConfig] = {}
    seen_display_names: dict[str, str] = {}
    duplicate_display_names: list[tuple[str, str, str]] = []

    if not TEMPLATES_DIR.is_dir():
        return names, configs

    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        if path.name in _SKIP_TEMPLATES:
            continue
        if not should_include(path.name):
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            cfg = TemplateConfig(**data)

            display_name = _display_name_from_template(path.name, data)
            normalized_display_name = display_name.strip().lower()

            existing_file = seen_display_names.get(normalized_display_name)
            if existing_file:
                duplicate_display_names.append((display_name, existing_file, path.name))
                continue

            seen_display_names[normalized_display_name] = path.name
            names[path.name] = display_name
            configs[path.name] = cfg
        except Exception as exc:
            print(f"Skipping invalid template '{path.name}': {exc}")
            continue

    _raise_duplicate_display_names(duplicate_display_names)
    return names, configs


def discover_templates(include_audio: bool = False) -> dict[str, str]:
    """
    Scan TEMPLATES_DIR for *.json, validate each, return {filename: display_name}.
    Skips files in _SKIP_TEMPLATES and invalid templates.

    Args:
        include_audio: If False, return text templates only (excluding audio
            and video templates). If True, include audio/whisper templates in
            addition to text templates, while still excluding video templates.
    """
    if include_audio:
        names, _ = _discover_templates_with_predicate(lambda filename: not _is_video_template(filename))
    else:
        names, _ = _discover_templates_with_predicate(_is_text_template)
    return names


def discover_audio_templates() -> dict[str, str]:
    """
    Scan TEMPLATES_DIR for audio *.json templates only, return {filename: display_name}.
    Skips files in _SKIP_TEMPLATES and invalid templates.
    """
    names, _configs = _discover_templates_with_predicate(_is_audio_template)
    return names


def discover_video_templates() -> dict[str, str]:
    names, _configs = _discover_templates_with_predicate(_is_video_template)
    return names


_cache: dict[str, str] | None = None
_config_cache: dict[str, TemplateConfig] | None = None
_audio_cache: dict[str, str] | None = None
_video_cache: dict[str, str] | None = None


def _ensure_cache() -> None:
    global _cache, _config_cache
    if _cache is None or _config_cache is None:
        _cache, _config_cache = _discover_templates_with_predicate(
            _is_text_template
        )

def get_template_map() -> dict[str, str]:
    """Return the cached {template_filename: display_name} mapping."""
    _ensure_cache()
    return _cache  # type: ignore[return-value]


def get_template_configs() -> dict[str, TemplateConfig]:
    """Return the cached {template_filename: TemplateConfig} mapping."""
    _ensure_cache()
    return _config_cache  # type: ignore[return-value]


def get_audio_template_map() -> dict[str, str]:
    """Return cached audio {template_filename: display_name} mapping."""
    global _audio_cache
    if _audio_cache is None:
        _audio_cache = discover_audio_templates()
    return _audio_cache


def get_video_template_map() -> dict[str, str]:
    global _video_cache
    if _video_cache is None:
        _video_cache = discover_video_templates()
    return _video_cache


def refresh() -> dict[str, str]:
    """Re-scan the templates directory and update all caches."""
    global _cache, _config_cache, _audio_cache, _video_cache
    _cache, _config_cache = _discover_templates_with_predicate(
        _is_text_template
    )
    _audio_cache = discover_audio_templates()
    _video_cache = discover_video_templates()
    return _cache
