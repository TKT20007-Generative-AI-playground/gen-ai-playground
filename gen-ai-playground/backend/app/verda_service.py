"""
Verda Cloud service for deploying and managing AI model containers.

Uses the Verda Python SDK to deploy SGLang-based LLM containers
and run inference against them.
"""
from datetime import datetime
from typing import Optional
import json
from pathlib import Path


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
    VolumeMount,
    VolumeMountType,
)
from verda.exceptions import APIException

from app.config import settings
from app.template_models import TemplateConfig


# Default model configuration
DEFAULT_MODEL = "deepseek-ai/deepseek-llm-7b-chat"
SECOND_MODEL = "Qwen/Qwen3-8B"
SGLANG_IMAGE = "docker.io/lmsysorg/sglang:v0.4.1.post6-cu124"
SGLANG_IMAGE_QWEN = "docker.io/lmsysorg/sglang:v0.5.8.post1-cu129-amd64-runtime"
DEFAULT_IMAGE =  "docker.io/lmsysorg/sglang:v0.5.6.post2-cu129-amd64"
HF_SECRET_NAME = "huggingface-token"
APP_PORT = 30000
DEFAULT_COMPUTE = "L40S"  # 48GB VRAM, good for 7B models

class NoComputeResourcesError(Exception):
    """Custom exception for no available GPU resources."""
    def __init__(self, gpu_count: int):
        super().__init__(f"No compute resources available for {gpu_count} GPUs")
      

class VerdaService:
    """
    Manages Verda container deployments for running AI text models.
    
    This service handles the full lifecycle: deploying an SGLang container
    with an LLM, checking health, running inference, and cleanup.
    """

    def __init__(self):
        self._client: Optional[VerdaClient] = None

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

    def _generate_command_from_template(self, cfg) -> list[str]:
        """Build the SGLang/vLLM launch command from a TemplateConfig."""
        host = cfg.host or "0.0.0.0"
        port = cfg.port or APP_PORT

        if cfg.engine == "sglang":
            cmd = [
                "python3", "-m", "sglang.launch_server",
                "--model-path", cfg.model,
                "--host", host,
                "--port", str(port),
            ]
            # generate CLI flags from SGLangConfig fields (model_templastes)
            # field_name -> --field-name  
            if cfg.sglang:
                for field_name, value in cfg.sglang.model_dump(exclude_none=True).items():
                    flag = f"--{field_name.replace('_', '-')}"
                    if isinstance(value, bool):
                        if value:
                            cmd.append(flag)
                    else:
                        cmd += [flag, str(value)]

            if cfg.model_loader_extra_config:
                config_json = json.dumps(cfg.model_loader_extra_config, separators=(',', ':'))
                cmd += ["--model-loader-extra-config", config_json]
            if cfg.trust_remote_code:
                cmd.append("--trust-remote-code")

            return cmd

        elif cfg.engine == "vllm":
            cmd = [
                cfg.model,
                "--host", host,
                "--port", str(port),
            ]
            if cfg.vllm:
                for field_name, value in cfg.vllm.model_dump(exclude_none=True).items():
                    flag = f"--{field_name.replace('_', '-')}"
                    if isinstance(value, bool):
                        if value:
                            cmd.append(flag)
                    else:
                        cmd += [flag, str(value)]
                if cfg.model_loader_extra_config:
                    config_json = json.dumps(cfg.model_loader_extra_config, separators=(',', ':'))
                    cmd += ["--model-loader-extra-config", config_json]
            if cfg.trust_remote_code:
                cmd.append("--trust-remote-code")
            return cmd

        elif cfg.engine == "custom":
            # Custom engine uses image entrypoint by default (no override command).
            return []

        else:
            raise RuntimeError(f"Unsupported engine: {cfg.engine}")

    def _resolve_image_from_template(self, cfg) -> str:
        """Resolve the Docker image from a TemplateConfig."""
        SGLANG_DEFAULT_IMAGE = "docker.io/lmsysorg/sglang"
        VLLM_DEFAULT_IMAGE = "docker.io/vllm/vllm-openai"
        SGLANG_DEFAULT_TAG = "v0.5.8.post1-cu129-amd64-runtime"
        VLLM_DEFAULT_TAG = "v0.13.0"

        
        if cfg.engine == "sglang":
            tag = cfg.image_tag or SGLANG_DEFAULT_TAG
            return f"{SGLANG_DEFAULT_IMAGE}:{tag}"

        elif cfg.engine == "vllm":
            tag = cfg.image_tag or VLLM_DEFAULT_TAG
            return f"{VLLM_DEFAULT_IMAGE}:{tag}"

        elif cfg.engine == "custom":
            if not cfg.custom or not cfg.custom.image:
                raise RuntimeError("No image specified for custom engine")
            image = cfg.custom.image
            if ":" not in image and cfg.image_tag:
                image = f"{image}:{cfg.image_tag}"

            # Verda rejects untagged images and the ':latest' tag.
            if "@sha256:" not in image:
                last_segment = image.rsplit("/", 1)[-1]
                if ":" not in last_segment:
                    raise RuntimeError(
                        "Custom image must include a non-latest tag or digest (example: your-repo/whisper-service:v0.1.0)."
                    )
                tag = last_segment.rsplit(":", 1)[-1].lower()
                if tag == "latest":
                    raise RuntimeError(
                        "Custom image tag ':latest' is not allowed. Use a versioned tag or digest."
                    )
            return image

        raise RuntimeError(f"Cannot resolve image for engine: {cfg.engine}")
    
    def available_models(self, template_map: Optional[dict[str, str]] = None) -> list[dict]:
        """Return template names and availability from a template map."""
        if template_map is None:
            from app.template_discovery import get_template_map
            template_map = get_template_map()

        # Fetch available resources once to avoid multiple api calls in the loop
        all_resources = self.check_compute_resources(1)

        results = []
        for template_name, display_name in template_map.items():
            cfg = self._parse_and_validate_template(template_name)
            compute_name, gpu_count = self._resolve_gpu(cfg, all_resources)
            
            supports_thinking = False
            if cfg.model_mode in {"thinking", "hybrid"}:
                supports_thinking = True
            elif cfg.sglang is not None and cfg.sglang.reasoning_parser is not None:
                supports_thinking = True
            elif cfg.vllm is not None and cfg.vllm.reasoning_parser is not None:
                supports_thinking = True

            results.append({
                "value": display_name,
                "label": display_name,
                "template": template_name,
                "tp": gpu_count,
                "availability": compute_name,
                "supports_thinking": supports_thinking,
                "model_mode": cfg.model_mode,
            })
        return results
      
    def check_compute_resources(self, size):
        """Check available compute resources for the specified template config."""
        client = self._get_client()
        
        #Temp workaround because client.containers.get_compute_resources() may contain a bug
        
        from verda.containers._containers import (
            SERVERLESS_COMPUTE_RESOURCES_ENDPOINT,   #import endpoint and ComputeResource dataclass
            ComputeResource,
        )
        
        response = client.containers.client.get(SERVERLESS_COMPUTE_RESOURCES_ENDPOINT)
    
         
        resources = []
        for item in response.json():
            if isinstance(item, list):
                for item_in_items in item:
                    resources.append(ComputeResource.from_dict(item_in_items))
            elif isinstance(item, dict):
                resources.append(ComputeResource.from_dict(item))
                
        available_resources = [r for r in resources if r.is_available and r.size >= size] # filter resources based on availability and size  
        
        return available_resources
    
    def _set_compute_name(self, cfg, available_gpu_types):
        """Determine the compute resource name based on template config and available GPU types.
        Selects cheapest option from cfg.gpu_types that is available
        """
        gpu_type_priority = ["l40s", "a100", "h100", "h200", "b200","b300"]
        for gpu_type in gpu_type_priority:
            if gpu_type in cfg.gpu_types and any(
                name.startswith(gpu_type.upper()) for name in available_gpu_types
            ):
                return gpu_type.upper()
        return "not available"
            
    def _parse_and_validate_template(self, template_json: str) -> TemplateConfig:
        """Parse and validate the template JSON config."""
        try:
            template_path = Path(__file__).resolve().parent.parent / "templates" / template_json
            cfg = TemplateConfig.model_validate_json(
                template_path.read_text(encoding="utf-8"))
        except Exception as e:
            raise RuntimeError(f"Invalid template config: {e}")
        
        return cfg
    
    def _resolve_gpu(self, cfg, resources=None):
        """ Determine GPU count and compute resource name based on template config and available resources."""
        gpu_count = 1
        if cfg.engine == "sglang" and cfg.sglang and cfg.sglang.tp:
            gpu_count = cfg.sglang.tp
        elif cfg.engine == "vllm" and cfg.vllm and cfg.vllm.tensor_parallel_size:
            gpu_count = cfg.vllm.tensor_parallel_size

        
        # resources can be passed in to avoid multiple api calls when checking all templates in available_models() 
        if resources is None:
            resources = self.check_compute_resources(gpu_count)
            
        available = [r for r in resources if r.is_available and r.size >= gpu_count]
        available_gpu_types = {r.name for r in available}

        compute_name = self._set_compute_name(cfg, available_gpu_types)
        return compute_name, gpu_count
    
    def deploy_from_template(
        self,
        template_json: str,
        deployment_name: Optional[str] = None,
        gpu_type: Optional[str] = None,
    ) -> dict:
        """
        Deploy a model from a JSON template config (TemplateConfig).

        Args:
            template_json: JSON string matching TemplateConfig schema.
            deployment_name: Custom deployment name. Auto-generated if not provided.

        Returns:
            dict with deployment info (name, status, model)
        """
        # Parse and validate template
        cfg = self._parse_and_validate_template(template_json)

        
        # Add host and port defaults, and model path 
        cfg.host = "0.0.0.0"
        if not cfg.port:
            cfg.port = 9000 if cfg.engine == "custom" else APP_PORT

        client = self._get_client()

        # Generate deployment name from template filename
        if deployment_name is None:
            from app.template_discovery import _deployment_name_from_filename
            deployment_name = _deployment_name_from_filename(template_json)      
        # ensure hf secret exists when model engine needs model downloads
        if cfg.engine in {"sglang", "vllm"}:
            self._ensure_hf_secret()
        
        # Check compute resources and determine compute name and GPU count
        compute_name, gpu_count = self._resolve_gpu(cfg)
        if compute_name == "not available":
            raise NoComputeResourcesError(gpu_count)

        # Build launch command
        cmd = self._generate_command_from_template(cfg)

        # Resolve image
        image = self._resolve_image_from_template(cfg)

        print("Deploying from template...")
        print(f"  Model: {cfg.model}")
        print(f"  Engine: {cfg.engine}")
        print(f"  Image: {image}")
        print(f"  GPU: {gpu_count} + {compute_name}")
        if cmd:
            print(f"  Command: {' '.join(cmd)}")
        else:
            print("  Command: <image default entrypoint>")

        env_vars: list[EnvVar] = []
        if cfg.engine in {"sglang", "vllm"}:
            env_vars.insert(
                0,
                EnvVar(
                    name="HF_TOKEN",
                    value_or_reference_to_secret=HF_SECRET_NAME,
                    type=EnvVarType.SECRET,
                ),
            )
            env_vars.append(
                EnvVar(
                    name="NCCL_DEBUG",
                    value_or_reference_to_secret="INFO",
                    type=EnvVarType.PLAIN,
                )
            )
        elif cfg.engine == "custom":
            custom_plain_env: dict[str, str] = {}
            if cfg.model:
                custom_plain_env["WHISPER_MODEL"] = cfg.model
            if cfg.custom and cfg.custom.env:
                custom_plain_env.update(cfg.custom.env)

            # Safety fallback: keep Whisper custom templates on GPU even if
            # a stale template payload does not include explicit env values.
            if template_json.startswith("whisper-"):
                custom_plain_env.setdefault("WHISPER_DEVICE", "cuda")
                custom_plain_env.setdefault("WHISPER_COMPUTE_TYPE", "float16")

            for env_name, env_value in custom_plain_env.items():
                env_vars.append(
                    EnvVar(
                        name=env_name,
                        value_or_reference_to_secret=str(env_value),
                        type=EnvVarType.PLAIN,
                    )
                )

        entrypoint_overrides = EntrypointOverridesSettings(
            enabled=cfg.engine != "custom",
            cmd=cmd,
        )

        volume_mounts = []
        if cfg.engine in {"sglang", "vllm"}:
            volume_mounts = [VolumeMount(
                type=VolumeMountType.MEMORY,
                mount_path="/dev/shm",
                size_in_mb=2048,
            )]

        # Build Verda container
        container = Container(
            image=image,
            exposed_port=cfg.port,
            healthcheck=HealthcheckSettings(
                enabled=True, port=cfg.port, path="/health"
            ),
            entrypoint_overrides=entrypoint_overrides,
            env=env_vars,
            volume_mounts=volume_mounts,
        )

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

        compute = ComputeResource(name=compute_name, size=gpu_count)

        deployment = Deployment(
            name=deployment_name,
            containers=[container],
            compute=compute,
            scaling=scaling_options,
            is_spot=False,
        )

        created = client.containers.create_deployment(deployment)

        print(f"Created deployment from template: {created.name}")
        return {
            "name": created.name,
            "status": "deploying",
            "model": cfg.model,
            "message": f"Deployment created from template ({cfg.engine} engine). "
                       "Model download and server startup may take several minutes.",
        }

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

        # Generate a unique deployment name if not provided
        if deployment_name is None:
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S").lower()
            deployment_name = f'{model_path.split("/")[-1].lower()}-{timestamp}'

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

        print(f"Created deployment: {created.name}")
        return {
            "name": created.name,
            "status": "deploying",
            "model": model_path,
            "message": "Deployment created. Model download and server startup may take several minutes.",
        }
        
    def deploy_second_model(
        self,
        model_path: str = SECOND_MODEL,
        deployment_name: Optional[str] = None,
    ) -> dict:
        """
        Deploy an SGLang container with the specified LLM model on Verda.
        
        Args:
            model_path: HuggingFace model identifier (e.g. 'Qwen/Qwen3-8B')
            deployment_name: Custom deployment name. Auto-generated if not provided.
            
        Returns:
            dict with deployment info (name, status, model)
        """
        client = self._get_client()

        # Generate a unique deployment name if not provided
        if deployment_name is None:
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S").lower()
            deployment_name = f'{model_path.split("/")[-1].lower()}-{timestamp}'

        # Ensure HF secret exists
        self._ensure_hf_secret()

        # Create container configuration
        # Use v0.5.8 image which natively supports Qwen3
        container = Container(
            image=SGLANG_IMAGE_QWEN,
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
                    "--trust-remote-code",
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
        print(f"Created deployment: {created.name}")
        return {
            "name": created.name,
            "status": "deploying",
            "model": model_path,
            "message": "Deployment created. Model download and server startup may take several minutes.",
        }

    def get_deployment_status(self, deployment_name: str, model_path: Optional[str] = None) -> dict:
        """
        Check the status of a specific deployment.

        Args:
            deployment_name: Name of the deployment to check.
            model_path: Optional model identifier for response metadata.

        Returns:
            dict with deployment status info
        """
        if not deployment_name:
            return {"status": "no_deployment", "message": "No deployment name provided"}

        client = self._get_client()

        try:
            status = client.containers.get_deployment_status(deployment_name)

            return {
                "name": deployment_name,
                "status": status.value,
                "model": model_path,
                "healthy": status == ContainerDeploymentStatus.HEALTHY,
            }

        except APIException as e:
            print(f"Error checking deployment status for '{deployment_name}': {e}")

            if "not_found" in str(e).lower():
                return {
                    "status": "no_deployment",
                    "message": "Deployment no longer exists"
                }

            return {
                "name": deployment_name,
                "status": "error",
                "message": str(e),
                "model": model_path,
            }

    def generate_text(
        self,
        deployment_name: str,
        model_path: str,
        prompt: str,
        max_tokens: int = 256,
        temperature: float = 0.7,
        top_p: float = 0.9,
    ) -> dict:
        """
        Generate text using a specific deployment via sync inference.
        
        Args:
            deployment_name: Name of the Verda deployment to use.
            model_path: HuggingFace model identifier the deployment is running.
            prompt: The text prompt to send to the model.
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature (0.0-2.0).
            top_p: Nucleus sampling parameter.
            
        Returns:
            dict with generated text and metadata
        """
        if not deployment_name:
            raise RuntimeError("No deployment name provided. Deploy a model first.")

        client = self._get_client()

        # Fetch the deployment object and attach inference client
        print("Running inference on deployment:", deployment_name)
        deployment = client.containers.get_deployment_by_name(deployment_name)
        if settings.VERDA_INFERENCE_KEY:
            deployment.set_inference_client(settings.VERDA_INFERENCE_KEY)
        else:
            print("No VERDA_INFERENCE_KEY set.")

        # Use OpenAI-compatible completions API (SGLang serves this)
        completions_data = {
            "model": model_path,
            "prompt": prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
        }

        response = deployment.run_sync(
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
            "model": model_path,
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
        enable_thinking: bool = False,
        supports_thinking: bool = False,
        deployment_name: str = "",
        model_path: str = "",
    ) -> dict:
        """
        Chat with a deployed model using Verdaclouds serverless containers.
        
        Args:
            messages: List of message dicts with 'role' and 'content' keys.
            max_tokens: Maximum tokens to generate.
            temperature: Sampling temperature.
            top_p: Nucleus sampling parameter.
            deployment_name: Name of the Verda deployment to target.
            model_path: HuggingFace model path for the request payload.
            
        Returns:
            dict with the assistant's reply and metadata
        """
        if not deployment_name:
            raise RuntimeError("No deployment name provided. Deploy a model first.")

        client = self._get_client()
        deployment = client.containers.get_deployment_by_name(deployment_name)
        if settings.VERDA_INFERENCE_KEY:
            deployment.set_inference_client(settings.VERDA_INFERENCE_KEY)

        chat_data = {
            "model": model_path,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "separate_reasoning": True,
        }
        if supports_thinking:
            # Different runtimes/models expect either enable_thinking or thinking.
            thinking_kwargs = {
                "enable_thinking": enable_thinking,
                "thinking": enable_thinking,
            }

            # Keep direct fields for SGLang compatibility.
            chat_data["chat_template_kwargs"] = thinking_kwargs

            # Also pass through OpenAI-style extra_body for runtimes that read overrides there.
            chat_data["extra_body"] = {
                "chat_template_kwargs": thinking_kwargs,
                "separate_reasoning": True,
            }

        response = deployment.run_sync(
            chat_data,
            path="/v1/chat/completions",
        )

        result = response.output()

        # Extract assistant message + reasoning from OpenAI-compatible response.
        assistant_message = ""
        reasoning_message: str | None = None
        if isinstance(result, dict) and "choices" in result:
            if result["choices"]:
                message = result["choices"][0].get("message", {})
                assistant_message = message.get("content") or ""

                # Prefer structured reasoning fields from runtime responses.
                reasoning = message.get("reasoning")
                if not reasoning:
                    reasoning = message.get("reasoning_content")
                if isinstance(reasoning, str) and reasoning.strip():
                    reasoning_message = reasoning.strip()

                # Fallback for runtimes that inline reasoning into content.
                if isinstance(assistant_message, str) and "<think>" in assistant_message and "</think>" in assistant_message:
                    start = assistant_message.find("<think>")
                    end = assistant_message.find("</think>", start + len("<think>"))
                    if start != -1 and end != -1:
                        inline_reasoning = assistant_message[start + len("<think>"):end].strip()
                        assistant_message = (
                            assistant_message[:start] +
                            assistant_message[end + len("</think>"):]
                        ).strip()
                        if inline_reasoning and not reasoning_message:
                            reasoning_message = inline_reasoning

                # Keep reasoning separate from final answer.
                # If the model returns only reasoning and no final content,
                # reply remains empty and reasoning is exposed via `reasoning`.

        return {
            "reply": assistant_message,
            "reasoning": reasoning_message,
            "model": model_path,
            "usage": result.get("usage", {}) if isinstance(result, dict) else {},
            "raw_response": result,
        }

    def delete_deployment(self, deployment_name: str) -> dict:
        """
        Delete a specific deployment and clean up resources.
        
        Args:
            deployment_name: Name of the deployment to delete.

        Returns:
            dict with deletion status
        """
        if not deployment_name:
            return {"status": "no_deployment", "message": "No deployment name provided"}

        client = self._get_client()
        try:
            client.containers.delete_deployment(deployment_name)
            print(f"Deleted deployment: {deployment_name}")
            return {"status": "deleted", "name": deployment_name}
        except json.JSONDecodeError as e:
            print(f"JSONDecodeError when deleting {deployment_name}: {str(e)}")
            return {
                "status": "deleted", 
                "name": deployment_name,
                "message": "Deployment not found on Verda (may have been already deleted)"
            }
        except APIException as e:
            print(f"APIException when deleting {deployment_name}: {str(e)}")
            return {"status": "error", "name": deployment_name, "message": str(e)}
        except Exception as e:
            print(f"Unexpected error when deleting {deployment_name}: {str(e)}")
            return {"status": "error", "name": deployment_name, "message": str(e)}

    def list_deployments(self) -> list[dict]:
        """List all existing container deployments."""
        try:
            client = self._get_client()
        except RuntimeError as e:
            print(f"Verda client not configured: {e}")
            return []
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
        Verify an existing deployment is reachable and return its status.
        
        Args:
            deployment_name: Name of the existing deployment.
            model_path: The model identifier the deployment is running.
            
        Returns:
            dict with connection/status info
        """
        client = self._get_client()
        try:
            client.containers.get_deployment_by_name(deployment_name)
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


# Singleton instance — now stateless, only holds shared VerdaClient
verda_service = VerdaService()
