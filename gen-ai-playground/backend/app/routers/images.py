"""
Image generation and history routes
"""
import traceback
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pymongo.database import Database
from datetime import datetime
import base64
import time
import requests

from app.config import settings
from app.database import get_database
from app.dependencies import get_current_user
from app.models import ImageRequestBody, HistoryResponse, UserInfo


router = APIRouter(
    prefix="/images",
    tags=["images"]
)


@router.get("/history", response_model=HistoryResponse)
def get_history(
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database)
):
    """
    Get image generation history for authenticated user
    
    Args:
        current_user: Authenticated user information
        db: Database instance
        
    Returns:
        HistoryResponse: List of image generation history items
        
    Raises:
        HTTPException: If fetching history fails
    """
    try:
        # Get last 50 image generations for this user, sorted by newest first
        history = list(db.images.find(
            {"username": current_user.username},
            {
                "_id": 0,
                "prompt": 1,
                "model": 1,
                "timestamp": 1,
                "image_size": 1,
                "image_data": 1
            }
        ).sort("timestamp", -1).limit(50))
        
        return HistoryResponse(history=history)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch history: {str(e)}"
        )


@router.post('/generate')
async def generate_image(
    image_request: ImageRequestBody,
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database)
):
    """
    Generate an image based on a prompt using Verda API
    
    Args:
        image_request: Image generation request with prompt and model
        current_user: Authenticated user information
        db: Database instance
        
    Returns:
        Response: Generated image as PNG
        
    Raises:
        HTTPException: If image generation fails
    """
    print(f"Image generation called at: {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())}")
    print(f"Generating image for user: {current_user.username}...")
    
    prompt = image_request.prompt
    model = image_request.model
    
    # Validate API key
    if not settings.VERDA_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="VERDA_API_KEY not set in environment."
        )
    
    # Select API URL based on model
    if model == "flux_kontext":
        url = settings.FLUX_KONTEXT_URL
    else:
        url = settings.FLUX1_KREA_DEV_URL
    
    # Prepare request
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.VERDA_API_KEY}"
    }
    
    data = {
        "input": {
            "prompt": prompt,
            "enable_base64_output": True
        }
    }
    
    # Call Verda API
    resp = requests.post(url, headers=headers, json=data)
    
    try:
        resp.raise_for_status()
    except requests.exceptions.HTTPError:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Image generation failed: {resp.text}"
        )
    
    # Process response
    resp_data = resp.json()
    if resp_data.get("status") == "COMPLETED" and resp_data.get("output", {}).get("outputs"):
        image_base64 = resp_data["output"]["outputs"][0]
        print(f"Received base64 image (length: {len(image_base64)})")
        
        # Remove data URL prefix if exists
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        
        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_base64)
        
        print(f"Image generation finished at: {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())}")
        
        # Save to MongoDB
        try:
            image_record = {
                "prompt": prompt,
                "model": model,
                "timestamp": datetime.now(datetime.timezone.utc),
                "image_size": len(image_bytes),
                "image_data": image_base64,
                "username": current_user.username
            }
            db.images.insert_one(image_record)
            print(f"Saved image data to MongoDB for user: {current_user.username}")
        except Exception as e:
            print(f"Failed to save to MongoDB: {e}")
        
        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={"Content-Disposition": "inline"}
        )
    
    raise HTTPException(
        status_code=500,
        detail={
            "error": "Problem generating image",
            "data": resp_data
        }
    )
@router.post("/edit-image")
async def edit_image(
    image_request: ImageRequestBody,
    # current_user: UserInfo = Depends(get_current_user),
    # db: Database = Depends(get_database)
                     ):
    """
    Edit an image based on a prompt and return it as a file response
    Args:
        image_request (ImageRequestBody): _description_
    """
    prompt = image_request.prompt  # prompt from request body
    model = image_request.model    # model from req body
    image_base64 = image_request.image # base64 image from req body
    
    if "," in image_base64:
        image_base64 = image_base64.split(",",1)[1]
    print("editing image...")
    
    if model == "FLUX.1_Kontext_dev":
        url = url = settings.FLUX_KONTEXT_URL
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model: {model}"
        )
     # Prepare request
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.VERDA_API_KEY}"
    }
    
    data = {
        "input": {
            "prompt": prompt,
            "image": image_base64,
            "enable_base64_output": True,
        }
    }
    # call Verda API
    resp = requests.post(url, headers=headers, json=data)
    try:
        resp.raise_for_status()
        print(f"Response status: {resp.status_code}")

        # Process response
        resp_data = resp.json()

        if resp_data.get("status") == "COMPLETED" and resp_data.get("output", {}).get("outputs"):
            return_image_base64 = resp_data["output"]["outputs"][0]
            print(f"Received base64 image (length: {len(return_image_base64)})")

            # Remove data URL prefix if exists
            if "," in return_image_base64:
                return_image_base64 = return_image_base64.split(",", 1)[1]

            # Decode base64 to bytes
            image_bytes = base64.b64decode(return_image_base64)
            # # Save to MongoDB
            # try:
            #     image_record = {
            #         "prompt": prompt,
            #         "model": model,
            #         "timestamp": datetime.now(datetime.timezone.utc),
            #         "image_size": len(image_bytes),
            #         "image_data": image_base64,
            #         "username": current_user.username
            #     }
            #     db.images.insert_one(image_record)
            #     print(f"Saved image data to MongoDB for user: {current_user.username}")
            # except Exception as e:
            #     print(f"Failed to save to MongoDB: {e}")
            return Response(
                content=image_bytes,
                media_type="image/png",
                headers={"Content-Disposition": "inline"}
            )
        else:
            print(f"Condition failed, status: {resp_data.get('status')}, outputs: {resp_data.get('output')}")
            raise HTTPException(
                status_code=500, 
                detail=f"Image not ready or missing outputs. status: {resp_data.get('status')}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        print("Full error traceback:\n", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Problem with image editing",
                "exception": str(e),
                "resp_data": resp.json() if 'resp' in locals() else None
            }
        )