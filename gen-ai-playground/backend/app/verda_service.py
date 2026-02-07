"""
Verda Cloud service for deploying and managing AI model containers.

Uses the Verda Python SDK to deploy SGLang-based LLM containers
and run inference against them.
"""
import time
from datetime import datetime
from typing import Optional

from verda import VerdaClient
from verda.containers import (
    ComputeResource,
    Container,
    ContainerDeploymentStatus,
    Deployment,
    EntrypointOverridesSettings,
    EnvVar,
    EnvVarType,
    HealthcheckSettings,
    QueueLoadScalingTrigger,
    ScalingOptions,
    ScalingPolicy,
    ScalingTriggers,
    UtilizationScalingTrigger,
)
from verda.exceptions import APIException

from app.config import settings


# Default model configuration
DEFAULT_MODEL = "deepseek-ai/deepseek-llm-7b-chat"
SGLANG_IMAGE = "docker.io/lmsysorg/sglang:v0.4.1.post6-cu124"
HF_SECRET_NAME = "huggingface-token"
APP_PORT = 30000
DEFAULT_COMPUTE = "L40S"  # 48GB VRAM, good for 7B models


class VerdaService:
    """
    Manages Verda container deployments for running AI text models.
    
    This service handles the full lifecycle: deploying an SGLang container
    with an LLM, checking health, running inference, and cleanup.
    """

    def __init__(self):
        self._client: Optional[VerdaClient] = None
        self._deployment: Optional[Deployment] = None
        self._deployment_name: Optional[str] = None
        self._model_path: str = DEFAULT_MODEL
        self._initialized = False

    def _get_client(self) -> VerdaClient:
        """Get or create the Verda API client."""
        if self._client is None:
            if not settings.VERDA_CLIENT_ID or not settings.VERDA_CLIENT_SECRET:
                raise RuntimeError(
                    "VERDA_CLIENT_ID and VERDA_CLIENT_SECRET must be set in environment"
                )
            self._client = VerdaClient(
                client_id=settings.VERDA_CLIENT_ID,
                client_secret=settings.VERDA_CLIENT_SECRET,
                inference_key=settings.VERDA_INFERENCE_KEY,
            )
        return self._client

    def _ensure_hf_secret(self) -> None:
        """Ensure the HuggingFace token secret exists on Verda."""
        client = self._get_client()
        try:
            existing_secrets = client.containers.get_secrets()
            secret_exists = any(
                secret.name == HF_SECRET_NAME for secret in existing_secrets
            )
            if not secret_exists:
                if not settings.HF_TOKEN:
                    raise RuntimeError(
                        "HF_TOKEN must be set in environment to create HuggingFace secret"
                    )
                client.containers.create_secret(HF_SECRET_NAME, settings.HF_TOKEN)
                print(f"Created HuggingFace secret: {HF_SECRET_NAME}")
            else:
                print(f"HuggingFace secret '{HF_SECRET_NAME}' already exists")
        except APIException as e:
            raise RuntimeError(f"Failed to manage HuggingFace secret: {e}")

    def deploy_model(
        self,
        model_path: str = DEFAULT_MODEL,
        deployment_name: Optional[str] = None,
    ) -> dict:
        """
        Deploy an SGLang container with the specified LLM model on Verda.
        
        Args:
            model_path: HuggingFace model identifier (e.g. 'deepseek-ai/deepseek-llm-7b-chat')
            deployment_name: Custom deployment name. Auto-generated if not provided.
            
        Returns:
            dict with deployment info (name, status, model)
        """
        client = self._get_client()
        self._model_path = model_path

        # Generate a unique deployment name if not provided
        if deployment_name is None:
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S").lower()
            deployment_name = f"genai-playground-{timestamp}"
        self._deployment_name = deployment_name

        # Ensure HF secret exists
        self._ensure_hf_secret()

        # Create container configuration
        container = Container(
            image=SGLANG_IMAGE,
            exposed_port=APP_PORT,
            healthcheck=HealthcheckSettings(
                enabled=True, port=APP_PORT, path="/health"
            ),
            entrypoint_overrides=EntrypointOverridesSettings(
                enabled=True,
                cmd=[
                    "python3",
                    "-m",
                    "sglang.launch_server",
                    "--model-path",
                    model_path,
                    "--host",
                    "0.0.0.0",
                    "--port",
                    str(APP_PORT),
                ],
            ),
            env=[
                EnvVar(
                    name="HF_TOKEN",
                    value_or_reference_to_secret=HF_SECRET_NAME,
                    type=EnvVarType.SECRET,
                )
            ],
        )

        # Create scaling configuration (minimal for dev/playground use)
        scaling_options = ScalingOptions(
            min_replica_count=1,
            max_replica_count=3,
            scale_down_policy=ScalingPolicy(delay_seconds=300),
            scale_up_policy=ScalingPolicy(delay_seconds=0),
            queue_message_ttl_seconds=500,
            concurrent_requests_per_replica=32,
            scaling_triggers=ScalingTriggers(
                queue_load=QueueLoadScalingTrigger(threshold=1),
                cpu_utilization=UtilizationScalingTrigger(
                    enabled=True, threshold=90
                ),
                gpu_utilization=UtilizationScalingTrigger(
                    enabled=True, threshold=90
                ),
            ),
        )

        # General Compute = 24GB VRAM, sufficient for 7B models
        compute = ComputeResource(name=DEFAULT_COMPUTE, size=1)

        # Create deployment
        deployment = Deployment(
            name=deployment_name,
            containers=[container],
            compute=compute,
            scaling=scaling_options,
            is_spot=False,
        )

        created = client.containers.create_deployment(deployment)
        self._deployment = created
        self._initialized = True

        print(f"Created deployment: {created.name}")
        return {
            "name": created.name,
            "status": "deploying",
            "model": model_path,
            "message": "Deployment created. Model download and server startup may take several minutes.",
        }

    def get_deployment_status(self) -> dict:
        """
        Check the current status of the active deployment.
        
        Returns:
            dict with deployment name and status
        """
        if not self._deployment_name:
            return {"status": "no_deployment", "message": "No active deployment"}

        client = self._get_client()
        try:
            status = client.containers.get_deployment_status(self._deployment_name)
            return {
                "name": self._deployment_name,
                "status": status.value,
                "model": self._model_path,
                "healthy": status == ContainerDeploymentStatus.HEALTHY,
            }
        except APIException as e:
            print(f"Error checking deployment status for '{self._deployment_name}': {e}")
            return {
                "name": self._deployment_name,
                "status": "error",
                "message": str(e),
                "model": self._model_path,
            }

    def generate_text(
        self,
        prompt: str,
        max_tokens: int = 256,
        temperature: float = 0.7,
        top_p: float = 0.9,
    ) -> dict:
        """
        Generate text using the deployed model via sync inference.
        
        Args:
            prompt: The text prompt to send to the model.
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature (0.0-2.0).
            top_p: Nucleus sampling parameter.
            
        Returns:
            dict with generated text and metadata
        """
        if not self._deployment_name:
            raise RuntimeError("No active deployment. Deploy a model first.")

        client = self._get_client()

        # Refresh the deployment object to get the inference client
        self._deployment = client.containers.get_deployment_by_name(
            self._deployment_name
        )

        # Use OpenAI-compatible completions API (SGLang serves this)
        completions_data = {
            "model": self._model_path,
            "prompt": prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
        }

        response = self._deployment.run_sync(
            completions_data,
            path="/v1/completions",
        )

        result = response.output()
        
        # Extract generated text from the OpenAI-compatible response
        generated_text = ""
        if isinstance(result, dict) and "choices" in result:
            if result["choices"]:
                generated_text = result["choices"][0].get("text", "")

        return {
            "generated_text": generated_text,
            "model": self._model_path,
            "prompt": prompt,
            "usage": result.get("usage", {}) if isinstance(result, dict) else {},
            "raw_response": result,
        }

    def chat(
        self,
        messages: list[dict],
        max_tokens: int = 256,
        temperature: float = 0.7,
        top_p: float = 0.9,
    ) -> dict:
        """
        Chat with the deployed model using the OpenAI-compatible chat API.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys.
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature.
            top_p: Nucleus sampling parameter.
            
        Returns:
            dict with the assistant's reply and metadata
        """
        if not self._deployment_name:
            raise RuntimeError("No active deployment. Deploy a model first.")

        client = self._get_client()
        self._deployment = client.containers.get_deployment_by_name(
            self._deployment_name
        )

        chat_data = {
            "model": self._model_path,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
        }

        response = self._deployment.run_sync(
            chat_data,
            path="/v1/chat/completions",
        )

        result = response.output()

        # Extract assistant message from OpenAI-compatible response
        assistant_message = ""
        if isinstance(result, dict) and "choices" in result:
            if result["choices"]:
                message = result["choices"][0].get("message", {})
                assistant_message = message.get("content", "")

        return {
            "reply": assistant_message,
            "model": self._model_path,
            "usage": result.get("usage", {}) if isinstance(result, dict) else {},
            "raw_response": result,
        }

    def delete_deployment(self) -> dict:
        """
        Delete the active deployment and clean up resources.
        
        Returns:
            dict with deletion status
        """
        if not self._deployment_name:
            return {"status": "no_deployment", "message": "No active deployment to delete"}

        client = self._get_client()
        name = self._deployment_name
        try:
            client.containers.delete_deployment(name)
            self._deployment = None
            self._deployment_name = None
            self._initialized = False
            print(f"Deleted deployment: {name}")
            return {"status": "deleted", "name": name}
        except APIException as e:
            return {"status": "error", "name": name, "message": str(e)}

    def list_deployments(self) -> list[dict]:
        """List all existing container deployments."""
        client = self._get_client()
        try:
            deployments = client.containers.get_deployments()
            return [
                {
                    "name": d.name,
                    "created_at": d.created_at,
                    "endpoint_url": d.endpoint_base_url,
                }
                for d in deployments
            ]
        except APIException as e:
            return [{"error": str(e)}]

    def connect_to_existing(self, deployment_name: str, model_path: str = DEFAULT_MODEL) -> dict:
        """
        Connect to an already-running deployment instead of creating a new one.
        
        Args:
            deployment_name: Name of the existing deployment.
            model_path: The model identifier the deployment is running.
            
        Returns:
            dict with connection status
        """
        client = self._get_client()
        try:
            self._deployment = client.containers.get_deployment_by_name(deployment_name)
            self._deployment_name = deployment_name
            self._model_path = model_path
            self._initialized = True
            status = client.containers.get_deployment_status(deployment_name)
            return {
                "name": deployment_name,
                "status": status.value,
                "model": model_path,
                "healthy": status == ContainerDeploymentStatus.HEALTHY,
                "message": "Connected to existing deployment",
            }
        except APIException as e:
            return {"status": "error", "message": str(e)}


# Singleton instance used across the app
verda_service = VerdaService()
