"""Unit tests for authentication/authorization dependencies."""

from datetime import datetime, timedelta
from unittest.mock import patch

import jwt
import mongomock
import pytest
from fastapi import HTTPException

from app.config import settings
from app.dependencies import get_admin_user, get_current_user, validate_csrf_token, verify_token
from app.models import UserInfo


@pytest.fixture
def mock_db():
    client = mongomock.MongoClient()
    db = client["gen_ai_playground"]
    db.users.insert_one({
        "username": "alice",
        "is_admin": False,
        "created_at": datetime.utcnow(),
    })
    db.users.insert_one({
        "username": "admin",
        "is_admin": True,
        "created_at": datetime.utcnow(),
    })
    return db


def _access_token(username: str, exp: datetime | None = None) -> str:
    payload = {
        "username": username,
        "exp": exp or (datetime.utcnow() + timedelta(hours=1)),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


class TestGetCurrentUser:
    def test_requires_bearer_header(self, mock_db):
        with pytest.raises(HTTPException) as exc:
            get_current_user(authorization=None, db=mock_db)
        assert exc.value.status_code == 401
        assert "not authenticated" in exc.value.detail.lower()

    def test_rejects_invalid_token(self, mock_db):
        with pytest.raises(HTTPException) as exc:
            get_current_user(authorization="Bearer bad-token", db=mock_db)
        assert exc.value.status_code == 401
        assert "invalid token" in exc.value.detail.lower()

    def test_rejects_expired_token(self, mock_db):
        token = _access_token("alice", exp=datetime.utcnow() - timedelta(minutes=1))
        with pytest.raises(HTTPException) as exc:
            get_current_user(authorization=f"Bearer {token}", db=mock_db)
        assert exc.value.status_code == 401
        assert "expired" in exc.value.detail.lower()

    def test_rejects_token_without_username(self, mock_db):
        token = jwt.encode(
            {
                "exp": datetime.utcnow() + timedelta(hours=1),
                "type": "access",
            },
            settings.JWT_SECRET_KEY,
            algorithm="HS256",
        )
        with pytest.raises(HTTPException) as exc:
            get_current_user(authorization=f"Bearer {token}", db=mock_db)
        assert exc.value.status_code == 401
        assert "invalid token" in exc.value.detail.lower()

    def test_rejects_unknown_user(self, mock_db):
        token = _access_token("ghost")
        with pytest.raises(HTTPException) as exc:
            get_current_user(authorization=f"Bearer {token}", db=mock_db)
        assert exc.value.status_code == 401
        assert "user not found" in exc.value.detail.lower()

    def test_returns_userinfo_for_valid_token(self, mock_db):
        token = _access_token("admin")
        user = get_current_user(authorization=f"Bearer {token}", db=mock_db)

        assert user.username == "admin"
        assert user.is_admin is True


class TestVerifyToken:
    def test_returns_none_for_bad_token(self, mock_db):
        assert verify_token("bad", mock_db) is None

    def test_returns_none_for_missing_username(self, mock_db):
        token = jwt.encode(
            {
                "exp": datetime.utcnow() + timedelta(hours=1),
                "type": "access",
            },
            settings.JWT_SECRET_KEY,
            algorithm="HS256",
        )
        assert verify_token(token, mock_db) is None

    def test_returns_none_for_unknown_user(self, mock_db):
        token = _access_token("ghost")
        assert verify_token(token, mock_db) is None

    def test_returns_userinfo_for_valid_token(self, mock_db):
        token = _access_token("alice")
        user = verify_token(token, mock_db)

        assert user is not None
        assert user.username == "alice"
        assert user.is_admin is False


class TestValidateCsrfToken:
    def test_skips_when_bearer_header_present(self):
        validate_csrf_token(
            csrf_cookie="cookie",
            csrf_header=None,
            authorization="Bearer token",
        )

    def test_skips_when_no_csrf_cookie(self):
        validate_csrf_token(csrf_cookie=None, csrf_header=None, authorization=None)

    def test_raises_on_missing_header_when_cookie_present(self):
        with pytest.raises(HTTPException) as exc:
            validate_csrf_token(csrf_cookie="abc", csrf_header=None, authorization=None)
        assert exc.value.status_code == 403

    def test_raises_on_mismatched_cookie_and_header(self):
        with pytest.raises(HTTPException) as exc:
            validate_csrf_token(csrf_cookie="abc", csrf_header="def", authorization=None)
        assert exc.value.status_code == 403

    def test_passes_when_cookie_matches_header(self):
        validate_csrf_token(csrf_cookie="same", csrf_header="same", authorization=None)


class TestGetAdminUser:
    def test_rejects_non_admin(self):
        with pytest.raises(HTTPException) as exc:
            get_admin_user(current_user=UserInfo(username="alice", is_admin=False))
        assert exc.value.status_code == 403
        assert "admin access required" in exc.value.detail.lower()

    def test_returns_admin_user(self):
        user = UserInfo(username="admin", is_admin=True)
        assert get_admin_user(current_user=user) == user
