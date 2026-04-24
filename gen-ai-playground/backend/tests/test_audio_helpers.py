"""Focused helper tests for audio router branch coverage."""

import asyncio
import io
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers import audio as audio_router


class _DummyResponse:
    def __init__(self, status_code: int, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def raise_for_status(self):
        if self.status_code >= 400 and self.status_code != 404:
            raise RuntimeError("http error")

    def json(self):
        return self._payload


class _DummyUpload:
    def __init__(self, data: bytes, size=None):
        self.file = io.BytesIO(data)
        self.size = size


class TestAudioHelpers:
    def test_inference_headers_prefers_inference_key(self, monkeypatch):
        monkeypatch.setattr(audio_router.settings, "VERDA_INFERENCE_KEY", "inference-key", raising=False)
        monkeypatch.setattr(audio_router.settings, "VERDA_API_KEY", "api-key", raising=False)
        assert audio_router._inference_headers() == {"Authorization": "Bearer inference-key"}

    def test_inference_headers_uses_api_key_fallback(self, monkeypatch):
        monkeypatch.setattr(audio_router.settings, "VERDA_INFERENCE_KEY", None, raising=False)
        monkeypatch.setattr(audio_router.settings, "VERDA_API_KEY", "api-key", raising=False)
        assert audio_router._inference_headers() == {"Authorization": "Bearer api-key"}

    def test_inference_headers_empty_without_keys(self, monkeypatch):
        monkeypatch.setattr(audio_router.settings, "VERDA_INFERENCE_KEY", None, raising=False)
        monkeypatch.setattr(audio_router.settings, "VERDA_API_KEY", None, raising=False)
        assert audio_router._inference_headers() == {}

    def test_audio_deployment_names_from_templates(self, monkeypatch):
        monkeypatch.setattr(
            audio_router,
            "get_audio_template_map",
            lambda: {"whisper-small.json": "Small", "whisper-large.json": "Large"},
        )
        assert audio_router._audio_deployment_names() == {"whisper-small", "whisper-large"}

    def test_resolve_audio_template_name(self, monkeypatch):
        monkeypatch.setattr(audio_router, "get_audio_template_map", lambda: {"whisper-a.json": "Whisper A"})
        assert audio_router._resolve_audio_template_name("Whisper A") == "whisper-a.json"
        assert audio_router._resolve_audio_template_name("Unknown") is None

    def test_safe_int(self):
        assert audio_router._safe_int(None) is None
        assert audio_router._safe_int("7") == 7
        assert audio_router._safe_int("7.9") == 7
        assert audio_router._safe_int("bad") is None

    def test_normalize_transcription_source(self):
        assert audio_router._normalize_transcription_source(None) is None
        assert audio_router._normalize_transcription_source("  Uploaded  ") == "uploaded"
        assert audio_router._normalize_transcription_source("recording") == "recording"
        assert audio_router._normalize_transcription_source("mic") is None

    def test_normalize_whisper_model_identifier(self):
        assert audio_router._normalize_whisper_model_identifier(None) is None
        assert audio_router._normalize_whisper_model_identifier("  ") is None
        assert audio_router._normalize_whisper_model_identifier("openai/whisper-large-v3") == "whisper-large-v3"
        assert audio_router._normalize_whisper_model_identifier("whisper-small") == "whisper-small"

    def test_resolve_audio_history_model_label_priority(self):
        assert (
            audio_router._resolve_audio_history_model_label(
                requested_model="Whisper A",
                result_model="openai/whisper-b",
                deployment_name="whisper-c",
            )
            == "Whisper A"
        )
        assert (
            audio_router._resolve_audio_history_model_label(
                requested_model=None,
                result_model="openai/whisper-b",
                deployment_name="whisper-c",
            )
            == "whisper-b"
        )
        assert (
            audio_router._resolve_audio_history_model_label(
                requested_model=None,
                result_model=None,
                deployment_name="",
            )
            == "unknown"
        )

    def test_whisper_url_building(self):
        assert audio_router._whisper_url("https://a.example/", "health") == "https://a.example/health"
        assert audio_router._whisper_url("https://a.example", "/health") == "https://a.example/health"
        assert audio_router._whisper_url("https://a.example", "") == "https://a.example"

    def test_enforce_audio_upload_size_limit_with_size_attr(self, monkeypatch):
        monkeypatch.setattr(audio_router.settings, "MAX_AUDIO_UPLOAD_MB", 1, raising=False)
        audio_router._enforce_audio_upload_size_limit(_DummyUpload(b"a" * 1024, size=1024))

        with pytest.raises(HTTPException) as exc:
            audio_router._enforce_audio_upload_size_limit(_DummyUpload(b"a" * (1024 * 1024 + 2), size=1024 * 1024 + 2))
        assert exc.value.status_code == 413

    def test_enforce_audio_upload_size_limit_computes_from_file_and_restores_pos(self, monkeypatch):
        monkeypatch.setattr(audio_router.settings, "MAX_AUDIO_UPLOAD_MB", 1, raising=False)
        upload = _DummyUpload(b"abcdef", size=None)
        upload.file.seek(2)

        audio_router._enforce_audio_upload_size_limit(upload)

        assert upload.file.tell() == 2


class TestResolveAudioEndpoint:
    def test_unsupported_model_raises_400(self, monkeypatch):
        monkeypatch.setattr(audio_router, "get_audio_template_map", lambda: {"whisper-a.json": "Whisper A"})
        with pytest.raises(HTTPException) as exc:
            audio_router._resolve_audio_endpoint(model_path="Unknown")
        assert exc.value.status_code == 400

    def test_no_deployments_raises_503(self, monkeypatch):
        monkeypatch.setattr(audio_router, "get_audio_template_map", lambda: {"whisper-a.json": "Whisper A"})
        monkeypatch.setattr(audio_router.verda_service, "list_deployments", lambda: [])
        with pytest.raises(HTTPException) as exc:
            audio_router._resolve_audio_endpoint()
        assert exc.value.status_code == 503

    def test_no_candidates_raises_503(self, monkeypatch):
        monkeypatch.setattr(audio_router, "get_audio_template_map", lambda: {"whisper-a.json": "Whisper A"})
        monkeypatch.setattr(
            audio_router.verda_service,
            "list_deployments",
            lambda: [{"name": "other", "endpoint_url": "https://x.example"}],
        )
        with pytest.raises(HTTPException) as exc:
            audio_router._resolve_audio_endpoint()
        assert exc.value.status_code == 503

    def test_returns_healthy_candidate(self, monkeypatch):
        monkeypatch.setattr(audio_router, "get_audio_template_map", lambda: {"whisper-a.json": "Whisper A"})
        monkeypatch.setattr(
            audio_router.verda_service,
            "list_deployments",
            lambda: [{"name": "whisper-a", "endpoint_url": "https://a.example/"}],
        )
        monkeypatch.setattr(
            audio_router.verda_service,
            "get_deployment_status",
            lambda name: {"status": "healthy", "name": name},
        )

        dep_name, endpoint = audio_router._resolve_audio_endpoint()
        assert dep_name == "whisper-a"
        assert endpoint == "https://a.example"

    def test_returns_fallback_when_not_require_healthy(self, monkeypatch):
        monkeypatch.setattr(audio_router, "get_audio_template_map", lambda: {"whisper-a.json": "Whisper A"})
        monkeypatch.setattr(
            audio_router.verda_service,
            "list_deployments",
            lambda: [{"name": "whisper-a", "endpoint_url": "https://a.example"}],
        )
        monkeypatch.setattr(
            audio_router.verda_service,
            "get_deployment_status",
            lambda _name: {"status": "deploying"},
        )

        dep_name, endpoint = audio_router._resolve_audio_endpoint(require_healthy=False)
        assert dep_name == "whisper-a"
        assert endpoint == "https://a.example"

    def test_unhealthy_with_require_healthy_raises(self, monkeypatch):
        monkeypatch.setattr(audio_router, "get_audio_template_map", lambda: {"whisper-a.json": "Whisper A"})
        monkeypatch.setattr(
            audio_router.verda_service,
            "list_deployments",
            lambda: [{"name": "whisper-a", "endpoint_url": "https://a.example"}],
        )
        monkeypatch.setattr(
            audio_router.verda_service,
            "get_deployment_status",
            lambda _name: {"status": "deploying"},
        )

        with pytest.raises(HTTPException) as exc:
            audio_router._resolve_audio_endpoint(require_healthy=True)
        assert exc.value.status_code == 503


class TestFallbackHttpHelpers:
    def test_get_with_fallback_paths_returns_second_path_after_404(self, monkeypatch):
        responses = [
            _DummyResponse(404),
            _DummyResponse(200, {"status": "ok"}),
        ]

        class DummyAsyncClient:
            def __init__(self, *args, **kwargs):
                _ = args, kwargs

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                _ = exc_type, exc, tb
                return False

            async def get(self, _url, headers=None):
                _ = headers
                return responses.pop(0)

        monkeypatch.setattr(audio_router.httpx, "AsyncClient", DummyAsyncClient)
        result = asyncio.run(audio_router._get_with_fallback_paths("https://a.example", ["/x", "/health"]))
        assert result == {"status": "ok"}

    def test_get_with_fallback_paths_raises_when_all_404(self, monkeypatch):
        class DummyAsyncClient:
            def __init__(self, *args, **kwargs):
                _ = args, kwargs

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                _ = exc_type, exc, tb
                return False

            async def get(self, _url, headers=None):
                _ = headers
                return _DummyResponse(404)

        monkeypatch.setattr(audio_router.httpx, "AsyncClient", DummyAsyncClient)

        with pytest.raises(HTTPException) as exc:
            asyncio.run(audio_router._get_with_fallback_paths("https://a.example", ["/health", "/ready"]))

        assert exc.value.status_code == 503
        assert "tried_urls" in exc.value.detail

    def test_post_with_fallback_paths_raises_when_all_404(self, monkeypatch):
        class DummyAsyncClient:
            def __init__(self, *args, **kwargs):
                _ = args, kwargs

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                _ = exc_type, exc, tb
                return False

            async def post(self, _url, data=None, files=None, headers=None):
                _ = data, files, headers
                return _DummyResponse(404)

        monkeypatch.setattr(audio_router.httpx, "AsyncClient", DummyAsyncClient)

        with pytest.raises(HTTPException) as exc:
            asyncio.run(
                audio_router._post_with_fallback_paths(
                    base_url="https://a.example",
                    paths=["/transcribe", "/predict"],
                    data={},
                    file_obj=io.BytesIO(b"abc"),
                    file_name="audio.wav",
                    file_content_type="audio/wav",
                )
            )

        assert exc.value.status_code == 503
        assert "tried_urls" in exc.value.detail
