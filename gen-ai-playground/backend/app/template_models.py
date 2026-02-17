
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, model_validator



# Template Config

class SGLangConfig(BaseModel):
    tp: Optional[int] = Field(default=None, ge=1)


class VLLMConfig(BaseModel):
    tensor_parallel_size: Optional[int] = Field(default=None, ge=1)


class CustomConfig(BaseModel):
    image: Optional[str] = None


class TemplateConfig(BaseModel):
    model: str
    engine: Literal["vllm", "sglang", "custom"]
    gpu_types: List[str] = Field(default_factory=list)
    image_tag: Optional[str] = None

    host: Optional[str] = None
    port: Optional[int] = None

    model_loader_extra_config: Optional[dict] = None

    sglang: Optional[SGLangConfig] = None
    vllm: Optional[VLLMConfig] = None
    custom: Optional[CustomConfig] = None

    @model_validator(mode="after")
    def validate_engine_config(self):
        if self.engine == "sglang" and not self.sglang:
            raise ValueError("sglang engine requires sglang config")
        if self.engine == "vllm" and not self.vllm:
            raise ValueError("vllm engine requires vllm config")
        if self.engine == "custom" and not self.custom:
            raise ValueError("custom engine requires custom config")
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