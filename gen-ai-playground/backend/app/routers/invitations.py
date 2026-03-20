"""
Invitation code management routes (admin only)
"""
from fastapi import APIRouter, HTTPException, Depends, Path, Body
from pymongo.database import Database
from datetime import datetime, timedelta
from pydantic import BaseModel, Field

from app.dependencies import get_admin_user
from app.database import get_database
from app.models import (
    UserInfo,
    InvitationCodeCreate,
    InvitationCodeInfo,
    InvitationCodeCreateResponse,
    InvitationCodeListResponse,
    InvitationCodeDeleteResponse,
)


class AddUsesRequest(BaseModel):
    """Request model for adding more uses to an invitation code"""
    additional_uses: int = Field(default=1, ge=1, le=100)


router = APIRouter(
    prefix="/dashboard/invitations",
    tags=["invitations"]
)


@router.post("/codes", response_model=InvitationCodeCreateResponse)
def create_invitation_code(
    code_data: InvitationCodeCreate,
    admin: UserInfo = Depends(get_admin_user),
    db: Database = Depends(get_database)
):
    """
    Create a new invitation code with customizable options (admin only)
    
    Args:
        code_data: Code generation options (length, expiration, max uses)
        admin: Admin user info
        db: Database instance
        
    Returns:
        InvitationCodeCreateResponse: Created code information
    """
    try:
        # Check if code already exists
        try:
            existing = db.invitation_codes.find_one({"code": code_data.code})
        except Exception as col_err:
            # Collection might not exist, try to create it implicitly
            existing = None
        
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Invitation code '{code_data.code}' already exists"
            )
        
        code = code_data.code
        
        # Calculate expiration date
        expires_at = datetime.utcnow() + timedelta(days=code_data.expiration_days)
        created_at = datetime.utcnow()
        
        # Create invitation code document
        invitation_doc = {
            "code": code,
            "created_at": created_at,
            "expires_at": expires_at,
            "max_uses": code_data.max_uses,
            "uses_count": 0,
            "is_active": True,
            "used_by": [],
            "created_by": admin.username
        }
        
        # Insert into database
        db.invitation_codes.insert_one(invitation_doc)
        
        return InvitationCodeCreateResponse(
            message="Invitation code created successfully",
            code=InvitationCodeInfo(
                code=code,
                created_at=created_at,
                expires_at=expires_at,
                max_uses=code_data.max_uses,
                uses_count=0,
                is_active=True,
                used_by=[]
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create invitation code: {str(e)}"
        )


@router.get("/codes", response_model=InvitationCodeListResponse)
def list_invitation_codes(
    admin: UserInfo = Depends(get_admin_user),
    db: Database = Depends(get_database)
):
    """
    List all invitation codes (admin only)
    
    Returns:
        InvitationCodeListResponse: List of all invitation codes
    """
    try:
        # Get all invitation codes, sorted by creation date (newest first)
        codes_cursor = db.invitation_codes.find().sort("created_at", -1)
        
        codes = []
        now = datetime.utcnow()
        
        for invitation in codes_cursor:
            # Calculate actual status based on expiration and usage
            is_expired = invitation.get("expires_at", now) < now
            is_fully_used = invitation.get("uses_count", 0) >= invitation.get("max_uses", 1)
            is_active = invitation.get("is_active", True) and not is_expired and not is_fully_used
            
            # Handle backward compatibility: used_by can be string, null, or array
            used_by_raw = invitation.get("used_by")
            if used_by_raw is None:
                used_by_list = []
            elif isinstance(used_by_raw, str):
                used_by_list = [used_by_raw] if used_by_raw else []
            else:
                used_by_list = used_by_raw
            
            codes.append(InvitationCodeInfo(
                code=invitation["code"],
                created_at=invitation["created_at"],
                expires_at=invitation["expires_at"],
                max_uses=invitation["max_uses"],
                uses_count=invitation.get("uses_count", 0),
                is_active=is_active,
                used_by=used_by_list
            ))
        
        return InvitationCodeListResponse(codes=codes)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list invitation codes: {str(e)}"
        )


@router.delete("/codes/{code}", response_model=InvitationCodeDeleteResponse)
def delete_invitation_code(
    code: str = Path(..., min_length=5, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$"),
    admin: UserInfo = Depends(get_admin_user),
    db: Database = Depends(get_database)
):
    """
    Delete an invitation code (admin only)
    
    Args:
        code: The invitation code to delete
        admin: Admin user info
        db: Database instance
        
    Returns:
        InvitationCodeDeleteResponse: Deletion confirmation
    """
    try:
        # Find and delete the invitation code
        result = db.invitation_codes.delete_one({"code": code})
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Invitation code '{code}' not found"
            )
        
        return InvitationCodeDeleteResponse(
            message="Invitation code deleted successfully",
            code=code
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete invitation code: {str(e)}"
        )


@router.post("/codes/{code}/deactivate", response_model=InvitationCodeDeleteResponse)
def deactivate_invitation_code(
    code: str = Path(..., min_length=5, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$"),
    admin: UserInfo = Depends(get_admin_user),
    db: Database = Depends(get_database)
):
    """
    Deactivate an invitation code without deleting it (admin only)
    
    Args:
        code: The invitation code to deactivate
        admin: Admin user info
        db: Database instance
        
    Returns:
        InvitationCodeDeleteResponse: Deactivation confirmation
    """
    try:
        # Find and deactivate the invitation code
        result = db.invitation_codes.update_one(
            {"code": code},
            {"$set": {"is_active": False}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Invitation code '{code}' not found"
            )
        
        return InvitationCodeDeleteResponse(
            message="Invitation code deactivated successfully",
            code=code
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to deactivate invitation code: {str(e)}"
        )


@router.post("/codes/{code}/reactivate", response_model=InvitationCodeDeleteResponse)
def reactivate_invitation_code(
    code: str = Path(..., min_length=5, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$"),
    admin: UserInfo = Depends(get_admin_user),
    db: Database = Depends(get_database)
):
    """
    Reactivate an invitation code (admin only)
    
    Args:
        code: The invitation code to reactivate
        admin: Admin user info
        db: Database instance
        
    Returns:
        InvitationCodeDeleteResponse: Reactivation confirmation
    """
    try:
        # Find the invitation code first
        invitation = db.invitation_codes.find_one({"code": code})
        
        if not invitation:
            raise HTTPException(
                status_code=404,
                detail=f"Invitation code '{code}' not found"
            )
        
        # Only reactivate - keep uses_count and used_by intact
        result = db.invitation_codes.update_one(
            {"code": code},
            {"$set": {"is_active": True}}
        )
        
        return InvitationCodeDeleteResponse(
            message="Invitation code reactivated successfully",
            code=code
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reactivate invitation code: {str(e)}"
        )


@router.post("/codes/{code}/add-uses", response_model=InvitationCodeDeleteResponse)
def add_uses_to_code(
    code: str = Path(..., min_length=5, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$"),
    uses_data: AddUsesRequest = Body(...),
    admin: UserInfo = Depends(get_admin_user),
    db: Database = Depends(get_database)
):
    """
    Add more uses to an invitation code (admin only)
    
    Args:
        code: The invitation code to add uses to
        uses_data: Number of additional uses to add
        admin: Admin user info
        db: Database instance
        
    Returns:
        InvitationCodeDeleteResponse: Confirmation
    """
    try:
        # Find the invitation code first
        invitation = db.invitation_codes.find_one({"code": code})
        
        if not invitation:
            raise HTTPException(
                status_code=404,
                detail=f"Invitation code '{code}' not found"
            )
        
        # Increase max_uses
        new_max_uses = invitation["max_uses"] + uses_data.additional_uses
        result = db.invitation_codes.update_one(
            {"code": code},
            {"$set": {"max_uses": new_max_uses}}
        )
        
        return InvitationCodeDeleteResponse(
            message=f"Added {uses_data.additional_uses} uses to invitation code (new max: {new_max_uses})",
            code=code
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add uses to invitation code: {str(e)}"
        )
