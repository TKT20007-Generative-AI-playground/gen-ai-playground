"""Tests for /audio/* endpoints."""

import asyncio
import io
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch

import bcrypt
import jwt
import mongomock
import pytest
from pymongo.errors import PyMongoError
from fastapi.testclient import TestClient

from app.config import settings
from server import app


@pytest.fixture
def mock_db():
    """Create a mock MongoDB database for testing."""
    client = mongomock.MongoClient()
    return client["gen_ai_playground"]


@pytest.fixture
def test_user_data():
    return {
        "username": "audio-user",
        "password": "SecurePassword123!",
    }


@pytest.fixture
def registered_user(mock_db, test_user_data):
    hashed_password = bcrypt.hashpw(
        test_user_data["password"].encode("utf-8"),
        bcrypt.gensalt(),
    )
    mock_db.users.insert_one(
        {
            "username": test_user_data["username"],
            "password": hashed_password,
            "is_admin": True,
            "created_at": datetime.utcnow(),
        }
    )
    return test_user_data


@pytest.fixture
def auth_token(test_user_data):
    payload = {
        "username": test_user_data["username"],
        "is_admin": True,
        "exp": datetime.utcnow() + timedelta(hours=24),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
def client(mock_db):
    with patch("app.database.db_manager.db", mock_db):
        with patch("app.database.get_database", return_value=mock_db):
            yield TestClient(app)


class TestAudioHealthAuth:
    def test_health_requires_authentication(self, client):
        response = client.get("/audio/health")
        assert response.status_code == 401
        assert response.json()["detail"] == "Not authenticated"


class TestAudioEndpointSelection:
    @patch("app.routers.audio.get_audio_template_map")
    @patch("app.routers.audio._get_with_fallback_paths", new_callable=AsyncMock)
    @patch("app.routers.audio.verda_service")
    def test_health_prefers_healthy_deployment(
        self,
        mock_verda_service,
        mock_whisper_health,
        mock_template_map,
        client,
        registered_user,
        auth_headers,
    ):
        mock_template_map.return_value = {
            "whisper-a.json": "Whisper A",
            "whisper-b.json": "Whisper B",
        }

        mock_verda_service.list_deployments.return_value = [
            {"name": "whisper-a", "endpoint_url": "https://a.example"},
            {"name": "whisper-b", "endpoint_url": "https://b.example"},
        ]

        def _status_for_name(name: str):
            if name == "whisper-a":
                return {"name": name, "status": "deploying"}
            return {"name": name, "status": "healthy"}

        mock_verda_service.get_deployment_status.side_effect = _status_for_name
        mock_whisper_health.return_value = {"status": "ok"}

        response = client.get("/audio/health", headers=auth_headers)

        assert response.status_code == 200
        payload = response.json()
        assert payload["deployment"]["name"] == "whisper-b"
        assert payload["deployment"]["status"] == "healthy"
        mock_whisper_health.assert_awaited_once_with("https://b.example", ["health"])

    @patch("app.routers.audio._resolve_audio_endpoint", return_value=("whisper-a", "https://a.example"))
    @patch("app.routers.audio._get_with_fallback_paths", new_callable=AsyncMock)
    @patch("app.routers.audio.verda_service")
    def test_health_returns_degraded_payload_when_status_lookup_fails(
        self,
        mock_verda_service,
        mock_whisper_health,
        _mock_resolve,
        client,
        registered_user,
        auth_headers,
    ):
        mock_verda_service.get_deployment_status.side_effect = RuntimeError("verda status failed")

        response = client.get("/audio/health", headers=auth_headers)

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert payload["deployment"]["name"] == "whisper-a"
        assert payload["deployment"]["status"] == "unknown"
        assert payload["whisper"]["status"] == "unavailable"
        assert "Unable to fetch deployment status" in payload["whisper"]["detail"]
        mock_whisper_health.assert_not_awaited()


class TestAudioUploadValidation:
    @patch("app.routers.audio._resolve_audio_endpoint", return_value=("whisper-a", "https://a.example"))
    @patch("app.routers.audio._post_with_fallback_paths", new_callable=AsyncMock)
    def test_transcribe_does_not_prevalidate_upload_size(
        self,
        mock_proxy_call,
        _mock_resolve,
        client,
        registered_user,
        auth_headers,
    ):
        mock_proxy_call.return_value = {"text": "ok"}

        response = client.post(
            "/audio/transcribe",
            headers=auth_headers,
            files={"file": ("audio.wav", b"x" * 2048, "audio/wav")},
        )

        assert response.status_code == 200
        assert response.json() == {"text": "ok"}
        mock_proxy_call.assert_awaited_once()

    @patch("app.routers.audio._resolve_audio_endpoint", return_value=("whisper-a", "https://a.example"))
    @patch("app.routers.audio._post_with_fallback_paths", new_callable=AsyncMock)
    def test_transcribe_accepts_upload(
        self,
        mock_proxy_call,
        _mock_resolve,
        client,
        registered_user,
        auth_headers,
    ):
        mock_proxy_call.return_value = {"text": "ok"}

        response = client.post(
            "/audio/transcribe",
            headers=auth_headers,
            files={"file": ("audio.wav", b"x" * 1024, "audio/wav")},
        )

        assert response.status_code == 200
        assert response.json() == {"text": "ok"}
        mock_proxy_call.assert_awaited_once()

    @patch("app.routers.audio._resolve_audio_endpoint", return_value=("whisper-a", "https://a.example"))
    @patch("app.routers.audio._post_with_fallback_paths", new_callable=AsyncMock)
    def test_transcribe_rejects_beam_size_out_of_range(
        self,
        mock_proxy_call,
        _mock_resolve,
        client,
        registered_user,
        auth_headers,
    ):
        response = client.post(
            "/audio/transcribe",
            headers=auth_headers,
            data={"beam_size": "0"},
            files={"file": ("audio.wav", b"x", "audio/wav")},
        )

        assert response.status_code == 422
        mock_proxy_call.assert_not_awaited()


class TestAudioFallbackUpload:
    def test_post_with_fallback_paths_rewinds_file_between_attempts(self, monkeypatch):
        from app.routers import audio as audio_router

        captured_payloads: list[bytes] = []

        response_not_found = Mock()
        response_not_found.status_code = 404
        response_not_found.raise_for_status = Mock()

        response_ok = Mock()
        response_ok.status_code = 200
        response_ok.raise_for_status = Mock()
        response_ok.json = Mock(return_value={"text": "ok"})

        class DummyAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, _url, data=None, files=None, headers=None):
                _ = data, headers
                captured_payloads.append(files["file"][1].read())
                if len(captured_payloads) == 1:
                    return response_not_found
                return response_ok

        monkeypatch.setattr(audio_router.httpx, "AsyncClient", DummyAsyncClient)

        file_obj = io.BytesIO(b"abc123")
        result = asyncio.run(
            audio_router._post_with_fallback_paths(
                base_url="https://a.example",
                paths=["transcribe", "predict"],
                data={},
                file_obj=file_obj,
                file_name="audio.wav",
                file_content_type="audio/wav",
            )
        )

        assert result == {"text": "ok"}
        assert captured_payloads == [b"abc123", b"abc123"]


class TestAudioHistoryPersistence:
    @patch("app.routers.audio._resolve_audio_endpoint", return_value=("whisper-a", "https://a.example"))
    @patch("app.routers.audio._post_with_fallback_paths", new_callable=AsyncMock)
    def test_transcribe_inserts_history_record(
        self,
        mock_proxy_call,
        _mock_resolve,
        client,
        mock_db,
        registered_user,
        auth_headers,
    ):
        mock_proxy_call.return_value = {
            "text": "hello transcript",
            "model": "whisper-large-v3-turbo",
            "language": "en",
            "transcription_time_ms": 777,
        }

        response = client.post(
            "/audio/transcribe",
            headers=auth_headers,
            data={
                "model_path": "Whisper A",
                "source": "uploaded",
                "run_id": "run-123",
            },
            files={"file": ("audio.wav", b"abc", "audio/wav")},
        )

        assert response.status_code == 200

        records = list(mock_db.audio_transcriptions.find({"type": "transcription"}))
        assert len(records) == 1
        rec = records[0]
        assert rec["username"] == "audio-user"
        assert rec["model"] == "Whisper A"
        assert rec["transcription_text"] == "hello transcript"
        assert rec["language"] == "en"
        assert rec["transcription_time_ms"] == 777
        assert rec["source"] == "uploaded"
        assert rec["run_id"] == "run-123"
        assert rec["input_name"] == "audio.wav"
        assert "timestamp" in rec

    @patch("app.routers.audio._resolve_audio_endpoint", return_value=("whisper-a", "https://a.example"))
    @patch("app.routers.audio._post_with_fallback_paths", new_callable=AsyncMock)
    def test_transcribe_still_returns_on_db_failure(
        self,
        mock_proxy_call,
        _mock_resolve,
        client,
        mock_db,
        registered_user,
        auth_headers,
    ):
        mock_proxy_call.return_value = {"text": "ok", "model": "Whisper A"}

        with patch.object(mock_db.audio_transcriptions, "insert_one", side_effect=PyMongoError("db down")):
            response = client.post(
                "/audio/transcribe",
                headers=auth_headers,
                data={"model_path": "Whisper A"},
                files={"file": ("audio.wav", b"abc", "audio/wav")},
            )

        assert response.status_code == 200
        assert response.json()["text"] == "ok"

    @patch("app.routers.audio._resolve_audio_endpoint", return_value=("whisper-a", "https://a.example"))
    @patch("app.routers.audio._post_with_fallback_paths", new_callable=AsyncMock)
    def test_transcribe_normalizes_unknown_source_to_none(
        self,
        mock_proxy_call,
        _mock_resolve,
        client,
        mock_db,
        registered_user,
        auth_headers,
    ):
        mock_proxy_call.return_value = {
            "text": "ok",
            "model": "Whisper A",
        }

        response = client.post(
            "/audio/transcribe",
            headers=auth_headers,
            data={
                "model_path": "Whisper A",
                "source": "mic-input",
            },
            files={"file": ("audio.wav", b"abc", "audio/wav")},
        )

        assert response.status_code == 200
        record = mock_db.audio_transcriptions.find_one({"username": "audio-user"})
        assert record is not None
        assert record["source"] is None


class TestAudioHistoryEndpoints:
    def test_audio_history_returns_user_items(self, client, mock_db, registered_user, auth_headers):
        now = datetime.utcnow()
        mock_db.audio_transcriptions.insert_many(
            [
                {
                    "type": "transcription",
                    "transcription_text": "new item",
                    "model": "whisper-a",
                    "timestamp": now,
                    "username": "audio-user",
                    "transcription_time_ms": 100,
                },
                {
                    "type": "transcription",
                    "transcription_text": "old item",
                    "model": "whisper-a",
                    "timestamp": now - timedelta(minutes=1),
                    "username": "audio-user",
                    "transcription_time_ms": 120,
                },
                {
                    "type": "transcription",
                    "transcription_text": "other user",
                    "model": "whisper-b",
                    "timestamp": now,
                    "username": "someone-else",
                    "transcription_time_ms": 150,
                },
            ]
        )

        response = client.get("/audio/history", headers=auth_headers)

        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 2
        assert len(payload["history"]) == 2
        assert payload["history"][0]["transcription_text"] == "new item"
        assert payload["history"][1]["transcription_text"] == "old item"

    def test_audio_history_sidebar_returns_sorted_items(self, client, mock_db, registered_user, auth_headers):
        now = datetime.utcnow()
        mock_db.audio_transcriptions.insert_many(
            [
                {
                    "type": "transcription",
                    "transcription_text": "first",
                    "model": "whisper-a",
                    "timestamp": now - timedelta(minutes=2),
                    "username": "audio-user",
                },
                {
                    "type": "transcription",
                    "transcription_text": "second",
                    "model": "whisper-a",
                    "timestamp": now - timedelta(minutes=1),
                    "username": "audio-user",
                },
            ]
        )

        response = client.get("/audio/history-sidebar", headers=auth_headers)

        assert response.status_code == 200
        history = response.json()["history"]
        assert len(history) == 2
        assert history[0]["transcription_text"] == "second"
        assert history[1]["transcription_text"] == "first"

    def test_audio_history_sidebar_respects_limit(self, client, mock_db, registered_user, auth_headers):
        now = datetime.utcnow()
        mock_db.audio_transcriptions.insert_many(
            [
                {
                    "type": "transcription",
                    "transcription_text": "third",
                    "model": "whisper-a",
                    "timestamp": now - timedelta(minutes=3),
                    "username": "audio-user",
                },
                {
                    "type": "transcription",
                    "transcription_text": "second",
                    "model": "whisper-a",
                    "timestamp": now - timedelta(minutes=2),
                    "username": "audio-user",
                },
                {
                    "type": "transcription",
                    "transcription_text": "first",
                    "model": "whisper-a",
                    "timestamp": now - timedelta(minutes=1),
                    "username": "audio-user",
                },
            ]
        )

        response = client.get("/audio/history-sidebar", headers=auth_headers, params={"limit": 1})

        assert response.status_code == 200
        history = response.json()["history"]
        assert len(history) == 1
        assert history[0]["transcription_text"] == "first"

    def test_audio_history_sidebar_rejects_invalid_limit(self, client, registered_user, auth_headers):
        response = client.get("/audio/history-sidebar", headers=auth_headers, params={"limit": 0})
        assert response.status_code == 422
