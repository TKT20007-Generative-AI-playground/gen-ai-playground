"""
Text generation routes using Verda container deployments.

Provides endpoints to deploy an LLM on Verda, check deployment status,
generate text completions, chat with the model, and clean up.
"""
import math
import secrets
from fastapi import APIRouter, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect
from pymongo.database import Database
from datetime import datetime, timezone
from typing import Optional
import time
from bson import ObjectId
import asyncio


from app.database import get_database
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
)
from app.verda_service import verda_service
from app.template_discovery import get_template_map, _deployment_name_from_filename
from verda.containers import ContainerDeploymentStatus
from app.connection_manager import ConnectionManager


def _sanitize_slug(model_path: str) -> str:
    """Convert a model path to a deployment-name-compatible slug."""
    return model_path.split("/")[-1].lower().replace(".", "-")

manager = ConnectionManager()

router = APIRouter(
    prefix="/text",
    tags=["text"],
)

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
    for template_name, display_name in get_template_map().items():
        if display_name == model:
            cfg = verda_service._parse_and_validate_template(template_name)
            return cfg.model

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
                    for tpl in get_template_map():
                        try:
                            if _deployment_name_from_filename(tpl) == d["name"].lower():
                                cfg = verda_service._parse_and_validate_template(tpl)
                                used_model_path = cfg.model
                                break
                        except Exception:
                            continue
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

    # Chat
    try:
        chat_start_time = time.perf_counter()
        result = verda_service.chat(
            messages=[msg.model_dump() for msg in request.messages],
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
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
    current_user: UserInfo = Depends(get_current_user),
    db: Database = Depends(get_database),
):
    records = list(
        db.text_generations.find(
            {"username": current_user.username}
        ).sort("timestamp", -1)
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

    doc = {
        "title": conversation.title or "Untitled Conversation",
        "participants": participants,
        "messages": initial_messages,
        "created_by": username,
        "invite_code": secrets.token_hex(8),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = db.conversations.insert_one(doc)

    return {
        "conversation_id": str(result.inserted_id),
        "participants": participants,
        "title": doc["title"],
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
    conversation = db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if cur_user.username not in conversation["participants"]:
        if body.get("invite_code") != conversation.get("invite_code"):
            raise HTTPException(status_code=403, detail="Invalid invite code")

    db.conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$addToSet": {"participants": cur_user.username}},
    )
    return {"ok": True}


@router.get("/conversations/{conversation_id}/check-participant")
def check_participant(
    conversation_id: str,
    db=Depends(get_database),
    cur_user: UserInfo = Depends(get_current_user),
):
    conversation = db.conversations.find_one({"_id": ObjectId(conversation_id)})
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
    conversation = db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if cur_user.username not in conversation["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant of this conversation")

    return {
        "messages": conversation.get("messages", []),
        "title": conversation.get("title", "Untitled Conversation"),
    }
    

@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_ws(websocket: WebSocket, conversation_id: str, db=Depends(get_database)):
    await websocket.accept()

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

    conversation = db.conversations.find_one({"_id": ObjectId(conversation_id)})
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
                {"_id": ObjectId(conversation_id)},
                {"$push": {"messages": user_message}},
            )

         
            # Broadcast user message to other participants
            
            await manager.broadcast(
                conversation_id,
                {
                    "type": "message",
                    **user_message,
                },
            )

            # generate       
            asyncio.create_task(
                handle_llm_reply(
                    conversation_id,
                    model_key,
                    db,
                    user,
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
    db: Database,
    user: UserInfo
):
    try:
        # Fetch conversation
        conversation = db.conversations.find_one(
        {"_id": ObjectId(conversation_id)}  
        )

        if not conversation:
            return

        messages = conversation.get("messages", [])

        await manager.broadcast(
            conversation_id,
            {
                "type": "assistant_typing",
            },
        )
        assistant_text = ""

        async for chunk in llm_stream(
            model=model_key,
            messages=messages,
            user=user.username,
        ):
            assistant_text += chunk

            await manager.broadcast(
                conversation_id,
                {
                    "type": "assistant_stream",
                    "delta": chunk,
                },
            )

        #save assistant message
        assistant_message = {
            "role": "assistant",
            "content": assistant_text,
        }

        db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$push": {"messages": assistant_message}},
        )

        #final message event
        await manager.broadcast(
            conversation_id,
            {
                "type": "assistant_done",
                "message": assistant_message,
            },
        )

    except Exception as e:
        await manager.broadcast(
            conversation_id,
            {
                "type": "error",
                "message": str(e),
            },
        )
        
async def llm_stream(model: str, messages: list, user: str):

    # fake streaming 
    text = "Hello! This is a streamed response."

    for token in text.split():
        await asyncio.sleep(0.05)
        yield token + " "



    
    
    
    
    
    
    
