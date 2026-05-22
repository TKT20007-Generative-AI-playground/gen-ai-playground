"""
Gen AI Playground Backend Server

FastAPI server for generating images using Verda API.
Refactored with proper separation of concerns.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.routers import auth, images, text, dashboard, invitations, audio
from app.container_handler import ContainerHandler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager to initialize and clean up resources."""
    container_handler = ContainerHandler()
    app.state.container_handler = container_handler
    await container_handler.start_watchdog(timeout_minutes=5, check_interval_seconds=30)
    print("Container watchdog started.")
    yield
    # Cleanup container handler
    await container_handler.cleanup()


# Initialize FastAPI app
app = FastAPI(
    title="Gen AI Playground API",
    description="Image and text generation API using Verda AI models",
    version="1.0.0",
    docs_url=None if settings.IS_PROD else "/docs",
    redoc_url=None if settings.IS_PROD else "/redoc",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
    expose_headers=["X-Generation-Time-Ms","X-Image-Id"],
)

# Register routers
app.include_router(auth.router)
app.include_router(images.router)
app.include_router(text.router)
app.include_router(dashboard.router)
app.include_router(invitations.router)
app.include_router(audio.router)


@app.get("/")
def read_root():
    """Health check endpoint"""
    return {"message": "Gen AI Playground Backend API", "status": "running"}