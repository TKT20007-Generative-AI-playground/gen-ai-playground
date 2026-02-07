"""
Pydantic models for request and response validation
"""
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional, Dict, Any


class ImageRequestBody(BaseModel):
    """Request model for image generation"""
    prompt: str
    model: str


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


# ---- Text generation models ----

class DeployModelRequest(BaseModel):
    """Request model for deploying a text model on Verda"""
    model_path: str = "deepseek-ai/deepseek-llm-7b-chat"
    deployment_name: Optional[str] = None


class ConnectDeploymentRequest(BaseModel):
    """Request model for connecting to an existing deployment"""
    deployment_name: str
    model_path: str = "deepseek-ai/deepseek-llm-7b-chat"


class DeploymentStatusResponse(BaseModel):
    """Response model for deployment status"""
    name: Optional[str] = None
    status: str
    model: Optional[str] = None
    healthy: Optional[bool] = None
    message: Optional[str] = None


class TextGenerateRequest(BaseModel):
    """Request model for text generation"""
    prompt: str
    max_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9


class TextGenerateResponse(BaseModel):
    """Response model for text generation"""
    generated_text: str
    model: str
    prompt: str
    usage: Dict[str, Any] = {}


class ChatMessage(BaseModel):
    """A single chat message"""
    role: str  # 'user', 'assistant', or 'system'
    content: str


class ChatRequest(BaseModel):
    """Request model for chat completions"""
    messages: List[ChatMessage]
    max_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9


class ChatResponse(BaseModel):
    """Response model for chat completions"""
    reply: str
    model: str
    usage: Dict[str, Any] = {}
