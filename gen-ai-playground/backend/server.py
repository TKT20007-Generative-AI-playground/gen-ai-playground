import base64
import time
from fastapi import FastAPI, HTTPException, HTTPException
import requests
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import Response
'''
    Simple FastAPI server to generate images based on prompts using Verda API (only FLUX.2 [dev] model is used).
    contains now only two endpoints:
        / - test endpoint to check if server is running
        /generate-image - returns a generated image based on a prompt (from verda api)

'''

class ImageRequestBody(BaseModel):
    prompt: str
    model: str

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
    allow_origins=[
        "http://localhost:5173",
        "https://gen-ai-frontend-route-ohtuprojekti-staging.apps.ocp-prod-0.k8s.it.helsinki.fi"
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"hello from gen-ai-playground backend"}

@app.post('/generate-image')
async def generate_image(image_request: ImageRequestBody):
    print("image gen endpoint called at time: " + time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()))
    
    prompt = image_request.prompt  # prompt from request body
    model = image_request.model    # model from req body
    print("Generating image...")
    '''Generate an image based on a prompt and return it as a file response (from verda api)'''
     
    token = "api_key_goes_here"  
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





    
