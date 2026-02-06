"""
Image generation and history routes
"""
import traceback
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pymongo.database import Database
from datetime import datetime, timezone
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
    url = choose_model_url(model)
    
    # Prepare request
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.VERDA_API_KEY}"
    }
    data = build_request_data(model, prompt)
    
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
    if model == "FLUX2_KLEIN_9B" or model == "FLUX2_KLEIN_4B":
        if "image" in resp_data:
                return_image_base64 = resp_data["image"]
                print(f"Received base64 image (length: {len(return_image_base64)})")

                # Remove data URL prefix if exists
                if "," in return_image_base64:
                    return_image_base64 = return_image_base64.split(",", 1)[1]

                # Decode base64 to bytes
                image_bytes = base64.b64decode(return_image_base64)
                save_image_to_db(db, prompt, model, return_image_base64, current_user)
                
                return Response(
                    content=image_bytes,
                    media_type="image/png",
                    headers={"Content-Disposition": "inline"}
                )
    else:   
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
            save_image_to_db(db, prompt, model, image_base64, current_user)

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
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database)
    ):
    
    """
    Edit an image based on a prompt and return it as a file response
    Args:
        current_user: UserInfo = Depends(get_current_user), _description_ (user info from )
        db: Database = Depends(get_database), _description_
        image_request (ImageRequestBody): _description_
    """
    prompt = image_request.prompt  # prompt from request body
    model = image_request.model    # model from req body
    image_base64 = image_request.image # base64 image from req body
    
    if "," in image_base64:
        image_base64 = image_base64.split(",",1)[1]
    print("editing image...")
    url = choose_model_url(model)
     # Prepare request
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.VERDA_API_KEY}"
    }

    data = build_request_data(model, prompt, image_base64)
    # call Verda API
    resp = requests.post(url, headers=headers, json=data)
    try:
        resp.raise_for_status()
        print(f"Response status: {resp.status_code}")

        # Process response
        resp_data = resp.json()
        if model == "FLUX2_KLEIN_9B" or model == "FLUX2_KLEIN_4B":
            if "image" in resp_data:
                return_image_base64 = resp_data["image"]
                print(f"Received base64 image (length: {len(return_image_base64)})")

                # Remove data URL prefix if exists
                if "," in return_image_base64:
                    return_image_base64 = return_image_base64.split(",", 1)[1]

                # Decode base64 to bytes
                image_bytes = base64.b64decode(return_image_base64)
                save_image_to_db(db, prompt, model, return_image_base64, current_user)
                return Response(
                    content=image_bytes,
                    media_type="image/png",
                    headers={"Content-Disposition": "inline"}
                )
        else:
            if resp_data.get("status") == "COMPLETED" and resp_data.get("output", {}).get("outputs"):
                return_image_base64 = resp_data["output"]["outputs"][0]
                print(f"Received base64 image (length: {len(return_image_base64)})")

                # Remove data URL prefix if exists
                if "," in return_image_base64:
                    return_image_base64 = return_image_base64.split(",", 1)[1]

                # Decode base64 to bytes
                image_bytes = base64.b64decode(return_image_base64)
                save_image_to_db(db, prompt, model, return_image_base64, current_user)
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
def save_image_to_db(db: Database, prompt: str, model: str, image_base64: str, current_user: UserInfo):
     # # Save to MongoDB
    try:
        image_record = {
            "prompt": prompt,
            "model": model,
            "timestamp": datetime.now(timezone.utc),
            "image_size": len(base64.b64decode(image_base64)),
            "image_data": image_base64,
            "username": current_user.username
        }
        db.images.insert_one(image_record)
        print(f"Saved image data to MongoDB for user: {current_user.username}")
    except Exception as e:
        print(f"Failed to save to MongoDB: {e}")
        
def choose_model_url(model: str)-> str:
    try:
        return settings.MODEL_URLS[model]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model: {model}"
        )
def build_request_data(model: str,  prompt: str, image_base64: Optional[str] = None) -> dict:
    base_data = {
            "prompt": prompt,
            "enable_base64_output": True
        }
    if image_base64:
        if "KLEIN" in model:
            base_data["input_images"] = [image_base64]
        else:
            base_data["image"] = image_base64
    if "KLEIN" not in model:
        base_data = {"input":base_data}
    
    return base_data
        
        
        
    
    
