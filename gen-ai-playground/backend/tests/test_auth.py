import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
import bcrypt
import jwt
import mongomock
from unittest.mock import patch, MagicMock
import os

# Import the app and models
from server import app
from app.models import RegisterRequest, LoginRequest


@pytest.fixture
def mock_db():
    """Create a mock MongoDB database for testing"""
    client = mongomock.MongoClient()
    db = client["gen_ai_playground"]
    return db


@pytest.fixture
def client(mock_db):
    """Create a test client with mocked database"""
    with patch('app.database.db_manager.db', mock_db):
        with patch('app.database.get_database', return_value=mock_db):
            yield TestClient(app)


@pytest.fixture
def test_user_data():
    """Sample user data for testing"""
    return {
        "username": "testuser",
        "password": "SecurePassword123!",
        "invitation_code": os.getenv("INVITATION_CODE")
    }


@pytest.fixture
def registered_user(mock_db, test_user_data):
    """Create a pre-registered user in the mock database"""
    hashed_password = bcrypt.hashpw(
        test_user_data["password"].encode('utf-8'),
        bcrypt.gensalt()
    )
    user_doc = {
        "username": test_user_data["username"],
        "password": hashed_password,
        "created_at": datetime.utcnow()
    }
    mock_db.users.insert_one(user_doc)
    return test_user_data


class TestRegisterEndpoint:
    """Tests for /register endpoint"""
    
    def test_successful_registration(self, client, test_user_data):
        """Test successful user registration"""
        response = client.post("/register", json=test_user_data)
        
        # Debug output
        if response.status_code != 200:
            print(f"Response status: {response.status_code}")
            print(f"Response body: {response.json()}")
            print(f"Test data: {test_user_data}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "User registered successfully"
        assert data["username"] == test_user_data["username"]
    
    def test_duplicate_username(self, client, registered_user):
        """Test registration with duplicate username"""
        duplicate_user = {
            "username": registered_user["username"],
            "password": "AnotherPassword123!",
            "invitation_code": os.getenv("INVITATION_CODE")
        }
        
        response = client.post("/register", json=duplicate_user)
        
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]
    
    
    def test_password_is_hashed(self, client, mock_db, test_user_data):
        """Test that password is hashed and not stored in plaintext"""
        response = client.post("/register", json=test_user_data)
        
        assert response.status_code == 200
        
        # Check database to ensure password is hashed
        user = mock_db.users.find_one({"username": test_user_data["username"]})
        assert user is not None
        assert user["password"] != test_user_data["password"].encode('utf-8')
        
        # Verify bcrypt hash can be validated
        assert bcrypt.checkpw(
            test_user_data["password"].encode('utf-8'),
            user["password"]
        )
    
    def test_database_unavailable(self, test_user_data):
        from fastapi import HTTPException
        from app.database import get_database
        
        def raise_503():
            raise HTTPException(status_code=503, detail="Database not available")
        
        app.dependency_overrides[get_database] = raise_503
        try:
            client = TestClient(app)
            response = client.post("/register", json=test_user_data)
            
            assert response.status_code == 503
            assert "Database not available" in response.json()["detail"]
        finally:
            app.dependency_overrides.clear()
    
    def test_missing_fields(self, client):
        """Test registration with missing required fields"""
        incomplete_data = {
            "username": "testuser"
            # Missing password and invitation_code
        }
        
        response = client.post("/register", json=incomplete_data)
        assert response.status_code == 422  # Validation error
    
    def test_invalid_invitation_code(self, client, test_user_data):
        """Test registration with invalid invitation code"""
        invalid_code_data = test_user_data.copy()
        invalid_code_data["invitation_code"] = "wrongcode"
        
        response = client.post("/register", json=invalid_code_data)
        
        assert response.status_code == 403
        assert "Invalid invitation code" in response.json()["detail"]
    
    def test_missing_invitation_code(self, client):
        """Test registration without invitation code"""
        data_without_code = {
            "username": "testuser",
            "password": "SecurePassword123!"
        }
        
        response = client.post("/register", json=data_without_code)
        assert response.status_code == 422  # Validation error


class TestLoginEndpoint:
    """Tests for /login endpoint"""
    
    def test_successful_login(self, client, registered_user):
        """Test successful login"""
        login_data = {
            "username": registered_user["username"],
            "password": registered_user["password"]
        }
        
        response = client.post("/login", json=login_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Login successful"
        assert data["username"] == registered_user["username"]
        assert "token" in data
        assert data["token"] != ""
    
    def test_jwt_token_structure(self, client, registered_user):
        """Test that JWT token contains correct claims and is valid"""
        login_data = {
            "username": registered_user["username"],
            "password": registered_user["password"]
        }
        
        response = client.post("/login", json=login_data)
        
        assert response.status_code == 200
        token = response.json()["token"]
        
        # Decode and verify token
        decoded = jwt.decode(token, "dev-secret-key-for-local-development", algorithms=["HS256"])
        
        assert decoded["username"] == registered_user["username"]
        assert "exp" in decoded
        
        # Verify expiration is ~24 hours from now
        exp_time = datetime.fromtimestamp(decoded["exp"])
        now = datetime.utcnow()
        time_diff = exp_time - now
        assert timedelta(hours=1) < time_diff < timedelta(hours=3)
    
    def test_invalid_username(self, client):
        """Test login with non-existent username"""
        login_data = {
            "username": "nonexistentuser",
            "password": "SomePassword123!"
        }
        
        response = client.post("/login", json=login_data)
        
        assert response.status_code == 401
        assert "Invalid username or password" in response.json()["detail"]
    
    def test_invalid_password(self, client, registered_user):
        """Test login with incorrect password"""
        login_data = {
            "username": registered_user["username"],
            "password": "WrongPassword123!"
        }
        
        response = client.post("/login", json=login_data)
        
        assert response.status_code == 401
        assert "Invalid username or password" in response.json()["detail"]
    
    def test_missing_credentials(self, client):
        """Test login with missing credentials"""
        incomplete_data = {
            "username": "testuser"
            # Missing password
        }
        
        response = client.post("/login", json=incomplete_data)
        assert response.status_code == 422  # Validation error
    
    def test_prevent_username_enumeration(self, client, registered_user):
        """Test that error messages don't reveal if username exists"""
        wrong_username_response = client.post("/login", json={
            "username": "wronguser",
            "password": "password"
        })
        
        wrong_password_response = client.post("/login", json={
            "username": registered_user["username"],
            "password": "wrongpassword"
        })
        
        # Both should return the same error message to prevent username enumeration
        assert wrong_username_response.status_code == 401
        assert wrong_password_response.status_code == 401
        assert (wrong_username_response.json()["detail"] == 
                wrong_password_response.json()["detail"])


class TestAuthIntegration:
    """Integration tests for registration and login flow"""
    
    def test_register_then_login(self, client, test_user_data):
        """Test complete flow: register a new user then login"""
        # Register new user
        register_response = client.post("/register", json=test_user_data)
        assert register_response.status_code == 200
        
        # Login with same credentials
        login_data = {
            "username": test_user_data["username"],
            "password": test_user_data["password"]
        }
        login_response = client.post("/login", json=login_data)
        
        assert login_response.status_code == 200
        assert "token" in login_response.json()


class TestTokenExpiration:
    """Tests for JWT token expiration handling"""

    def _make_token(self, username: str, expired: bool = False) -> str:
        """Helper to create a JWT token, optionally already expired."""
        if expired:
            exp = datetime.utcnow() - timedelta(seconds=1)
        else:
            exp = datetime.utcnow() + timedelta(hours=24)
        return jwt.encode(
            {"username": username, "exp": exp},
            "dev-secret-key-for-local-development",
            algorithm="HS256",
        )

    def test_expired_token_rejected_by_protected_endpoint(self, client, registered_user):
        """An expired JWT should return 401 with 'Token has expired'"""
        token = self._make_token(registered_user["username"], expired=True)

        response = client.get(
            "/images/history",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 401
        assert "Token has expired" in response.json()["detail"]

    def test_valid_token_accepted_by_protected_endpoint(self, client, registered_user):
        """A valid (non-expired) JWT should not return 401 for auth reasons"""
        token = self._make_token(registered_user["username"], expired=False)

        response = client.get(
            "/images/history",
            headers={"Authorization": f"Bearer {token}"},
        )

        # Should not be an auth failure (may be 200 with empty history)
        assert response.status_code != 401

    def test_expired_token_from_login_endpoint(self, client, registered_user):
        """Token obtained from /login should be valid immediately"""
        login_data = {
            "username": registered_user["username"],
            "password": registered_user["password"],
        }
        login_response = client.post("/login", json=login_data)
        assert login_response.status_code == 200

        token = login_response.json()["token"]
        decoded = jwt.decode(token, "dev-secret-key-for-local-development", algorithms=["HS256"])

        # exp should be in the future
        assert decoded["exp"] > datetime.utcnow().timestamp()

    def test_missing_token_rejected(self, client):
        """Request without Authorization header should be rejected"""
        response = client.get("/images/history")

        assert response.status_code in (401, 422)

    def test_malformed_token_rejected(self, client):
        """A garbage token should return 401"""
        response = client.get(
            "/images/history",
            headers={"Authorization": "Bearer not.a.valid.token"},
        )

        assert response.status_code == 401


class TestRefreshEndpoint:
    """Tests for /refresh endpoint"""

    def _make_token(self, username: str, hours: float = 24) -> str:
        """Helper to create a JWT token with a given lifetime."""
        exp = datetime.utcnow() + timedelta(hours=hours)
        return jwt.encode(
            {"username": username, "exp": exp},
            "dev-secret-key-for-local-development",
            algorithm="HS256",
        )

    def test_refresh_returns_new_token(self, client, registered_user):
        """A valid token should get a fresh token back from /refresh"""
        token = self._make_token(registered_user["username"])

        response = client.post(
            "/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Token refreshed"
        assert data["username"] == registered_user["username"]
        assert "token" in data
        assert data["token"] != ""

    def test_refreshed_token_has_later_expiry(self, client, registered_user):
        """The refreshed token should have an expiry further in the future than the original"""
        import time

        # Create a token that expires in 1 hour (simulating a partially used session)
        original_token = self._make_token(registered_user["username"], hours=1)
        original_decoded = jwt.decode(
            original_token, "dev-secret-key-for-local-development", algorithms=["HS256"]
        )

        time.sleep(1)

        response = client.post(
            "/refresh",
            headers={"Authorization": f"Bearer {original_token}"},
        )

        assert response.status_code == 200
        new_token = response.json()["token"]
        new_decoded = jwt.decode(
            new_token, "dev-secret-key-for-local-development", algorithms=["HS256"]
        )

        # New expiry should be later than the original
        assert new_decoded["exp"] > original_decoded["exp"]

    def test_refreshed_token_is_usable(self, client, registered_user):
        """The refreshed token should work on protected endpoints"""
        original_token = self._make_token(registered_user["username"])

        refresh_response = client.post(
            "/refresh",
            headers={"Authorization": f"Bearer {original_token}"},
        )
        assert refresh_response.status_code == 200

        new_token = refresh_response.json()["token"]

        # Use the new token on a protected endpoint
        history_response = client.get(
            "/images/history",
            headers={"Authorization": f"Bearer {new_token}"},
        )
        assert history_response.status_code != 401

    def test_refresh_with_expired_token_rejected(self, client, registered_user):
        """An expired token should not be refreshable"""
        expired_token = jwt.encode(
            {"username": registered_user["username"], "exp": datetime.utcnow() - timedelta(seconds=1)},
            "dev-secret-key-for-local-development",
            algorithm="HS256",
        )

        response = client.post(
            "/refresh",
            headers={"Authorization": f"Bearer {expired_token}"},
        )

        assert response.status_code == 401
        assert "Token has expired" in response.json()["detail"]

    def test_refresh_without_token_rejected(self, client):
        """Request to /refresh without Authorization header should fail"""
        response = client.post("/refresh")

        assert response.status_code in (401, 422)

    def test_refresh_preserves_username(self, client, registered_user):
        """The refreshed token should contain the same username"""
        token = self._make_token(registered_user["username"])

        response = client.post(
            "/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        new_token = response.json()["token"]
        decoded = jwt.decode(new_token, "dev-secret-key-for-local-development", algorithms=["HS256"])
        assert decoded["username"] == registered_user["username"]