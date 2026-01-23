from fastapi import FastAPI, HTTPException, HTTPException
import requests
from fastapi.middleware.cors import CORSMiddleware

'''
    Simple FastAPI server to generate images based on prompts using Verda API (only FLUX.2 [dev] model is used).
    contains now only two endpoints:
        / - test endpoint to check if server is running
        /generate-image - returns a generated image based on a prompt (from verda api)

'''

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



@app.get('/generate-image')
def generate_image(prompt: str):
    print("Generating image...")
    '''Generate an image based on a prompt and return it as a file response (from verda api)'''
     
    token = "api_key_goes_here" 
    bearer_token = f"Bearer {token}"

    url = "https://inference.datacrunch.io/flux2-dev/runsync"
    headers = {
        "Content-Type": "application/json",
        "Authorization": bearer_token
    }
    
    data = {
        "input": {
            "prompt": prompt
        },
        "enable_base64_output": True,
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
        image_url = resp_data["output"]["outputs"][0]
        print(f"generated image url: {image_url}")
        return {
            "image_url": image_url,
            "status": "success"
        }

    raise HTTPException(
        status_code=500,
        detail={
            "error": "problem generating image",
            "data": resp_data
        }
    )



    
