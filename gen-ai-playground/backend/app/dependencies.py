"""
FastAPI dependencies for authentication and authorization
"""
from fastapi import HTTPException, Header, Depends, Cookie
from pymongo.database import Database
import jwt
from app.config import settings
from app.database import get_database
from app.models import UserInfo


def get_current_user(
    authorization: str = Header(None),
    access_token: str = Cookie(None),
    db: Database = Depends(get_database)
) -> UserInfo:
    """
    Dependency to verify JWT token and extract user information.

    Args:
        authorization: Optional. Bearer token from Authorization header. If present and starts with "Bearer ", this is used for authentication.
        access_token: Optional. JWT token from access_token cookie. Used if Authorization header is not present.
        db: Database instance.

    Returns:
        UserInfo: Authenticated user information.

    Raises:
        HTTPException: If authentication fails.

    Selection logic:
        If Authorization header is present and starts with "Bearer ", use its value as the token.
        Else, if access_token cookie is present, use its value as the token.
        If neither is present, authentication fails.
    """
    token = None

    # Mobile / API client
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")

    # Browser cookie
    elif access_token:
        token = access_token

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


def validate_csrf_token(
    access_token: str = Cookie(None),
    csrf_cookie: str = Cookie(None, alias="csrf_token"),
    csrf_header: str = Header(None, alias="X-CSRF-Token"),
    authorization: str = Header(None)
):
    """
    Dependency to validate CSRF token for cookie-authenticated requests.
    Skips CSRF validation if Authorization: Bearer is present.

    Args:
        access_token: HTTPOnly JWT cookie. If absent, CSRF check is skipped.
        csrf_cookie: Non-HTTPOnly CSRF token cookie set by the backend on login.
        csrf_header: X-CSRF-Token header sent by the frontend on each request.
        authorization: Optional Authorization header. If Bearer token is present, CSRF is skipped.

    Raises:
        HTTPException: 403 if CSRF cookie and header are present but do not match.
    """
    if authorization and authorization.startswith("Bearer "):
        return
    # No session cookie → not a browser/cookie-based request; skip CSRF
    if not access_token:
        return

    if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
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
