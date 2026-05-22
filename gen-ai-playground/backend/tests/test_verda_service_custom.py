"""Focused tests for Verda custom template deployment payload assembly."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.verda_service import VerdaService, NoComputeResourcesError


def _ns_factory(**kwargs):
    return SimpleNamespace(**kwargs)


def _make_sglang(**kwargs):
    """Create a mock sglang config with model_dump method."""
    ns = SimpleNamespace(**kwargs)
    ns.model_dump = lambda exclude_none=False: kwargs
    return ns


def _make_vllm(**kwargs):
    ns = SimpleNamespace(**kwargs)
    ns.model_dump = lambda exclude_none=False: kwargs
    return ns


def _make_api_exception(code: str, message: str):
    """Construct APIException across SDK versions with different signatures."""
    from verda.exceptions import APIException

    try:
        return APIException(code, message)
    except TypeError:
        return APIException(500, code, message)


class TestCustomTemplateDeploymentPayload:
    def test_custom_whisper_payload_sets_expected_env_and_skips_hf_secret(self):
        service = VerdaService()

        cfg = SimpleNamespace(
            engine="custom",
            model="small",
            host=None,
            port=None,
            custom=SimpleNamespace(env={"EXTRA_FLAG": "1"}),
        )

        mock_client = MagicMock()
        mock_client.containers.create_deployment.return_value = SimpleNamespace(name="whisper-faster-small-custom")

        with (
            patch.object(service, "_parse_and_validate_template", return_value=cfg),
            patch.object(service, "_get_client", return_value=mock_client),
            patch.object(service, "_resolve_gpu", return_value=("RTX PRO 6000", 1)),
            patch.object(service, "_generate_command_from_template", return_value=[]),
            patch.object(service, "_resolve_image_from_template", return_value="repo/whisper-service:v1"),
            patch.object(service, "_ensure_hf_secret") as mock_ensure_hf_secret,
            patch("app.verda_service.EnvVar", side_effect=_ns_factory),
            patch("app.verda_service.EntrypointOverridesSettings", side_effect=_ns_factory),
            patch("app.verda_service.HealthcheckSettings", side_effect=_ns_factory),
            patch("app.verda_service.ScalingPolicy", side_effect=_ns_factory),
            patch("app.verda_service.QueueLoadScalingTrigger", side_effect=_ns_factory),
            patch("app.verda_service.UtilizationScalingTrigger", side_effect=_ns_factory),
            patch("app.verda_service.ScalingTriggers", side_effect=_ns_factory),
            patch("app.verda_service.ScalingOptions", side_effect=_ns_factory),
            patch("app.verda_service.ComputeResource", side_effect=_ns_factory),
            patch("app.verda_service.Container", side_effect=_ns_factory),
            patch("app.verda_service.Deployment", side_effect=_ns_factory),
        ):
            result = service.deploy_from_template("whisper-faster-small-custom.json")

        assert result["name"] == "whisper-faster-small-custom"
        assert result["status"] == "deploying"
        assert result["model"] == "small"
        mock_ensure_hf_secret.assert_not_called()

        deployment_payload = mock_client.containers.create_deployment.call_args.args[0]
        container_payload = deployment_payload.containers[0]

        assert deployment_payload.name == "whisper-faster-small-custom"
        assert container_payload.image == "repo/whisper-service:v1"
        assert container_payload.exposed_port == 9000
        assert container_payload.entrypoint_overrides.enabled is False
        assert container_payload.entrypoint_overrides.cmd == []

        env_map = {env.name: env.value_or_reference_to_secret for env in container_payload.env}
        assert env_map["WHISPER_MODEL"] == "small"
        assert env_map["EXTRA_FLAG"] == "1"
        assert env_map["WHISPER_DEVICE"] == "cuda"
        assert env_map["WHISPER_COMPUTE_TYPE"] == "float16"
        assert "HF_TOKEN" not in env_map


class TestGenerateCommandFromTemplate:
    """Tests for _generate_command_from_template internal method."""

    def test_sglang_command_basic(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="sglang",
            model="deepseek-ai/deepseek-7b",
            host=None,
            port=None,
            sglang=_make_sglang(tp=2, context_length=4096),
            model_loader_extra_config=None,
            trust_remote_code=None,
        )
        cmd = service._generate_command_from_template(cfg)
        assert cmd == [
            "python3", "-m", "sglang.launch_server",
            "--model-path", "deepseek-ai/deepseek-7b",
            "--host", "0.0.0.0",
            "--port", "30000",
            "--tp", "2",
            "--context-length", "4096",
        ]

    def test_sglang_command_with_bool_flag(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="sglang",
            model="deepseek-ai/deepseek-7b",
            host=None,
            port=None,
            sglang=_make_sglang(trust_remote_code=True),
            model_loader_extra_config=None,
            trust_remote_code=None,
        )
        cmd = service._generate_command_from_template(cfg)
        assert "--trust-remote-code" in cmd

    def test_sglang_command_with_model_loader_extra_config(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="sglang",
            model="deepseek-ai/deepseek-7b",
            host=None,
            port=None,
            sglang=_make_sglang(),
            model_loader_extra_config={"test": True},
            trust_remote_code=None,
        )
        cmd = service._generate_command_from_template(cfg)
        assert "--model-loader-extra-config" in cmd

    def test_vllm_command_basic(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="vllm",
            model="Qwen/Qwen3-8B",
            host=None,
            port=None,
            vllm=_make_vllm(tensor_parallel_size=2, dtype="auto"),
            model_loader_extra_config=None,
            trust_remote_code=None,
            load_format=None,
            quantization=None,
            tokenizer=None,
            seed=None,
        )
        cmd = service._generate_command_from_template(cfg)
        assert "Qwen/Qwen3-8B" in cmd
        assert "--host" in cmd
        assert "--port" in cmd
        assert "--tensor-parallel-size" in cmd

    def test_vllm_command_with_quantization(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="vllm",
            model="Qwen/Qwen3-8B",
            host=None,
            port=None,
            vllm=_make_vllm(),
            model_loader_extra_config=None,
            trust_remote_code=None,
            load_format=None,
            quantization="awq",
            tokenizer=None,
            seed=None,
        )
        cmd = service._generate_command_from_template(cfg)
        assert "--quantization" in cmd
        assert "awq" in cmd

    def test_custom_engine_returns_empty_list(self):
        service = VerdaService()
        cfg = SimpleNamespace(engine="custom", host=None, port=None)
        cmd = service._generate_command_from_template(cfg)
        assert cmd == []

    def test_unsupported_engine_raises(self):
        service = VerdaService()
        cfg = SimpleNamespace(engine="unsupported", host=None, port=None)
        with pytest.raises(RuntimeError, match="Unsupported engine"):
            service._generate_command_from_template(cfg)


class TestResolveImageFromTemplate:
    """Tests for _resolve_image_from_template internal method."""

    def test_sglang_default_image(self):
        service = VerdaService()
        cfg = SimpleNamespace(engine="sglang", image_tag=None)
        image = service._resolve_image_from_template(cfg)
        assert image == "docker.io/lmsysorg/sglang:v0.5.8.post1-cu129-amd64-runtime"

    def test_sglang_custom_tag(self):
        service = VerdaService()
        cfg = SimpleNamespace(engine="sglang", image_tag="v0.4.0")
        image = service._resolve_image_from_template(cfg)
        assert image == "docker.io/lmsysorg/sglang:v0.4.0"

    def test_vllm_default_image(self):
        service = VerdaService()
        cfg = SimpleNamespace(engine="vllm", image_tag=None)
        image = service._resolve_image_from_template(cfg)
        assert image == "docker.io/vllm/vllm-openai:v0.13.0"

    def test_vllm_custom_tag(self):
        service = VerdaService()
        cfg = SimpleNamespace(engine="vllm", image_tag="v0.12.0")
        image = service._resolve_image_from_template(cfg)
        assert image == "docker.io/vllm/vllm-openai:v0.12.0"

    def test_custom_valid_tag(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="custom",
            custom=SimpleNamespace(image="my-registry/whisper-service:v0.1.0"),
            image_tag=None,
        )
        image = service._resolve_image_from_template(cfg)
        assert image == "my-registry/whisper-service:v0.1.0"

    def test_custom_sha256_digest_allowed(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="custom",
            custom=SimpleNamespace(image="my-registry/whisper-service@sha256:abc123"),
            image_tag=None,
        )
        image = service._resolve_image_from_template(cfg)
        assert image == "my-registry/whisper-service@sha256:abc123"

    def test_custom_no_tag_raises(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="custom",
            custom=SimpleNamespace(image="my-registry/whisper-service"),
            image_tag=None,
        )
        with pytest.raises(RuntimeError, match="must include a non-latest tag or digest"):
            service._resolve_image_from_template(cfg)

    def test_custom_latest_tag_raises(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="custom",
            custom=SimpleNamespace(image="my-registry/whisper-service:latest"),
            image_tag=None,
        )
        with pytest.raises(RuntimeError, match="':latest' is not allowed"):
            service._resolve_image_from_template(cfg)

    def test_custom_no_image_raises(self):
        service = VerdaService()
        cfg = SimpleNamespace(engine="custom", custom=SimpleNamespace(image=None))
        with pytest.raises(RuntimeError, match="No image specified for custom engine"):
            service._resolve_image_from_template(cfg)


class TestResolveGpu:
    """Tests for _resolve_gpu internal method."""

    def test_sglang_uses_tp_from_config(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="sglang",
            sglang=_make_sglang(tp=4),
            vllm=None,
            gpu_types=["RTX PRO 6000"],
        )
        mock_resource = SimpleNamespace(name="RTX PRO 6000", size=4, is_available=True)
        compute_name, gpu_count = service._resolve_gpu(cfg, resources=[mock_resource])
        assert gpu_count == 4
        assert compute_name == "RTX PRO 6000"

    def test_vllm_uses_tensor_parallel_size(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="vllm",
            sglang=None,
            vllm=_make_vllm(tensor_parallel_size=2),
            gpu_types=["RTX PRO 6000"],
        )
        mock_resource = SimpleNamespace(name="RTX PRO 6000", size=2, is_available=True)
        compute_name, gpu_count = service._resolve_gpu(cfg, resources=[mock_resource])
        assert gpu_count == 2

    def test_default_gpu_count_is_one(self):
        service = VerdaService()
        cfg = SimpleNamespace(engine="sglang", sglang=None, vllm=None, gpu_types=["RTX PRO 6000"])
        mock_resource = SimpleNamespace(name="RTX PRO 6000", size=1, is_available=True)
        compute_name, gpu_count = service._resolve_gpu(cfg, resources=[mock_resource])
        assert gpu_count == 1

    def test_no_available_resources_returns_not_available(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="sglang",
            sglang=None,
            vllm=None,
            gpu_types=["RTX PRO 6000"],
        )
        mock_resource = SimpleNamespace(name="A100", size=1, is_available=True)
        compute_name, gpu_count = service._resolve_gpu(cfg, resources=[mock_resource])
        assert compute_name == "not available"


class TestDeployFromTemplateEngines:
    """Tests for deploy_from_template with different engine types."""

    def test_sglang_creates_hf_secret(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="sglang",
            model="deepseek-7b",
            host="0.0.0.0",
            port=30000,
            sglang=_make_sglang(tp=1),
            custom=None,
            trust_remote_code=None,
            model_loader_extra_config=None,
            load_format=None,
            quantization=None,
            tokenizer=None,
            seed=None,
        )
        mock_client = MagicMock()
        mock_client.containers.create_deployment.return_value = SimpleNamespace(name="sglang-deepseek")

        with (
            patch.object(service, "_parse_and_validate_template", return_value=cfg),
            patch.object(service, "_get_client", return_value=mock_client),
            patch.object(service, "_resolve_gpu", return_value=("RTX PRO 6000", 1)),
            patch.object(service, "_generate_command_from_template", return_value=["python3", "-m", "sglang"]),
            patch.object(service, "_resolve_image_from_template", return_value="docker.io/lmsysorg/sglang:v0.5"),
            patch.object(service, "_ensure_hf_secret") as mock_ensure_hf,
            patch("app.verda_service.EnvVar", side_effect=_ns_factory),
            patch("app.verda_service.EntrypointOverridesSettings", side_effect=_ns_factory),
            patch("app.verda_service.HealthcheckSettings", side_effect=_ns_factory),
            patch("app.verda_service.ScalingPolicy", side_effect=_ns_factory),
            patch("app.verda_service.QueueLoadScalingTrigger", side_effect=_ns_factory),
            patch("app.verda_service.UtilizationScalingTrigger", side_effect=_ns_factory),
            patch("app.verda_service.ScalingTriggers", side_effect=_ns_factory),
            patch("app.verda_service.ScalingOptions", side_effect=_ns_factory),
            patch("app.verda_service.ComputeResource", side_effect=_ns_factory),
            patch("app.verda_service.Container", side_effect=_ns_factory),
            patch("app.verda_service.Deployment", side_effect=_ns_factory),
            patch("app.verda_service.VolumeMount", side_effect=_ns_factory),
            patch("app.verda_service.VolumeMountType", side_effect=_ns_factory),
        ):
            service.deploy_from_template("deepseek-sglang-fp8.json")

        mock_ensure_hf.assert_called_once()

    def test_vllm_creates_hf_secret(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="vllm",
            model="Qwen3-8B",
            host="0.0.0.0",
            port=30000,
            vllm=_make_vllm(tensor_parallel_size=1),
            custom=None,
            trust_remote_code=None,
            model_loader_extra_config=None,
            load_format=None,
            quantization=None,
            tokenizer=None,
            seed=None,
        )
        mock_client = MagicMock()
        mock_client.containers.create_deployment.return_value = SimpleNamespace(name="vllm-qwen")

        with (
            patch.object(service, "_parse_and_validate_template", return_value=cfg),
            patch.object(service, "_get_client", return_value=mock_client),
            patch.object(service, "_resolve_gpu", return_value=("RTX PRO 6000", 1)),
            patch.object(service, "_generate_command_from_template", return_value=["python3", "-m", "vllm"]),
            patch.object(service, "_resolve_image_from_template", return_value="docker.io/vllm/vllm-openai:v0.13"),
            patch.object(service, "_ensure_hf_secret") as mock_ensure_hf,
            patch("app.verda_service.EnvVar", side_effect=_ns_factory),
            patch("app.verda_service.EntrypointOverridesSettings", side_effect=_ns_factory),
            patch("app.verda_service.HealthcheckSettings", side_effect=_ns_factory),
            patch("app.verda_service.ScalingPolicy", side_effect=_ns_factory),
            patch("app.verda_service.QueueLoadScalingTrigger", side_effect=_ns_factory),
            patch("app.verda_service.UtilizationScalingTrigger", side_effect=_ns_factory),
            patch("app.verda_service.ScalingTriggers", side_effect=_ns_factory),
            patch("app.verda_service.ScalingOptions", side_effect=_ns_factory),
            patch("app.verda_service.ComputeResource", side_effect=_ns_factory),
            patch("app.verda_service.Container", side_effect=_ns_factory),
            patch("app.verda_service.Deployment", side_effect=_ns_factory),
            patch("app.verda_service.VolumeMount", side_effect=_ns_factory),
            patch("app.verda_service.VolumeMountType", side_effect=_ns_factory),
        ):
            service.deploy_from_template("qwen-vllm.json")

        mock_ensure_hf.assert_called_once()

    def test_no_compute_resources_raises(self):
        service = VerdaService()
        cfg = SimpleNamespace(
            engine="sglang",
            model="big-model",
            host="0.0.0.0",
            port=30000,
            sglang=_make_sglang(tp=8),
            custom=None,
            trust_remote_code=None,
            model_loader_extra_config=None,
            load_format=None,
            quantization=None,
            tokenizer=None,
            seed=None,
        )
        mock_client = MagicMock()

        with (
            patch.object(service, "_parse_and_validate_template", return_value=cfg),
            patch.object(service, "_get_client", return_value=mock_client),
            patch.object(service, "_resolve_gpu", return_value=("not available", 8)),
            patch.object(service, "_ensure_hf_secret"),
            patch("app.verda_service.EnvVar", side_effect=_ns_factory),
            patch("app.verda_service.EntrypointOverridesSettings", side_effect=_ns_factory),
            patch("app.verda_service.HealthcheckSettings", side_effect=_ns_factory),
            patch("app.verda_service.ScalingPolicy", side_effect=_ns_factory),
            patch("app.verda_service.QueueLoadScalingTrigger", side_effect=_ns_factory),
            patch("app.verda_service.UtilizationScalingTrigger", side_effect=_ns_factory),
            patch("app.verda_service.ScalingTriggers", side_effect=_ns_factory),
            patch("app.verda_service.ScalingOptions", side_effect=_ns_factory),
            patch("app.verda_service.ComputeResource", side_effect=_ns_factory),
            patch("app.verda_service.Container", side_effect=_ns_factory),
            patch("app.verda_service.Deployment", side_effect=_ns_factory),
        ):
            with pytest.raises(NoComputeResourcesError, match="No compute resources available for 8 GPUs"):
                service.deploy_from_template("big-model.json")


class TestGetDeploymentStatus:
    """Tests for get_deployment_status method."""

    def test_returns_status_on_success(self):
        service = VerdaService()
        mock_client = MagicMock()
        from app.verda_service import ContainerDeploymentStatus as ServiceContainerDeploymentStatus

        mock_client.containers.get_deployment_status.return_value = ServiceContainerDeploymentStatus.HEALTHY

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.get_deployment_status("my-deployment", "deepseek-7b")

        assert result["status"] == "healthy"
        assert result["name"] == "my-deployment"
        assert result["model"] == "deepseek-7b"
        # healthy status should make healthy=True
        assert result["healthy"] is True

    def test_not_found_returns_no_deployment(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_client.containers.get_deployment_status.side_effect = _make_api_exception(
            "not_found",
            "deployment not found",
        )

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.get_deployment_status("nonexistent", "model")

        assert result["status"] == "no_deployment"
        assert result["message"] == "Deployment no longer exists"

    def test_other_api_exception_returns_error(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_client.containers.get_deployment_status.side_effect = _make_api_exception(
            "internal_error",
            "internal server error",
        )

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.get_deployment_status("broken", "model")

        assert result["status"] == "error"
        assert "internal server error" in result["message"]

    def test_empty_deployment_name_returns_no_deployment(self):
        service = VerdaService()
        result = service.get_deployment_status("", "model")
        assert result["status"] == "no_deployment"


class TestDeleteDeployment:
    """Tests for delete_deployment method."""

    def test_deletes_successfully(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_client.containers.delete_deployment.return_value = None

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.delete_deployment("my-deployment")

        assert result["status"] == "deleted"
        assert result["name"] == "my-deployment"
        mock_client.containers.delete_deployment.assert_called_once_with("my-deployment")

    def test_json_decode_error_returns_deleted(self):
        service = VerdaService()
        mock_client = MagicMock()
        import json
        mock_client.containers.delete_deployment.side_effect = json.JSONDecodeError("", "", 0)

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.delete_deployment("already-gone")

        assert result["status"] == "deleted"
        assert "may have been already deleted" in result["message"]

    def test_api_exception_returns_error(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_client.containers.delete_deployment.side_effect = _make_api_exception(
            "internal_error",
            "some error",
        )

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.delete_deployment("broken")

        assert result["status"] == "error"
        assert "some error" in result["message"]

    def test_generic_exception_returns_error(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_client.containers.delete_deployment.side_effect = RuntimeError("unexpected")

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.delete_deployment("boom")

        assert result["status"] == "error"
        assert result["message"] == "unexpected"

    def test_empty_name_returns_no_deployment(self):
        service = VerdaService()
        result = service.delete_deployment("")
        assert result["status"] == "no_deployment"


class TestListDeployments:
    """Tests for list_deployments method."""

    def test_returns_deployments(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_dep1 = MagicMock()
        mock_dep1.name = "deployment-1"
        mock_dep1.created_at = "2024-01-01"
        mock_dep1.endpoint_base_url = "https://example.com"
        mock_client.containers.get_deployments.return_value = [mock_dep1]

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.list_deployments()

        assert len(result) == 1
        assert result[0]["name"] == "deployment-1"

    def test_runtime_error_from_get_client_returns_empty_list(self):
        service = VerdaService()

        with patch.object(service, "_get_client", side_effect=RuntimeError("not configured")):
            result = service.list_deployments()

        assert result == []

    def test_api_exception_returns_error_list(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_client.containers.get_deployments.side_effect = _make_api_exception(
            "internal_error",
            "api error",
        )

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.list_deployments()

        assert len(result) == 1
        assert "error" in result[0]
        assert "api error" in result[0]["error"]


class TestChatReasoningExtraction:
    """Tests for chat method reasoning extraction."""

    def test_reasoning_extracted_from_reasoning_field(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_deployment = MagicMock()
        mock_response = MagicMock()
        mock_response.output.return_value = {
            "choices": [{
                "message": {
                    "content": "The answer is 42",
                    "reasoning": "Let me work through this step by step",
                }
            }]
        }
        mock_deployment.run_sync.return_value = mock_response
        mock_client.containers.get_deployment_by_name.return_value = mock_deployment

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.chat(
                messages=[{"role": "user", "content": "what is 6 * 7?"}],
                deployment_name="test-deploy",
                model_path="test-model",
                enable_thinking=True,
                supports_thinking=True,
            )

        assert result["reply"] == "The answer is 42"
        assert result["reasoning"] == "Let me work through this step by step"

    def test_reasoning_extracted_from_reasoning_content_field(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_deployment = MagicMock()
        mock_response = MagicMock()
        mock_response.output.return_value = {
            "choices": [{
                "message": {
                    "content": "The answer is 42",
                    "reasoning_content": "Working through the problem",
                }
            }]
        }
        mock_deployment.run_sync.return_value = mock_response
        mock_client.containers.get_deployment_by_name.return_value = mock_deployment

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.chat(
                messages=[{"role": "user", "content": "what is 6 * 7?"}],
                deployment_name="test-deploy",
                model_path="test-model",
            )

        assert result["reasoning"] == "Working through the problem"

    def test_inline_reasoning_extraction(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_deployment = MagicMock()
        mock_response = MagicMock()
        mock_response.output.return_value = {
            "choices": [{
                "message": {
                    "content": "<think>Let me calculate: 6*7=42</think>The answer is 42",
                }
            }]
        }
        mock_deployment.run_sync.return_value = mock_response
        mock_client.containers.get_deployment_by_name.return_value = mock_deployment

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.chat(
                messages=[{"role": "user", "content": "what is 6 * 7?"}],
                deployment_name="test-deploy",
                model_path="test-model",
            )

        assert result["reply"] == "The answer is 42"
        assert result["reasoning"] == "Let me calculate: 6*7=42"

    def test_no_reasoning_returns_none(self):
        service = VerdaService()
        mock_client = MagicMock()
        mock_deployment = MagicMock()
        mock_response = MagicMock()
        mock_response.output.return_value = {
            "choices": [{
                "message": {
                    "content": "The answer is 42",
                }
            }]
        }
        mock_deployment.run_sync.return_value = mock_response
        mock_client.containers.get_deployment_by_name.return_value = mock_deployment

        with patch.object(service, "_get_client", return_value=mock_client):
            result = service.chat(
                messages=[{"role": "user", "content": "what is 6 * 7?"}],
                deployment_name="test-deploy",
                model_path="test-model",
            )

        assert result["reply"] == "The answer is 42"
        assert result["reasoning"] is None

    def test_empty_deployment_name_raises(self):
        service = VerdaService()
        with pytest.raises(RuntimeError, match="No deployment name provided"):
            service.chat(messages=[{"role": "user", "content": "hi"}], deployment_name="")