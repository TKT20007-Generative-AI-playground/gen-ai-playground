
import re
from typing import Dict, List, Optional, Literal
from pydantic import BaseModel, Field, model_validator



# Template Config

class SGLangConfig(BaseModel):
    #TODO: Add valid values maybe ?
    #TODO: needs testing
    tp: Optional[int] = Field(default=None, ge=1)
    dp: Optional[int] = Field(default=None, ge=1)
    enable_dp_attention : Optional[bool] = None
    ep: Optional[int] = Field(default=None, ge=1)
    mem_fraction_static: Optional[float] = Field(default=None, ge=0.0, le=1.0) 
    kv_cache_dtype: Optional[str] = None
    context_length: Optional[int] = Field(default=None, ge=1)
    max_running_requests: Optional[int] = Field(default=None, ge=1)
    reasoning_parser: Optional[str] = None
    tool_call_parser: Optional[str] = None
    chat_template: Optional[str] = None
    disable_shared_experts_fusion: Optional[bool] = None
    speculative_algorithm: Optional[str] = None
    speculative_num_steps: Optional[int] = Field(default=None, ge=1) # typical val 3
    speculative_eagle_topk: Optional[int] = Field(default=None, ge=1)
    speculative_num_draft_tokens: Optional[int] = Field(default=None, ge=1)
    speculative_draft_model_path: Optional[str] = None
    pp: Optional[int] = Field(default=None, ge=1) # SGLang pipeline_parallel_size
    schedule_policy: Optional[str] = None
    disable_radix_cache: Optional[bool] = None
    disable_cuda_graph: Optional[bool] = None 
    
    
    @model_validator(mode="after")
    # This is needed to ensure that if dp > 1, then enable_dp_attention must be True
    def check_if_dp_is_valid(self):
        if self.dp and self.dp > 1:
            # External templates may omit this; default it to the only valid setting.
            if self.enable_dp_attention is None:
                self.enable_dp_attention = True
            elif self.enable_dp_attention is False:
                raise ValueError("enable_dp_attention must be True when dp > 1")
        return self
    
    
    


class VLLMConfig(BaseModel):
    tensor_parallel_size: Optional[int] = Field(default=None, ge=1)
    pipeline_parallel_size: Optional[int] = Field(default=None, ge=1)
    dtype: Optional[str] = None # deafault "auto" (infers from model)
    max_model_len: Optional[int] = Field(default=None, ge=1)
    gpu_memory_utilization: Optional[float] = Field(default=None, ge=0.0, le=1.0) # default 0.9
    max_num_seqs: Optional[int] = Field(default=None, ge=1)
    enable_prefix_caching: Optional[bool] = None
    enable_chunked_prefill: Optional[bool] = None
    enforce_eager: Optional[bool] = None
    served_model_name: Optional[str] = None
    data_parallel_size: Optional[int] = Field(default=None, ge=1)
    distributed_executor_backend: Optional[str] = None
    swap_space: Optional[int] = Field(default=None, ge=1)
    max_num_batched_tokens: Optional[int] = Field(default=None, ge=1)
    scheduling_policy: Optional[str] = None
    reasoning_parser: Optional[str] = None
    
    


class CustomConfig(BaseModel):
    image: Optional[str] = None
    env: Optional[Dict[str, str]] = None

    @model_validator(mode="after")
    def validate_env_keys(self):
        if not self.env:
            return self

        env_name_pattern = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
        for env_name in self.env.keys():
            if not env_name_pattern.match(env_name):
                raise ValueError(
                    f"custom.env contains invalid key '{env_name}'. "
                    "Env var names must match [A-Za-z_][A-Za-z0-9_]*"
                )
        return self


class TemplateConfig(BaseModel):
    # Common Fields (All Engines)
    engine: Literal["vllm", "sglang", "custom"]
    model: str
    name: Optional[str] = None
    display_name: Optional[str] = None
    explanation: Optional[str] = None
    short_explanation: Optional[str] = None
    model_mode: Optional[Literal["thinking", "hybrid", "instruct", "vision"]] = None
    trust_remote_code: Optional[bool] = None
    quantization: Optional[str] = None
    gpu_types: List[str] = Field(default_factory=list)
    load_format: Optional[str] = None
    model_loader_extra_config: Optional[dict] = None
    seed: Optional[int] = None
    tokenizer: Optional[str] = None
    image_tag: Optional[str] = None
    
    # Engine specific configs
    sglang: Optional[SGLangConfig] = None
    vllm: Optional[VLLMConfig] = None
    custom: Optional[CustomConfig] = None
    
    host: Optional[str] = None
    port: Optional[int] = None
    
    @model_validator(mode="after")
    def validate_engine_config(self):
        if self.engine == "sglang" and not self.sglang:
            raise ValueError("sglang engine requires sglang config")
        if self.engine == "vllm" and not self.vllm:
            raise ValueError("vllm engine requires vllm config")
        if self.engine == "custom" and not self.custom:
            raise ValueError("custom engine requires custom config")
        if self.engine == "custom" and self.custom and not self.custom.image:
            raise ValueError("custom engine requires custom.image")
        if self.engine == "custom" and self.custom and self.custom.image:
            image = self.custom.image
            if "@sha256:" not in image:
                last_segment = image.rsplit("/", 1)[-1]
                if ":" not in last_segment:
                    raise ValueError("custom.image must include a non-latest tag or digest")
                tag = last_segment.rsplit(":", 1)[-1].lower()
                if tag == "latest":
                    raise ValueError("custom.image tag ':latest' is not allowed")
        return self


class ScalingPolicy(BaseModel):
    delay_seconds: int


class QueueLoadTrigger(BaseModel):
    threshold: int


class ScalingTriggers(BaseModel):
    queue_load: QueueLoadTrigger


class ContainerScalingOptions(BaseModel):
    min_replica_count: int
    max_replica_count: int
    scale_down_policy: ScalingPolicy
    scale_up_policy: ScalingPolicy
    queue_message_ttl_seconds: int
    concurrent_requests_per_replica: int
    scaling_triggers: ScalingTriggers


class ContainerHealthcheck(BaseModel):
    enabled: bool
    port: int
    path: str


class ContainerEntrypointOverrides(BaseModel):
    enabled: bool
    cmd: List[str]


class CreateDeploymentContainer(BaseModel):
    image: str
    exposed_port: int
    healthcheck: ContainerHealthcheck
    env: List[dict]
    entrypoint_overrides: ContainerEntrypointOverrides


class ContainerCompute(BaseModel):
    name: str
    size: int


class ContainerRegistrySettings(BaseModel):
    is_private: bool


class CreateDeploymentRequest(BaseModel):
    name: str
    is_spot: bool
    compute: ContainerCompute
    container_registry_settings: ContainerRegistrySettings
    scaling: ContainerScalingOptions
    containers: List[CreateDeploymentContainer]