"""
FastAPI dependencies for authentication and authorization
"""
from fastapi import HTTPException, Header, Depends, Cookie, WebSocket, Request
from pymongo.database import Database
import jwt
from app.config import settings
from app.database import get_database
from app.models import UserInfo
from app.container_handler import ContainerHandler



def get_current_user(
    authorization: str = Header(None),
    db: Database = Depends(get_database)
) -> UserInfo:
    """
    Dependency to verify JWT token and extract user information.

    Args:
        authorization: Bearer token from Authorization header.
        db: Database instance.

    Returns:
        UserInfo: Authenticated user information.

    Raises:
        HTTPException: If authentication fails.
    """
    token = None

    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        # Decode and verify token
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=["HS256"]
        )
        username = payload.get("username")
        
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Verify user exists in database
        user = db.users.find_one({"username": username})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return UserInfo(username=username, is_admin=user.get("is_admin", False))
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Authentication failed: {str(e)}"
        )

def verify_token(token: str, db) -> UserInfo | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        username = payload.get("username")
        if not username:
            return None
        user = db.users.find_one({"username": username})
        if not user:
            return None
        return UserInfo(username=username, is_admin=user.get("is_admin", False))
    except Exception:
        return None

def validate_csrf_token(
    csrf_cookie: str = Cookie(None, alias="csrf_token"),
    csrf_header: str = Header(None, alias="X-CSRF-Token"),
    authorization: str = Header(None)
):
    """
    Dependency to validate CSRF token for cookie-authenticated requests.
    Skips CSRF validation if Authorization: Bearer is present.

    Args:
        csrf_cookie: Non-HTTPOnly CSRF token cookie set by the backend on login.
            Also serves as the session indicator — if absent, there is no
            browser session and CSRF check is skipped.
        csrf_header: X-CSRF-Token header sent by the frontend on each request.
        authorization: Optional Authorization header. If Bearer token is present, CSRF is skipped.

    Raises:
        HTTPException: 403 if CSRF cookie is present but the header is missing or mismatched.
    """
    if authorization and authorization.startswith("Bearer "):
        return
    # No CSRF cookie → no browser session; skip CSRF
    if not csrf_cookie:
        return

    if not csrf_header or csrf_cookie != csrf_header:
        raise HTTPException(status_code=403, detail="Invalid CSRF token")


def get_admin_user(
    current_user: UserInfo = Depends(get_current_user)
) -> UserInfo:
    """
    Dependency that ensures the current user is an admin.

    Returns:
        UserInfo: Admin user information

    Raises:
        HTTPException: If user is not an admin
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    return current_user

def get_container_handler(request: Request) -> ContainerHandler:
    return request.app.state.container_handler