"""
Pydantic models for request and response validation
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional, Dict, Any


class ImageRequestBody(BaseModel):
    """Request model for image generation"""
    prompt: str
    model: str
    image: Optional[str] = None  
    image_to_edit: Optional[str] = None
    parent_image_id: Optional[str] = None


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
    is_admin: bool = False


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
    image_type: str

class HistoryResponse(BaseModel):
    """Response model for history endpoint"""
    history: List[HistoryItem]


class UserInfo(BaseModel):
    """Model for authenticated user information"""
    username: str
    is_admin: bool = False


# ---- User management models ----

class UserListItem(BaseModel):
    """Model for a single user in the user list"""
    username: str
    is_admin: bool = False
    created_at: Optional[datetime] = None


class UserListResponse(BaseModel):
    """Response model for user list endpoint"""
    users: List[UserListItem]


class DeleteUserResponse(BaseModel):
    """Response model for user deletion"""
    message: str
    username: str


# ---- Text generation models ----

class DeployModelRequest(BaseModel):
    """Request model for deploying a text model on Verda"""
    model_path: str
    deployment_name: Optional[str] = None


class ConnectDeploymentRequest(BaseModel):
    """Request model for connecting to an existing deployment"""
    deployment_name: str
    model_path: str


class DeploymentStatusResponse(BaseModel):
    """Response model for deployment status"""
    name: Optional[str] = None
    status: str
    model: Optional[str] = None
    healthy: Optional[bool] = None
    message: Optional[str] = None


class ContainerInfo(BaseModel):
    """Model for a single container deployment info (dashboard)"""
    name: str
    status: str
    image: str = ""
    container_id: str


class ContainerActionResponse(BaseModel):
    """Response model for container actions (stop/delete)"""
    message: str
    container: str
    action: str


class TextGenerateRequest(BaseModel):
    """Request model for text generation"""
    prompt: str
    model_path: Optional[str] = None
    max_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9


class TextGenerateResponse(BaseModel):
    """Response model for text generation"""
    generated_text: str
    model: str
    prompt: str
    usage: Dict[str, Any] = {}
    generation_time_ms: Optional[int] = None


class ChatMessage(BaseModel):
    """A single chat message"""
    role: str  # 'user', 'assistant', or 'system'
    content: str


class ChatRequest(BaseModel):
    """Request model for chat completions"""
    model_path: str
    messages: List[ChatMessage]
    max_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9


# ---- Invitation code models ----

class InvitationCodeCreate(BaseModel):
    """Request model for creating an invitation code"""
    code: str = Field(min_length=5, max_length=64)
    expiration_days: int = Field(default=30, ge=1, le=365)
    max_uses: int = Field(default=1, ge=1, le=100)


class InvitationCodeInfo(BaseModel):
    """Model for invitation code information"""
    code: str
    created_at: datetime
    expires_at: datetime
    max_uses: int
    uses_count: int = 0
    is_active: bool = True
    used_by: Optional[List[str]] = None


class InvitationCodeCreateResponse(BaseModel):
    """Response model for creating an invitation code"""
    message: str
    code: InvitationCodeInfo


class InvitationCodeListResponse(BaseModel):
    """Response model for listing invitation codes"""
    codes: List[InvitationCodeInfo]


class InvitationCodeDeleteResponse(BaseModel):
    """Response model for deleting an invitation code"""
    message: str
    code: str


class ChatResponse(BaseModel):
    """Response model for chat completions"""
    reply: str
    model: str
    usage: Dict[str, Any] = {}
    generation_time_ms: Optional[int] = None



