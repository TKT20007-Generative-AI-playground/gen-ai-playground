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
    VERDA_INFERENCE_KEY: str = os.getenv("VERDA_INFERENCE_KEY") or os.getenv("VERDA_API_KEY")
    
    # Verda SDK credentials (for container deployments)
    VERDA_CLIENT_ID: str = os.getenv("VERDA_CLIENT_ID")
    VERDA_CLIENT_SECRET: str = os.getenv("VERDA_CLIENT_SECRET")
    HF_TOKEN: str = os.getenv("HF_TOKEN")
    
    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY")
    JWT_EXPIRY_HOURS: int = 24
    
    # CORS
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS")
    
    # Authentication
    INVITATION_CODE: str = os.getenv("INVITATION_CODE")
    
    # API URLs
    MODEL_URLS ={
        "FLUX1_KONTEXT_DEV": "https://inference.datacrunch.io/flux-kontext-dev/predict",
        "FLUX1_KREA_DEV": "https://inference.datacrunch.io/flux-krea-dev/runsync",
        "FLUX2_KLEIN_9B": "https://inference.datacrunch.io/flux2-klein-9b/generate",
        "FLUX2_KLEIN_4B": "https://inference.datacrunch.io/flux2-klein-4b/generate"
    }
    TEXT_MODEL_PATHS = {
        "deepseek-llm-7b": "deepseek-ai/deepseek-llm-7b-chat",
        "Llama-3.1-8B": "meta-llama/Llama-3.1-8B-Instruct",
        "Qwen3-8B": "Qwen/Qwen3-8B",
        "Qwen3-32B": "Qwen/Qwen3-32B"
    }
    TEXT_MODEL_PATHS_V2 = {
        # DeepSeek
        #"deepseek-llm-7b": "deepseek-ai/deepseek-llm-7b-chat",
        "deepseek-r1-0528": "deepseek-r1-sglang.json",
        "deepseek-v3.2-fp8": "deepseek-sglang-fp8.json",
        "deepseek-v3.2": "deepseek-sglang.json",
        # GLM
        "glm46": "glm46-sglang.json",
        # GPT-OSS
        "gptoss-120b-b200": "gptoss-120b-b200-fp4-vllm.json",
        "gptoss-120b-h200": "gptoss-120b-h200-fp4-vllm.json",
        "gptoss-20b-h100": "gptoss-20b-h100-fp4-vllm.json",
        # Kimi
        "kimi-k2": "kimik2-sglang.json",
        # Llama
        "Llama-3-70B-AWQ": "llama-awq-vllm.json",
        "Llama-3.1-8B-sglang": "llama-sglang-deploy.json",
        "Llama-3.1-70B-sglang-opt": "llama-sglang-optimized.json",
        "Llama-3.1-70B-sglang": "llama-sglang.json",
        "Llama-3-70B-AWQ-vllm": "llama-vllm-deploy-full.json",
        "Llama-3.1-8B": "llama-vllm.json",
        # Mistral
        "Mistral-7B": "mistral-vllm.json",
        # Nemotron
        "Nemotron-Nano-30B": "nemotron-sglang.json",
        # Qwen
        "Qwen2.5-32B": "qwen-vllm.json",
        "Qwen3-30B-MoE": "qwen3-30b-moe-sglang.json",
        "Qwen3-8B": "qwen3-sglang.json",
        "Qwen3-32B-think": "qwen3-sglang-think.json",
        "Qwen3-32B": "qwen3-thinking-sglang.json",
    }


settings = Settings()
