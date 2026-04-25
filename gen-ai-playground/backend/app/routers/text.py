"""
Text generation routes using Verda container deployments.

Provides endpoints to deploy an LLM on Verda, check deployment status,
generate text completions, chat with the model, and clean up.
"""
import math
import secrets
from fastapi import APIRouter, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pymongo.database import Database
from datetime import datetime, timezone
from typing import Optional
import time
import json
from bson import ObjectId
import asyncio
import httpx

from app.database import get_database
from app.config import settings
from app.dependencies import get_current_user, verify_token, get_admin_user, validate_csrf_token
from app.models import (
    HistoryResponseText,
    TextGenerateRequest,
    TextGenerateResponse,
    ChatRequest,
    ChatResponse,
    DeployModelRequest,
    DeploymentStatusResponse,
    ConnectDeploymentRequest,
    UserInfo,
    ConversationCreateRequest,
    StreamRequest,
)
from app.verda_service import verda_service
from app.template_discovery import get_template_map, get_template_configs, _deployment_name_from_filename
from verda.containers import ContainerDeploymentStatus
from app.connection_manager import ConnectionManager


def _sanitize_slug(model_path: str) -> str:
    """Convert a model path to a deployment-name-compatible slug."""
    return model_path.split("/")[-1].lower().replace(".", "-")


def _parse_conversation_object_id(conversation_id: str) -> ObjectId:
    """Parse conversation id and return a client error for malformed ids."""
    try:
        return ObjectId(conversation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid conversation id")

manager = ConnectionManager()


def _inference_headers() -> dict[str, str]:
    token = settings.VERDA_INFERENCE_KEY or settings.VERDA_API_KEY
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}

router = APIRouter(
    prefix="/text",
    tags=["text"],
)

last_request = None

@router.get("/models")
def list_available_models(current_user: UserInfo = Depends(get_current_user)):
    """
    List all models available for deployment, fetched from JSON templates.

    Returns:
        List of model objects with value, label, template, GPU count, and availability.
    """
    available_models = verda_service.available_models()
    return {"available_models": available_models}

@router.get("/available-compute")
def get_available_compute(current_user: UserInfo = Depends(get_current_user)):
    """for testing, check available compute resources for a given size"""
    return verda_service.check_compute_resources(1)

@router.post("/deploy", response_model=DeploymentStatusResponse)
def deploy_model(
    request: DeployModelRequest,
    current_user: UserInfo = Depends(get_admin_user),
    _: None = Depends(validate_csrf_token),
):
    """
    Deploy an LLM model on Verda Cloud using SGLang or vLLM.

    This creates a new serverless container deployment running the specified model.
    The deployment may take several minutes to become healthy while the model downloads.

    Args:
        request: Deployment configuration (model path).
        current_user: Authenticated admin user.

    Returns:
        Deployment status information.

    Raises:
        HTTPException: 403 if the user is not an admin.
        HTTPException: 500 if deployment fails.
    """
    print(f"User {current_user.username} requesting model deployment: {request.model_path}")
    
    try:
        result = _deploy_model_internal(request.model_path)
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
    
    Notes:
        Requires CSRF token validation for cookie-authenticated requests.
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
    """Map a user-friendly display name to the actual model path used for deployment."""
    model = model.strip()
    configs = get_template_configs()
    for template_name, display_name in get_template_map().items():
        if display_name == model:
            cfg = configs.get(template_name)
            if cfg is not None:
                return cfg.model

            # Fallback for stale template maps (for example, tests that patch only
            # display-name mapping): try parsing the template on demand.
            try:
                return verda_service._parse_and_validate_template(template_name).model
            except Exception:
                break

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported model: {model}. "
               f"Supported models: {list(get_template_map().values())}"
    )


def _resolve_template_name(model: str) -> str | None:
    """Resolve a display name to a template filename, or None."""
    model = model.strip()
    for template_name, display_name in get_template_map().items():
        if display_name == model:
            return template_name
    return None


def _model_supports_thinking(template_name: str | None) -> bool:
    """Return whether the model template supports thinking mode."""
    if not template_name:
        return False

    cfg = get_template_configs().get(template_name)
    if cfg is None:
        return False

    if cfg.model_mode in {"thinking", "hybrid"}:
        return True
    if cfg.sglang is not None and cfg.sglang.reasoning_parser is not None:
        return True
    if cfg.vllm is not None and cfg.vllm.reasoning_parser is not None:
        return True
    return False


def _deploy_model_internal(model_key: str) -> dict:
    """
    Internal helper to deploy a model by key.
    Used by the admin /deploy endpoint.
    """
    # Check V2 templates 
    template = _resolve_template_name(model_key)
    if template:
        return verda_service.deploy_from_template(template_json=template)
    else:
        return {"error": f"Model '{model_key}' not found in available templates."}



def _check_deployment_health(deployment_name: str, label: str = "Deployment") -> None:
    """Raise 503 if the deployment is not healthy."""
    try:
        client = verda_service._get_client()
        dep_status = client.containers.get_deployment_status(deployment_name)
        status_str = dep_status.value if hasattr(dep_status, 'value') else str(dep_status)
        if status_str != "healthy":
            raise HTTPException(
                status_code=503,
                detail=f"{label} is not healthy yet (status: {status_str}). Please wait and try again.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Failed to check deployment status: {str(e)}")


@router.get("/status", response_model=DeploymentStatusResponse)
def get_deployment_status(
    deployment_name: str = Query(..., description="Name of the deployment to check"),
    model_path: Optional[str] = Query(None, description="Model path for metadata"),
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Check the status of a specific text model deployment.
    
    Returns:
        Current deployment status (deploying, healthy, error, etc.)
    """
    result = verda_service.get_deployment_status(deployment_name, model_path)
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


@router.get("/model-statuses")
def get_model_statuses(
    current_user: UserInfo = Depends(get_current_user),
):
    """
    Return the live/starting/offline status for each known model.
    Used by the frontend to show green/yellow indicators in the model selector.
    """
    try:
        client = verda_service._get_client()
        deployments = client.containers.get_deployments()
    except Exception:
        # If we can't reach Verda, everything is offline
        return {name: "offline" for name in get_template_map().values()}

    # Build a lookup: deployment_name (lower) -> status string
    dep_statuses: dict[str, str] = {}
    for d in deployments:
        try:
            status = client.containers.get_deployment_status(d.name)
            dep_statuses[d.name.lower()] = status.value
        except Exception:
            dep_statuses[d.name.lower()] = "unknown"

    result: dict[str, str] = {}
    
    for template_name, display_name in get_template_map().items():
        if display_name in result:
            continue
        dep_name_expected = _deployment_name_from_filename(template_name)
        matched_status = "offline"
        for dep_name, st in dep_statuses.items():
            if dep_name_expected == dep_name:
                if st == "healthy":
                    matched_status = "live"
                elif st == "unknown":
                    matched_status = "offline"
                else:
                    matched_status = "starting"
                break
        result[display_name] = matched_status

    return result


@router.post("/generate", response_model=TextGenerateResponse)
def generate_text(
    request: TextGenerateRequest,
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    _: None = Depends(validate_csrf_token),
):
    """
    Generate text using a deployed LLM model.
    
    Automatically discovers the correct deployment for the requested model.
    The deployment must be healthy before calling this endpoint.
    
    Args:
        request: Text generation parameters (prompt, max_tokens, etc.)
        current_user: Authenticated user
        db: Database for saving history
        
    Returns:
        Generated text and metadata
    
    Notes:
        Requires CSRF token validation for cookie-authenticated requests.
    """
    print(f"Text generation for user: {current_user.username}, prompt: {request.prompt[:50]}...")

    # Discover deployment for the requested model
    model_path = request.model_path if hasattr(request, 'model_path') and request.model_path else None
    if model_path:
        model_path = choose_text_model_path(model_path)
    
    # Find a running deployment
    try:
        deployments = verda_service.list_deployments()
    except Exception as e:
        raise HTTPException(status_code=503, detail="Could not reach deployment service.")

    deployment_name = None
    used_model_path = model_path

    if model_path:
        # Find deployment by template filename stem
        template_name = _resolve_template_name(request.model_path)
        if template_name:
            expected_dep = _deployment_name_from_filename(template_name)
            for d in deployments:
                if d.get("name", "").lower() == expected_dep:
                    deployment_name = d["name"]
                    break
    else:
        # Fallback: use any healthy deployment
        client = verda_service._get_client()
        for d in deployments:
            try:
                dep_status = client.containers.get_deployment_status(d["name"])
                if dep_status == ContainerDeploymentStatus.HEALTHY:
                    deployment_name = d["name"]
                    configs = get_template_configs()
                    for tpl in get_template_map():
                        if _deployment_name_from_filename(tpl) == d["name"].lower():
                            used_model_path = configs[tpl].model
                            break
                    break
            except Exception:
                continue

    if not deployment_name:
        raise HTTPException(
            status_code=503,
            detail="No suitable deployment found. Ask an admin to deploy a model.",
        )

    # Check deployment health
    try:
        client = verda_service._get_client()
        dep_status = client.containers.get_deployment_status(deployment_name)
        status_str = dep_status.value if hasattr(dep_status, 'value') else str(dep_status)
        if status_str != "healthy":
            raise HTTPException(
                status_code=503,
                detail=f"Deployment is not healthy. Current status: {status_str}. "
                       "Wait for the deployment to become healthy before generating text.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Failed to check deployment status: {str(e)}")

    try:
        gen_start_time = time.perf_counter()
        result = verda_service.generate_text(
            deployment_name=deployment_name,
            model_path=used_model_path or "",
            prompt=request.prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
        )
        gen_time_ms = int((time.perf_counter() - gen_start_time) * 1000)

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
                "generation_time_ms": gen_time_ms,
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
            generation_time_ms=gen_time_ms,
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
    Chat with a deployed LLM using the OpenAI-compatible chat completions API.

    Automatically finds and connects to the correct deployment for the
    requested model. The model must already be deployed by an admin.

    Args:
        request: Chat parameters (model_path, messages, max_tokens, etc.)
        current_user: Authenticated user
        db: Database for saving history

    Returns:
        Assistant's reply and metadata
    
    Notes:
        Requires CSRF token validation for cookie-authenticated requests.
    """
    model_key = request.model_path
    model_path = choose_text_model_path(model_key)
    template_name = _resolve_template_name(model_key)
    expected_dep = _deployment_name_from_filename(template_name) if template_name else None

    print(f"Chat request from user: {current_user.username}, model: {model_key}")

    # Find a running deployment for this model
    try:
        deployments = verda_service.list_deployments()
    except Exception as e:
        print(f"Failed to list deployments: {e}")
        raise HTTPException(status_code=503, detail="Could not reach deployment service.")

    existing = None
    for d in deployments:
        if expected_dep and d.get("name", "").lower() == expected_dep:
            existing = d
            break

    if not existing:
        dep_names = [d.get("name", "?") for d in deployments]
        print(f"No deployment found for '{expected_dep}'. Available: {dep_names}")
        raise HTTPException(
            status_code=503,
            detail=f"Model {model_key} is not deployed. Ask an admin to deploy it from the dashboard.",
        )

    # Check deployment health without mutating singleton state
    deployment_name = existing["name"]
    print(f"Found deployment '{deployment_name}' for '{expected_dep}'")
    try:
        client = verda_service._get_client()
        dep_status = client.containers.get_deployment_status(deployment_name)
        status_str = dep_status.value if hasattr(dep_status, 'value') else str(dep_status)
        print(f"Deployment '{deployment_name}' status: {status_str}")
        if status_str != "healthy":
            raise HTTPException(
                status_code=503,
                detail=f"Model {model_key} is not healthy yet (status: {status_str}). Please wait and try again.",
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Failed to check deployment status for '{deployment_name}': {e}")
        raise HTTPException(status_code=503, detail=f"Failed to check deployment status: {str(e)}")

    # Detect if model supports thinking from template config
    supports_thinking = _model_supports_thinking(template_name)

    # Chat
    try:
        chat_start_time = time.perf_counter()
        result = verda_service.chat(
            messages=[msg.model_dump() for msg in request.messages],
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            enable_thinking=request.enable_thinking,
            supports_thinking=supports_thinking,
            deployment_name=deployment_name,
            model_path=model_path,
        )
        chat_time_ms = int((time.perf_counter() - chat_start_time) * 1000)

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
                "generation_time_ms": chat_time_ms,
            }
            db.text_generations.insert_one(history_record)
        except Exception as e:
            print(f"Failed to save chat to MongoDB: {e}")

        return ChatResponse(
            reply=result["reply"],
            reasoning=result.get("reasoning"),
            model=result["model"],
            usage=result.get("usage", {}),
            generation_time_ms=chat_time_ms,
        )

    except RuntimeError as e:
        print(f"Chat RuntimeError: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Chat unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {str(e)}",
        )

@router.get("/history-sidebar")
def get_text_history(
    limit: int = Query(5, description="How many text history items to return (5, 10, or 15)"),
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
):
    if limit not in {5, 10, 15}:
        raise HTTPException(status_code=400, detail="limit must be one of: 5, 10, 15")

    records = list(
        db.text_generations.find(
            {"username": current_user.username}
        ).sort("timestamp", -1).limit(limit)
    )

    # Convert ObjectId to string
    for r in records:
        r["_id"] = str(r["_id"])

    return {"history": records}


@router.delete("/deploy")
def delete_deployment(
    deployment_name: str = Query(..., description="Name of the deployment to delete"),
    current_user: UserInfo = Depends(get_admin_user),
    _csrf: None = Depends(validate_csrf_token),
):
    """
    Delete a specific deployment and clean up resources.

    Important: Always clean up deployments when done to avoid unnecessary charges.

    Args:
        deployment_name: Name of the Verda deployment to delete.
        current_user: Authenticated admin user.

    Returns:
        Deletion status.

    Raises:
        HTTPException: 403 if the user is not an admin.
        HTTPException: 500 if deletion fails.
    """
    print(f"User {current_user.username} deleting deployment: {deployment_name}")
    result = verda_service.delete_deployment(deployment_name)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result

@router.get("/history", response_model=HistoryResponseText)
def history(
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
    from_date: Optional[int] = Query(None, alias="from"),
    to_date: Optional[int] = Query(None, alias="to"),
    page: int = Query(1, alias="page", ge=1),
):
    page_size = 10

    query = {"username": current_user.username}

    if from_date or to_date:
        date_filter = {}
        if from_date:
            date_filter["$gte"] = datetime.fromtimestamp(from_date / 1000, tz=timezone.utc)
        if to_date:
            date_filter["$lte"] = datetime.fromtimestamp(to_date / 1000, tz=timezone.utc)
        query["timestamp"] = date_filter

    total = db.text_generations.count_documents(query)

    if total == 0:
        return HistoryResponseText(history=[], total=0, page=page, total_pages=0)

    total_pages = math.ceil(total / page_size)
    page = min(page, total_pages)
    start = (page - 1) * page_size

    try:
        history = list(
            db.text_generations.find(
                query,
                {
                    "_id": 1,
                    "type": 1,
                    "messages": 1,
                    "reply": 1,
                    "model": 1,
                    "timestamp": 1,
                    "username": 1,
                    "usage": 1,
                    "generation_time_ms": 1,
                },
            )
            .sort("timestamp", -1)
            .skip(start)
            .limit(page_size)
        )

        return HistoryResponseText(
            history=history,
            total=total,
            page=page,
            total_pages=total_pages,
        )

    except Exception as e:
        print(f"Error getting history: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting history: {e}")
    
    
@router.post("/conversations")
async def create_conversation(
    conversation: ConversationCreateRequest,
    db=Depends(get_database),
    cur_user: UserInfo = Depends(get_current_user),
):
    username = cur_user.username
    participants = list(set(conversation.participants or []) | {username})
    initial_messages = conversation.initial_messages or []
    model_key = conversation.model_key or "default"
    
    doc = {
        "title": conversation.title or "Untitled Conversation",
        "participants": participants,
        "messages": initial_messages,
        "created_by": username,
        "model": model_key,
        "invite_code": secrets.token_hex(8),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = db.conversations.insert_one(doc)

    return {
        "conversation_id": str(result.inserted_id),
        "participants": participants,
        "title": doc["title"],
        "model": model_key,
        "invite_code": doc["invite_code"],
        "created_at": doc["created_at"],
    }


@router.post("/conversations/{conversation_id}/join")
def join_conversation(
    conversation_id: str,
    body: dict,
    db=Depends(get_database),
    cur_user: UserInfo = Depends(get_current_user),
):
    conversation_oid = _parse_conversation_object_id(conversation_id)
    conversation = db.conversations.find_one({"_id": conversation_oid})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if cur_user.username not in conversation["participants"]:
        if body.get("invite_code") != conversation.get("invite_code"):
            raise HTTPException(status_code=403, detail="Invalid invite code")

    db.conversations.update_one(
        {"_id": conversation_oid},
        {"$addToSet": {"participants": cur_user.username}},
    )
    return {"ok": True}


@router.get("/conversations/{conversation_id}/check-participant")
def check_participant(
    conversation_id: str,
    db=Depends(get_database),
    cur_user: UserInfo = Depends(get_current_user),
):
    conversation_oid = _parse_conversation_object_id(conversation_id)
    conversation = db.conversations.find_one({"_id": conversation_oid})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if cur_user.username not in conversation["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")
    return {"ok": True}


@router.get("/conversation-history/{conversation_id}")
def conversation_history(
    conversation_id: str,
    db=Depends(get_database),
    cur_user: UserInfo = Depends(get_current_user),
):
    conversation_oid = _parse_conversation_object_id(conversation_id)
    conversation = db.conversations.find_one({"_id": conversation_oid})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if cur_user.username not in conversation["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant of this conversation")

    return {
        "messages": conversation.get("messages", []),
        "title": conversation.get("title", "Untitled Conversation"),
        "model": conversation.get("model", "default"),
    }
    
    
@router.get("/shared-conversations-sidebar")
def get_shared_conversations_sidebar(
    limit: int = Query(5, description="How many conversations to return (5, 10, or 15)"),
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
):
    if limit not in {5, 10, 15}:
        raise HTTPException(status_code=400, detail="limit must be one of: 5, 10, 15")

    conversations = list(
        db.conversations.find(
            {"participants": current_user.username},
            {
                "_id": 1,
                "title": 1,
                "participants": 1,
                "model": 1,
                "messages": 1,
                "created_at": 1,
                "updated_at": 1,
            },
        )
        .sort("created_at", -1)
        .limit(limit)
    )

    for conversation in conversations:
        conversation["_id"] = str(conversation["_id"])

    return {"history": conversations}
    

@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_ws(websocket: WebSocket, conversation_id: str, db=Depends(get_database)):
    await websocket.accept()

    try:
        conversation_oid = _parse_conversation_object_id(conversation_id)
    except HTTPException:
        await websocket.close(code=1008, reason="Invalid conversation id")
        return

    try:
        auth_data = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
    except asyncio.TimeoutError:
        await websocket.close(code=1008)
        return

    if auth_data.get("type") != "auth":
        await websocket.close(code=1008)
        return

    user = verify_token(auth_data.get("token", ""), db)
    if not user:
        await websocket.close(code=1008)
        return


    username = user.username

    conversation = db.conversations.find_one({"_id": conversation_oid})
    if not conversation:
        await websocket.close(code=1008)
        return

    if username not in conversation["participants"]:
        await websocket.close(code=1008)
        return

    await websocket.send_json({"type": "auth_ok"})
    await manager.connect(conversation_id, username, websocket)

    try:
        while True:
            data = await websocket.receive_json()

            content = data.get("content")
            model_key = data.get("model")
            no_ai = data.get("noAI", False)
            requested_max_tokens = data.get("max_tokens", 256)
            enable_thinking = data.get("enable_thinking", False) is True

            try:
                max_tokens = int(requested_max_tokens)
            except (TypeError, ValueError):
                max_tokens = 256

            max_tokens = max(1, min(max_tokens, 32768))
            if enable_thinking:
                max_tokens = max(max_tokens, 2)

            if not content:
                continue

          
            # save user message to db
           
            user_message = {
                "sender": username,
                "role": "user",
                "content": content,
                "timestamp": datetime.utcnow().isoformat(),
            }

            db.conversations.update_one(
                {"_id": conversation_oid},
                {"$push": {"messages": user_message}},
            )

         
            # Broadcast user message to other participants
            
            await manager.broadcast(
                conversation_id,
                {
                    "type": "message",
                    **user_message,
                },
                exclude_username=username,
            )

            # generate
            if not no_ai:
                asyncio.create_task(
                    handle_llm_reply(
                        conversation_id,
                        model_key,
                        max_tokens=max_tokens,
                        enable_thinking=enable_thinking,
                        db=db,
                        cur_user=user,
                    )
                )

    except WebSocketDisconnect:
        manager.disconnect(conversation_id, username)

        await manager.broadcast(
            conversation_id,
            {
                "type": "user_left",
                "user": username,
            },
        )
        
async def handle_llm_reply(
    conversation_id: str,
    model_key: str,
    max_tokens: int = 256,
    enable_thinking: bool = False,
    db: Database = Depends(get_database),
    cur_user: UserInfo = Depends(get_current_user),
):
    try:
        try:
            conversation_oid = _parse_conversation_object_id(conversation_id)
        except HTTPException:
            await manager.broadcast(conversation_id, {"type": "error", "message": "Invalid conversation id"})
            return

        conversation = db.conversations.find_one({"_id": conversation_oid})
        if not conversation:
            return

        messages = [
            {"role": m["role"], "content": m["content"]}
            for m in conversation.get("messages", [])
        ]

        template_name = _resolve_template_name(model_key)
        expected_dep = _deployment_name_from_filename(template_name) if template_name else None

        try:
            deployments = verda_service.list_deployments()
        except Exception:
            await manager.broadcast(conversation_id, {"type": "error", "message": "Could not reach deployment service."})
            return

        existing = None
        for d in deployments:
            if expected_dep and d.get("name", "").lower() == expected_dep:
                existing = d
                break

        if not existing:
            await manager.broadcast(conversation_id, {"type": "error", "message": f"Model {model_key} is not deployed."})
            return

        deployment_name = existing["name"]
        supports_thinking = _model_supports_thinking(template_name)
        effective_enable_thinking = enable_thinking and supports_thinking

        try:
            client = verda_service._get_client()
            dep_status = client.containers.get_deployment_status(deployment_name)
            status_str = dep_status.value if hasattr(dep_status, "value") else str(dep_status)
            if status_str != "healthy":
                await manager.broadcast(conversation_id, {"type": "error", "message": f"Model not healthy: {status_str}"})
                return
        except Exception as e:
            await manager.broadcast(conversation_id, {"type": "error", "message": f"Failed to check deployment: {str(e)}"})
            return

        await manager.broadcast(conversation_id, {"type": "assistant_typing"})

        try:
            verda_client = verda_service._get_client()
            deployment_obj = verda_client.containers.get_deployment_by_name(deployment_name)
            base_url = (deployment_obj.endpoint_base_url or "").rstrip("/")
        except Exception as e:
            await manager.broadcast(conversation_id, {"type": "error", "message": f"Could not get deployment URL: {str(e)}"})
            return
        normalized = base_url[:-3] if base_url.endswith("/v1") else base_url
        target_url = f"{normalized}/v1/chat/completions"

        model_path = choose_text_model_path(model_key)

        request_payload = {
            "model": model_path,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.7,
            "stream": True,
        }

        if effective_enable_thinking:
            request_payload["chat_template_kwargs"] = {"enable_thinking": True}

        assistant_text = ""
        assistant_reasoning = ""
        inside_think = False

        async with httpx.AsyncClient(timeout=None) as http_client:
            async with http_client.stream(
                "POST",
                target_url,
                json=request_payload,
                headers={
                    **_inference_headers(),
                    "Accept": "text/event-stream",
                    "Cache-Control": "no-cache",
                },
            ) as response:
                if response.status_code >= 400:
                    detail = (await response.aread()).decode("utf-8", errors="replace")
                    await manager.broadcast(conversation_id, {"type": "error", "message": detail[:200]})
                    return

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue

                    payload = line[len("data: "):]
                    if payload == "[DONE]":
                        break

                    try:
                        obj = json.loads(payload)
                        token = obj.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if not token:
                            continue
                        
                        if inside_think:
                            assistant_reasoning += token
                            if "</think>" in assistant_reasoning:
                                parts = assistant_reasoning.split("</think>", 1)
                                assistant_reasoning = parts[0]
                                leftover = parts[1]
                                inside_think = False
                                if leftover:
                                    assistant_text += leftover
                                    await manager.broadcast(conversation_id, {
                                        "type": "assistant_token",
                                        "token": leftover.replace("\n", "\\n"),
                                    })
                            continue

                        if "<think>" in token:
                            parts = token.split("<think>", 1)
                            before = parts[0]
                            inside_think = True
                            if before:
                                assistant_text += before
                                await manager.broadcast(conversation_id, {
                                    "type": "assistant_token",
                                    "token": before.replace("\n", "\\n"),
                                })
                            continue

                        assistant_text += token
                        await manager.broadcast(conversation_id, {
                            "type": "assistant_token",
                            "token": token.replace("\n", "\\n"),
                        })

                    except Exception:
                        continue
                    
        assistant_message = {
            "role": "assistant",
            "content": assistant_text,
            "reasoning": assistant_reasoning if assistant_reasoning else None,
        }
        db.conversations.update_one(
            {"_id": conversation_oid},
            {"$push": {"messages": assistant_message}},
        )

        await manager.broadcast(conversation_id, {"type": "assistant_done", "message": assistant_message})

    except Exception as e:
        await manager.broadcast(conversation_id, {"type": "error", "message": str(e)})
        

@router.get("/all-conversations")
def all_conversations(
    db=Depends(get_database),
    cur_user: UserInfo = Depends(get_current_user),
    from_date: Optional[int] = Query(None, alias="from"),
    to_date: Optional[int] = Query(None, alias="to"),
    page: int = Query(1, alias="page", ge=1),
):
    page_size = 10

    query = {"participants": cur_user.username}

    if from_date or to_date:
        date_filter = {}
        if from_date:
            date_filter["$gte"] = datetime.fromtimestamp(from_date / 1000, tz=timezone.utc)
        if to_date:
            date_filter["$lte"] = datetime.fromtimestamp(to_date / 1000, tz=timezone.utc)
        query["created_at"] = date_filter

    total = db.conversations.count_documents(query)

    if total == 0:
        return {"conversations": [], "total": 0, "page": page, "total_pages": 0}

    total_pages = math.ceil(total / page_size)
    page = min(page, total_pages)
    start = (page - 1) * page_size

    conversations = list(
        db.conversations.find(query)
        .sort("created_at", -1)
        .skip(start)
        .limit(page_size)
    )
    for c in conversations:
        c["_id"] = str(c["_id"])
    return {
        "conversations": conversations,
        "total": total,
        "page": page,
        "total_pages": total_pages,
    }


@router.get("/conversations-length")
def conversations_length(
    db=Depends(get_database),
    cur_user: UserInfo = Depends(get_current_user),
):
    length = db.conversations.count_documents({"participants": cur_user.username})
    return {"length": length}

@router.get("/chat-messages-length")
def chat_messages_length(
    db=Depends(get_database),
    cur_user: UserInfo = Depends(get_current_user),
):
    length = db.text_generations.count_documents({"username": cur_user.username})
    return {"length": length}

@router.post("/stream")
async def stream(
    stream_req: StreamRequest,
    _: UserInfo = Depends(get_current_user),
):
    """
        Stream text generation responses token-by-token using Server-Sent Events (SSE).
    """
    deployment_name = stream_req.deployment_name
    max_tokens = stream_req.max_tokens
    model_path = stream_req.model_path
    messages = stream_req.messages
    enable_thinking = stream_req.enable_thinking or False
    
    if not model_path:
        deployment_to_model_path = {
            _deployment_name_from_filename(template_name): cfg.model
            for template_name, cfg in get_template_configs().items()
        }
        model_path = deployment_to_model_path.get(deployment_name.lower())

    if not model_path:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not resolve model_path for deployment '{deployment_name}'. "
                "Provide model_path in request body or ensure deployment name matches a known template."
            ),
        )

    try:
        client = verda_service._get_client()
        deployment = client.containers.get_deployment_by_name(deployment_name)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail=f"Could not find deployment '{deployment_name}' or initialize Verda client",
        )

    base_url = (deployment.endpoint_base_url or "").rstrip("/")
    if not base_url:
        raise HTTPException(status_code=503, detail="Deployment endpoint URL is missing")

    normalized_base_url = base_url[:-3] if base_url.endswith("/v1") else base_url
    target_url = f"{normalized_base_url}/v1/chat/completions"

    request_payload = {
        "model": model_path,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
        "top_p": 0.9,
        "stream": True,
        "enable_thinking": enable_thinking,
    }
    

    def _extract_token(payload: str) -> str:
        obj = json.loads(payload)
        choice = obj.get("choices", [{}])[0]
        delta = choice.get("delta", {})
        return delta.get("content", "")

    async def event_generator():
        full_text = ""
        inside_think = False

        async with httpx.AsyncClient(timeout=None) as async_client:
            async with async_client.stream(
                "POST",
                target_url,
                json=request_payload,
                headers={
                    **_inference_headers(),
                    "Accept": "text/event-stream",
                    "Cache-Control": "no-cache",
                },
            ) as response:
                print(f"Stream upstream status={response.status_code} url={target_url}")

                if response.status_code >= 400:
                    detail = (await response.aread()).decode("utf-8", errors="replace")
                    print(f"Stream upstream error status={response.status_code} body={detail}")
                    message = json.dumps(
                        {
                            "error": "Upstream stream failed",
                            "status": response.status_code,
                            "detail": detail[:500],
                        }
                    )
                    yield f"data: {message}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue

                    payload = line[len("data: "):]
                    if payload == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return

                    try:
                        token = _extract_token(payload)
                        if not token:
                            continue

                        full_text += token

                      
                        if inside_think:
                            if "</think>" in full_text:
                                inside_think = False
                                full_text = full_text.split("</think>", 1)[1]
                                if full_text:
                                    yield f"data: {full_text}\n\n"
                                    full_text = ""
                            continue

                      
                        if "<think>" in full_text:
                            inside_think = True
                            before_think = full_text.split("<think>", 1)[0]
                            full_text = ""
                            if before_think:
                                yield f"data: {before_think}\n\n"
                            continue
                        encoded_token = token.replace("\n", "\\n")
                        yield f"data: {encoded_token}\n\n"
                        full_text = ""

                    except Exception:
                        continue

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
