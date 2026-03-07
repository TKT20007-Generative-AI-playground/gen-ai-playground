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
    Dependency to verify JWT token and extract user information
    
    Args:
        authorization: Bearer token from Authorization header
        db: Database instance
        
    Returns:
        UserInfo: Authenticated user information
        
    Raises:
        HTTPException: If authentication fails
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
        
        return UserInfo(username=username)
    
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
    authorization: str = Header(None),
    csrf_cookie: str = Cookie(None, alias="csrf_token"),
    csrf_header: str = Header(None, alias="X-CSRF-Token")
):
    """
    Dependency to validate CSRF token.
    Skipped when the request authenticates via Authorization: Bearer
    (API/mobile clients) since CSRF attacks only apply to cookie-based auth.
    Compares the csrf_token cookie against the X-CSRF-Token header for
    browser-based (cookie) requests.
    """
    # Bearer token clients are not vulnerable to CSRF — skip validation
    if authorization and authorization.startswith("Bearer "):
        return

    if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
        raise HTTPException(status_code=403, detail="Invalid CSRF token")
