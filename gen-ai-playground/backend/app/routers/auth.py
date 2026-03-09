"""
Authentication routes: registration and login

Security Model:
- User authentication uses HTTPOnly cookies (secure, XSS-protected)
- Token is returned in login response body for flexibility
- Frontend relies on HTTPOnly cookies (no localStorage)
- Cookie settings: httponly=True, samesite="strict", secure=IS_PROD
"""
from fastapi import APIRouter, HTTPException, Depends, Response
from pymongo.database import Database
from datetime import datetime, timedelta
import bcrypt
import jwt
import secrets

from app.config import settings
from app.database import get_database
from app.models import RegisterRequest, LoginRequest, RegisterResponse, LoginResponse
from app.utils.validation import validate_password
from app.dependencies import get_current_user, validate_csrf_token, get_admin_user

router = APIRouter(
    tags=["authentication"]
)


@router.post("/register", response_model=RegisterResponse)
def register(
    user_data: RegisterRequest,
    db: Database = Depends(get_database)
):
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

    # Password validation
    validate_password(user_data.password)

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
            "is_admin": False,
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
    
    Notes:
        Sets an HTTPOnly access_token cookie for browser-based authentication.
        Sets a non-HTTPOnly csrf_token cookie for CSRF protection.
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
        token_expiry_delta = timedelta(seconds=settings.JWT_EXPIRY_HOURS)
        token_expiry = datetime.utcnow() + token_expiry_delta
        
        is_admin = user.get("is_admin", False)
        
        token_payload = {
            "username": user["username"],
            "is_admin": is_admin,
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
            max_age=int(token_expiry_delta.total_seconds())
        )

        # Generate CSRF token
        csrf_token = secrets.token_urlsafe(32)

        # Set CSRF cookie (not httponly)
        response.set_cookie(
            key="csrf_token",
            value=csrf_token,
            httponly=False,  # Must be False so frontend can read it
            secure=settings.IS_PROD,
            samesite="strict",
            max_age=int(token_expiry_delta.total_seconds())
        )
        
        return LoginResponse(
            message="Login successful",
            token=token,
            username=user["username"],
            is_admin=is_admin
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Login failed: {str(e)}"
        )

@router.get("/me")
def me(current_user=Depends(get_current_user)):
    """
    Return the current authenticated user's username and admin status.

    Args:
        current_user: User extracted from the JWT cookie or Bearer token.

    Returns:
        dict: username and is_admin flag for the authenticated user.

    Raises:
        HTTPException: 401 if not authenticated.
    """
    return {"username": current_user.username, "is_admin": getattr(current_user, "is_admin", False)}
    
@router.post("/logout")
def logout(
    response: Response,
    _: None = Depends(validate_csrf_token)):
    """
    Logs out the current user by clearing authentication and CSRF cookies.

    Args:
        response: FastAPI Response object used to clear cookies.
        _: Ensures CSRF protection is enforced via dependency.

    Returns:
        dict: A message indicating successful logout.

    Raises:
        HTTPException: 403 if CSRF validation fails.

    Notes:
        Requires a valid CSRF token for cookie-authenticated requests.
        Works for both cookie and Bearer token authentication, but CSRF is only enforced for cookie auth.
    """
    # Clear the access token cookie
    response.delete_cookie(
        key="access_token",
        httponly=True,
        samesite="strict",
        secure=settings.IS_PROD
    )
    # Clear the CSRF token cookie
    response.delete_cookie(
        key="csrf_token",
        httponly=False,
        samesite="strict",
        secure=settings.IS_PROD
    )
    return {"message": "Logged out successfully"}