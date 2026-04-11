"""
Tests for dashboard invitation code management endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
from unittest.mock import patch
import bcrypt
import jwt
import mongomock

from server import app
from app.config import settings


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
        client = TestClient(app)
        token = _make_token("admin", is_admin=True)
        client.headers.update({"Authorization": f"Bearer {token}"})
        yield client


@pytest.fixture
def regular_client(mock_db, regular_user):
    """TestClient whose requests carry a valid non-admin JWT."""
    with patch("app.database.db_manager.db", mock_db), \
         patch("app.database.get_database", return_value=mock_db):
        client = TestClient(app)
        token = _make_token("regularuser", is_admin=False)
        client.headers.update({"Authorization": f"Bearer {token}"})
        yield client


@pytest.fixture
def unauthenticated_client(mock_db):
    """TestClient with no Authorization header."""
    with patch("app.database.db_manager.db", mock_db), \
         patch("app.database.get_database", return_value=mock_db):
        yield TestClient(app)


# ===========================================================================
# POST /dashboard/invitations/codes - Create Invitation Code
# ===========================================================================


class TestCreateInvitationCode:
    """Tests for POST /dashboard/invitations/codes"""

    def test_create_invitation_code_success(self, admin_client, mock_db):
        """Admin can successfully create an invitation code."""
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={
                "code": "TESTCODE123",
                "expiration_days": 30,
                "max_uses": 5
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Invitation code created successfully"
        assert data["code"]["code"] == "TESTCODE123"
        assert data["code"]["max_uses"] == 5
        assert data["code"]["uses_count"] == 0
        assert data["code"]["is_active"] is True
        assert data["code"]["used_by"] == []

        # Verify code exists in database
        db_code = mock_db.invitation_codes.find_one({"code": "TESTCODE123"})
        assert db_code is not None
        assert db_code["code"] == "TESTCODE123"
        assert db_code["max_uses"] == 5
        assert db_code["uses_count"] == 0
        assert db_code["is_active"] is True
        assert db_code["created_by"] == "admin"

    def test_create_invitation_code_with_default_values(self, admin_client, mock_db):
        """Create invitation code with default expiration and max_uses."""
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={"code": "DEFAULTCODE"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["code"]["max_uses"] == 1
        # Expiration should be approximately 30 days from now
        expires_at = datetime.fromisoformat(data["code"]["expires_at"].replace("Z", "+00:00"))
        created_at = datetime.fromisoformat(data["code"]["created_at"].replace("Z", "+00:00"))
        delta = expires_at - created_at
        assert 29 <= delta.days <= 31

    def test_create_invitation_code_duplicate(self, admin_client, mock_db):
        """Cannot create duplicate invitation codes."""
        # Create first code
        admin_client.post(
            "/dashboard/invitations/codes",
            json={"code": "DUPLICATE1"}
        )

        # Try to create duplicate
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={"code": "DUPLICATE1"}
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_invitation_code_custom_expiration(self, admin_client, mock_db):
        """Create invitation code with custom expiration days."""
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={
                "code": "CUSTOMEXP",
                "expiration_days": 60,
                "max_uses": 10
            }
        )

        assert response.status_code == 200
        data = response.json()
        expires_at = datetime.fromisoformat(data["code"]["expires_at"].replace("Z", "+00:00"))
        created_at = datetime.fromisoformat(data["code"]["created_at"].replace("Z", "+00:00"))
        delta = expires_at - created_at
        assert 59 <= delta.days <= 61

    def test_create_invitation_code_max_uses_100(self, admin_client, mock_db):
        """Create invitation code with maximum allowed uses (100)."""
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={
                "code": "MAXUSESCODE",
                "max_uses": 100
            }
        )

        assert response.status_code == 200
        assert response.json()["code"]["max_uses"] == 100

    def test_create_invitation_code_min_length(self, admin_client, mock_db):
        """Create invitation code with minimum length (5 characters)."""
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={"code": "ABCDE"}
        )

        assert response.status_code == 200
        assert response.json()["code"]["code"] == "ABCDE"

    def test_create_invitation_code_max_length(self, admin_client, mock_db):
        """Create invitation code with maximum length (64 characters)."""
        long_code = "A" * 64
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={"code": long_code}
        )

        assert response.status_code == 200
        assert response.json()["code"]["code"] == long_code

    def test_create_invitation_code_too_short(self, admin_client):
        """Cannot create invitation code shorter than 5 characters."""
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={"code": "ABCD"}
        )

        assert response.status_code == 422

    def test_create_invitation_code_too_long(self, admin_client):
        """Cannot create invitation code longer than 64 characters."""
        long_code = "A" * 65
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={"code": long_code}
        )

        assert response.status_code == 422

    def test_create_invitation_code_invalid_expiration_days(self, admin_client):
        """Cannot create invitation code with invalid expiration days."""
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={
                "code": "VALIDCODE",
                "expiration_days": 0
            }
        )

        assert response.status_code == 422

        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={
                "code": "VALIDCODE",
                "expiration_days": 366
            }
        )

        assert response.status_code == 422

    def test_create_invitation_code_invalid_max_uses(self, admin_client):
        """Cannot create invitation code with invalid max_uses."""
        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={
                "code": "VALIDCODE",
                "max_uses": 0
            }
        )

        assert response.status_code == 422

        response = admin_client.post(
            "/dashboard/invitations/codes",
            json={
                "code": "VALIDCODE",
                "max_uses": 101
            }
        )

        assert response.status_code == 422

    def test_create_invitation_code_forbidden_for_regular_user(self, regular_client):
        """Non-admin users cannot create invitation codes."""
        response = regular_client.post(
            "/dashboard/invitations/codes",
            json={"code": "FORBIDDEN"}
        )

        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_create_invitation_code_unauthorized_without_token(self, unauthenticated_client):
        """Requests without auth token are rejected."""
        response = unauthenticated_client.post(
            "/dashboard/invitations/codes",
            json={"code": "NOTOKEN"}
        )

        assert response.status_code in (401, 422)


# ===========================================================================
# GET /dashboard/invitations/codes - List Invitation Codes
# ===========================================================================


class TestListInvitationCodes:
    """Tests for GET /dashboard/invitations/codes"""

    def test_list_invitation_codes_empty(self, admin_client, mock_db):
        """Admin gets empty list when no codes exist."""
        response = admin_client.get("/dashboard/invitations/codes")

        assert response.status_code == 200
        data = response.json()
        assert data["codes"] == []

    def test_list_invitation_codes_single(self, admin_client, mock_db):
        """Admin can list a single invitation code."""
        # Insert a code directly
        mock_db.invitation_codes.insert_one({
            "code": "SINGLECODE",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.get("/dashboard/invitations/codes")

        assert response.status_code == 200
        data = response.json()
        assert len(data["codes"]) == 1
        assert data["codes"][0]["code"] == "SINGLECODE"
        assert data["codes"][0]["max_uses"] == 5
        assert data["codes"][0]["uses_count"] == 0
        assert data["codes"][0]["is_active"] is True

    def test_list_invitation_codes_multiple(self, admin_client, mock_db):
        """Admin can list multiple invitation codes."""
        # Insert multiple codes
        for i in range(3):
            mock_db.invitation_codes.insert_one({
                "code": f"CODE{i}",
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(days=30),
                "max_uses": 5,
                "uses_count": 0,
                "is_active": True,
                "used_by": [],
                "created_by": "admin"
            })

        response = admin_client.get("/dashboard/invitations/codes")

        assert response.status_code == 200
        data = response.json()
        assert len(data["codes"]) == 3
        codes = [c["code"] for c in data["codes"]]
        assert "CODE0" in codes
        assert "CODE1" in codes
        assert "CODE2" in codes

    def test_list_invitation_codes_sorted_by_creation_date(self, admin_client, mock_db):
        """Invitation codes are sorted by creation date (newest first)."""
        # Insert codes with different creation dates
        mock_db.invitation_codes.insert_one({
            "code": "OLDCODE",
            "created_at": datetime.utcnow() - timedelta(days=2),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })
        mock_db.invitation_codes.insert_one({
            "code": "NEWCODE",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.get("/dashboard/invitations/codes")

        assert response.status_code == 200
        data = response.json()
        assert data["codes"][0]["code"] == "NEWCODE"
        assert data["codes"][1]["code"] == "OLDCODE"

    def test_list_invitation_codes_shows_expired_status(self, admin_client, mock_db):
        """Expired codes show correct status."""
        # Insert an expired code
        mock_db.invitation_codes.insert_one({
            "code": "EXPIREDCODE",
            "created_at": datetime.utcnow() - timedelta(days=60),
            "expires_at": datetime.utcnow() - timedelta(days=1),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.get("/dashboard/invitations/codes")

        assert response.status_code == 200
        data = response.json()
        assert data["codes"][0]["is_active"] is False

    def test_list_invitation_codes_shows_fully_used_status(self, admin_client, mock_db):
        """Fully used codes show correct status."""
        # Insert a fully used code
        mock_db.invitation_codes.insert_one({
            "code": "USEDCODE",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 2,
            "uses_count": 2,
            "is_active": True,
            "used_by": ["user1", "user2"],
            "created_by": "admin"
        })

        response = admin_client.get("/dashboard/invitations/codes")

        assert response.status_code == 200
        data = response.json()
        assert data["codes"][0]["is_active"] is False

    def test_list_invitation_codes_shows_deactivated_status(self, admin_client, mock_db):
        """Deactivated codes show correct status."""
        # Insert a deactivated code
        mock_db.invitation_codes.insert_one({
            "code": "DEACTIVATEDCODE",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": False,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.get("/dashboard/invitations/codes")

        assert response.status_code == 200
        data = response.json()
        assert data["codes"][0]["is_active"] is False

    def test_list_invitation_codes_handles_used_by_string(self, admin_client, mock_db):
        """Handle backward compatibility when used_by is a string."""
        # Insert code with used_by as string (old format)
        mock_db.invitation_codes.insert_one({
            "code": "OLDFORMAT",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 1,
            "is_active": True,
            "used_by": "user1",
            "created_by": "admin"
        })

        response = admin_client.get("/dashboard/invitations/codes")

        assert response.status_code == 200
        data = response.json()
        assert data["codes"][0]["used_by"] == ["user1"]

    def test_list_invitation_codes_handles_used_by_none(self, admin_client, mock_db):
        """Handle backward compatibility when used_by is None."""
        # Insert code with used_by as None
        mock_db.invitation_codes.insert_one({
            "code": "NONEFORMAT",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": None,
            "created_by": "admin"
        })

        response = admin_client.get("/dashboard/invitations/codes")

        assert response.status_code == 200
        data = response.json()
        assert data["codes"][0]["used_by"] == []

    def test_list_invitation_codes_forbidden_for_regular_user(self, regular_client):
        """Non-admin users cannot list invitation codes."""
        response = regular_client.get("/dashboard/invitations/codes")

        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_list_invitation_codes_unauthorized_without_token(self, unauthenticated_client):
        """Requests without auth token are rejected."""
        response = unauthenticated_client.get("/dashboard/invitations/codes")

        assert response.status_code in (401, 422)


# ===========================================================================
# DELETE /dashboard/invitations/codes/{code} - Delete Invitation Code
# ===========================================================================


class TestDeleteInvitationCode:
    """Tests for DELETE /dashboard/invitations/codes/{code}"""

    def test_delete_invitation_code_success(self, admin_client, mock_db):
        """Admin can successfully delete an invitation code."""
        # Insert a code to delete
        mock_db.invitation_codes.insert_one({
            "code": "DELETEME",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.delete("/dashboard/invitations/codes/DELETEME")

        assert response.status_code == 200
        data = response.json()
        assert "deleted successfully" in data["message"]
        assert data["code"] == "DELETEME"

        # Verify code is deleted from database
        db_code = mock_db.invitation_codes.find_one({"code": "DELETEME"})
        assert db_code is None

    def test_delete_invitation_code_not_found(self, admin_client, mock_db):
        """Cannot delete non-existent invitation code."""
        response = admin_client.delete("/dashboard/invitations/codes/NONEXISTENT")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_delete_invitation_code_invalid_format(self, admin_client):
        """Cannot delete code with invalid format (too short)."""
        response = admin_client.delete("/dashboard/invitations/codes/ABCD")

        assert response.status_code == 422

    def test_delete_invitation_code_special_characters(self, admin_client, mock_db):
        """Can delete code with valid special characters (underscore, hyphen)."""
        # Insert code with special characters
        mock_db.invitation_codes.insert_one({
            "code": "test_code-123",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.delete("/dashboard/invitations/codes/test_code-123")

        assert response.status_code == 200
        assert response.json()["code"] == "test_code-123"

    def test_delete_invitation_code_invalid_special_characters(self, admin_client):
        """Cannot delete code with invalid special characters."""
        response = admin_client.delete("/dashboard/invitations/codes/test@code!")

        assert response.status_code == 422

    def test_delete_invitation_code_forbidden_for_regular_user(self, regular_client):
        """Non-admin users cannot delete invitation codes."""
        response = regular_client.delete("/dashboard/invitations/codes/ANYCODE")

        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_delete_invitation_code_unauthorized_without_token(self, unauthenticated_client):
        """Requests without auth token are rejected."""
        response = unauthenticated_client.delete("/dashboard/invitations/codes/ANYCODE")

        assert response.status_code in (401, 422)


# ===========================================================================
# POST /dashboard/invitations/codes/{code}/deactivate - Deactivate Code
# ===========================================================================


class TestDeactivateInvitationCode:
    """Tests for POST /dashboard/invitations/codes/{code}/deactivate"""

    def test_deactivate_invitation_code_success(self, admin_client, mock_db):
        """Admin can successfully deactivate an invitation code."""
        # Insert an active code
        mock_db.invitation_codes.insert_one({
            "code": "DEACTIVATEME",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post("/dashboard/invitations/codes/DEACTIVATEME/deactivate")

        assert response.status_code == 200
        data = response.json()
        assert "deactivated successfully" in data["message"]
        assert data["code"] == "DEACTIVATEME"

        # Verify code is deactivated in database
        db_code = mock_db.invitation_codes.find_one({"code": "DEACTIVATEME"})
        assert db_code["is_active"] is False

    def test_deactivate_invitation_code_not_found(self, admin_client, mock_db):
        """Cannot deactivate non-existent invitation code."""
        response = admin_client.post("/dashboard/invitations/codes/NONEXISTENT/deactivate")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_deactivate_invitation_code_already_deactivated(self, admin_client, mock_db):
        """Can deactivate an already deactivated code (idempotent)."""
        # Insert a deactivated code
        mock_db.invitation_codes.insert_one({
            "code": "ALREADYDEACT",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": False,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post("/dashboard/invitations/codes/ALREADYDEACT/deactivate")

        assert response.status_code == 200
        assert "deactivated successfully" in response.json()["message"]

    def test_deactivate_invitation_code_invalid_format(self, admin_client):
        """Cannot deactivate code with invalid format."""
        response = admin_client.post("/dashboard/invitations/codes/ABCD/deactivate")

        assert response.status_code == 422

    def test_deactivate_invitation_code_forbidden_for_regular_user(self, regular_client):
        """Non-admin users cannot deactivate invitation codes."""
        response = regular_client.post("/dashboard/invitations/codes/ANYCODE/deactivate")

        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_deactivate_invitation_code_unauthorized_without_token(self, unauthenticated_client):
        """Requests without auth token are rejected."""
        response = unauthenticated_client.post("/dashboard/invitations/codes/ANYCODE/deactivate")

        assert response.status_code in (401, 422)


# ===========================================================================
# POST /dashboard/invitations/codes/{code}/reactivate - Reactivate Code
# ===========================================================================


class TestReactivateInvitationCode:
    """Tests for POST /dashboard/invitations/codes/{code}/reactivate"""

    def test_reactivate_invitation_code_success(self, admin_client, mock_db):
        """Admin can successfully reactivate an invitation code."""
        # Insert a deactivated code
        mock_db.invitation_codes.insert_one({
            "code": "REACTIVATEME",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": False,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post("/dashboard/invitations/codes/REACTIVATEME/reactivate")

        assert response.status_code == 200
        data = response.json()
        assert "reactivated successfully" in data["message"]
        assert data["code"] == "REACTIVATEME"

        # Verify code is reactivated in database
        db_code = mock_db.invitation_codes.find_one({"code": "REACTIVATEME"})
        assert db_code["is_active"] is True

    def test_reactivate_invitation_code_not_found(self, admin_client, mock_db):
        """Cannot reactivate non-existent invitation code."""
        response = admin_client.post("/dashboard/invitations/codes/NONEXISTENT/reactivate")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_reactivate_invitation_code_already_active(self, admin_client, mock_db):
        """Can reactivate an already active code (idempotent)."""
        # Insert an active code
        mock_db.invitation_codes.insert_one({
            "code": "ALREADYACTIVE",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post("/dashboard/invitations/codes/ALREADYACTIVE/reactivate")

        assert response.status_code == 200
        assert "reactivated successfully" in response.json()["message"]

    def test_reactivate_invitation_code_preserves_usage(self, admin_client, mock_db):
        """Reactivating a code preserves its usage count and used_by list."""
        # Insert a deactivated code with usage
        mock_db.invitation_codes.insert_one({
            "code": "PRESERVEUSAGE",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 2,
            "is_active": False,
            "used_by": ["user1", "user2"],
            "created_by": "admin"
        })

        response = admin_client.post("/dashboard/invitations/codes/PRESERVEUSAGE/reactivate")

        assert response.status_code == 200

        # Verify usage is preserved
        db_code = mock_db.invitation_codes.find_one({"code": "PRESERVEUSAGE"})
        assert db_code["uses_count"] == 2
        assert db_code["used_by"] == ["user1", "user2"]

    def test_reactivate_invitation_code_invalid_format(self, admin_client):
        """Cannot reactivate code with invalid format."""
        response = admin_client.post("/dashboard/invitations/codes/ABCD/reactivate")

        assert response.status_code == 422

    def test_reactivate_invitation_code_forbidden_for_regular_user(self, regular_client):
        """Non-admin users cannot reactivate invitation codes."""
        response = regular_client.post("/dashboard/invitations/codes/ANYCODE/reactivate")

        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_reactivate_invitation_code_unauthorized_without_token(self, unauthenticated_client):
        """Requests without auth token are rejected."""
        response = unauthenticated_client.post("/dashboard/invitations/codes/ANYCODE/reactivate")

        assert response.status_code in (401, 422)


# ===========================================================================
# POST /dashboard/invitations/codes/{code}/extend - Extend Expiration
# ===========================================================================


class TestExtendInvitationCode:
    """Tests for POST /dashboard/invitations/codes/{code}/extend"""

    def test_extend_invitation_code_success(self, admin_client, mock_db):
        """Admin can successfully extend an invitation code expiration."""
        # Insert a code
        original_expires = datetime.utcnow() + timedelta(days=10)
        mock_db.invitation_codes.insert_one({
            "code": "EXTENDME",
            "created_at": datetime.utcnow(),
            "expires_at": original_expires,
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post(
            "/dashboard/invitations/codes/EXTENDME/extend",
            json={"expiration_days": 30}
        )

        assert response.status_code == 200
        data = response.json()
        assert "extended successfully" in data["message"]
        assert data["code"] == "EXTENDME"

        # Verify expiration is extended
        db_code = mock_db.invitation_codes.find_one({"code": "EXTENDME"})
        new_expires = db_code["expires_at"]
        delta = new_expires - original_expires
        assert 29 <= delta.days <= 31

    def test_extend_invitation_code_default_days(self, admin_client, mock_db):
        """Extend invitation code with default expiration days (30)."""
        # Insert a code
        original_expires = datetime.utcnow() + timedelta(days=10)
        mock_db.invitation_codes.insert_one({
            "code": "EXTENDDEFAULT",
            "created_at": datetime.utcnow(),
            "expires_at": original_expires,
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post(
            "/dashboard/invitations/codes/EXTENDDEFAULT/extend",
            json={}
        )

        assert response.status_code == 200
        data = response.json()
        assert "extended successfully" in data["message"]

    def test_extend_invitation_code_expired_code(self, admin_client, mock_db):
        """Extending an expired code extends from now, not from original expiration."""
        # Insert an expired code
        expired_date = datetime.utcnow() - timedelta(days=5)
        mock_db.invitation_codes.insert_one({
            "code": "EXPIREDAND",
            "created_at": datetime.utcnow() - timedelta(days=60),
            "expires_at": expired_date,
            "max_uses": 5,
            "uses_count": 0,
            "is_active": False,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post(
            "/dashboard/invitations/codes/EXPIREDAND/extend",
            json={"expiration_days": 30}
        )

        assert response.status_code == 200

        # Verify expiration is extended from now
        db_code = mock_db.invitation_codes.find_one({"code": "EXPIREDAND"})
        new_expires = db_code["expires_at"]
        now = datetime.utcnow()
        delta = new_expires - now
        assert 29 <= delta.days <= 31

    def test_extend_invitation_code_reactivates(self, admin_client, mock_db):
        """Extending a code sets is_active to True."""
        # Insert a deactivated code
        mock_db.invitation_codes.insert_one({
            "code": "REACTIVATEONEXTEND",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=10),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": False,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post(
            "/dashboard/invitations/codes/REACTIVATEONEXTEND/extend",
            json={"expiration_days": 30}
        )

        assert response.status_code == 200

        # Verify code is reactivated
        db_code = mock_db.invitation_codes.find_one({"code": "REACTIVATEONEXTEND"})
        assert db_code["is_active"] is True

    def test_extend_invitation_code_not_found(self, admin_client, mock_db):
        """Cannot extend non-existent invitation code."""
        response = admin_client.post(
            "/dashboard/invitations/codes/NONEXISTENT/extend",
            json={"expiration_days": 30}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_extend_invitation_code_min_days(self, admin_client, mock_db):
        """Extend invitation code with minimum expiration days (1)."""
        mock_db.invitation_codes.insert_one({
            "code": "MINEXTEND",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=10),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post(
            "/dashboard/invitations/codes/MINEXTEND/extend",
            json={"expiration_days": 1}
        )

        assert response.status_code == 200

    def test_extend_invitation_code_max_days(self, admin_client, mock_db):
        """Extend invitation code with maximum expiration days (365)."""
        mock_db.invitation_codes.insert_one({
            "code": "MAXEXTEND",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=10),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post(
            "/dashboard/invitations/codes/MAXEXTEND/extend",
            json={"expiration_days": 365}
        )

        assert response.status_code == 200

    def test_extend_invitation_code_invalid_days(self, admin_client):
        """Cannot extend with invalid expiration days."""
        response = admin_client.post(
            "/dashboard/invitations/codes/ANYCODE/extend",
            json={"expiration_days": 0}
        )

        assert response.status_code == 422

        response = admin_client.post(
            "/dashboard/invitations/codes/ANYCODE/extend",
            json={"expiration_days": 366}
        )

        assert response.status_code == 422

    def test_extend_invitation_code_invalid_format(self, admin_client):
        """Cannot extend code with invalid format."""
        response = admin_client.post(
            "/dashboard/invitations/codes/ABCD/extend",
            json={"expiration_days": 30}
        )

        assert response.status_code == 422

    def test_extend_invitation_code_forbidden_for_regular_user(self, regular_client):
        """Non-admin users cannot extend invitation codes."""
        response = regular_client.post(
            "/dashboard/invitations/codes/ANYCODE/extend",
            json={"expiration_days": 30}
        )

        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_extend_invitation_code_unauthorized_without_token(self, unauthenticated_client):
        """Requests without auth token are rejected."""
        response = unauthenticated_client.post(
            "/dashboard/invitations/codes/ANYCODE/extend",
            json={"expiration_days": 30}
        )

        assert response.status_code in (401, 422)


# ===========================================================================
# POST /dashboard/invitations/codes/{code}/add-uses - Add Uses
# ===========================================================================


class TestAddUsesToCode:
    """Tests for POST /dashboard/invitations/codes/{code}/add-uses"""

    def test_add_uses_success(self, admin_client, mock_db):
        """Admin can successfully add uses to an invitation code."""
        # Insert a code
        mock_db.invitation_codes.insert_one({
            "code": "ADDUSES",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 2,
            "is_active": True,
            "used_by": ["user1", "user2"],
            "created_by": "admin"
        })

        response = admin_client.post(
            "/dashboard/invitations/codes/ADDUSES/add-uses",
            json={"additional_uses": 3}
        )

        assert response.status_code == 200
        data = response.json()
        assert "Added 3 uses" in data["message"]
        assert data["code"] == "ADDUSES"

        # Verify max_uses is increased
        db_code = mock_db.invitation_codes.find_one({"code": "ADDUSES"})
        assert db_code["max_uses"] == 8

    def test_add_uses_default_value(self, admin_client, mock_db):
        """Add uses with default value (1)."""
        # Insert a code
        mock_db.invitation_codes.insert_one({
            "code": "ADDDEFAULT",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post(
            "/dashboard/invitations/codes/ADDDEFAULT/add-uses",
            json={}
        )

        assert response.status_code == 200
        data = response.json()
        assert "Added 1 uses" in data["message"]

        # Verify max_uses is increased by 1
        db_code = mock_db.invitation_codes.find_one({"code": "ADDDEFAULT"})
        assert db_code["max_uses"] == 6

    def test_add_uses_max_value(self, admin_client, mock_db):
        """Add uses with maximum value (100)."""
        # Insert a code
        mock_db.invitation_codes.insert_one({
            "code": "ADDMAX",
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=30),
            "max_uses": 5,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": "admin"
        })

        response = admin_client.post(
            "/dashboard/invitations/codes/ADDMAX/add-uses",
            json={"additional_uses": 100}
        )

        assert response.status_code == 200

        # Verify max_uses is increased by 100
        db_code = mock_db.invitation_codes.find_one({"code": "ADDMAX"})
        assert db_code["max_uses"] == 105

    def test_add_uses_not_found(self, admin_client, mock_db):
        """Cannot add uses to non-existent invitation code."""
        response = admin_client.post(
            "/dashboard/invitations/codes/NONEXISTENT/add-uses",
            json={"additional_uses": 5}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_add_uses_invalid_value(self, admin_client):
        """Cannot add uses with invalid value."""
        response = admin_client.post(
            "/dashboard/invitations/codes/ANYCODE/add-uses",
            json={"additional_uses": 0}
        )

        assert response.status_code == 422

        response = admin_client.post(
            "/dashboard/invitations/codes/ANYCODE/add-uses",
            json={"additional_uses": 101}
        )

        assert response.status_code == 422

    def test_add_uses_invalid_format(self, admin_client):
        """Cannot add uses to code with invalid format."""
        response = admin_client.post(
            "/dashboard/invitations/codes/ABCD/add-uses",
            json={"additional_uses": 5}
        )

        assert response.status_code == 422

    def test_add_uses_forbidden_for_regular_user(self, regular_client):
        """Non-admin users cannot add uses to invitation codes."""
        response = regular_client.post(
            "/dashboard/invitations/codes/ANYCODE/add-uses",
            json={"additional_uses": 5}
        )

        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_add_uses_unauthorized_without_token(self, unauthenticated_client):
        """Requests without auth token are rejected."""
        response = unauthenticated_client.post(
            "/dashboard/invitations/codes/ANYCODE/add-uses",
            json={"additional_uses": 5}
        )

        assert response.status_code in (401, 422)
