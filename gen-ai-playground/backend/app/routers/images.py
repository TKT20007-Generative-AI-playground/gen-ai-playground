"""
Image generation and history routes
"""
import traceback
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, logger
from fastapi.responses import Response
from pymongo.database import Database
from bson import ObjectId
from datetime import datetime, timezone
from bson import ObjectId, errors
import math
import base64
import time
import httpx

from app.config import settings
from app.database import get_database
from app.dependencies import get_current_user
from app.models import ImageRequestBody, HistoryResponse, UserInfo


router = APIRouter(
    prefix="/images",
    tags=["images"]
)


def normalize_base64_image(image_data: Optional[str]) -> Optional[str]:
    """Strip data URL prefix and whitespace from optional base64 image data."""
    if not image_data:
        return image_data

    normalized = image_data.strip()
    if "," in normalized:
        normalized = normalized.split(",", 1)[1]

    return normalized.strip()


@router.get("/history", response_model=HistoryResponse)
def get_history(
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    from_date: Optional[int] = Query(None, alias="from"),  
    to_date: Optional[int] = Query(None, alias="to"),
    page_num: Optional[int] = Query(1, alias="page")
):
    """
    Get image generation history for authenticated user
    
    Args:
        current_user: Authenticated user information
        db: Database instance
        time_period: Optional[str]: time period to get history for
        page_num: Optional[int]: page number to get history for
    Returns:
        HistoryResponse: List of image generation history items
        
    Raises:
        HTTPException: If fetching history fails
    """
    
    page_size = 10
    page = int(page_num)
    query = {"username": current_user.username}
    
    if from_date or to_date:
        date_filter = {}
        if from_date:
            date_filter["$gte"] = datetime.fromtimestamp(from_date / 1000, tz=timezone.utc)
        if to_date:
            date_filter["$lte"] = datetime.fromtimestamp(to_date / 1000, tz=timezone.utc)
        query["timestamp"] = date_filter
    
    total = db.images.count_documents(query)
    if total == 0:
        return HistoryResponse(history=[], total=0, page=page, total_pages=0)
    total_pages = math.ceil(total / page_size)
    page = min(page, total_pages)
    start = (page - 1) * page_size
    
    try:
        history = list(db.images.find(
            query,
            {
                "_id": 1,
                "prompt": 1,
                "model": 1,
                "timestamp": 1,
                "image_size": 1,
                "image_data": 1,
                "image_type": 1,
                "parent_image_id": 1,
            }).sort("timestamp", -1).skip(start).limit(page_size))
       
        history = convert_objects_to_str(history, current_user)
        return HistoryResponse(history=history, total=total, page=page, total_pages=total_pages)
    except Exception as e:
        print(f"Error getting history: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting history: {e}")




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
    image_type = "generated"
    
    # Start timing
    start_time = time.perf_counter()
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
    parent_image_id = None
    user_base64_image = None

    if image_request.image_to_edit:
        base64_img = normalize_base64_image(image_request.image_to_edit)
        user_base64_image = base64_img

        data = build_request_data(model, prompt, base64_img)
        image_type = "edited"
        parent_image_id = image_request.parent_image_id

    else:
        data = build_request_data(model, prompt)
        image_type = "generated"

    # Call Verda API once using async HTTP client
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, headers=headers, json=data)
    
    try:
        resp.raise_for_status()
    except httpx.HTTPError:
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
            return build_timed_image_response(
                db=db,
                prompt=prompt,
                model=model,
                image_base64=return_image_base64,
                current_user=current_user,
                image_type=image_type,
                start_time=start_time,
                user_base64_image=user_base64_image,
                parent_image_id=parent_image_id,
            )
    else:   
        if resp_data.get("status") == "COMPLETED" and resp_data.get("output", {}).get("outputs"):
            image_base64 = resp_data["output"]["outputs"][0]
            print(f"Received base64 image (length: {len(image_base64)})")

            print(f"Image generation finished at: {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())}")

            return build_timed_image_response(
                db=db,
                prompt=prompt,
                model=model,
                image_base64=image_base64,
                current_user=current_user,
                image_type=image_type,
                start_time=start_time,
                user_base64_image=user_base64_image,
                parent_image_id=parent_image_id,
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
    image_type = "edited"
    parent_image_id = image_request.parent_image_id or image_request.id
    
    # Start timing
    start_time = time.perf_counter()
    
    image_base64 = normalize_base64_image(image_base64)
    url = choose_model_url(model)

     # Prepare request
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.VERDA_API_KEY}"
    }

    data = build_request_data(model, prompt, image_base64)
    
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, headers=headers, json=data)
    try:
        resp.raise_for_status()
        print(f"Response status: {resp.status_code}")

        # Avoid saving the original image again when we already know its DB id.
        user_base64_image_for_db = image_base64 if not parent_image_id else None

        # Process response
        resp_data = resp.json()
        if model == "FLUX2_KLEIN_9B" or model == "FLUX2_KLEIN_4B":
            if "image" in resp_data:
                return_image_base64 = resp_data["image"]
                print(f"Received base64 image (length: {len(return_image_base64)})")

                return build_timed_image_response(
                    db=db,
                    prompt=prompt,
                    model=model,
                    image_base64=return_image_base64,
                    current_user=current_user,
                    image_type=image_type,
                    start_time=start_time,
                    user_base64_image=user_base64_image_for_db,
                    parent_image_id=parent_image_id,
                )
        else:
            if resp_data.get("status") == "COMPLETED" and resp_data.get("output", {}).get("outputs"):
                return_image_base64 = resp_data["output"]["outputs"][0]
                print(f"Received base64 image (length: {len(return_image_base64)})")

                return build_timed_image_response(
                    db=db,
                    prompt=prompt,
                    model=model,
                    image_base64=return_image_base64,
                    current_user=current_user,
                    image_type=image_type,
                    start_time=start_time,
                    user_base64_image=user_base64_image_for_db,
                    parent_image_id=parent_image_id,
                )
            else:
                print(f"Condition failed, status: {resp_data.get('status')}, outputs: {resp_data.get('output')}")
                raise HTTPException(
                    status_code=500, 
                    detail=f"Image not ready or missing outputs. status: {resp_data.get('status')}"
                )
    except httpx.HTTPError as e:
        print("Full error traceback:\n", traceback.format_exc())
        safe_resp_data = None
        if 'resp' in locals():
            try:
                safe_resp_data = resp.json()
            except ValueError:
                safe_resp_data = resp.text

        raise HTTPException(
            status_code=500,
            detail={
                "error": "Problem with image editing",
                "exception": str(e),
                "resp_data": safe_resp_data
            }
        )


def build_timed_image_response(
    db: Database,
    prompt: str,
    model: str,
    image_base64: str,
    current_user: UserInfo,
    image_type: str,
    start_time: float,
    user_base64_image: Optional[str] = None,
    parent_image_id: Optional[str] = None,
) -> Response:
    """Decode image data, save with generation time, and return PNG response."""
    image_base64 = normalize_base64_image(image_base64)
    user_base64_image = normalize_base64_image(user_base64_image)

    image_bytes = base64.b64decode(image_base64)
    generation_time_ms = int((time.perf_counter() - start_time) * 1000)

    save_image_to_db(
        db,
        prompt,
        model,
        image_base64,
        current_user,
        image_type,
        user_base64_image=user_base64_image,
        parent_image_id=parent_image_id,
        generation_time_ms=generation_time_ms,
    )

    return Response(
        content=image_bytes,
        media_type="image/png",
        headers={"Content-Disposition": "inline", "X-Generation-Time-Ms": str(generation_time_ms)},
    )


def save_image_to_db(db: Database, prompt: str, model:
                    str, image_base64: str, current_user:UserInfo,
                    image_type:str, user_base64_image: Optional[str] = None, 
                    parent_image_id: Optional[str] = None,
                    generation_time_ms: Optional[int] = None ):
    """ Saves the image(s) to mongoDB.
        If the user has provided the original image, it is also saved to the database,
        and the edited image is referenced by the original record ID.
    Args:
        db (Database): db
        prompt (str): user prompt
        model (str): model used to generate/edit the image
        image_base64 (str): generated image in base64 format
        current_user (UserInfo): logged-in user
        user_base64_image (Optional[str], optional): image added by user in base64 format. Defaults to None.
        type (str): is the image returned by the AI edited or completely generated?
    """
    try:
        original_id = None
        # If 'parent_image_id' is set, the original image already exists in DB.
        if user_base64_image and parent_image_id is None:
            new_image = check_database_for_duplicate(db, parent_image_id, current_user.username)
            if not new_image:
                user_input_image_record = {
                    "prompt": prompt,
                    "model": model,
                    "timestamp": datetime.now(timezone.utc),
                    "image_size": len(base64.b64decode(user_base64_image)),
                    "image_data": user_base64_image,
                    "username": current_user.username,
                    "image_type": "original"
                }
                res = db.images.insert_one(user_input_image_record)
                original_id = res.inserted_id
        
        image_record = {
            "prompt": prompt,
            "model": model,
            "timestamp": datetime.now(timezone.utc),
            "image_size": len(base64.b64decode(image_base64)),
            "image_data": image_base64,
            "username": current_user.username,
            "image_type": image_type
        }
        
        if generation_time_ms is not None:
            image_record["generation_time_ms"] = generation_time_ms
        
        if parent_image_id:
            image_record["parent_image_id"] = ObjectId(parent_image_id)
    
                
        db.images.insert_one(image_record)
        print(f"Saved image data to MongoDB for user: {current_user.username}")
    except Exception as e:
        print(f"Failed to save to MongoDB: {e}")
        
def choose_model_url(model: str)-> str:
    """ return the correct model URL """
    try:
        return settings.MODEL_URLS[model]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model: {model}"
        )
def build_request_data(model: str,  prompt: str, image_base64: Optional[str] = None) -> dict:
    """ build the right type of data dictionary """
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

def convert_objects_to_str(history: list, cur_user: UserInfo) -> list:
    """Convert ObjectId to string for JSON serialization, also for parent_image_id if it exists."""
    for doc in history:
        doc["id"] = str(doc["_id"])
        if "parent_image_id" in doc and doc["parent_image_id"]:
            doc["parent_image_id"] = str(doc["parent_image_id"])
        doc["username"] = cur_user.username
    return history
    

def check_database_for_duplicate(db: Database, parent_image_id: str | None, username: str) -> bool:
    """Check if an edited image already exists for this user and parent image."""
    query = {
        "username": username,
    }

    if parent_image_id:
        try:
            query["parent_image_id"] = ObjectId(parent_image_id)
        except errors.InvalidId:
            return False  # Invalid parent_image_id, no duplicates

    existing = db.images.find_one(query)
    if existing:
        logger.info(f"Duplicate found for parent_image_id: {parent_image_id}, username: {username}")
        return True

    return False
    
    
        
        
    
    
