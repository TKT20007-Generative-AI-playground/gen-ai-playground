"""
Authentication routes: registration and login

Security Model:
- Access token is returned in the response body and kept in-memory on the frontend
- Refresh token is stored in an HTTPOnly cookie (path-scoped to /refresh)
- CSRF token is a non-HTTPOnly cookie used for double-submit protection
- Cookie settings: samesite="strict", secure=IS_PROD
"""
from fastapi import APIRouter, HTTPException, Depends, Response, Request
from pymongo.database import Database
from datetime import datetime, timedelta
import bcrypt
import jwt
import secrets

from app.config import settings
from app.database import get_database
from app.models import RegisterRequest, LoginRequest, RegisterResponse, LoginResponse
from app.utils.validation import validate_password
from app.dependencies import get_current_user, validate_csrf_token

router = APIRouter(
    tags=["authentication"]
)

def _issue_access_token(username: str, is_admin: bool) -> tuple[str, datetime]:
    """Return a short-lived access token and its expiry datetime (lifetime is configuration-driven)."""
    expiry = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = jwt.encode(
        {"username": username, 
        "is_admin": is_admin, 
        "exp": expiry, 
        "type": "access"},
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    return token, expiry


def _issue_refresh_token(username: str) -> tuple[str, timedelta]:
    """Return a long-lived refresh token and its TTL timedelta (lifetime is configuration-driven)."""
    delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    expiry = datetime.utcnow() + delta
    token = jwt.encode(
        {"username": username, "exp": expiry, "type": "refresh"},
        settings.JWT_REFRESH_SECRET_KEY,   # ← separate secret for refresh tokens
        algorithm="HS256",
    )
    return token, delta


def _set_refresh_cookie(response: Response, token: str, max_age: timedelta) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.IS_PROD,
        samesite="strict",
        max_age=int(max_age.total_seconds()),
        path="/refresh",
    )


def _set_csrf_cookie(response: Response, token: str, max_age: timedelta) -> None:
    response.set_cookie(
        key="csrf_token",
        value=token,
        httponly=False,   # must be readable by frontend JS
        secure=settings.IS_PROD,
        samesite="strict",
        max_age=int(max_age.total_seconds()),
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
        Access token is returned in the response body (frontend stores in memory).
        Sets an HTTPOnly refresh_token cookie for session persistence.
        Sets a non-HTTPOnly csrf_token cookie for CSRF protection.
    """
    user = db.users.find_one({"username": credentials.username})
    if not user or not bcrypt.checkpw(credentials.password.encode(), user["password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    is_admin = user.get("is_admin", False)

    # 1. Short-lived access token  → returned in response body (frontend keeps in memory)
    access_token, _ = _issue_access_token(user["username"], is_admin)

    # 2. Long-lived refresh token  → HTTPOnly cookie, path-scoped to /refresh
    refresh_token, refresh_delta = _issue_refresh_token(user["username"])
    _set_refresh_cookie(response, refresh_token, refresh_delta)

    # 3. CSRF token  → non-HTTPOnly cookie, frontend reads and sends as X-CSRF-Token header
    csrf_token = secrets.token_urlsafe(32)
    _set_csrf_cookie(response, csrf_token, refresh_delta)

    return LoginResponse(
        message="Login successful",
        token=access_token,         # short-lived, in-memory on frontend
        username=user["username"],
        is_admin=is_admin,
    )

@router.post("/refresh")
def refresh(request: Request, db: Database = Depends(get_database)):
    """
    Issue a new access token using the refresh token cookie.
    Called automatically by the frontend when a 401 is received.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")

    try:
        payload = jwt.decode(token, settings.JWT_REFRESH_SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired, please log in again")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Wrong token type")

    user = db.users.find_one({"username": payload["username"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Issue a fresh access token only — refresh token cookie stays unchanged
    access_token, _ = _issue_access_token(user["username"], user.get("is_admin", False))

    return {"token": access_token}

@router.get("/me")
def me(current_user=Depends(get_current_user)):
    """
    Return the current authenticated user's username and admin status.

    Args:
        current_user: User extracted from the Bearer token.

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
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        samesite="strict",
        secure=settings.IS_PROD,
        path="/refresh",
    )
    response.delete_cookie(
        key="csrf_token",
        httponly=False,
        samesite="strict",
        secure=settings.IS_PROD,
    )
    return {"message": "Logged out successfully"}