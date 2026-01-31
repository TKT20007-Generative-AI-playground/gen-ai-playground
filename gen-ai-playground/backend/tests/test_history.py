import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
import bcrypt
import jwt
import mongomock
from unittest.mock import patch, MagicMock
import os
import base64

# Import the app
from server import app


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
        "password": "SecurePassword123!"
    }


@pytest.fixture
def test_user2_data():
    """Second user data for testing user isolation"""
    return {
        "username": "testuser2",
        "password": "SecurePassword456!"
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


@pytest.fixture
def registered_user2(mock_db, test_user2_data):
    """Create a second pre-registered user in the mock database"""
    hashed_password = bcrypt.hashpw(
        test_user2_data["password"].encode('utf-8'),
        bcrypt.gensalt()
    )
    user_doc = {
        "username": test_user2_data["username"],
        "password": hashed_password,
        "created_at": datetime.utcnow()
    }
    mock_db.users.insert_one(user_doc)
    return test_user2_data


@pytest.fixture
def auth_token(test_user_data):
    """Generate a valid JWT token for testing"""
    secret_key = "dev-secret-key-for-local-development"
    token_expiry = datetime.utcnow() + timedelta(hours=24)
    
    token_payload = {
        "username": test_user_data["username"],
        "exp": token_expiry
    }
    
    token = jwt.encode(token_payload, secret_key, algorithm="HS256")
    return token


@pytest.fixture
def auth_token2(test_user2_data):
    """Generate a valid JWT token for second user"""
    secret_key = "dev-secret-key-for-local-development"
    token_expiry = datetime.utcnow() + timedelta(hours=24)
    
    token_payload = {
        "username": test_user2_data["username"],
        "exp": token_expiry
    }
    
    token = jwt.encode(token_payload, secret_key, algorithm="HS256")
    return token


@pytest.fixture
def sample_image_data():
    """Generate sample base64 image data for testing"""
    # Create a simple base64 encoded string (not a real image, but sufficient for testing)
    return base64.b64encode(b"fake_image_data_for_testing").decode('utf-8')


@pytest.fixture
def populated_history(mock_db, test_user_data, test_user2_data, sample_image_data):
    """Populate the database with sample image history for multiple users"""
    # Add images for testuser
    for i in range(3):
        image_record = {
            "prompt": f"Test prompt {i} for user 1",
            "model": "flux_kontext",
            "timestamp": datetime.utcnow() - timedelta(minutes=i),
            "image_size": 1024 * (i + 1),
            "image_data": sample_image_data,
            "username": test_user_data["username"]
        }
        mock_db.images.insert_one(image_record)
    
    # Add images for testuser2
    for i in range(2):
        image_record = {
            "prompt": f"Test prompt {i} for user 2",
            "model": "flux1_krea_dev",
            "timestamp": datetime.utcnow() - timedelta(minutes=i + 10),
            "image_size": 2048 * (i + 1),
            "image_data": sample_image_data,
            "username": test_user2_data["username"]
        }
        mock_db.images.insert_one(image_record)


class TestHistoryEndpoint:
    """Tests for /history endpoint"""
    
    def test_get_history_with_valid_token(self, client, registered_user, auth_token, populated_history):
        """Test getting history with valid authentication"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = client.get("/images/history", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "history" in data
        assert len(data["history"]) == 3  # Only user 1's images
    
    def test_get_history_without_token(self, client, populated_history):
        """Test getting history without authentication token"""
        response = client.get("/images/history")
        
        assert response.status_code == 422  # Missing required header
    
    def test_get_history_with_invalid_token(self, client, populated_history):
        """Test getting history with invalid token"""
        headers = {"Authorization": "Bearer invalid_token"}
        response = client.get("/images/history", headers=headers)
        
        assert response.status_code == 401
        assert "Invalid token" in response.json()["detail"]
    
    def test_get_history_with_expired_token(self, client, registered_user, populated_history):
        """Test getting history with expired token"""
        secret_key = "dev-secret-key-for-local-development"
        token_expiry = datetime.utcnow() - timedelta(hours=1)  # Expired 1 hour ago
        
        token_payload = {
            "username": registered_user["username"],
            "exp": token_expiry
        }
        
        expired_token = jwt.encode(token_payload, secret_key, algorithm="HS256")
        headers = {"Authorization": f"Bearer {expired_token}"}
        response = client.get("/images/history", headers=headers)
        
        assert response.status_code == 401
        assert "expired" in response.json()["detail"].lower()
    
    def test_get_history_user_isolation(self, client, registered_user, registered_user2, 
                                        auth_token, auth_token2, populated_history):
        """Test that users can only see their own history"""
        # Get history for user 1
        headers1 = {"Authorization": f"Bearer {auth_token}"}
        response1 = client.get("/images/history", headers=headers1)
        
        assert response1.status_code == 200
        data1 = response1.json()
        assert len(data1["history"]) == 3
        for item in data1["history"]:
            assert "user 1" in item["prompt"]
        
        # Get history for user 2
        headers2 = {"Authorization": f"Bearer {auth_token2}"}
        response2 = client.get("/images/history", headers=headers2)
        
        assert response2.status_code == 200
        data2 = response2.json()
        assert len(data2["history"]) == 2
        for item in data2["history"]:
            assert "user 2" in item["prompt"]
    
    def test_get_history_includes_image_data(self, client, registered_user, auth_token, 
                                             populated_history, sample_image_data):
        """Test that history includes image data"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = client.get("/images/history", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        for item in data["history"]:
            assert "image_data" in item
            assert item["image_data"] == sample_image_data
            assert "prompt" in item
            assert "model" in item
            assert "timestamp" in item
            assert "image_size" in item
    
    def test_get_history_sorted_by_timestamp(self, client, registered_user, auth_token, populated_history):
        """Test that history is sorted by newest first"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = client.get("/images/history", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        history = data["history"]
        
        # Check that timestamps are in descending order
        timestamps = [datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00")) 
                     for item in history]
        assert timestamps == sorted(timestamps, reverse=True)
    
    def test_get_history_empty_for_new_user(self, client, registered_user, auth_token):
        """Test that new user with no images gets empty history"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = client.get("/images/history", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "history" in data
        assert len(data["history"]) == 0
    
    def test_get_history_without_bearer_prefix(self, client, registered_user, auth_token, populated_history):
        """Test getting history without 'Bearer' prefix in token"""
        headers = {"Authorization": auth_token}  # Missing "Bearer " prefix
        response = client.get("/images/history", headers=headers)
        
        assert response.status_code == 401
        assert "Invalid authorization header" in response.json()["detail"]
    
    def test_get_history_database_unavailable(self, auth_token):
        """Test history endpoint when database is unavailable"""
        from fastapi import HTTPException
        from app.database import get_database
        
        def raise_503():
            raise HTTPException(status_code=503, detail="Database not available")
        
        app.dependency_overrides[get_database] = raise_503
        try:
            client = TestClient(app)
            headers = {"Authorization": f"Bearer {auth_token}"}
            response = client.get("/images/history", headers=headers)
            
            assert response.status_code == 503
            assert "Database not available" in response.json()["detail"]
        finally:
            app.dependency_overrides.clear()
    
    def test_get_history_limit_50_items(self, client, registered_user, auth_token, mock_db, sample_image_data):
        """Test that history returns maximum 50 items"""
        # Add 60 images for the user
        for i in range(60):
            image_record = {
                "prompt": f"Test prompt {i}",
                "model": "flux_kontext",
                "timestamp": datetime.utcnow() - timedelta(minutes=i),
                "image_size": 1024,
                "image_data": sample_image_data,
                "username": registered_user["username"]
            }
            mock_db.images.insert_one(image_record)
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = client.get("/images/history", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["history"]) == 50  # Should be limited to 50


class TestGenerateImageWithAuth:
    """Tests for /generate-image endpoint with authentication"""
    
    def test_generate_image_without_token(self, client):
        """Test generating image without authentication token"""
        image_request = {
            "prompt": "A beautiful sunset",
            "model": "flux_kontext"
        }
        
        response = client.post("/images/generate", json=image_request)
        
        assert response.status_code == 422  # Missing required header
    
    def test_generate_image_with_invalid_token(self, client):
        """Test generating image with invalid token"""
        image_request = {
            "prompt": "A beautiful sunset",
            "model": "flux_kontext"
        }
        headers = {"Authorization": "Bearer invalid_token"}
        
        response = client.post("/images/generate", json=image_request, headers=headers)
        
        assert response.status_code == 401
        assert "Invalid token" in response.json()["detail"]
    
    @patch('app.routers.images.requests.post')
    def test_generate_image_stores_with_username(self, mock_post, client, registered_user, 
                                                  auth_token, mock_db, sample_image_data):
        """Test that generated image is stored with username"""
        # Mock the external API response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "COMPLETED",
            "output": {
                "outputs": [sample_image_data]
            }
        }
        mock_post.return_value = mock_response
        
        image_request = {
            "prompt": "A beautiful sunset",
            "model": "flux_kontext"
        }
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        with patch.dict(os.environ, {"VERDA_API_KEY": "test-api-key"}):
            response = client.post("/images/generate", json=image_request, headers=headers)
        
        assert response.status_code == 200
        
        # Verify image was stored in database with username
        stored_image = mock_db.images.find_one({"prompt": "A beautiful sunset"})
        assert stored_image is not None
        assert stored_image["username"] == registered_user["username"]
        assert stored_image["model"] == "flux_kontext"
        assert stored_image["image_data"] == sample_image_data
        assert "timestamp" in stored_image
        assert "image_size" in stored_image
    
    @patch('app.routers.images.requests.post')
    def test_generate_image_different_users_separate_storage(self, mock_post, client, 
                                                              registered_user, registered_user2,
                                                              auth_token, auth_token2, 
                                                              mock_db, sample_image_data):
        """Test that images from different users are stored separately"""
        # Mock the external API response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "COMPLETED",
            "output": {
                "outputs": [sample_image_data]
            }
        }
        mock_post.return_value = mock_response
        
        with patch.dict(os.environ, {"VERDA_API_KEY": "test-api-key"}):
            # Generate image for user 1
            headers1 = {"Authorization": f"Bearer {auth_token}"}
            response1 = client.post("/images/generate", 
                                   json={"prompt": "User 1 prompt", "model": "flux_kontext"}, 
                                   headers=headers1)
            assert response1.status_code == 200
            
            # Generate image for user 2
            headers2 = {"Authorization": f"Bearer {auth_token2}"}
            response2 = client.post("/images/generate", 
                                   json={"prompt": "User 2 prompt", "model": "flux_kontext"}, 
                                   headers=headers2)
            assert response2.status_code == 200
        
        # Verify separate storage
        user1_images = list(mock_db.images.find({"username": registered_user["username"]}))
        user2_images = list(mock_db.images.find({"username": registered_user2["username"]}))
        
        assert len(user1_images) == 1
        assert len(user2_images) == 1
        assert user1_images[0]["prompt"] == "User 1 prompt"
        assert user2_images[0]["prompt"] == "User 2 prompt"
