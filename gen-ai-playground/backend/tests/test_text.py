"""
Tests for /text/* endpoints (deploy, connect, status, generate, chat, delete).

Mocks verda_service so no real Verda/network calls are made.
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
import bcrypt
import jwt
import mongomock
from unittest.mock import patch, MagicMock
import os

from server import app
from app.dependencies import validate_csrf_token


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_db():
    """Create a mock MongoDB database for testing."""
    client = mongomock.MongoClient()
    db = client["gen_ai_playground"]
    return db


@pytest.fixture
def client(mock_db):
    """Create a test client with mocked database."""
    app.dependency_overrides[validate_csrf_token] = lambda: None
    with patch('app.database.db_manager.db', mock_db):
        with patch('app.database.get_database', return_value=mock_db):
            yield TestClient(app)
    app.dependency_overrides.pop(validate_csrf_token, None)


@pytest.fixture
def test_user_data():
    return {
        "username": "testuser",
        "password": "SecurePassword123!",
    }


@pytest.fixture
def registered_user(mock_db, test_user_data):
    """Insert a user into the mock database so JWT auth succeeds."""
    hashed_password = bcrypt.hashpw(
        test_user_data["password"].encode("utf-8"),
        bcrypt.gensalt(),
    )
    mock_db.users.insert_one({
        "username": test_user_data["username"],
        "password": hashed_password,
        "created_at": datetime.utcnow(),
    })
    return test_user_data


@pytest.fixture
def auth_token(test_user_data):
    """Generate a valid JWT token."""
    secret_key = "dev-secret-key-for-local-development"
    payload = {
        "username": test_user_data["username"],
        "exp": datetime.utcnow() + timedelta(hours=24),
    }
    return jwt.encode(payload, secret_key, algorithm="HS256")


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _healthy_status():
    return {"name": "test-deploy", "status": "healthy", "model": "m", "healthy": True}


def _unhealthy_status():
    return {"name": "test-deploy", "status": "deploying", "model": "m", "healthy": False}


# ===========================================================================
# 1. Healthy-check gating for /generate and /chat
# ===========================================================================

class TestHealthGating:
    """POST /text/generate and /text/chat must reject when deployment is unhealthy."""

    @patch("app.routers.text.verda_service")
    def test_generate_returns_503_when_unhealthy(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.get_deployment_status.return_value = _unhealthy_status()

        response = client.post(
            "/text/generate",
            json={"deployment_name": "test-deploy", "prompt": "Hello"},
            headers=auth_headers,
        )

        assert response.status_code == 503
        assert "not healthy" in response.json()["detail"].lower()
        mock_vs.generate_text.assert_not_called()

    @patch("app.routers.text.verda_service")
    def test_chat_returns_503_when_unhealthy(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.get_deployment_status.return_value = _unhealthy_status()

        response = client.post(
            "/text/chat",
            json={"deployment_name": "test-deploy", "messages": [{"role": "user", "content": "Hi"}]},
            headers=auth_headers,
        )

        assert response.status_code == 503
        assert "not healthy" in response.json()["detail"].lower()
        mock_vs.chat.assert_not_called()

    @patch("app.routers.text.verda_service")
    def test_generate_proceeds_when_healthy(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.get_deployment_status.return_value = _healthy_status()
        mock_vs.generate_text.return_value = {
            "generated_text": "world",
            "model": "m",
            "usage": {},
        }

        response = client.post(
            "/text/generate",
            json={"deployment_name": "test-deploy", "prompt": "Hello"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["generated_text"] == "world"
        mock_vs.generate_text.assert_called_once()

    @patch("app.routers.text.verda_service")
    def test_chat_proceeds_when_healthy(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.get_deployment_status.return_value = _healthy_status()
        mock_vs.chat.return_value = {
            "reply": "Hi there!",
            "model": "m",
            "usage": {},
        }

        response = client.post(
            "/text/chat",
            json={"deployment_name": "test-deploy", "messages": [{"role": "user", "content": "Hi"}]},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["reply"] == "Hi there!"
        mock_vs.chat.assert_called_once()


# ===========================================================================
# 2. Status codes for connect / deploy / delete error paths
# ===========================================================================

class TestDeployErrors:
    """POST /text/deploy error paths."""

    @patch("app.routers.text.verda_service")
    def test_deploy_runtime_error_returns_500(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.deploy_model.side_effect = RuntimeError("SDK boom")

        response = client.post(
            "/text/deploy",
            json={"model_path": "some/model"},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "SDK boom" in response.json()["detail"]

    @patch("app.routers.text.verda_service")
    def test_deploy_generic_exception_returns_500(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.deploy_model.side_effect = Exception("unexpected")

        response = client.post(
            "/text/deploy",
            json={"model_path": "some/model"},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "Failed to deploy model" in response.json()["detail"]

    @patch("app.routers.text.verda_service")
    def test_deploy_success_returns_200(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.deploy_model.return_value = {
            "name": "deploy-1",
            "status": "deploying",
            "model": "some/model",
            "message": "ok",
        }

        response = client.post(
            "/text/deploy",
            json={"model_path": "some/model"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["status"] == "deploying"


class TestConnectErrors:
    """POST /text/connect error paths."""

    @patch("app.routers.text.verda_service")
    def test_connect_not_found_returns_404(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.connect_to_existing.return_value = {
            "status": "error",
            "message": "Deployment not found",
        }

        response = client.post(
            "/text/connect",
            json={"deployment_name": "ghost"},
            headers=auth_headers,
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @patch("app.routers.text.verda_service")
    def test_connect_unexpected_exception_returns_500(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.connect_to_existing.side_effect = Exception("network down")

        response = client.post(
            "/text/connect",
            json={"deployment_name": "x"},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "network down" in response.json()["detail"]

    @patch("app.routers.text.verda_service")
    def test_connect_success_returns_200(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.connect_to_existing.return_value = {
            "name": "existing-deploy",
            "status": "healthy",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "healthy": True,
            "message": "Connected to existing deployment",
        }

        response = client.post(
            "/text/connect",
            json={"deployment_name": "existing-deploy"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["healthy"] is True


class TestDeleteErrors:
    """DELETE /text/deploy error paths."""

    @patch("app.routers.text.verda_service")
    def test_delete_error_returns_500(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.delete_deployment.return_value = {
            "status": "error",
            "name": "deploy-1",
            "message": "api failure",
        }

        response = client.delete("/text/deploy?deployment_name=deploy-1", headers=auth_headers)

        assert response.status_code == 500
        assert "api failure" in response.json()["detail"]

    @patch("app.routers.text.verda_service")
    def test_delete_no_deployment_returns_200(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.delete_deployment.return_value = {
            "status": "no_deployment",
            "message": "No active deployment to delete",
        }

        response = client.delete("/text/deploy?deployment_name=deploy-1", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["status"] == "no_deployment"

    @patch("app.routers.text.verda_service")
    def test_delete_success_returns_200(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.delete_deployment.return_value = {
            "status": "deleted",
            "name": "deploy-1",
        }

        response = client.delete("/text/deploy?deployment_name=deploy-1", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"


# ===========================================================================
# 3. MongoDB history inserts for text/generate and text/chat
# ===========================================================================

class TestTextHistoryInserts:
    """Verify that successful /generate and /chat calls save to MongoDB."""

    @patch("app.routers.text.verda_service")
    def test_generate_inserts_history_record(
        self, mock_vs, client, mock_db, registered_user, auth_headers
    ):
        mock_vs.get_deployment_status.return_value = _healthy_status()
        mock_vs.generate_text.return_value = {
            "generated_text": "once upon a time",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "usage": {"prompt_tokens": 3, "completion_tokens": 5},
        }

        response = client.post(
            "/text/generate",
            json={"deployment_name": "test-deploy", "prompt": "Tell me a story"},
            headers=auth_headers,
        )

        assert response.status_code == 200

        # Verify MongoDB insert
        records = list(mock_db.text_generations.find({"type": "text"}))
        assert len(records) == 1

        rec = records[0]
        assert rec["prompt"] == "Tell me a story"
        assert rec["generated_text"] == "once upon a time"
        assert rec["model"] == "deepseek-ai/deepseek-llm-7b-chat"
        assert rec["username"] == "testuser"
        assert "timestamp" in rec
        assert rec["usage"] == {"prompt_tokens": 3, "completion_tokens": 5}

    @patch("app.routers.text.verda_service")
    def test_chat_inserts_history_record(
        self, mock_vs, client, mock_db, registered_user, auth_headers
    ):
        mock_vs.get_deployment_status.return_value = _healthy_status()
        mock_vs.chat.return_value = {
            "reply": "I'm fine, thanks!",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "usage": {"prompt_tokens": 4, "completion_tokens": 6},
        }

        response = client.post(
            "/text/chat",
            json={"deployment_name": "test-deploy", "messages": [{"role": "user", "content": "How are you?"}]},
            headers=auth_headers,
        )

        assert response.status_code == 200

        records = list(mock_db.text_generations.find({"type": "chat"}))
        assert len(records) == 1

        rec = records[0]
        assert rec["reply"] == "I'm fine, thanks!"
        assert rec["model"] == "deepseek-ai/deepseek-llm-7b-chat"
        assert rec["username"] == "testuser"
        assert rec["messages"] == [{"role": "user", "content": "How are you?"}]
        assert "timestamp" in rec
        assert rec["usage"] == {"prompt_tokens": 4, "completion_tokens": 6}

    @patch("app.routers.text.verda_service")
    def test_generate_still_returns_on_db_failure(
        self, mock_vs, client, mock_db, registered_user, auth_headers
    ):
        """Even if MongoDB insert fails, the endpoint should still return generated text."""
        mock_vs.get_deployment_status.return_value = _healthy_status()
        mock_vs.generate_text.return_value = {
            "generated_text": "result",
            "model": "m",
            "usage": {},
        }

        # Make the insert blow up
        with patch.object(mock_db.text_generations, "insert_one", side_effect=Exception("db down")):
            response = client.post(
                "/text/generate",
                json={"deployment_name": "test-deploy", "prompt": "go"},
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert response.json()["generated_text"] == "result"

    @patch("app.routers.text.verda_service")
    def test_chat_still_returns_on_db_failure(
        self, mock_vs, client, mock_db, registered_user, auth_headers
    ):
        """Even if MongoDB insert fails, the chat endpoint should still return the reply."""
        mock_vs.get_deployment_status.return_value = _healthy_status()
        mock_vs.chat.return_value = {
            "reply": "hi",
            "model": "m",
            "usage": {},
        }

        with patch.object(mock_db.text_generations, "insert_one", side_effect=Exception("db down")):
            response = client.post(
                "/text/chat",
                json={"deployment_name": "test-deploy", "messages": [{"role": "user", "content": "hey"}]},
                headers=auth_headers,
            )

        assert response.status_code == 200
        assert response.json()["reply"] == "hi"


# ===========================================================================
# 4. Status endpoint
# ===========================================================================

class TestStatusEndpoint:

    @patch("app.routers.text.verda_service")
    def test_status_returns_current_deployment_info(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.get_deployment_status.return_value = _healthy_status()

        response = client.get("/text/status?deployment_name=test-deploy", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["healthy"] is True

    @patch("app.routers.text.verda_service")
    def test_status_accepts_cookie_auth(
        self, mock_vs, client, registered_user, auth_token
    ):
        mock_vs.get_deployment_status.return_value = _healthy_status()
        client.cookies.set("access_token", auth_token)

        response = client.get("/text/status?deployment_name=test-deploy")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["healthy"] is True

    @patch("app.routers.text.verda_service")
    def test_status_no_active_deployment(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_vs.get_deployment_status.return_value = {
            "status": "no_deployment",
            "message": "No active deployment",
        }

        response = client.get("/text/status?deployment_name=test-deploy", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["status"] == "no_deployment"


# ===========================================================================
# 5. Auth gating – endpoints should require valid JWT
# ===========================================================================

class TestAuthRequired:
    """All /text/* endpoints must reject unauthenticated requests."""

    def test_deploy_requires_auth(self, client):
        response = client.post("/text/deploy", json={"model_path": "x"})
        assert response.status_code == 401  # missing Authorization header

    def test_connect_requires_auth(self, client):
        response = client.post("/text/connect", json={"deployment_name": "x"})
        assert response.status_code == 401

    def test_status_requires_auth(self, client):
        response = client.get("/text/status?deployment_name=x")
        assert response.status_code == 401

    def test_generate_requires_auth(self, client):
        response = client.post("/text/generate", json={"deployment_name": "x", "prompt": "hi"})
        assert response.status_code == 401

    def test_chat_requires_auth(self, client):
        response = client.post(
            "/text/chat",
            json={"deployment_name": "x", "messages": [{"role": "user", "content": "hi"}]},
        )
        assert response.status_code == 401

    def test_delete_requires_auth(self, client):
        response = client.delete("/text/deploy?deployment_name=x")
        assert response.status_code == 401
