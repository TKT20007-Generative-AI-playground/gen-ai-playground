"""Focused tests for Verda custom template deployment payload assembly."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.verda_service import VerdaService


def _ns_factory(**kwargs):
    return SimpleNamespace(**kwargs)


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
            patch.object(service, "_resolve_gpu", return_value=("L40S", 1)),
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
