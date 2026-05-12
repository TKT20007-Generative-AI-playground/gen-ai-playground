import base64
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import bcrypt
import jwt
import mongomock
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from server import app


@pytest.fixture
def mock_db():
    client = mongomock.MongoClient()
    return client["gen_ai_playground"]


@pytest.fixture
def test_user_data():
    return {
        "username": "video-user",
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
            "created_at": datetime.now(timezone.utc),
        }
    )
    return test_user_data


@pytest.fixture
def auth_token(test_user_data):
    payload = {
        "username": test_user_data["username"],
        "is_admin": True,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
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


@patch("app.routers.video.get_video_template_map", return_value={"video-a.json": "Video A"})
@patch("app.routers.video.verda_service")
def test_video_model_statuses_maps_live_starting_offline(
    mock_verda_service,
    _mock_template_map,
    client,
    registered_user,
    auth_headers,
):
    mock_verda_service.list_deployments.return_value = [
        {"name": "video-a", "endpoint_url": "https://example.com/v1/"},
        {"name": "other", "endpoint_url": "https://example.com/v2/"},
    ]

    def fake_status(name: str):
        if name == "video-a":
            return {"status": "healthy"}
        return {"status": "deploying"}

    mock_verda_service.get_deployment_status.side_effect = fake_status

    response = client.get("/video/model-statuses", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["Video A"] == "live"


@patch("app.routers.video.get_video_template_map", return_value={"video-a.json": "Video A"})
@patch("app.routers.video.verda_service")
def test_video_deploy_uses_resolved_template(
    mock_verda_service,
    _mock_template_map,
    client,
    registered_user,
    auth_headers,
):
    mock_verda_service.deploy_from_template.return_value = {
        "name": "video-a",
        "status": "deploying",
        "model": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",
    }

    response = client.post(
        "/video/deploy",
        json={"model_path": "Video A"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "video-a"
    mock_verda_service.deploy_from_template.assert_called_once_with(
        template_json="video-a.json",
        deployment_name=None,
    )


@patch("app.routers.video.get_video_template_map", return_value={"video-wan21-t2v-13b-custom.json": "Wan2.1 T2V 1.3B"})
@patch("app.routers.video.verda_service")
def test_video_deploy_accepts_wan_human_label_alias(
    mock_verda_service,
    _mock_template_map,
    client,
    registered_user,
    auth_headers,
):
    mock_verda_service.deploy_from_template.return_value = {
        "name": "video-wan21-t2v-13b-custom",
        "status": "deploying",
        "model": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",
    }

    response = client.post(
        "/video/deploy",
        json={"model_path": "Wan 2.1 (1.3B)"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    mock_verda_service.deploy_from_template.assert_called_once_with(
        template_json="video-wan21-t2v-13b-custom.json",
        deployment_name=None,
    )


@patch("app.routers.video._resolve_video_endpoint", return_value=("video-a", "https://video.example"))
@patch("app.routers.video._post_video_generate", new_callable=AsyncMock)
def test_generate_video_saves_history(
    mock_generate,
    _mock_resolve,
    client,
    mock_db,
    registered_user,
    auth_headers,
):
    video_data = base64.b64encode(b"mp4-bytes").decode("ascii")
    mock_generate.return_value = {
        "video_base64": video_data,
        "mime_type": "video/mp4",
        "model": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",
        "generation_time_ms": 1234,
        "height": 480,
        "width": 832,
        "num_frames": 49,
        "fps": 16,
    }

    response = client.post(
        "/video/generate",
        json={"prompt": "A calm lake", "model_path": "Video A"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["video_base64"] == video_data
    record = mock_db.video_generations.find_one({"username": "video-user"})
    assert record["prompt"] == "A calm lake"
    assert record["video_data"] == video_data
    assert record["type"] == "video"


@patch("app.routers.video._resolve_video_endpoint", return_value=("video-a", "https://video.example"))
@patch("app.routers.video._post_video_generate", new_callable=AsyncMock)
@patch("app.routers.video.settings.MAX_VIDEO_OUTPUT_MB", 0)
def test_generate_video_rejects_output_over_history_limit(
    mock_generate,
    _mock_resolve,
    client,
    mock_db,
    registered_user,
    auth_headers,
):
    mock_generate.return_value = {
        "video_base64": base64.b64encode(b"x").decode("ascii"),
        "mime_type": "video/mp4",
    }

    response = client.post(
        "/video/generate",
        json={"prompt": "A calm lake", "model_path": "Video A"},
        headers=auth_headers,
    )

    assert response.status_code == 413
    assert mock_db.video_generations.count_documents({}) == 0


def test_video_history_returns_user_records(client, mock_db, registered_user, auth_headers):
    mock_db.video_generations.insert_one(
        {
            "type": "video",
            "prompt": "A calm lake",
            "model": "Wan",
            "timestamp": datetime.now(timezone.utc),
            "username": "video-user",
            "video_data": base64.b64encode(b"mp4").decode("ascii"),
            "mime_type": "video/mp4",
        }
    )

    response = client.get("/video/history", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["history"][0]["prompt"] == "A calm lake"


def test_video_history_sidebar_limits_records(client, mock_db, registered_user, auth_headers):
    for index in range(3):
        mock_db.video_generations.insert_one(
            {
                "type": "video",
                "prompt": f"Prompt {index}",
                "model": "Wan",
                "timestamp": datetime.now(timezone.utc),
                "username": "video-user",
                "video_data": base64.b64encode(b"mp4").decode("ascii"),
                "mime_type": "video/mp4",
            }
        )

    response = client.get("/video/history-sidebar?limit=5", headers=auth_headers)

    assert response.status_code == 200
    assert len(response.json()["history"]) == 3
