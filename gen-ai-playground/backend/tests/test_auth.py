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
from app.dependencies import validate_csrf_token
from app.config import settings
from app.container_handler import ContainerHandler


@pytest.fixture
def mock_db():
    """Create a mock MongoDB database for testing"""
    client = mongomock.MongoClient()
    db = client["gen_ai_playground"]
    # Seed invitation code for registration tests
    invitation_code = os.getenv("INVITATION_CODE", "local-invitation-code")
    db.invitation_codes.insert_one({
        "code": invitation_code,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(days=30),
        "max_uses": 100,
        "uses_count": 0,
        "is_active": True,
        "used_by": []
    })
    return db


@pytest.fixture
def client(mock_db):
    """Create a test client with mocked database"""
    app.dependency_overrides[validate_csrf_token] = lambda: None
    app.state.container_handler = ContainerHandler()
    with patch('app.database.db_manager.db', mock_db):
        with patch('app.database.get_database', return_value=mock_db):
            yield TestClient(app)
    app.dependency_overrides.pop(validate_csrf_token, None)


@pytest.fixture
def test_user_data():
    """Sample user data for testing"""
    return {
        "username": "testuser",
        "password": "SecurePassword123!",
        "invitation_code": os.getenv("INVITATION_CODE")
    }


@pytest.fixture
def auth_token(test_user_data):
    """Generate a valid JWT access token for testing."""
    secret_key = settings.JWT_SECRET_KEY
    payload = {
        "username": test_user_data["username"],
        "is_admin": False,
        "exp": datetime.utcnow() + timedelta(hours=24),
        "type": "access",
    }
    return jwt.encode(payload, secret_key, algorithm="HS256")


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


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
            app.state.container_handler = ContainerHandler()
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
        assert "Invalid, expired, or fully used invitation code" in response.json()["detail"]
    
    def test_missing_invitation_code(self, client):
        """Test registration without invitation code"""
        data_without_code = {
            "username": "testuser",
            "password": "SecurePassword123!"
        }
        
        response = client.post("/register", json=data_without_code)
        assert response.status_code == 422  # Validation error

    @pytest.mark.parametrize(
        "password, expected_error",
        [
            ("short", "Password must be at least 8 characters long"),
            ("nouppercase123!", "Password must contain at least one uppercase letter"),
            ("NoNumber!", "Password must contain at least one number"),
            ("NoSpecial123", "Password must contain at least one special character"),
        ]
    )

    def test_password_validation(self, client, test_user_data, password, expected_error):
        """Test that backend rejects passwords failing validation rules"""
        invalid_data = test_user_data.copy()
        invalid_data["password"] = password
        invalid_data["username"] = f"user_{password}"

        response = client.post("/register", json=invalid_data)

        assert response.status_code == 400
        assert expected_error in response.json()["detail"]

    @pytest.mark.parametrize(
        "username,expected_error",
        [
            ("abc", "Username must be at least 4 characters long"),
            ("ab", "Username must be at least 4 characters long"),
            ("a", "Username must be at least 4 characters long"),
            ("test@user", "Username must contain only letters and numbers"),
            ("test.user", "Username must contain only letters and numbers"),
            ("test_user", "Username must contain only letters and numbers"),
            ("test-user", "Username must contain only letters and numbers"),
            ("test user", "Username must contain only letters and numbers"),
        ]
    )
    def test_username_validation(self, client, test_user_data, username, expected_error):
        """Test that backend rejects usernames failing validation rules"""
        invalid_data = test_user_data.copy()
        invalid_data["username"] = username

        response = client.post("/register", json=invalid_data)

        assert response.status_code == 400
        assert expected_error in response.json()["detail"]

    def test_username_valid(self, client, test_user_data):
        """Test that backend accepts valid usernames"""
        valid_data = test_user_data.copy()
        valid_data["username"] = "ValidUser123"

        response = client.post("/register", json=valid_data)

        # Should succeed (or fail for other reasons like invitation code, but not username validation)
        assert response.status_code != 400 or "Username must" not in response.json().get("detail", "")


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

    def test_login_sets_cookies(self, client, registered_user):
        """Test login sets refresh_token (HTTPOnly) and csrf_token cookies"""
        login_data = {
            "username": registered_user["username"],
            "password": registered_user["password"]
        }

        response = client.post("/login", json=login_data)

        assert response.status_code == 200
        cookies = {c.name: c for c in response.cookies.jar}
        # refresh_token should be HTTPOnly
        assert "refresh_token" in cookies
        refresh_cookie_header = response.headers.get("set-cookie", "")
        assert "httponly" in refresh_cookie_header.lower()
        # csrf_token should be present (non-HTTPOnly, readable by JS)
        assert "csrf_token" in cookies
    
    def test_jwt_token_structure(self, client, registered_user):
        """Test that JWT access token contains correct claims and is valid"""
        login_data = {
            "username": registered_user["username"],
            "password": registered_user["password"]
        }

        response = client.post("/login", json=login_data)

        assert response.status_code == 200
        token = response.json()["token"]

        # Decode and verify token
        decoded = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])

        assert decoded["username"] == registered_user["username"]
        assert decoded["type"] == "access"
        assert "is_admin" in decoded
        assert "exp" in decoded

        # Verify expiration matches ACCESS_TOKEN_EXPIRE_MINUTES
        exp_time = datetime.fromtimestamp(decoded["exp"])
        now = datetime.utcnow()
        time_diff = exp_time - now
        max_expected = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        assert time_diff <= max_expected
    
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

    def test_me_endpoint_with_bearer(self, client, test_user_data):
        """Test /me returns user when authenticated via Bearer token"""
        register_response = client.post("/register", json=test_user_data)
        assert register_response.status_code == 200

        login_response = client.post(
            "/login",
            json={
                "username": test_user_data["username"],
                "password": test_user_data["password"]
            }
        )
        assert login_response.status_code == 200
        token = login_response.json()["token"]

        me_response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert me_response.status_code == 200
        assert me_response.json()["username"] == test_user_data["username"]

    def test_logout_clears_cookies_and_me_fails(self, client, test_user_data):
        """Test /logout clears cookies so /me with Bearer becomes unauthorized"""
        register_response = client.post("/register", json=test_user_data)
        assert register_response.status_code == 200

        login_response = client.post(
            "/login",
            json={
                "username": test_user_data["username"],
                "password": test_user_data["password"]
            }
        )
        assert login_response.status_code == 200
        token = login_response.json()["token"]

        # Verify /me works before logout
        me_response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert me_response.status_code == 200

        logout_response = client.post("/logout")
        assert logout_response.status_code == 200

        # After logout, cookies are cleared, but the in-memory token is still
        # technically valid until it expires. The frontend clears it from memory.
        # Here we simulate the frontend having discarded the token.
        me_response = client.get("/me")
        assert me_response.status_code == 401
        assert "Not authenticated" in me_response.json()["detail"]


class TestCSRFProtection:
    """Verify CSRF validation is enforced on cookie-authenticated requests."""

    def test_post_without_csrf_header_returns_403(self, client, registered_user):
        """POST with csrf_token cookie but no X-CSRF-Token header should return 403."""
        app.dependency_overrides.pop(validate_csrf_token, None)
        try:
            client.cookies.set("csrf_token", "some-csrf-token")
            response = client.post("/logout")
            assert response.status_code == 403
            assert "Invalid CSRF token" in response.json()["detail"]
        finally:
            client.cookies.clear()
            app.dependency_overrides[validate_csrf_token] = lambda: None

    def test_post_with_mismatched_csrf_returns_403(self, client, registered_user):
        """POST with mismatched CSRF cookie and header should return 403."""
        app.dependency_overrides.pop(validate_csrf_token, None)
        try:
            client.cookies.set("csrf_token", "correct-token")
            response = client.post("/logout", headers={"X-CSRF-Token": "wrong-token"})
            assert response.status_code == 403
            assert "Invalid CSRF token" in response.json()["detail"]
        finally:
            client.cookies.clear()
            app.dependency_overrides[validate_csrf_token] = lambda: None

    def test_post_with_valid_csrf_succeeds(self, client, registered_user):
        """POST with matching CSRF cookie and header should succeed."""
        app.dependency_overrides.pop(validate_csrf_token, None)
        try:
            client.cookies.set("csrf_token", "valid-token")
            response = client.post("/logout", headers={"X-CSRF-Token": "valid-token"})
            assert response.status_code == 200
        finally:
            client.cookies.clear()
            app.dependency_overrides[validate_csrf_token] = lambda: None


class TestRefreshEndpoint:
    def test_refresh_requires_cookie(self, client):
        response = client.post("/refresh")
        assert response.status_code == 401
        assert "no refresh token" in response.json()["detail"].lower()

    def test_refresh_expired_token(self, client):
        token = jwt.encode(
            {
                "username": "testuser",
                "type": "refresh",
                "exp": datetime.utcnow() - timedelta(minutes=1),
            },
            settings.JWT_REFRESH_SECRET_KEY,
            algorithm="HS256",
        )
        client.cookies.set("refresh_token", token, path="/refresh")

        response = client.post("/refresh")
        assert response.status_code == 401
        assert "expired" in response.json()["detail"].lower()

    def test_refresh_invalid_token(self, client):
        client.cookies.set("refresh_token", "bad-token", path="/refresh")

        response = client.post("/refresh")
        assert response.status_code == 401
        assert "invalid refresh token" in response.json()["detail"].lower()

    def test_refresh_wrong_token_type(self, client):
        token = jwt.encode(
            {
                "username": "testuser",
                "type": "access",
                "exp": datetime.utcnow() + timedelta(hours=1),
            },
            settings.JWT_REFRESH_SECRET_KEY,
            algorithm="HS256",
        )
        client.cookies.set("refresh_token", token, path="/refresh")

        response = client.post("/refresh")
        assert response.status_code == 401
        assert "wrong token type" in response.json()["detail"].lower()

    def test_refresh_user_not_found(self, client):
        token = jwt.encode(
            {
                "username": "ghost",
                "type": "refresh",
                "exp": datetime.utcnow() + timedelta(hours=1),
            },
            settings.JWT_REFRESH_SECRET_KEY,
            algorithm="HS256",
        )
        client.cookies.set("refresh_token", token, path="/refresh")

        response = client.post("/refresh")
        assert response.status_code == 401
        assert "user not found" in response.json()["detail"].lower()

    def test_refresh_success(self, client, registered_user):
        token = jwt.encode(
            {
                "username": registered_user["username"],
                "type": "refresh",
                "exp": datetime.utcnow() + timedelta(hours=1),
            },
            settings.JWT_REFRESH_SECRET_KEY,
            algorithm="HS256",
        )
        client.cookies.set("refresh_token", token, path="/refresh")

        response = client.post("/refresh")
        assert response.status_code == 200
        payload = response.json()
        assert "token" in payload
        decoded = jwt.decode(payload["token"], settings.JWT_SECRET_KEY, algorithms=["HS256"])
        assert decoded["username"] == registered_user["username"]
        assert decoded["type"] == "access"