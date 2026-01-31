"""
FastAPI dependencies for authentication and authorization
"""
from fastapi import HTTPException, Header, Depends
from pymongo.database import Database
import jwt
from app.config import settings
from app.database import get_database
from app.models import UserInfo


def get_current_user(
    authorization: str = Header(...),
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
    try:
        # Extract token from Bearer header
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=401,
                detail="Invalid authorization header"
            )
        
        token = authorization.replace("Bearer ", "")
        
        # Decode and verify token
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=["HS256"]
        )
        username = payload.get("username")
        email = payload.get("email")
        
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Verify user exists in database
        user = db.users.find_one({"username": username})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return UserInfo(username=username, email=email)
    
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
