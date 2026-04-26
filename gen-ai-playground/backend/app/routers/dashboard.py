"""
Dashboard routes: Verda deployment management and user management (admin only)
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from pymongo.database import Database

from app.dependencies import get_admin_user, validate_csrf_token
from app.database import get_database
from app.models import UserInfo, ContainerInfo, ContainerActionResponse, UserListItem, UserListResponse, DeleteUserResponse
from app.verda_service import verda_service


router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"]
)


@router.get("/containers", response_model=List[ContainerInfo])
def list_containers(
    admin: UserInfo = Depends(get_admin_user)
):
    """
    List all Verda container deployments and their status (admin only)
    """
    try:
        client = verda_service._get_client()
        deployments = client.containers.get_deployments()
        results = []
        for d in deployments:
            # Get status for each deployment
            try:
                status = client.containers.get_deployment_status(d.name)
                status_str = status.value
            except Exception:
                status_str = "unknown"
            
            results.append(ContainerInfo(
                name=d.name,
                status=status_str,
                image=getattr(d, 'endpoint_base_url', '') or '',
                container_id=d.name
            ))
        return results
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list deployments: {str(e)}"
        )


@router.post("/containers/{deployment_name}/stop", response_model=ContainerActionResponse)
def stop_container(
    deployment_name: str,
    admin: UserInfo = Depends(get_admin_user),
    _: None = Depends(validate_csrf_token),
):
    """
    Delete/stop a Verda deployment (admin only)
    """
    try:
        client = verda_service._get_client()
        client.containers.delete_deployment(deployment_name)
        return ContainerActionResponse(
            message=f"Deployment '{deployment_name}' deleted",
            container=deployment_name,
            action="stop"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete deployment: {str(e)}"
        )


# ---- User management endpoints ----

@router.get("/users", response_model=UserListResponse)
def list_users(
    admin: UserInfo = Depends(get_admin_user),
    db: Database = Depends(get_database)
):
    """
    List all users (admin only)
    """
    try:
        users_cursor = db.users.find({}, {"username": 1, "is_admin": 1, "created_at": 1, "_id": 0})
        users = []
        for user in users_cursor:
            users.append(UserListItem(
                username=user["username"],
                is_admin=user.get("is_admin", False),
                created_at=user.get("created_at")
            ))
        return UserListResponse(users=users)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list users: {str(e)}"
        )


@router.delete("/users/{username}", response_model=DeleteUserResponse)
def delete_user(
    username: str,
    admin: UserInfo = Depends(get_admin_user),
    db: Database = Depends(get_database)
):
    """
    Delete a user and all their data (images, text generations) - admin only
    """
    try:
        # Prevent self-deletion
        if username == admin.username:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete your own account"
            )
        
        # Check if user exists
        user = db.users.find_one({"username": username})
        if not user:
            raise HTTPException(
                status_code=404,
                detail=f"User '{username}' not found"
            )
        
        # Prevent deleting the last admin user
        user_is_admin = user.get("is_admin", False)
        if user_is_admin:
            admin_count = db.users.count_documents({"is_admin": True})
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete the last admin user"
                )
        
        # Delete user's images
        images_result = db.images.delete_many({"username": username})
        
        # Delete user's text generations
        text_result = db.text_generations.delete_many({"username": username})
        
        # Delete the user
        result = db.users.delete_one({"username": username})
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete user '{username}'"
            )
        
        return DeleteUserResponse(
            message=f"User '{username}' deleted successfully (removed {images_result.deleted_count} images, {text_result.deleted_count} text generations)",
            username=username
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete user: {str(e)}"
        )
