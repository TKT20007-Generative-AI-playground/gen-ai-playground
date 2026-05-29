import pytest
from fastapi.testclient import TestClient
from datetime import datetime
from unittest.mock import patch, MagicMock, PropertyMock
import bcrypt
import jwt
import mongomock
import os

from server import app
from app.models import UserInfo
from app.config import settings
from app.dependencies import get_current_user, get_admin_user
from app.database import get_database
from app.container_handler import ContainerHandler


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_db():
    """Create a mock MongoDB database for testing"""
    client = mongomock.MongoClient()
    db = client["gen_ai_playground"]
    return db


@pytest.fixture
def admin_user(mock_db):
    """Insert an admin user into the mock database and return credentials."""
    hashed = bcrypt.hashpw(b"AdminPass123!", bcrypt.gensalt())
    mock_db.users.insert_one({
        "username": "admin",
        "password": hashed,
        "is_admin": True,
        "created_at": datetime.utcnow(),
    })
    return {"username": "admin", "password": "AdminPass123!"}


@pytest.fixture
def regular_user(mock_db):
    """Insert a non-admin user into the mock database and return credentials."""
    hashed = bcrypt.hashpw(b"UserPass123!", bcrypt.gensalt())
    mock_db.users.insert_one({
        "username": "regularuser",
        "password": hashed,
        "is_admin": False,
        "created_at": datetime.utcnow(),
    })
    return {"username": "regularuser", "password": "UserPass123!"}


def _make_token(username: str, is_admin: bool = False) -> str:
    """Helper to create a valid JWT token."""
    payload = {
        "username": username,
        "exp": datetime(2099, 1, 1).timestamp(),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


@pytest.fixture
def admin_client(mock_db, admin_user):
    """TestClient whose requests carry a valid admin JWT."""
    with patch("app.database.db_manager.db", mock_db), \
         patch("app.database.get_database", return_value=mock_db):
        app.state.container_handler = ContainerHandler()
        client = TestClient(app)
        token = _make_token("admin", is_admin=True)
        client.headers.update({"Authorization": f"Bearer {token}"})
        yield client


@pytest.fixture
def regular_client(mock_db, regular_user):
    """TestClient whose requests carry a valid non-admin JWT."""
    with patch("app.database.db_manager.db", mock_db), \
         patch("app.database.get_database", return_value=mock_db):
        app.state.container_handler = ContainerHandler()
        client = TestClient(app)
        token = _make_token("regularuser", is_admin=False)
        client.headers.update({"Authorization": f"Bearer {token}"})
        yield client


@pytest.fixture
def unauthenticated_client(mock_db):
    """TestClient with no Authorization header."""
    with patch("app.database.db_manager.db", mock_db), \
         patch("app.database.get_database", return_value=mock_db):
        app.state.container_handler = ContainerHandler()
        yield TestClient(app)


# ---------------------------------------------------------------------------
# Mock helpers for Verda service
# ---------------------------------------------------------------------------

def _mock_deployment(name: str, endpoint_url: str = "https://example.com"):
    """Create a mock Verda deployment object."""
    dep = MagicMock()
    dep.name = name
    dep.endpoint_base_url = endpoint_url
    return dep


def _mock_status(value: str):
    """Create a mock deployment status object."""
    status = MagicMock()
    status.value = value
    return status


# ===========================================================================
# GET /dashboard/containers
# ===========================================================================


class TestListContainers:
    """Tests for GET /dashboard/containers"""

    def test_returns_deployments_for_admin(self, admin_client):
        """Admin user receives a list of container deployments."""
        deployments = [
            _mock_deployment("deploy-a", "https://a.example.com"),
            _mock_deployment("deploy-b", "https://b.example.com"),
        ]

        mock_client = MagicMock()
        mock_client.containers.get_deployments.return_value = deployments
        mock_client.containers.get_deployment_status.side_effect = [
            _mock_status("running"),
            _mock_status("stopped"),
        ]

        with patch("app.routers.dashboard.verda_service._get_client", return_value=mock_client):
            response = admin_client.get("/dashboard/containers")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        assert data[0]["name"] == "deploy-a"
        assert data[0]["status"] == "running"
        assert data[0]["image"] == "https://a.example.com"
        assert data[0]["container_id"] == "deploy-a"

        assert data[1]["name"] == "deploy-b"
        assert data[1]["status"] == "stopped"

    def test_returns_empty_list_when_no_deployments(self, admin_client):
        """Admin gets an empty list when there are no deployments."""
        mock_client = MagicMock()
        mock_client.containers.get_deployments.return_value = []

        with patch("app.routers.dashboard.verda_service._get_client", return_value=mock_client):
            response = admin_client.get("/dashboard/containers")

        assert response.status_code == 200
        assert response.json() == []

    def test_status_unknown_on_status_error(self, admin_client):
        """If status lookup fails for a deployment, status should be 'unknown'."""
        deployments = [_mock_deployment("deploy-err")]

        mock_client = MagicMock()
        mock_client.containers.get_deployments.return_value = deployments
        mock_client.containers.get_deployment_status.side_effect = Exception("timeout")

        with patch("app.routers.dashboard.verda_service._get_client", return_value=mock_client):
            response = admin_client.get("/dashboard/containers")

        assert response.status_code == 200
        assert response.json()[0]["status"] == "unknown"

    def test_image_fallback_when_no_endpoint(self, admin_client):
        """If a deployment has no endpoint_base_url, image should be empty string."""
        dep = MagicMock()
        dep.name = "no-endpoint"
        # Simulate missing attribute
        del dep.endpoint_base_url

        mock_client = MagicMock()
        mock_client.containers.get_deployments.return_value = [dep]
        mock_client.containers.get_deployment_status.return_value = _mock_status("running")

        with patch("app.routers.dashboard.verda_service._get_client", return_value=mock_client):
            response = admin_client.get("/dashboard/containers")

        assert response.status_code == 200
        assert response.json()[0]["image"] == ""

    def test_returns_500_when_verda_fails(self, admin_client):
        """Return 500 when the Verda client throws an exception."""
        mock_client = MagicMock()
        mock_client.containers.get_deployments.side_effect = Exception("Verda unavailable")

        with patch("app.routers.dashboard.verda_service._get_client", return_value=mock_client):
            response = admin_client.get("/dashboard/containers")

        assert response.status_code == 500
        assert "Failed to list deployments" in response.json()["detail"]

    def test_returns_500_when_client_creation_fails(self, admin_client):
        """Return 500 when _get_client itself throws."""
        with patch(
            "app.routers.dashboard.verda_service._get_client",
            side_effect=RuntimeError("Missing credentials"),
        ):
            response = admin_client.get("/dashboard/containers")

        assert response.status_code == 500
        assert "Failed to list deployments" in response.json()["detail"]

    def test_forbidden_for_regular_user(self, regular_client):
        """Non-admin users should receive a 403."""
        response = regular_client.get("/dashboard/containers")
        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_unauthorized_without_token(self, unauthenticated_client):
        """Requests without an auth token should be rejected."""
        response = unauthenticated_client.get("/dashboard/containers")
        assert response.status_code in (401, 422)


# ===========================================================================
# POST /dashboard/containers/{deployment_name}/stop
# ===========================================================================


class TestStopContainer:
    """Tests for POST /dashboard/containers/{deployment_name}/stop"""

    def test_stop_deployment_success(self, admin_client):
        """Admin can successfully stop/delete a deployment."""
        mock_client = MagicMock()
        mock_client.containers.delete_deployment.return_value = None

        with patch("app.routers.dashboard.verda_service._get_client", return_value=mock_client):
            response = admin_client.post("/dashboard/containers/my-deploy/stop")

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Deployment 'my-deploy' deleted"
        assert data["container"] == "my-deploy"
        assert data["action"] == "stop"
        mock_client.containers.delete_deployment.assert_called_once_with("my-deploy")

    def test_stop_returns_correct_deployment_name(self, admin_client):
        """The response should echo back the exact deployment name."""
        mock_client = MagicMock()
        mock_client.containers.delete_deployment.return_value = None

        with patch("app.routers.dashboard.verda_service._get_client", return_value=mock_client):
            response = admin_client.post("/dashboard/containers/special-deploy-123/stop")

        assert response.status_code == 200
        assert response.json()["container"] == "special-deploy-123"

    def test_stop_returns_500_on_verda_error(self, admin_client):
        """Return 500 when Verda delete fails."""
        mock_client = MagicMock()
        mock_client.containers.delete_deployment.side_effect = Exception("Not found")

        with patch("app.routers.dashboard.verda_service._get_client", return_value=mock_client):
            response = admin_client.post("/dashboard/containers/bad-deploy/stop")

        assert response.status_code == 500
        assert "Failed to delete deployment" in response.json()["detail"]

    def test_stop_returns_500_when_client_creation_fails(self, admin_client):
        """Return 500 when _get_client itself throws."""
        with patch(
            "app.routers.dashboard.verda_service._get_client",
            side_effect=RuntimeError("No credentials"),
        ):
            response = admin_client.post("/dashboard/containers/any/stop")

        assert response.status_code == 500
        assert "Failed to delete deployment" in response.json()["detail"]

    def test_stop_forbidden_for_regular_user(self, regular_client):
        """Non-admin users should receive a 403."""
        response = regular_client.post("/dashboard/containers/my-deploy/stop")
        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_stop_unauthorized_without_token(self, unauthenticated_client):
        """Requests without an auth token should be rejected."""
        response = unauthenticated_client.post("/dashboard/containers/my-deploy/stop")
        assert response.status_code in (401, 422)


# ===========================================================================
# GET /dashboard/users
# ===========================================================================


class TestListUsers:
    """Tests for GET /dashboard/users"""

    def test_list_users_as_admin(self, admin_client, mock_db):
        """Admin can list all users."""
        # Insert additional users
        mock_db.users.insert_one({
            "username": "user1",
            "password": b"hashed",
            "is_admin": False,
            "created_at": datetime.utcnow(),
        })
        mock_db.users.insert_one({
            "username": "user2",
            "password": b"hashed",
            "is_admin": False,
            "created_at": datetime.utcnow(),
        })

        response = admin_client.get("/dashboard/users")

        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        usernames = [u["username"] for u in data["users"]]
        assert "admin" in usernames
        assert "user1" in usernames
        assert "user2" in usernames

    def test_list_users_forbidden_for_regular_user(self, regular_client):
        """Non-admin users should receive a 403."""
        response = regular_client.get("/dashboard/users")
        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_list_users_unauthorized_without_token(self, unauthenticated_client):
        """Requests without an auth token should be rejected."""
        response = unauthenticated_client.get("/dashboard/users")
        assert response.status_code in (401, 422)


# ===========================================================================
# DELETE /dashboard/users/{username}
# ===========================================================================


class TestDeleteUser:
    """Tests for DELETE /dashboard/users/{username}"""

    def test_delete_user_success(self, admin_client, mock_db):
        """Admin can successfully delete a user."""
        # Insert a user to delete
        mock_db.users.insert_one({
            "username": "user_to_delete",
            "password": b"hashed",
            "is_admin": False,
            "created_at": datetime.utcnow(),
        })

        response = admin_client.delete("/dashboard/users/user_to_delete")

        assert response.status_code == 200
        data = response.json()
        assert "deleted successfully" in data["message"]
        assert data["username"] == "user_to_delete"

        # Verify user is actually deleted from database
        deleted_user = mock_db.users.find_one({"username": "user_to_delete"})
        assert deleted_user is None

    def test_delete_user_removes_images(self, admin_client, mock_db):
        """Deleting a user should also delete their images."""
        # Insert a user
        mock_db.users.insert_one({
            "username": "user_with_images",
            "password": b"hashed",
            "is_admin": False,
            "created_at": datetime.utcnow(),
        })

        # Insert images for this user
        mock_db.images.insert_many([
            {
                "username": "user_with_images",
                "prompt": "test prompt 1",
                "image_data": "base64data1",
                "timestamp": datetime.utcnow(),
            },
            {
                "username": "user_with_images",
                "prompt": "test prompt 2",
                "image_data": "base64data2",
                "timestamp": datetime.utcnow(),
            },
            {
                "username": "other_user",
                "prompt": "other prompt",
                "image_data": "base64data3",
                "timestamp": datetime.utcnow(),
            },
        ])

        response = admin_client.delete("/dashboard/users/user_with_images")

        assert response.status_code == 200
        data = response.json()
        assert "2 images" in data["message"]

        # Verify user's images are deleted
        user_images = list(mock_db.images.find({"username": "user_with_images"}))
        assert len(user_images) == 0

        # Verify other user's images are NOT deleted
        other_images = list(mock_db.images.find({"username": "other_user"}))
        assert len(other_images) == 1

    def test_delete_user_removes_text_generations(self, admin_client, mock_db):
        """Deleting a user should also delete their text generations."""
        # Insert a user
        mock_db.users.insert_one({
            "username": "user_with_text",
            "password": b"hashed",
            "is_admin": False,
            "created_at": datetime.utcnow(),
        })

        # Insert text generations for this user
        mock_db.text_generations.insert_many([
            {
                "username": "user_with_text",
                "type": "text",
                "prompt": "generate something",
                "generated_text": "result 1",
                "model": "llama",
                "timestamp": datetime.utcnow(),
            },
            {
                "username": "user_with_text",
                "type": "text",
                "prompt": "generate another",
                "generated_text": "result 2",
                "model": "llama",
                "timestamp": datetime.utcnow(),
            },
            {
                "username": "other_user",
                "type": "text",
                "prompt": "other prompt",
                "generated_text": "other result",
                "model": "llama",
                "timestamp": datetime.utcnow(),
            },
        ])

        response = admin_client.delete("/dashboard/users/user_with_text")

        assert response.status_code == 200
        data = response.json()
        assert "2 text generations" in data["message"]

        # Verify user's text generations are deleted
        user_texts = list(mock_db.text_generations.find({"username": "user_with_text"}))
        assert len(user_texts) == 0

        # Verify other user's text generations are NOT deleted
        other_texts = list(mock_db.text_generations.find({"username": "other_user"}))
        assert len(other_texts) == 1

    def test_delete_user_removes_chats(self, admin_client, mock_db):
        """Deleting a user should also delete their chat history."""
        # Insert a user
        mock_db.users.insert_one({
            "username": "user_with_chats",
            "password": b"hashed",
            "is_admin": False,
            "created_at": datetime.utcnow(),
        })

        # Insert chat records for this user (stored in text_generations with type=chat)
        mock_db.text_generations.insert_many([
            {
                "username": "user_with_chats",
                "type": "chat",
                "messages": [{"role": "user", "content": "Hello"}],
                "reply": "Hi there!",
                "model": "llama",
                "timestamp": datetime.utcnow(),
            },
            {
                "username": "user_with_chats",
                "type": "chat",
                "messages": [{"role": "user", "content": "How are you?"}],
                "reply": "I'm good!",
                "model": "llama",
                "timestamp": datetime.utcnow(),
            },
        ])

        response = admin_client.delete("/dashboard/users/user_with_chats")

        assert response.status_code == 200
        data = response.json()
        # Chats are counted as text generations
        assert "2 text generations" in data["message"]

        # Verify user's chats are deleted
        user_chats = list(mock_db.text_generations.find({"username": "user_with_chats"}))
        assert len(user_chats) == 0

    def test_delete_user_removes_all_data_types(self, admin_client, mock_db):
        """Deleting a user should remove images, text generations, and chats."""
        # Insert a user
        mock_db.users.insert_one({
            "username": "user_with_all_data",
            "password": b"hashed",
            "is_admin": False,
            "created_at": datetime.utcnow(),
        })

        # Insert images
        mock_db.images.insert_one({
            "username": "user_with_all_data",
            "prompt": "image prompt",
            "image_data": "base64data",
            "timestamp": datetime.utcnow(),
        })

        # Insert text generation
        mock_db.text_generations.insert_one({
            "username": "user_with_all_data",
            "type": "text",
            "prompt": "text prompt",
            "generated_text": "result",
            "model": "llama",
            "timestamp": datetime.utcnow(),
        })

        # Insert chat
        mock_db.text_generations.insert_one({
            "username": "user_with_all_data",
            "type": "chat",
            "messages": [{"role": "user", "content": "Hello"}],
            "reply": "Hi!",
            "model": "llama",
            "timestamp": datetime.utcnow(),
        })

        response = admin_client.delete("/dashboard/users/user_with_all_data")

        assert response.status_code == 200
        data = response.json()
        assert "1 images" in data["message"]
        assert "2 text generations" in data["message"]

        # Verify all data is deleted
        assert mock_db.users.find_one({"username": "user_with_all_data"}) is None
        assert len(list(mock_db.images.find({"username": "user_with_all_data"}))) == 0
        assert len(list(mock_db.text_generations.find({"username": "user_with_all_data"}))) == 0

    def test_delete_user_not_found(self, admin_client):
        """Deleting a non-existent user should return 404."""
        response = admin_client.delete("/dashboard/users/nonexistent_user")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_user_forbidden_for_regular_user(self, regular_client):
        """Non-admin users should receive a 403."""
        response = regular_client.delete("/dashboard/users/some_user")
        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_delete_user_unauthorized_without_token(self, unauthenticated_client):
        """Requests without an auth token should be rejected."""
        response = unauthenticated_client.delete("/dashboard/users/some_user")
        assert response.status_code in (401, 422)

    def test_delete_user_with_no_data(self, admin_client, mock_db):
        """Deleting a user with no images or text generations should succeed."""
        # Insert a user with no associated data
        mock_db.users.insert_one({
            "username": "clean_user",
            "password": b"hashed",
            "is_admin": False,
            "created_at": datetime.utcnow(),
        })

        response = admin_client.delete("/dashboard/users/clean_user")

        assert response.status_code == 200
        data = response.json()
        assert "0 images" in data["message"]
        assert "0 text generations" in data["message"]

        # Verify user is deleted
        assert mock_db.users.find_one({"username": "clean_user"}) is None
