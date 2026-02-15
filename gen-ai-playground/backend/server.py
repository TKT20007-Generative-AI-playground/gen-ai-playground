"""
Gen AI Playground Backend Server

FastAPI server for generating images using Verda API.
Refactored with proper separation of concerns.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from verda import VerdaClient

from app.config import settings
from app.routers import auth, images, text
from app.verda_service import verda_service

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handle application startup and shutdown events.
    Cleans up Verda deployments on shutdown.
    """
    # Startup
    logger.info("Gen AI Playground Backend starting up...")
    yield
    # Shutdown
    logger.info("Gen AI Playground Backend shutting down...")
    logger.info("Cleaning up Verda deployments...")
    try:
        result = verda_service.delete_deployment()
        if result.get("status") == "deleted":
            logger.info(f"Successfully deleted deployment: {result.get('name')}")
        elif result.get("status") == "no_deployment":
            logger.info("No active deployment to clean up")
        else:
            logger.warning(f"Cleanup result: {result}")
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")


# Initialize FastAPI app with lifespan handler
app = FastAPI(
    title="Gen AI Playground API",
    description="Image and text generation API using Verda AI models",
    version="1.0.0",
    lifespan=lifespan
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