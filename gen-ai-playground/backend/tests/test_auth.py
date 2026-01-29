import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
import bcrypt
import jwt
import mongomock
from unittest.mock import patch, MagicMock
import os

# Import the app and database instance
from server import app, RegisterRequest, LoginRequest


@pytest.fixture
def mock_db():
    """Create a mock MongoDB database for testing"""
    client = mongomock.MongoClient()
    db = client["gen_ai_playground"]
    return db


@pytest.fixture
def client(mock_db):
    """Create a test client with mocked database"""
    with patch('server.db', mock_db):
        with patch.dict(os.environ, {"INVITATION_CODE": "genaiteamonly"}):
            yield TestClient(app)


@pytest.fixture
def test_user_data():
    """Sample user data for testing"""
    return {
        "username": "testuser",
        "email": "test@example.com",
        "password": "SecurePassword123!",
        "invitation_code": "genaiteamonly"
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
        "email": test_user_data["email"],
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
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "User registered successfully"
        assert data["username"] == test_user_data["username"]
    
    def test_duplicate_username(self, client, registered_user):
        """Test registration with duplicate username"""
        duplicate_user = {
            "username": registered_user["username"],
            "email": "different@example.com",
            "password": "AnotherPassword123!",
            "invitation_code": "genaiteamonly"
        }
        
        response = client.post("/register", json=duplicate_user)
        
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]
    
    def test_duplicate_email(self, client, registered_user):
        """Test registration with duplicate email"""
        duplicate_user = {
            "username": "differentuser",
            "email": registered_user["email"],
            "password": "AnotherPassword123!",
            "invitation_code": "genaiteamonly"
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
        """Test registration when database is unavailable"""
        with patch('server.db', None):
            with patch.dict(os.environ, {"INVITATION_CODE": "genaiteamonly"}):
                client = TestClient(app)
                response = client.post("/register", json=test_user_data)
                
                assert response.status_code == 503
                assert "Database not available" in response.json()["detail"]
    
    def test_missing_fields(self, client):
        """Test registration with missing required fields"""
        incomplete_data = {
            "username": "testuser"
            # Missing email, password, and invitation_code
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
            "email": "test@example.com",
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
        assert data["email"] == registered_user["email"]
        assert "token" in data
        assert data["token"] != ""
    
    def test_jwt_token_structure(self, client, registered_user):
        """Test that JWT token contains correct claims and is valid"""
        login_data = {
            "username": registered_user["username"],
            "password": registered_user["password"]
        }
        
        with patch.dict(os.environ, {"JWT_SECRET_KEY": "test-secret-key"}):
            response = client.post("/login", json=login_data)
            
            assert response.status_code == 200
            token = response.json()["token"]
            
            # Decode and verify token
            decoded = jwt.decode(token, "test-secret-key", algorithms=["HS256"])
            
            assert decoded["username"] == registered_user["username"]
            assert decoded["email"] == registered_user["email"]
            assert "exp" in decoded
            
            # Verify expiration is ~24 hours from now
            exp_time = datetime.fromtimestamp(decoded["exp"])
            now = datetime.utcnow()
            time_diff = exp_time - now
            assert timedelta(hours=23) < time_diff < timedelta(hours=25)
    
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
    
    def test_database_unavailable(self, test_user_data):
        """Test login when database is unavailable"""
        with patch('server.db', None):
            client = TestClient(app)
            login_data = {
                "username": test_user_data["username"],
                "password": test_user_data["password"]
            }
            
            response = client.post("/login", json=login_data)
            
            assert response.status_code == 503
            assert "Database not available" in response.json()["detail"]
    
    def test_missing_credentials(self, client):
        """Test login with missing credentials"""
        incomplete_data = {
            "username": "testuser"
            # Missing password
        }
        
        response = client.post("/login", json=incomplete_data)
        assert response.status_code == 422  # Validation error
    
    def test_error_messages_dont_leak_info(self, client, registered_user):
        """Test that error messages are the same for invalid username vs password"""
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
    
    def test_register_then_login_flow(self, client, test_user_data):
        """Test complete flow: register a user then login"""
        # Register
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