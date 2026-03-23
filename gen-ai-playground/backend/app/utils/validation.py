from fastapi import HTTPException
import re

def validate_password(password: str) -> None:
    """
    Validates password strength according to security requirements.
    
    Args:
        password (str): The password to validate.
    
    Raises:
        HTTPException: If the password does not meet length, uppercase, digit, or special character requirements.
    """
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not any(c.isupper() for c in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not any(c.isdigit() for c in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    if not any(c in "!@#$%^&*(),.?\":{}|<>" for c in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character")

def validate_username(username: str) -> None:
    """
    Validates username according to requirements.
    
    Args:
        username (str): The username to validate.
    
    Raises:
        HTTPException: If the username does not meet length or character requirements.
    """
    if len(username) < 4:
        raise HTTPException(status_code=400, detail="Username must be at least 4 characters long")
    if not re.match(r'^[A-Za-z0-9]+$', username):
        raise HTTPException(status_code=400, detail="Username must contain only letters and numbers")
