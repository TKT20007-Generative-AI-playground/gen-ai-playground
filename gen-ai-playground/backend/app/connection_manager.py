from fastapi import WebSocket
from typing import Dict
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, conversation_id: str, username: str, websocket: WebSocket):
        if conversation_id not in self.active_connections:
            self.active_connections[conversation_id] = {}
        self.active_connections[conversation_id][username] = websocket

    def disconnect(self, conversation_id: str, username: str):
        if conversation_id in self.active_connections:
            self.active_connections[conversation_id].pop(username, None)
            if not self.active_connections[conversation_id]:
                del self.active_connections[conversation_id]

    async def broadcast(self, conversation_id: str, message: dict, exclude_username: str | None = None):
        connections = self.active_connections.get(conversation_id, {})
        failed_usernames = []
        for username, websocket in list(connections.items()):
            if exclude_username is not None and username == exclude_username:
                continue
            try:
                await websocket.send_json(message)
            except Exception:
                failed_usernames.append(username)
        for username in failed_usernames:
            self.disconnect(conversation_id, username)