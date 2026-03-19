"""
Gen AI Playground Backend Server

FastAPI server for generating images using Verda API.
Refactored with proper separation of concerns.
"""
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import auth, images, text, dashboard

SHOWCASE_DIR = Path(__file__).resolve().parent / "showcase"
SHOWCASE_DIR.mkdir(exist_ok=True)


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
app.include_router(dashboard.router)


# Serve showcase images as static files (must be after router registration)
app.mount("/showcase", StaticFiles(directory=str(SHOWCASE_DIR)), name="showcase")


@app.get("/")
def read_root():
    """Health check endpoint"""
    return {"message": "Gen AI Playground Backend API", "status": "running"}