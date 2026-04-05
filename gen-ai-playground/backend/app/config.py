"""
Application configuration and environment variables
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv('.env.local')


class Settings:
    """Application settings loaded from environment variables"""
    
    # Is it production
    ENV = os.getenv("ENV", "development")
    IS_PROD = ENV == "production"

    # MongoDB
    MONGO_DB_URL: str = os.getenv("MONGO_DB_URL")
    
    # External API Keys (Bearer Tokens - NEVER expose to frontend)
    # These are used by backend to authenticate with external inference APIs
    VERDA_API_KEY: str = os.getenv("VERDA_API_KEY")
    VERDA_INFERENCE_KEY: str = os.getenv("VERDA_INFERENCE_KEY") or os.getenv("VERDA_API_KEY")
    
    # Verda SDK credentials (for container deployments)
    VERDA_CLIENT_ID: str = os.getenv("VERDA_CLIENT_ID")
    VERDA_CLIENT_SECRET: str = os.getenv("VERDA_CLIENT_SECRET")
    HF_TOKEN: str = os.getenv("HF_TOKEN")
    
    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY")
    JWT_REFRESH_SECRET_KEY: str = os.getenv("JWT_REFRESH_SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS")
    
    # Authentication
    INVITATION_CODE: str = os.getenv("INVITATION_CODE")
    
    # Admin
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD")
    
    # API URLs
    MODEL_URLS ={
        "FLUX1_KONTEXT_DEV": "https://inference.datacrunch.io/flux-kontext-dev/predict",
        "FLUX1_KREA_DEV": "https://inference.datacrunch.io/flux-krea-dev/runsync",
        "FLUX2_KLEIN_9B": "https://inference.datacrunch.io/flux2-klein-9b/generate",
        "FLUX2_KLEIN_4B": "https://inference.datacrunch.io/flux2-klein-4b/generate"
    }

settings = Settings()
