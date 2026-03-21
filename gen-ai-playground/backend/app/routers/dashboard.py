"""
Dashboard routes: Verda deployment management (admin only)
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List

from app.dependencies import get_admin_user, validate_csrf_token
from app.models import UserInfo, ContainerInfo, ContainerActionResponse
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
