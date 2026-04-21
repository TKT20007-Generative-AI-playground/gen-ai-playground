from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import asyncio

router = APIRouter()

@router.get("/stream")
async def stream():
    async def event_generator():
        tokens = ["Hei", " ", "Fiia", "! ", "Tämä", " ", "striimaa", " ", "nyt", "."]
        for token in tokens:
            yield f"data: {token}\n\n"
            await asyncio.sleep(0.1)

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
