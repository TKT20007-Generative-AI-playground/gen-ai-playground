"""Focused helper and async workflow tests for text router."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import mongomock
import pytest
from fastapi import HTTPException

from app.models import UserInfo
from app.routers import text as text_router


@pytest.fixture
def mock_db():
    return mongomock.MongoClient()["gen_ai_playground"]


class TestTextHelpers:
    def test_sanitize_slug(self):
        assert text_router._sanitize_slug("org/Model.Name") == "model-name"

    def test_parse_conversation_object_id_invalid(self):
        with pytest.raises(HTTPException) as exc:
            text_router._parse_conversation_object_id("bad-id")
        assert exc.value.status_code == 400

    def test_resolve_template_name(self, monkeypatch):
        monkeypatch.setattr(text_router, "get_template_map", lambda: {"a.json": "Model A"})
        assert text_router._resolve_template_name("Model A") == "a.json"
        assert text_router._resolve_template_name("Unknown") is None

    def test_model_supports_thinking_branches(self, monkeypatch):
        cfg_thinking = SimpleNamespace(model_mode="thinking", sglang=None, vllm=None)
        cfg_sglang = SimpleNamespace(
            model_mode="instruct",
            sglang=SimpleNamespace(reasoning_parser="rp"),
            vllm=None,
        )
        cfg_vllm = SimpleNamespace(
            model_mode="instruct",
            sglang=None,
            vllm=SimpleNamespace(reasoning_parser="rp"),
        )
        cfg_plain = SimpleNamespace(
            model_mode="instruct",
            sglang=SimpleNamespace(reasoning_parser=None),
            vllm=SimpleNamespace(reasoning_parser=None),
        )

        monkeypatch.setattr(
            text_router,
            "get_template_configs",
            lambda: {
                "thinking.json": cfg_thinking,
                "sglang.json": cfg_sglang,
                "vllm.json": cfg_vllm,
                "plain.json": cfg_plain,
            },
        )

        assert text_router._model_supports_thinking(None) is False
        assert text_router._model_supports_thinking("missing.json") is False
        assert text_router._model_supports_thinking("thinking.json") is True
        assert text_router._model_supports_thinking("sglang.json") is True
        assert text_router._model_supports_thinking("vllm.json") is True
        assert text_router._model_supports_thinking("plain.json") is False

    def test_choose_text_model_path_from_config(self, monkeypatch):
        monkeypatch.setattr(text_router, "get_template_map", lambda: {"a.json": "Model A"})
        monkeypatch.setattr(
            text_router,
            "get_template_configs",
            lambda: {"a.json": SimpleNamespace(model="org/model-a")},
        )
        assert text_router.choose_text_model_path("Model A") == "org/model-a"

    def test_choose_text_model_path_fallback_parser(self, monkeypatch):
        monkeypatch.setattr(text_router, "get_template_map", lambda: {"a.json": "Model A"})
        monkeypatch.setattr(text_router, "get_template_configs", lambda: {})
        monkeypatch.setattr(
            text_router.verda_service,
            "_parse_and_validate_template",
            lambda _name: SimpleNamespace(model="org/model-a"),
        )
        assert text_router.choose_text_model_path("Model A") == "org/model-a"

    def test_choose_text_model_path_unsupported(self, monkeypatch):
        monkeypatch.setattr(text_router, "get_template_map", lambda: {"a.json": "Model A"})
        monkeypatch.setattr(text_router, "get_template_configs", lambda: {})
        monkeypatch.setattr(
            text_router.verda_service,
            "_parse_and_validate_template",
            lambda _name: (_ for _ in ()).throw(RuntimeError("bad template")),
        )

        with pytest.raises(HTTPException) as exc:
            text_router.choose_text_model_path("Unknown")

        assert exc.value.status_code == 400

    def test_deploy_model_internal(self, monkeypatch):
        monkeypatch.setattr(text_router, "_resolve_template_name", lambda _model: "a.json")
        monkeypatch.setattr(
            text_router.verda_service,
            "deploy_from_template",
            lambda template_json: {"status": "ok", "template": template_json},
        )
        assert text_router._deploy_model_internal("Model A") == {"status": "ok", "template": "a.json"}

    def test_deploy_model_internal_unknown(self, monkeypatch):
        monkeypatch.setattr(text_router, "_resolve_template_name", lambda _model: None)
        result = text_router._deploy_model_internal("Unknown")
        assert "error" in result

    def test_check_deployment_health(self, monkeypatch):
        client = SimpleNamespace(containers=SimpleNamespace(get_deployment_status=lambda _n: SimpleNamespace(value="healthy")))
        monkeypatch.setattr(text_router.verda_service, "_get_client", lambda: client)
        text_router._check_deployment_health("dep")

    def test_check_deployment_health_unhealthy_raises(self, monkeypatch):
        client = SimpleNamespace(containers=SimpleNamespace(get_deployment_status=lambda _n: SimpleNamespace(value="deploying")))
        monkeypatch.setattr(text_router.verda_service, "_get_client", lambda: client)

        with pytest.raises(HTTPException) as exc:
            text_router._check_deployment_health("dep")
        assert exc.value.status_code == 503

    def test_check_deployment_health_runtime_failure_raises(self, monkeypatch):
        monkeypatch.setattr(
            text_router.verda_service,
            "_get_client",
            lambda: (_ for _ in ()).throw(RuntimeError("verda down")),
        )

        with pytest.raises(HTTPException) as exc:
            text_router._check_deployment_health("dep")
        assert exc.value.status_code == 503


class TestHandleLlmReply:
    def test_handle_llm_reply_invalid_conversation_id_broadcasts_error(self, mock_db, monkeypatch):
        broadcast = AsyncMock()
        monkeypatch.setattr(text_router.manager, "broadcast", broadcast)

        asyncio.run(
            text_router.handle_llm_reply(
                conversation_id="bad-id",
                model_key="Model A",
                db=mock_db,
                cur_user=UserInfo(username="alice", is_admin=False),
            )
        )

        broadcast.assert_awaited_once()
        assert "invalid conversation id" in broadcast.await_args.args[1]["message"].lower()

    def test_handle_llm_reply_deployment_lookup_failure(self, mock_db, monkeypatch):
        conv_id = str(
            mock_db.conversations.insert_one(
                {
                    "participants": ["alice"],
                    "messages": [{"role": "user", "content": "hi"}],
                    "created_at": "now",
                }
            ).inserted_id
        )

        broadcast = AsyncMock()
        monkeypatch.setattr(text_router.manager, "broadcast", broadcast)
        monkeypatch.setattr(
            text_router.verda_service,
            "list_deployments",
            lambda: (_ for _ in ()).throw(RuntimeError("down")),
        )

        asyncio.run(
            text_router.handle_llm_reply(
                conversation_id=conv_id,
                model_key="Model A",
                db=mock_db,
                cur_user=UserInfo(username="alice", is_admin=False),
            )
        )

        broadcast.assert_awaited_once()
        assert "could not reach deployment service" in broadcast.await_args.args[1]["message"].lower()

    def test_handle_llm_reply_success_path(self, mock_db, monkeypatch):
        conv_id = str(
            mock_db.conversations.insert_one(
                {
                    "participants": ["alice"],
                    "messages": [{"role": "user", "content": "hi"}],
                    "created_at": "now",
                }
            ).inserted_id
        )

        broadcast = AsyncMock()
        monkeypatch.setattr(text_router.manager, "broadcast", broadcast)

        monkeypatch.setattr(text_router, "_resolve_template_name", lambda _mk: "a.json")
        monkeypatch.setattr(text_router, "_deployment_name_from_filename", lambda _tn: "deploy-a")
        monkeypatch.setattr(text_router, "_model_supports_thinking", lambda _tn: False)
        monkeypatch.setattr(text_router, "choose_text_model_path", lambda _mk: "org/model-a")

        monkeypatch.setattr(
            text_router.verda_service,
            "list_deployments",
            lambda: [{"name": "deploy-a"}],
        )

        # Mock client now needs both endpoints used by the streaming code path.
        mock_client = SimpleNamespace(
            containers=SimpleNamespace(
                get_deployment_status=lambda _name: SimpleNamespace(value="healthy"),
                get_deployment_by_name=lambda _name: SimpleNamespace(endpoint_base_url="http://mock/v1"),
            )
        )
        monkeypatch.setattr(text_router.verda_service, "_get_client", lambda: mock_client)
        monkeypatch.setattr(text_router, "_inference_headers", lambda: {})

        # Fake httpx.AsyncClient + stream context managers so the `async with` chain
        # succeeds without making a real HTTP call to an upstream model server.
        class _FakeResponse:
            status_code = 200

        class _FakeStreamCtx:
            async def __aenter__(self):
                return _FakeResponse()

            async def __aexit__(self, *_):
                return False

        class _FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return False

            def stream(self, *_args, **_kwargs):
                return _FakeStreamCtx()

        monkeypatch.setattr(text_router.httpx, "AsyncClient", lambda **_kwargs: _FakeClient())

        # Stand in for the SSE parser with a deterministic single-token stream.
        async def fake_iter(_response, include_reasoning=False):
            yield "content", "hello"

        monkeypatch.setattr(text_router, "_iter_processed_chat_stream", fake_iter)

        asyncio.run(
            text_router.handle_llm_reply(
                conversation_id=conv_id,
                model_key="Model A",
                db=mock_db,
                cur_user=UserInfo(username="alice", is_admin=False),
            )
        )

        message_types = [call.args[1]["type"] for call in broadcast.await_args_list]
        assert "assistant_typing" in message_types
        assert "assistant_token" in message_types
        assert "assistant_done" in message_types

        conversation = mock_db.conversations.find_one({"_id": text_router._parse_conversation_object_id(conv_id)})
        roles = [m.get("role") for m in conversation["messages"]]
        assert "assistant" in roles
