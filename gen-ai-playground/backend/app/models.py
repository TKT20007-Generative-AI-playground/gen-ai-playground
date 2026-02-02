"""
Pydantic models for request and response validation
"""
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class ImageRequestBody(BaseModel):
    """Request model for image generation"""
    prompt: str
    model: str
    image: Optional[str] = None  


class RegisterRequest(BaseModel):
    """Request model for user registration"""
    username: str
    password: str
    invitation_code: str


class LoginRequest(BaseModel):
    """Request model for user login"""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Response model for successful login"""
    message: str
    token: str
    username: str


class RegisterResponse(BaseModel):
    """Response model for successful registration"""
    message: str
    username: str


class HistoryItem(BaseModel):
    """Model for a single history item"""
    prompt: str
    model: str
    timestamp: datetime
    image_size: int
    image_data: str


class HistoryResponse(BaseModel):
    """Response model for history endpoint"""
    history: List[HistoryItem]


class UserInfo(BaseModel):
    """Model for authenticated user information"""
    username: str
