"""
Application configuration and environment variables
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv('.env.local')


class Settings:
    """Application settings loaded from environment variables"""
    
    # MongoDB
    MONGO_DB_URL: str = os.getenv("MONGO_DB_URL")
    
    # API Keys
    VERDA_API_KEY: str = os.getenv("VERDA_API_KEY")
    
    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY")
    JWT_EXPIRY_HOURS: int = 24
    
    # CORS
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS")
    
    # Authentication
    INVITATION_CODE: str = os.getenv("INVITATION_CODE")
    
    # API URLs
    FLUX_KONTEXT_URL: str = "https://inference.datacrunch.io/flux-kontext-dev/predict"
    FLUX1_KREA_DEV_URL: str = "https://inference.datacrunch.io/flux-krea-dev/runsync"


settings = Settings()
