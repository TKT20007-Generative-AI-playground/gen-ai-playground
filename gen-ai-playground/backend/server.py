import base64
import os
from dotenv import load_dotenv
import time
from fastapi import FastAPI, HTTPException, HTTPException
import requests
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import Response
from pymongo import MongoClient
from datetime import datetime, timedelta
import bcrypt
import jwt

# Load environment variables from .env.local
load_dotenv('.env.local')

# MongoDB connection
mongo_url = os.getenv("MONGO_DB_URL")
mongo_client = None
db = None

if mongo_url:
    try:
        mongo_client = MongoClient(mongo_url)
        db = mongo_client["gen_ai_playground"]
        # Test connection
        mongo_client.admin.command('ping')
        print("Successfully connected to MongoDB!")
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        print("Continuing without database support...")
else:
    print("MONGO_DB_URL not set, continuing without database support...")

'''
    Simple FastAPI server to generate images based on prompts using Verda API (only FLUX.2 [dev] model is used).
    contains now only two endpoints:
        / - test endpoint to check if server is running
        /generate-image - returns a generated image based on a prompt (from verda api)

'''

class ImageRequestBody(BaseModel):
    prompt: str
    model: str
    image: str = None  # for edit-image endpoint

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    invitation_code: str

class LoginRequest(BaseModel):
    username: str
    password: str

flux_kontext_url = "https://inference.datacrunch.io/flux-kontext-dev/predict"
flux1_krea_dev_url = "https://inference.datacrunch.io/flux-krea-dev/runsync"

app = FastAPI()

"""
    CORS middleware configuration
    TODO: change allow_origins to the appropriate frontend url when needed
    TODO: set allow_methods and allow_headers if/when needed
"""
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("ALLOWED_ORIGINS")],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"hello from gen-ai-playground backend"}

@app.post("/register")
def register(user_data: RegisterRequest):
    """Register a new user"""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        # Validate invitation code
        required_code = os.getenv("INVITATION_CODE", "")
        if not required_code or user_data.invitation_code != required_code:
            raise HTTPException(status_code=403, detail="Invalid invitation code")
        
        # Check if user already exists
        existing_user = db.users.find_one({"$or": [
            {"username": user_data.username},
            {"email": user_data.email}
        ]})
        
        if existing_user:
            raise HTTPException(status_code=400, detail="Username or email already exists")
        
        # Hash the password
        hashed_password = bcrypt.hashpw(user_data.password.encode('utf-8'), bcrypt.gensalt())
        
        # Create user document
        user_doc = {
            "username": user_data.username,
            "email": user_data.email,
            "password": hashed_password,
            "created_at": datetime.utcnow()
        }
        
        # Insert user into database
        result = db.users.insert_one(user_doc)
        
        return {
            "message": "User registered successfully",
            "username": user_data.username
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/login")
def login(credentials: LoginRequest):
    """Authenticate user and return JWT token"""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        # Find user by username
        user = db.users.find_one({"username": credentials.username})
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Verify password
        if not bcrypt.checkpw(credentials.password.encode('utf-8'), user["password"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Generate JWT token
        secret_key = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this")
        token_expiry = datetime.utcnow() + timedelta(hours=24)
        
        token_payload = {
            "username": user["username"],
            "email": user["email"],
            "exp": token_expiry
        }
        
        token = jwt.encode(token_payload, secret_key, algorithm="HS256")
        
        return {
            "message": "Login successful",
            "token": token,
            "username": user["username"],
            "email": user["email"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@app.get("/history")
def get_history():
    """Get image generation history from MongoDB"""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    try:
        # Get last 50 image generations, sorted by newest first
        history = list(db.images.find(
            {},
            {"_id": 0, "prompt": 1, "model": 1, "timestamp": 1, "image_size": 1}
        ).sort("timestamp", -1).limit(50))
        
        return {"history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")


@app.post("/edit-image")
async def edit_image(image_request: ImageRequestBody):
    """
    Edit an image based on a prompt and return it as a file response
    Args:
        image_request (ImageRequestBody): _description_
    """
    prompt = image_request.prompt  # prompt from request body
    model = image_request.model    # model from req body
    image_base64 = image_request.image  # base64 image from req body
    print("editing image...")

@app.post("/generate-image")
async def generate_image(image_request: ImageRequestBody):
    print("image gen endpoint called at time: " + time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()))
    
    prompt = image_request.prompt  # prompt from request body
    model = image_request.model    # model from req body
    print("Generating image...")
    '''Generate an image based on a prompt and return it as a file response (from verda api)'''
     
    token = os.getenv("VERDA_API_KEY")
    if not token:
        raise HTTPException(status_code=500, detail="VERDA_API_KEY not set in environment.")
    bearer_token = f"Bearer {token}"

    if model == "flux_kontext":
        url = flux_kontext_url
    else:   
        url = flux1_krea_dev_url
        
        
    headers = {
        "Content-Type": "application/json",
        "Authorization": bearer_token
    }
    
    if model == "flux_kontext":
       data = {
           "input": {
                "prompt": prompt,
                "enable_base64_output": True
            }
        }    
    else:
        data = {
            "input": {
                "prompt": prompt,
                "enable_base64_output": True,
            }
        }

    resp = requests.post(url, headers=headers, json=data)
    
    try:
        resp.raise_for_status()
    except requests.exceptions.HTTPError:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"image generation failed: {resp.text}"
        )

    resp_data = resp.json()
    if resp_data.get("status") == "COMPLETED" and resp_data.get("output", {}).get("outputs"):
        image_base64 = resp_data["output"]["outputs"][0]
        print(f"Received base64 image (length: {len(image_base64)})")
        
        # delete data url prefix if exists
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        
        # decode base64 to bytes
        image_bytes = base64.b64decode(image_base64)
        
        print("image gen endpoint finished at time: " + time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()))
        
        # Save to MongoDB if available
        if db is not None:
            try:
                image_record = {
                    "prompt": prompt,
                    "model": model,
                    "timestamp": datetime.utcnow(),
                    "image_size": len(image_bytes)
                }
                db.images.insert_one(image_record)
                print(f"Saved image metadata to MongoDB")
            except Exception as e:
                print(f"Failed to save to MongoDB: {e}")
        
        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": "inline"
            }
        )
    
    raise HTTPException(
        status_code=500,
        detail={
            "error": "problem generating image",
            "data": resp_data
        }
    )





    
