from fastapi import HTTPException

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