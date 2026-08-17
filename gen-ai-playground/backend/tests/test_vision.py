from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import bcrypt
import jwt
import mongomock
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.container_handler import ContainerHandler
from server import app


@pytest.fixture
def mock_db():
    client = mongomock.MongoClient()
    return client["gen_ai_playground"]


@pytest.fixture
def regular_user(mock_db):
    hashed = bcrypt.hashpw(b"UserPass123!", bcrypt.gensalt())
    mock_db.users.insert_one(
        {
            "username": "regularuser",
            "password": hashed,
            "is_admin": False,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"username": "regularuser", "password": "UserPass123!"}


@pytest.fixture
def auth_headers(regular_user):
    payload = {
        "username": regular_user["username"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(mock_db):
    app.state.container_handler = ContainerHandler()
    with patch("app.database.db_manager.db", mock_db):
        with patch("app.database.get_database", return_value=mock_db):
            yield TestClient(app)


@patch("app.routers.vision.get_vision_template_map", return_value={"vision-a.json": "Vision A"})
@patch("app.routers.vision.verda_service")
def test_vision_deploy_allows_regular_user(mock_verda_service, _mock_template_map, client, auth_headers):
    mock_verda_service.deploy_from_template.return_value = {
        "name": "vision-a",
        "status": "deploying",
        "model": "vision-model-v1",
    }

    response = client.post(
        "/vision/deploy",
        json={"model_path": "Vision A"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["name"] == "vision-a"
    mock_verda_service.deploy_from_template.assert_called_once_with(
        template_json="vision-a.json",
        deployment_name=None,
        container_handler=app.state.container_handler,
    )