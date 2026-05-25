"""
Tests for /text/* endpoints (deploy, connect, status, generate, chat, delete).

Mocks verda_service so no real Verda/network calls are made.
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
import mongomock
from unittest.mock import patch, MagicMock
import os
from bson import ObjectId

from server import app
from app.dependencies import validate_csrf_token
from app.config import settings
from app.container_handler import ContainerHandler


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
    app.state.container_handler = ContainerHandler()
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
def admin_registered_user(mock_db, test_user_data):
    """Insert an admin user into the mock database so admin-gated endpoints work."""
    hashed_password = bcrypt.hashpw(
        test_user_data["password"].encode("utf-8"),
        bcrypt.gensalt(),
    )
    mock_db.users.delete_many({"username": test_user_data["username"]})
    mock_db.users.insert_one({
        "username": test_user_data["username"],
        "password": hashed_password,
        "is_admin": True,
        "created_at": datetime.utcnow(),
    })
    return test_user_data


@pytest.fixture
def auth_token(test_user_data):
    """Generate a valid JWT access token."""
    payload = {
        "username": test_user_data["username"],
        "is_admin": False,
        "exp": datetime.utcnow() + timedelta(hours=24),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(autouse=True)
def mock_template_map():
    """Mock get_template_map for all tests so display names resolve correctly."""
    with patch('app.routers.text.get_template_map', return_value=MOCK_TEMPLATE_MAP):
        yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Mock template map used by all tests that reference display names
MOCK_TEMPLATE_MAP = {"deepseek-7b-sglang.json": "Deepseek-7b-sglang"}
TEST_DISPLAY_NAME = "Deepseek-7b-sglang"
TEST_DEPLOYMENT_NAME = "deepseek-7b-sglang"

def _healthy_status():
    return {"name": "test-deploy", "status": "healthy", "model": "m", "healthy": True}


def _unhealthy_status():
    return {"name": "test-deploy", "status": "deploying", "model": "m", "healthy": False}


def _setup_deployment_discovery(mock_vs, healthy=True):
    """Set up mocks for the deployment discovery flow used by generate and chat."""
    mock_cfg = MagicMock()
    mock_cfg.model = "deepseek-ai/deepseek-llm-7b-chat"
    mock_vs._parse_and_validate_template.return_value = mock_cfg
    mock_vs.list_deployments.return_value = [
        {"name": TEST_DEPLOYMENT_NAME, "created_at": "2026-01-01", "endpoint_url": "https://example.com"}
    ]
    mock_client = MagicMock()
    mock_status = MagicMock()
    mock_status.value = "healthy" if healthy else "deploying"
    mock_client.containers.get_deployment_status.return_value = mock_status
    mock_vs._get_client.return_value = mock_client


# ===========================================================================
# 1. Healthy-check gating for /generate and /chat
# ===========================================================================

class TestHealthGating:
    """POST /text/chat must reject when deployment is unhealthy."""

    @patch("app.routers.text.verda_service")
    def test_chat_returns_503_when_unhealthy(
        self, mock_vs, client, registered_user, auth_headers
    ):
        _setup_deployment_discovery(mock_vs, healthy=False)

        response = client.post(
            "/text/chat",
            json={"model_path": TEST_DISPLAY_NAME, "messages": [{"role": "user", "content": "Hi"}]},
            headers=auth_headers,
        )

        assert response.status_code == 503
        assert "not healthy" in response.json()["detail"].lower()
        mock_vs.chat.assert_not_called()

    @patch("app.routers.text.verda_service")
    def test_chat_proceeds_when_healthy(
        self, mock_vs, client, registered_user, auth_headers
    ):
        _setup_deployment_discovery(mock_vs, healthy=True)
        mock_vs.chat.return_value = {
            "reply": "Hi there!",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "usage": {},
        }

        response = client.post(
            "/text/chat",
            json={"model_path": TEST_DISPLAY_NAME, "messages": [{"role": "user", "content": "Hi"}]},
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
        self, mock_vs, client, admin_registered_user, auth_headers
    ):
        mock_vs.deploy_from_template.side_effect = RuntimeError("SDK boom")

        response = client.post(
            "/text/deploy",
            json={"model_path": TEST_DISPLAY_NAME},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "SDK boom" in response.json()["detail"]

    @patch("app.routers.text.verda_service")
    def test_deploy_generic_exception_returns_500(
        self, mock_vs, client, admin_registered_user, auth_headers
    ):
        mock_vs.deploy_from_template.side_effect = Exception("unexpected")

        response = client.post(
            "/text/deploy",
            json={"model_path": TEST_DISPLAY_NAME},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "Failed to deploy model" in response.json()["detail"]

    @patch("app.routers.text.verda_service")
    def test_deploy_success_returns_200(
        self, mock_vs, client, admin_registered_user, auth_headers
    ):
        mock_vs.deploy_from_template.return_value = {
            "name": "deploy-1",
            "status": "deploying",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "message": "ok",
        }

        response = client.post(
            "/text/deploy",
            json={"model_path": TEST_DISPLAY_NAME},
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
        mock_cfg = MagicMock()
        mock_cfg.model = "deepseek-ai/deepseek-llm-7b-chat"
        mock_vs._parse_and_validate_template.return_value = mock_cfg
        mock_vs.connect_to_existing.return_value = {
            "status": "error",
            "message": "Deployment not found",
        }

        response = client.post(
            "/text/connect",
            json={"deployment_name": "ghost", "model_path": TEST_DISPLAY_NAME},
            headers=auth_headers,
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @patch("app.routers.text.verda_service")
    def test_connect_unexpected_exception_returns_500(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_cfg = MagicMock()
        mock_cfg.model = "deepseek-ai/deepseek-llm-7b-chat"
        mock_vs._parse_and_validate_template.return_value = mock_cfg
        mock_vs.connect_to_existing.side_effect = Exception("network down")

        response = client.post(
            "/text/connect",
            json={"deployment_name": "x", "model_path": TEST_DISPLAY_NAME},
            headers=auth_headers,
        )

        assert response.status_code == 500
        assert "network down" in response.json()["detail"]

    @patch("app.routers.text.verda_service")
    def test_connect_success_returns_200(
        self, mock_vs, client, registered_user, auth_headers
    ):
        mock_cfg = MagicMock()
        mock_cfg.model = "deepseek-ai/deepseek-llm-7b-chat"
        mock_vs._parse_and_validate_template.return_value = mock_cfg
        mock_vs.connect_to_existing.return_value = {
            "name": "existing-deploy",
            "status": "healthy",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "healthy": True,
            "message": "Connected to existing deployment",
        }

        response = client.post(
            "/text/connect",
            json={"deployment_name": "existing-deploy", "model_path": TEST_DISPLAY_NAME},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["healthy"] is True


# ===========================================================================
# 3. MongoDB history inserts for text/chat
# ===========================================================================

class TestTextHistoryInserts:
    """Verify that successful /chat calls save to MongoDB."""

    @patch("app.routers.text.verda_service")
    def test_chat_inserts_history_record(
        self, mock_vs, client, mock_db, registered_user, auth_headers
    ):
        _setup_deployment_discovery(mock_vs, healthy=True)
        mock_vs.chat.return_value = {
            "reply": "I'm fine, thanks!",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "usage": {"prompt_tokens": 4, "completion_tokens": 6},
        }

        response = client.post(
            "/text/chat",
            json={"model_path": TEST_DISPLAY_NAME, "messages": [{"role": "user", "content": "How are you?"}]},
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
    def test_chat_still_returns_on_db_failure(
        self, mock_vs, client, mock_db, registered_user, auth_headers
    ):
        """Even if MongoDB insert fails, the chat endpoint should still return the reply."""
        _setup_deployment_discovery(mock_vs, healthy=True)
        mock_vs.chat.return_value = {
            "reply": "hi",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "usage": {},
        }

        with patch.object(mock_db.text_generations, "insert_one", side_effect=Exception("db down")):
            response = client.post(
                "/text/chat",
                json={"model_path": TEST_DISPLAY_NAME, "messages": [{"role": "user", "content": "hey"}]},
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
# 5. Auth gating â€“ endpoints should require valid JWT
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

    def test_chat_requires_auth(self, client):
        response = client.post(
            "/text/chat",
            json={"model_path": "deepseek-llm-7b", "messages": [{"role": "user", "content": "hi"}]},
        )
        assert response.status_code == 401


# ===========================================================================
# 6. enable_thinking parameter handling
# ===========================================================================

class TestThinkingParams:
    """enable_thinking pass-through behavior."""

    @patch("app.routers.text.verda_service")
    def test_enable_thinking_true_passed_to_service(
        self, mock_vs, client, registered_user, auth_headers
    ):
        """enable_thinking=True is forwarded to chat()."""
        _setup_deployment_discovery(mock_vs, healthy=True)
        mock_vs.chat.return_value = {
            "reply": "I thought about it.",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "usage": {},
        }

        response = client.post(
            "/text/chat",
            json={
                "model_path": TEST_DISPLAY_NAME,
                "messages": [{"role": "user", "content": "Think hard"}],
                "max_tokens": 512,
                "enable_thinking": True,
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["reply"] == "I thought about it."

        _, call_kwargs = mock_vs.chat.call_args
        assert call_kwargs["enable_thinking"] is True

    @patch("app.routers.text.verda_service")
    def test_enable_thinking_false_passed_to_service(
        self, mock_vs, client, registered_user, auth_headers
    ):
        """enable_thinking=False is forwarded to chat()."""
        _setup_deployment_discovery(mock_vs, healthy=True)
        mock_vs.chat.return_value = {
            "reply": "Answer only.",
            "model": "deepseek-ai/deepseek-llm-7b-chat",
            "usage": {},
        }

        response = client.post(
            "/text/chat",
            json={
                "model_path": TEST_DISPLAY_NAME,
                "messages": [{"role": "user", "content": "Think"}],
                "max_tokens": 256,
                "enable_thinking": False,
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["reply"] == "Answer only."

        _, call_kwargs = mock_vs.chat.call_args
        assert call_kwargs["enable_thinking"] is False


class TestTemplateFiles:
    """Test that the command generation from templates works as expected."""
    
    def test_cmd_generation_from_template(self):
        from app.verda_service import VerdaService
        from app.template_models import TemplateConfig
        from app.template_discovery import _SKIP_TEMPLATES
        from pathlib import Path
        
        verda_service = VerdaService()
        
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        templates_dir = Path(backend_dir) / "templates"
        
        template_files = [
            f
            for f in templates_dir.iterdir()
            if f.suffix == ".json" and f.name not in _SKIP_TEMPLATES
        ]
        assert len(template_files) > 0, "No template files found"
        
        for template_file in template_files:
            try:
                cfg = TemplateConfig.model_validate_json(
                    template_file.read_text(encoding="utf-8"))
            except Exception as e:
                pytest.fail(f"Invalid template config {template_file.name}: {e}")
                
class TestConversations:

    @staticmethod
    def _auth_headers_for(username: str, is_admin: bool = False) -> dict:
        payload = {
            "username": username,
            "is_admin": is_admin,
            "exp": datetime.utcnow() + timedelta(hours=24),
            "type": "access",
        }
        token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")
        return {"Authorization": f"Bearer {token}"}

    @staticmethod
    def _insert_user(mock_db, username: str):
        hashed_password = bcrypt.hashpw("SecurePassword123!".encode("utf-8"), bcrypt.gensalt())
        mock_db.users.insert_one({
            "username": username,
            "password": hashed_password,
            "created_at": datetime.utcnow(),
        })

    def test_create_conversation_applies_defaults_and_includes_creator(
        self, client, mock_db, registered_user, auth_headers
    ):
        response = client.post(
            "/text/conversations",
            json={"participants": ["alice", "testuser", "alice"]},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert set(data["participants"]) == {"testuser", "alice"}
        assert data["title"] == "Untitled Conversation"
        assert data["model"] == "default"

        saved = mock_db.conversations.find_one({"_id": ObjectId(data["conversation_id"])})
        assert saved is not None
        assert saved["created_by"] == "testuser"
        assert saved["messages"] == []

    def test_join_conversation_rejects_invalid_invite_for_non_participant(
        self, client, mock_db, registered_user
    ):
        self._insert_user(mock_db, "outsider")

        conv_id = mock_db.conversations.insert_one({
            "title": "Shared",
            "participants": ["testuser"],
            "messages": [],
            "invite_code": "correct-code",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }).inserted_id

        response = client.post(
            f"/text/conversations/{conv_id}/join",
            json={"invite_code": "wrong-code"},
            headers=self._auth_headers_for("outsider"),
        )

        assert response.status_code == 403
        assert "invalid invite code" in response.json()["detail"].lower()

    def test_join_conversation_adds_participant_with_valid_invite(
        self, client, mock_db, registered_user
    ):
        self._insert_user(mock_db, "outsider")

        conv_id = mock_db.conversations.insert_one({
            "title": "Shared",
            "participants": ["testuser"],
            "messages": [],
            "invite_code": "correct-code",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }).inserted_id

        response = client.post(
            f"/text/conversations/{conv_id}/join",
            json={"invite_code": "correct-code"},
            headers=self._auth_headers_for("outsider"),
        )

        assert response.status_code == 200
        assert response.json()["ok"] is True

        updated = mock_db.conversations.find_one({"_id": conv_id})
        assert "outsider" in updated["participants"]

    def test_conversation_history_forbidden_for_non_participant(
        self, client, mock_db, registered_user
    ):
        self._insert_user(mock_db, "outsider")

        conv_id = mock_db.conversations.insert_one({
            "title": "Project chat",
            "participants": ["testuser"],
            "messages": [{"role": "user", "content": "hello"}],
            "model": "Deepseek-7b-sglang",
            "invite_code": "abc123",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }).inserted_id

        response = client.get(
            f"/text/conversation-history/{conv_id}",
            headers=self._auth_headers_for("outsider"),
        )

        assert response.status_code == 403
        assert "not a participant" in response.json()["detail"].lower()

    def test_all_conversations_supports_pagination_and_date_range(
        self, client, mock_db, registered_user, auth_headers
    ):
        now = datetime.now(timezone.utc)

        # 11 recent conversations for testuser and one old conversation.
        for i in range(11):
            mock_db.conversations.insert_one({
                "title": f"Recent {i}",
                "participants": ["testuser"],
                "messages": [],
                "invite_code": f"code-{i}",
                "created_at": now - timedelta(hours=i),
                "updated_at": now - timedelta(hours=i),
            })

        mock_db.conversations.insert_one({
            "title": "Very old",
            "participants": ["testuser"],
            "messages": [],
            "invite_code": "old-code",
            "created_at": now - timedelta(days=10),
            "updated_at": now - timedelta(days=10),
        })

        # Not visible to testuser.
        mock_db.conversations.insert_one({
            "title": "Other user",
            "participants": ["someone-else"],
            "messages": [],
            "invite_code": "other-code",
            "created_at": now,
            "updated_at": now,
        })

        page_2 = client.get("/text/all-conversations?page=2", headers=auth_headers)
        assert page_2.status_code == 200
        page_2_data = page_2.json()
        assert page_2_data["total"] == 12
        assert page_2_data["total_pages"] == 2
        assert page_2_data["page"] == 2
        assert len(page_2_data["conversations"]) == 2

        from_ts = int((now - timedelta(days=2)).timestamp() * 1000)
        to_ts = int(now.timestamp() * 1000)
        filtered = client.get(
            f"/text/all-conversations?from={from_ts}&to={to_ts}&page=1",
            headers=auth_headers,
        )
        assert filtered.status_code == 200
        filtered_data = filtered.json()
        assert filtered_data["total"] == 11
        assert all(conv["title"] != "Very old" for conv in filtered_data["conversations"])

    def test_join_conversation_returns_400_for_invalid_object_id(
        self, client, registered_user, auth_headers
    ):
        response = client.post(
            "/text/conversations/not-a-valid-objectid/join",
            json={"invite_code": "x"},
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "invalid conversation id" in response.json()["detail"].lower()

    def test_check_participant_returns_400_for_invalid_object_id(
        self, client, registered_user, auth_headers
    ):
        response = client.get(
            "/text/conversations/not-a-valid-objectid/check-participant",
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "invalid conversation id" in response.json()["detail"].lower()

    def test_conversation_history_returns_400_for_invalid_object_id(
        self, client, registered_user, auth_headers
    ):
        response = client.get(
            "/text/conversation-history/not-a-valid-objectid",
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "invalid conversation id" in response.json()["detail"].lower()

    def test_check_participant_not_found(self, client, registered_user, auth_headers):
        response = client.get(
            f"/text/conversations/{ObjectId()}/check-participant",
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_check_participant_forbidden(self, client, mock_db, registered_user):
        self._insert_user(mock_db, "outsider")
        conv_id = mock_db.conversations.insert_one(
            {
                "title": "Shared",
                "participants": ["testuser"],
                "messages": [],
                "invite_code": "abc",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
        ).inserted_id

        response = client.get(
            f"/text/conversations/{conv_id}/check-participant",
            headers=self._auth_headers_for("outsider"),
        )
        assert response.status_code == 403

    def test_check_participant_success(self, client, mock_db, registered_user, auth_headers):
        conv_id = mock_db.conversations.insert_one(
            {
                "title": "Shared",
                "participants": ["testuser"],
                "messages": [],
                "invite_code": "abc",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
        ).inserted_id

        response = client.get(
            f"/text/conversations/{conv_id}/check-participant",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_join_conversation_not_found(self, client, registered_user, auth_headers):
        response = client.post(
            f"/text/conversations/{ObjectId()}/join",
            json={"invite_code": "x"},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_conversation_history_not_found(self, client, registered_user, auth_headers):
        response = client.get(
            f"/text/conversation-history/{ObjectId()}",
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_conversation_history_success(self, client, mock_db, registered_user, auth_headers):
        conv_id = mock_db.conversations.insert_one(
            {
                "title": "Project chat",
                "participants": ["testuser"],
                "messages": [{"role": "user", "content": "hello"}],
                "model": "Deepseek-7b-sglang",
                "invite_code": "abc123",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
        ).inserted_id

        response = client.get(
            f"/text/conversation-history/{conv_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["title"] == "Project chat"
        assert payload["model"] == "Deepseek-7b-sglang"
        assert payload["messages"][0]["content"] == "hello"

    def test_shared_conversations_sidebar_limit_validation(self, client, registered_user, auth_headers):
        response = client.get("/text/shared-conversations-sidebar?limit=7", headers=auth_headers)
        assert response.status_code == 400

    def test_shared_conversations_sidebar_success(self, client, mock_db, registered_user, auth_headers):
        now = datetime.utcnow()
        mock_db.conversations.insert_many(
            [
                {
                    "title": "First",
                    "participants": ["testuser"],
                    "messages": [],
                    "model": "m",
                    "created_at": now - timedelta(minutes=1),
                    "updated_at": now - timedelta(minutes=1),
                },
                {
                    "title": "Second",
                    "participants": ["testuser"],
                    "messages": [],
                    "model": "m",
                    "created_at": now,
                    "updated_at": now,
                },
            ]
        )

        response = client.get("/text/shared-conversations-sidebar?limit=5", headers=auth_headers)
        assert response.status_code == 200
        history = response.json()["history"]
        assert len(history) == 2
        assert history[0]["title"] == "Second"

    def test_all_conversations_empty(self, client, registered_user, auth_headers):
        response = client.get("/text/all-conversations", headers=auth_headers)
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 0
        assert payload["conversations"] == []

    def test_conversations_length_endpoint(self, client, mock_db, registered_user, auth_headers):
        mock_db.conversations.insert_many(
            [
                {"participants": ["testuser"], "created_at": datetime.utcnow()},
                {"participants": ["testuser"], "created_at": datetime.utcnow()},
                {"participants": ["other"], "created_at": datetime.utcnow()},
            ]
        )

        response = client.get("/text/conversations-length", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["length"] == 2

    def test_chat_messages_length_endpoint(self, client, mock_db, registered_user, auth_headers):
        mock_db.text_generations.insert_many(
            [
                {"username": "testuser", "timestamp": datetime.utcnow()},
                {"username": "testuser", "timestamp": datetime.utcnow()},
                {"username": "other", "timestamp": datetime.utcnow()},
            ]
        )

        response = client.get("/text/chat-messages-length", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["length"] == 2


class TestTextExtraEndpoints:
    @patch("app.routers.text.verda_service")
    def test_list_deployments_success(self, mock_vs, client, registered_user, auth_headers):
        mock_vs.list_deployments.return_value = [{"name": "dep-a"}]
        response = client.get("/text/deployments", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == [{"name": "dep-a"}]

    @patch("app.routers.text.verda_service")
    def test_list_deployments_error_returns_500(self, mock_vs, client, registered_user, auth_headers):
        mock_vs.list_deployments.side_effect = RuntimeError("boom")
        response = client.get("/text/deployments", headers=auth_headers)
        assert response.status_code == 500
        assert "boom" in response.json()["detail"]

    @patch("app.routers.text.verda_service")
    def test_text_models_endpoint(self, mock_vs, client, registered_user, auth_headers):
        mock_vs.available_models.return_value = [{"value": "m"}]
        response = client.get("/text/models", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["available_models"] == [{"value": "m"}]

    @patch("app.routers.text.get_template_map", return_value={"a.json": "Model A", "b.json": "Model B"})
    @patch("app.routers.text.verda_service")
    def test_model_statuses_offline_on_client_error(
        self,
        mock_vs,
        _mock_template_map,
        client,
        registered_user,
        auth_headers,
    ):
        mock_vs._get_client.side_effect = RuntimeError("down")
        response = client.get("/text/model-statuses", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == {"Model A": "offline", "Model B": "offline"}

    @patch("app.routers.text.get_template_map", return_value={"a.json": "Model A", "b.json": "Model B", "c.json": "Model C"})
    @patch("app.routers.text.verda_service")
    def test_model_statuses_maps_live_starting_offline(
        self,
        mock_vs,
        _mock_template_map,
        client,
        registered_user,
        auth_headers,
    ):
        dep_a = MagicMock()
        dep_a.name = "a"
        dep_b = MagicMock()
        dep_b.name = "b"

        mock_client = MagicMock()
        mock_client.containers.get_deployments.return_value = [dep_a, dep_b]

        def _status(name):
            status = MagicMock()
            if name == "a":
                status.value = "healthy"
            else:
                status.value = "deploying"
            return status

        mock_client.containers.get_deployment_status.side_effect = _status
        mock_vs._get_client.return_value = mock_client

        response = client.get("/text/model-statuses", headers=auth_headers)
        assert response.status_code == 200
        payload = response.json()
        assert payload["Model A"] == "live"
        assert payload["Model B"] == "starting"
        assert payload["Model C"] == "offline"

    def test_text_history_sidebar_limit_validation(self, client, registered_user, auth_headers):
        response = client.get("/text/history-sidebar?limit=7", headers=auth_headers)
        assert response.status_code == 400

    def test_text_history_sidebar_serializes_ids(self, client, mock_db, registered_user, auth_headers):
        now = datetime.utcnow()
        mock_db.text_generations.insert_many(
            [
                {"username": "testuser", "timestamp": now - timedelta(minutes=1), "reply": "old"},
                {"username": "testuser", "timestamp": now, "reply": "new"},
            ]
        )

        response = client.get("/text/history-sidebar?limit=5", headers=auth_headers)
        assert response.status_code == 200
        history = response.json()["history"]
        assert len(history) == 2
        assert isinstance(history[0]["_id"], str)

    def test_text_history_empty(self, client, registered_user, auth_headers):
        response = client.get("/text/history", headers=auth_headers)
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 0
        assert payload["history"] == []

    def test_text_history_date_filter(self, client, mock_db, registered_user, auth_headers):
        now = datetime.now(timezone.utc)
        old = now - timedelta(days=10)
        mock_db.text_generations.insert_many(
            [
                {
                    "username": "testuser",
                    "timestamp": now,
                    "reply": "recent",
                    "type": "chat",
                    "messages": [{"role": "user", "content": "hi"}],
                    "model": "m",
                },
                {
                    "username": "testuser",
                    "timestamp": old,
                    "reply": "old",
                    "type": "chat",
                    "messages": [{"role": "user", "content": "hi"}],
                    "model": "m",
                },
            ]
        )

        from_ts = int((now - timedelta(days=1)).timestamp() * 1000)
        to_ts = int((now + timedelta(days=1)).timestamp() * 1000)
        response = client.get(f"/text/history?from={from_ts}&to={to_ts}", headers=auth_headers)
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["history"][0]["reply"] == "recent"

    def test_text_history_db_error(self, client, mock_db, registered_user, auth_headers):
        mock_db.text_generations.insert_one(
            {
                "username": "testuser",
                "timestamp": datetime.now(timezone.utc),
                "reply": "seed",
                "type": "chat",
                "messages": [{"role": "user", "content": "hi"}],
                "model": "m",
            }
        )
        with patch.object(mock_db.text_generations, "find", side_effect=Exception("db fail")):
            response = client.get("/text/history", headers=auth_headers)
        assert response.status_code == 500
        assert "error getting history" in response.json()["detail"].lower()
    
