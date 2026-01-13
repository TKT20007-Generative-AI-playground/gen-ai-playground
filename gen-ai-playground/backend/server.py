from flask import Flask, send_file, request
from flask_cors import CORS
import requests


'''
    Simple Flask server to generate images based on prompts using Verda API (only FLUX.2 [dev] model is used).
    contains now only two endpoints:
        /generate-image - generates an image based on a prompt and returns the image URL
        /test-image - returns a test image for development purposes (image creation takes time)
    just add some img to the backend folder with name 'test_img.png' for testing
'''


app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])

@app.route('/')
def index():
    return "Hello, World!"

@app.route('/test-image', methods=['GET'])
def test_image():
    prompt = request.args.get("prompt")
    print("prompt received:", prompt)
    return send_file("test_img.png")
    

@app.route('/generate-image', methods=['GET'])
def generate_image():   
    print("Generating image...")
    '''Generate an image based on a prompt and return it as a file response (from verda api)'''
     
    token = "api_key_goes_here" 
    bearer_token = f"Bearer {token}"

    url = "https://inference.datacrunch.io/flux2-dev/runsync"
    headers = {
        "Content-Type": "application/json",
        "Authorization": bearer_token
    }
    prompt = request.args.get("prompt")
    data = {
        "input": {
            "prompt": prompt
        },
        "enable_base64_output": True,
    }

    resp = requests.post(url, headers=headers, json=data)
    
    try:
        resp.raise_for_status()
    except requests.exceptions.HTTPError as e:
        print(f"api err response: {resp.text}") 
        return {"error": f"image generation failed: {resp.text}"}, resp.status_code

    resp_data = resp.json()
    if resp_data.get("status") == "COMPLETED" and resp_data.get("output", {}).get("outputs"):
        image_url = resp_data["output"]["outputs"][0]
        print(f"generated image url: {image_url}")
        return {"image_url": image_url, "status": "success"}
    else:
        return {"error": "image generation incomplete", "data": resp_data}, 500

if __name__ == '__main__':
    app.run(debug=True)
