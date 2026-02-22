"""
Gen AI Playground Backend Server

FastAPI server for generating images using Verda API.
Refactored with proper separation of concerns.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, images, text


# Initialize FastAPI app
app = FastAPI(
    title="Gen AI Playground API",
    description="Image and text generation API using Verda AI models",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(images.router)
app.include_router(text.router)


@app.get("/")
def read_root():
    """Health check endpoint"""
    return {"message": "Gen AI Playground Backend API", "status": "running"}





    
