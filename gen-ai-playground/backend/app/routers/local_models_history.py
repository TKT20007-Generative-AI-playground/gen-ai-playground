from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pymongo.errors import PyMongoError

from app.dependencies import get_current_user
from app.database import get_database
from app.models import SaveLocalHistoryRequest, UserInfo

router = APIRouter(
    prefix="/local-models",
    tags=["local_models"],
)


@router.post("/save-history")
async def save_local_models_history(
    request: SaveLocalHistoryRequest,
    db=Depends(get_database),
    current_user: UserInfo = Depends(get_current_user),
):
    """Save local model chat history items to the database."""
    records = [
        {
            "username": current_user.username,
            "model": request.model,
            "role": item.role,
            "content": item.content,
            "timestamp": datetime.now(timezone.utc),
        }
        for item in request.historyItems
    ]
    if not records:
        return {"message": "Nothing to save."}
    try:
        db.local_models_history.insert_many(records)
    except PyMongoError as e:
        raise HTTPException(status_code=500, detail=f"Failed to save history: {e}")
    return {"message": "History items saved successfully."}
