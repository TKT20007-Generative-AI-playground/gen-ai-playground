"""Unit tests for DatabaseManager and get_database dependency."""

from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app import database as database_module
from app.database import DatabaseManager, get_database


class _DummySettings:
    def __init__(
        self,
        mongo_url: str | None = None,
        admin_username: str | None = None,
        admin_password: str | None = None,
        invitation_code: str | None = None,
    ):
        self.MONGO_DB_URL = mongo_url
        self.ADMIN_USERNAME = admin_username
        self.ADMIN_PASSWORD = admin_password
        self.INVITATION_CODE = invitation_code


class _FakeUsers:
    def __init__(self, existing=None):
        self.existing = existing
        self.inserted = []
        self.updated = []

    def find_one(self, query):
        _ = query
        return self.existing

    def insert_one(self, doc):
        self.inserted.append(doc)

    def update_one(self, query, update):
        self.updated.append((query, update))


class _FakeInvitationCodes:
    def __init__(self, existing=None):
        self.existing = existing
        self.inserted = []
        self.indexes = []

    def find_one(self, query):
        _ = query
        return self.existing

    def insert_one(self, doc):
        self.inserted.append(doc)

    def create_index(self, spec, background=True):
        self.indexes.append((spec, background))


class _FakeDB:
    def __init__(self, existing_user=None, existing_invitation=None):
        self.users = _FakeUsers(existing=existing_user)
        self.invitation_codes = _FakeInvitationCodes(existing=existing_invitation)


class _FakeClient:
    def __init__(self, db, ping_raises: Exception | None = None):
        self._db = db
        self.admin = MagicMock()
        if ping_raises:
            self.admin.command.side_effect = ping_raises
        else:
            self.admin.command.return_value = {"ok": 1}

    def __getitem__(self, name):
        assert name == "gen_ai_playground"
        return self._db


class TestDatabaseManagerConnect:
    def test_connect_skips_when_mongo_url_missing(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.client = None
        mgr.db = None

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(database_module, "settings", _DummySettings(mongo_url=None))
            mgr._connect()

        assert mgr.client is None
        assert mgr.db is None

    def test_connect_success_sets_client_and_db(self):
        db = _FakeDB()
        fake_client = _FakeClient(db)
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.client = None
        mgr.db = None

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(database_module, "settings", _DummySettings(mongo_url="mongodb://x"))
            mp.setattr(database_module, "MongoClient", lambda _: fake_client)
            mgr._connect()

        assert mgr.client is fake_client
        assert mgr.db is db

    def test_connect_failure_resets_client_and_db(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.client = "old"
        mgr.db = "old"

        def _boom(_):
            raise RuntimeError("connect failed")

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(database_module, "settings", _DummySettings(mongo_url="mongodb://x"))
            mp.setattr(database_module, "MongoClient", _boom)
            mgr._connect()

        assert mgr.client is None
        assert mgr.db is None


class TestDatabaseManagerSeeding:
    def test_seed_admin_skips_without_db(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = None
        mgr._seed_admin()

    def test_seed_admin_skips_when_env_missing(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = _FakeDB()

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(database_module, "settings", _DummySettings())
            mgr._seed_admin()

        assert mgr.db.users.inserted == []
        assert mgr.db.users.updated == []

    def test_seed_admin_creates_new_admin(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = _FakeDB(existing_user=None)

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(
                database_module,
                "settings",
                _DummySettings(admin_username="admin", admin_password="Secret123!"),
            )
            mgr._seed_admin()

        assert len(mgr.db.users.inserted) == 1
        inserted = mgr.db.users.inserted[0]
        assert inserted["username"] == "admin"
        assert inserted["is_admin"] is True
        assert isinstance(inserted["created_at"], datetime)

    def test_seed_admin_updates_existing_non_admin(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = _FakeDB(existing_user={"username": "admin", "is_admin": False})

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(
                database_module,
                "settings",
                _DummySettings(admin_username="admin", admin_password="Secret123!"),
            )
            mgr._seed_admin()

        assert mgr.db.users.inserted == []
        assert len(mgr.db.users.updated) == 1

    def test_seed_admin_noop_for_existing_admin(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = _FakeDB(existing_user={"username": "admin", "is_admin": True})

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(
                database_module,
                "settings",
                _DummySettings(admin_username="admin", admin_password="Secret123!"),
            )
            mgr._seed_admin()

        assert mgr.db.users.inserted == []
        assert mgr.db.users.updated == []

    def test_seed_invitation_skips_without_db(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = None
        mgr._seed_invitation_code()

    def test_seed_invitation_skips_when_env_missing(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = _FakeDB()

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(database_module, "settings", _DummySettings(invitation_code=None))
            mgr._seed_invitation_code()

        assert mgr.db.invitation_codes.inserted == []

    def test_seed_invitation_noop_when_existing(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = _FakeDB(existing_invitation={"code": "ABC"})

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(database_module, "settings", _DummySettings(invitation_code="ABC"))
            mgr._seed_invitation_code()

        assert mgr.db.invitation_codes.inserted == []

    def test_seed_invitation_creates_default_record(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = _FakeDB(existing_invitation=None)

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(database_module, "settings", _DummySettings(invitation_code="WELCOME"))
            mgr._seed_invitation_code()

        assert len(mgr.db.invitation_codes.inserted) == 1
        inserted = mgr.db.invitation_codes.inserted[0]
        assert inserted["code"] == "WELCOME"
        assert inserted["max_uses"] == 1000000
        assert inserted["uses_count"] == 0
        assert inserted["is_active"] is True

    def test_create_indexes_skips_when_db_missing(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = None
        mgr._create_indexes()

    def test_create_indexes_creates_invitation_index(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = _FakeDB()

        mgr._create_indexes()

        assert len(mgr.db.invitation_codes.indexes) == 1
        spec, background = mgr.db.invitation_codes.indexes[0]
        assert spec == [("created_at", database_module.DESCENDING)]
        assert background is True


class TestDatabaseDependency:
    def test_get_db_and_is_available(self):
        mgr = DatabaseManager.__new__(DatabaseManager)
        mgr.db = object()

        assert mgr.get_db() is mgr.db
        assert mgr.is_available() is True

        mgr.db = None
        assert mgr.is_available() is False

    def test_get_database_returns_db_when_available(self):
        fake_db = object()
        original_manager = database_module.db_manager
        try:
            database_module.db_manager = MagicMock()
            database_module.db_manager.get_db.return_value = fake_db
            assert get_database() is fake_db
        finally:
            database_module.db_manager = original_manager

    def test_get_database_raises_503_when_unavailable(self):
        original_manager = database_module.db_manager
        try:
            database_module.db_manager = MagicMock()
            database_module.db_manager.get_db.return_value = None

            with pytest.raises(HTTPException) as exc:
                get_database()

            assert exc.value.status_code == 503
            assert "database not available" in exc.value.detail.lower()
        finally:
            database_module.db_manager = original_manager
