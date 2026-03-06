"""
Text generation routes using Verda container deployments.

Provides endpoints to deploy an LLM on Verda, check deployment status,
generate text completions, chat with the model, and clean up.
"""
from fastapi import APIRouter, HTTPException, Depends
from pymongo.database import Database
from datetime import datetime
from typing import Optional


from app.database import get_database
from app.dependencies import get_current_user, validate_csrf_token
from app.models import (
    TextGenerateRequest,
    TextGenerateResponse,
    ChatRequest,
    ChatResponse,
    DeployModelRequest,
    DeploymentStatusResponse,
    ConnectDeploymentRequest,
    UserInfo,
)
from app.verda_service import verda_service
from app.config import settings


router = APIRouter(
    prefix="/text",
    tags=["text"],
)


@router.post("/deploy", response_model=DeploymentStatusResponse)
def deploy_model(
    request: DeployModelRequest,
    current_user: UserInfo = Depends(get_current_user),
    _: None = Depends(validate_csrf_token),
):
    """
    Deploy an LLM model on Verda Cloud using SGLang.
    
    This creates a new serverless container deployment running the specified model.
    The deployment may take several minutes to become healthy while the model downloads.
    
    Args:
        request: Deployment configuration (model, optional name)
        current_user: Authenticated user
        
    Returns:
        Deployment status information
    """
    print(f"User {current_user.username} requesting model deployment: {request.model_path}")
    model_path = choose_text_model_path(request.model_path)
    print("MODEL PATH: ", model_path)
    
    
    try:
        if model_path == "deepseek-ai/deepseek-llm-7b-chat":
            print("Deploying deepseek-llm-7b-chat with optimized settings for 7B models")
            result = verda_service.deploy_model(
            model_path=model_path,
            deployment_name=request.deployment_name,
            )
        elif model_path == "Qwen/Qwen3-8B":
            print("Deploying Qwen3-8B with optimized settings for 8B models")
            result = verda_service.deploy_from_template(
                template_json="qwen3-sglang.json")
        elif model_path == "Qwen/Qwen3-32B":
            print("Deploying Qwen3-32B with optimized settings for 32B models")
            result = verda_service.deploy_from_template(
                template_json="qwen3-sglang-think.json")
            # result = verda_service.deploy_second_model(
            #     model_path=model_path,
            #     deployment_name=request.deployment_name,
            # )
        return DeploymentStatusResponse(**result)
    except RuntimeError as e:
        print(f"Deploy RuntimeError: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"Deploy unexpected error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to deploy model: {str(e)}",
        )


@router.post("/connect", response_model=DeploymentStatusResponse)
def connect_to_deployment(
    request: ConnectDeploymentRequest,
    current_user: UserInfo = Depends(get_current_user),
    _: None = Depends(validate_csrf_token),
):
    """
    Connect to an already-running Verda deployment.
    
    Use this if you already have a deployment running and want to
    use it for text generation without creating a new one.
    
    Args:
        request: Deployment name and model info
        current_user: Authenticated user
        
    Returns:
        Deployment status information
    """
    print(f"User {current_user.username} connecting to deployment: {request.deployment_name}")
    try:
        result = verda_service.connect_to_existing(
            deployment_name=request.deployment_name,
            model_path=choose_text_model_path(request.model_path),
        )
        if result.get("status") == "error":
            raise HTTPException(status_code=404, detail=result.get("message", "Deployment not found"))
        return DeploymentStatusResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
def choose_text_model_path(model: str) -> str:
    model = model.strip()

    try:
        return settings.TEXT_MODEL_PATHS[model]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model: {model}. "
                   f"Supported models: {list(settings.TEXT_MODEL_PATHS.keys())}" # for better debugging and user feedback
        )


@router.get("/status", response_model=DeploymentStatusResponse)
def get_deployment_status(
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Check the current status of the active text model deployment.
    
    Returns:
        Current deployment status (deploying, healthy, error, etc.)
    """
    result = verda_service.get_deployment_status()
    return DeploymentStatusResponse(**result)


@router.get("/deployments")
def list_deployments(
    current_user: UserInfo = Depends(get_current_user),
):
    """
    List all existing Verda container deployments.
    
    Returns:
        List of deployment summaries
    """
    try:
        return verda_service.list_deployments()
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=TextGenerateResponse)
def generate_text(
    request: TextGenerateRequest,
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(validate_csrf_token),
):
    """
    Generate text using the deployed LLM model.
    
    Sends a prompt to the SGLang-hosted model and returns the generated text.
    The deployment must be healthy before calling this endpoint.
    
    Args:
        request: Text generation parameters (prompt, max_tokens, etc.)
        current_user: Authenticated user
        db: Database for saving history
        
    Returns:
        Generated text and metadata
    """
    print(f"Text generation for user: {current_user.username}, prompt: {request.prompt[:50]}...")

    # Check deployment is healthy first
    status = verda_service.get_deployment_status()
    if not status.get("healthy"):
        raise HTTPException(
            status_code=503,
            detail=f"Deployment is not healthy. Current status: {status.get('status', 'unknown')}. "
                   "Wait for the deployment to become healthy before generating text.",
        )

    try:
        result = verda_service.generate_text(
            prompt=request.prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
        )

        # Save to history in MongoDB
        try:
            history_record = {
                "type": "text",
                "prompt": request.prompt,
                "generated_text": result["generated_text"],
                "model": result["model"],
                "timestamp": datetime.utcnow(),
                "username": current_user.username,
                "usage": result.get("usage", {}),
            }
            db.text_generations.insert_one(history_record)
            print(f"Saved text generation to MongoDB for user: {current_user.username}")
        except Exception as e:
            print(f"Failed to save text generation to MongoDB: {e}")

        return TextGenerateResponse(
            generated_text=result["generated_text"],
            model=result["model"],
            prompt=request.prompt,
            usage=result.get("usage", {}),
        )

    except RuntimeError as e:
        print(f"Generate RuntimeError: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Generate unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Text generation failed: {str(e)}",
        )


@router.post("/chat", response_model=ChatResponse)
def chat_with_model(
    request: ChatRequest,
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(validate_csrf_token),
):
    """
    Chat with the deployed LLM using the OpenAI-compatible chat completions API.
    
    Send a list of messages and receive an assistant reply.
    
    Args:
        request: Chat parameters (messages, max_tokens, etc.)
        current_user: Authenticated user
        db: Database for saving history
        
    Returns:
        Assistant's reply and metadata
    """
    print(f"Chat request from user: {current_user.username}")

    status = verda_service.get_deployment_status()
    if not status.get("healthy"):
        raise HTTPException(
            status_code=503,
            detail=f"Deployment is not healthy. Current status: {status.get('status', 'unknown')}.",
        )

    try:
        result = verda_service.chat(
            messages=[msg.model_dump() for msg in request.messages],
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
        )

        # Save to history
        try:
            history_record = {
                "type": "chat",
                "messages": [msg.model_dump() for msg in request.messages],
                "reply": result["reply"],
                "model": result["model"],
                "timestamp": datetime.utcnow(),
                "username": current_user.username,
                "usage": result.get("usage", {}),
            }
            db.text_generations.insert_one(history_record)
        except Exception as e:
            print(f"Failed to save chat to MongoDB: {e}")

        return ChatResponse(
            reply=result["reply"],
            model=result["model"],
            usage=result.get("usage", {}),
        )

    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {str(e)}",
        )


@router.delete("/deploy")
def delete_deployment(
    current_user: UserInfo = Depends(get_current_user),
    _: None = Depends(validate_csrf_token),
):
    """
    Delete the active deployment and clean up resources.
    
    Important: Always clean up deployments when done to avoid unnecessary charges.
    
    Returns:
        Deletion status
    """
    print(f"User {current_user.username} deleting deployment")
    result = verda_service.delete_deployment()
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result
