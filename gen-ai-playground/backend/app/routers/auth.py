"""
Authentication routes: registration and login
"""
from fastapi import APIRouter, HTTPException, Depends, Response, Cookie
from pymongo.database import Database
from datetime import datetime, timedelta
import bcrypt
import jwt

from app.config import settings
from app.database import get_database
from app.models import RegisterRequest, LoginRequest, RegisterResponse, LoginResponse
from app.utils.validation import validate_password

router = APIRouter(
    tags=["authentication"]
)


@router.post("/register", response_model=RegisterResponse)
def register(
    user_data: RegisterRequest,
    db: Database = Depends(get_database)
):
    
    # Password validation
    validate_password(user_data.password)
    
    """
    Register a new user
    
    Args:
        user_data: Registration details including username, password, and invitation code
        db: Database instance
        
    Returns:
        RegisterResponse: Success message and username
        
    Raises:
        HTTPException: If registration fails
    """
    try:
        # Validate invitation code
        if not settings.INVITATION_CODE or user_data.invitation_code != settings.INVITATION_CODE:
            raise HTTPException(
                status_code=403,
                detail="Invalid invitation code"
            )
        
        # Check if user already exists
        existing_user = db.users.find_one({"username": user_data.username})
        
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="Username already exists"
            )
        
        # Hash the password
        hashed_password = bcrypt.hashpw(
            user_data.password.encode('utf-8'),
            bcrypt.gensalt()
        )
        
        # Create user document
        user_doc = {
            "username": user_data.username,
            "password": hashed_password,
            "created_at": datetime.utcnow()
        }
        
        # Insert user into database
        db.users.insert_one(user_doc)
        
        return RegisterResponse(
            message="User registered successfully",
            username=user_data.username
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Registration failed: {str(e)}"
        )


@router.post("/login", response_model=LoginResponse)
def login(
    credentials: LoginRequest,
    response: Response,
    db: Database = Depends(get_database)
):
    """
    Authenticate user and return JWT token
    
    Args:
        credentials: Login credentials (username and password)
        db: Database instance
        
    Returns:
        LoginResponse: JWT token and user information
        
    Raises:
        HTTPException: If authentication fails
    """
    try:
        # Find user by username
        user = db.users.find_one({"username": credentials.username})
        
        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid username or password"
            )
        
        # Verify password
        if not bcrypt.checkpw(
            credentials.password.encode('utf-8'),
            user["password"]
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid username or password"
            )
        
        # Generate JWT token
        token_expiry = datetime.utcnow() + timedelta(hours=settings.JWT_EXPIRY_HOURS)
        
        token_payload = {
            "username": user["username"],
            "exp": token_expiry
        }
        
        token = jwt.encode(
            token_payload,
            settings.JWT_SECRET_KEY,
            algorithm="HS256"
        )

        # Set HTTPonly cookie
        response.set_cookie(
            key="access_token",
            value=token,
            httponly=True,
            secure=settings.IS_PROD,  # keep False for local dev
            samesite="strict",
            max_age=settings.JWT_EXPIRY_HOURS * 3600
        )
        
        return LoginResponse(
            message="Login successful",
            token=token,
            username=user["username"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Login failed: {str(e)}"
        )

@router.get("/me")
def me(access_token: str = Cookie(None)):
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(access_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        return {"username": payload.get("username")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
@router.post("/logout")
def logout(response: Response):
    # Clear the cookie
    response.delete_cookie(
        key="access_token",
        httponly=True,
        samesite="strict",
        secure=settings.IS_PROD  # True in production
    )
    return {"message": "Logged out successfully"}