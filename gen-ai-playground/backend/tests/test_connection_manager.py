"""Unit tests for ConnectionManager WebSocket connection registry."""

import asyncio
from unittest.mock import AsyncMock

import pytest

from app.connection_manager import ConnectionManager


@pytest.fixture
def cm():
    return ConnectionManager()


@pytest.fixture
def mock_ws():
    ws = AsyncMock()
    ws.send_json = AsyncMock()
    return ws


class TestConnect:
    def test_connect_creates_new_conversation(self, cm, mock_ws):
        asyncio.run(cm.connect("conv1", "alice", mock_ws))
        assert "conv1" in cm.active_connections
        assert cm.active_connections["conv1"]["alice"] is mock_ws

    def test_connect_adds_to_existing_conversation(self, cm):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        asyncio.run(cm.connect("conv1", "alice", ws1))
        asyncio.run(cm.connect("conv1", "bob", ws2))
        assert len(cm.active_connections["conv1"]) == 2
        assert cm.active_connections["conv1"]["alice"] is ws1
        assert cm.active_connections["conv1"]["bob"] is ws2

    def test_connect_overwrites_existing_user(self, cm):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        asyncio.run(cm.connect("conv1", "alice", ws1))
        asyncio.run(cm.connect("conv1", "alice", ws2))
        assert cm.active_connections["conv1"]["alice"] is ws2


class TestDisconnect:
    def test_disconnect_removes_user(self, cm, mock_ws):
        asyncio.run(cm.connect("conv1", "alice", mock_ws))
        cm.disconnect("conv1", "alice")
        assert "conv1" not in cm.active_connections

    def test_disconnect_preserves_other_users(self, cm):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        asyncio.run(cm.connect("conv1", "alice", ws1))
        asyncio.run(cm.connect("conv1", "bob", ws2))
        cm.disconnect("conv1", "alice")
        assert "conv1" in cm.active_connections
        assert "alice" not in cm.active_connections["conv1"]
        assert "bob" in cm.active_connections["conv1"]

    def test_disconnect_missing_conversation_is_noop(self, cm, mock_ws):
        # Should not raise
        cm.disconnect("nonexistent", "alice")
        assert "nonexistent" not in cm.active_connections

    def test_disconnect_missing_username_is_noop(self, cm, mock_ws):
        asyncio.run(cm.connect("conv1", "alice", mock_ws))
        # Should not raise
        cm.disconnect("conv1", "bob")
        assert "conv1" in cm.active_connections


class TestBroadcast:
    def test_broadcast_sends_to_all(self, cm):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        ws1.send_json = AsyncMock()
        ws2.send_json = AsyncMock()
        asyncio.run(cm.connect("conv1", "alice", ws1))
        asyncio.run(cm.connect("conv1", "bob", ws2))

        asyncio.run(cm.broadcast("conv1", {"type": "message", "content": "hello"}))

        ws1.send_json.assert_called_once()
        ws2.send_json.assert_called_once()

    def test_broadcast_excludes_username(self, cm):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        ws1.send_json = AsyncMock()
        ws2.send_json = AsyncMock()
        asyncio.run(cm.connect("conv1", "alice", ws1))
        asyncio.run(cm.connect("conv1", "bob", ws2))

        asyncio.run(cm.broadcast("conv1", {"type": "message"}, exclude_username="alice"))

        ws1.send_json.assert_not_called()
        ws2.send_json.assert_called_once()

    def test_broadcast_nonexistent_conversation_noops(self, cm, mock_ws):
        # Should not raise
        asyncio.run(cm.broadcast("nonexistent", {"type": "message"}))

    def test_broadcast_empty_conversation_noops(self, cm, mock_ws):
        asyncio.run(cm.connect("conv1", "alice", mock_ws))
        cm.disconnect("conv1", "alice")
        # Should not raise
        asyncio.run(cm.broadcast("conv1", {"type": "message"}))


class TestBroadcastWebSocketFailure:
    def test_broadcast_disconnects_failing_peer(self, cm):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        ws1.send_json = AsyncMock()
        ws2.send_json = AsyncMock(side_effect=Exception("send failed"))
        asyncio.run(cm.connect("conv1", "alice", ws1))
        asyncio.run(cm.connect("conv1", "bob", ws2))

        asyncio.run(cm.broadcast("conv1", {"type": "message"}))

        # bob's failing websocket should be disconnected
        ws1.send_json.assert_called_once()
        assert "conv1" in cm.active_connections
        assert "alice" in cm.active_connections["conv1"]
        # bob was disconnected after broadcast
        assert "bob" not in cm.active_connections["conv1"]

    def test_broadcast_continues_after_single_failure(self, cm):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        ws3 = AsyncMock()
        ws1.send_json = AsyncMock(side_effect=Exception("fail"))
        ws2.send_json = AsyncMock()
        ws3.send_json = AsyncMock()
        asyncio.run(cm.connect("conv1", "alice", ws1))
        asyncio.run(cm.connect("conv1", "bob", ws2))
        asyncio.run(cm.connect("conv1", "charlie", ws3))

        asyncio.run(cm.broadcast("conv1", {"type": "message"}))

        # All should have been attempted despite alice's failure
        ws2.send_json.assert_called_once()
        ws3.send_json.assert_called_once()