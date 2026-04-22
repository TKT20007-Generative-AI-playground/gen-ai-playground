"""Focused helper tests for images router branch coverage."""

import base64
import time
from types import SimpleNamespace

import mongomock
import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.routers import images as images_router


@pytest.fixture
def mock_db():
    return mongomock.MongoClient()["gen_ai_playground"]


@pytest.fixture
def user():
    return SimpleNamespace(username="image-user")


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


class TestImagesHelpers:
    def test_normalize_base64_image(self):
        assert images_router.normalize_base64_image(None) is None
        assert images_router.normalize_base64_image("") == ""
        assert images_router.normalize_base64_image("  abc  ") == "abc"
        assert (
            images_router.normalize_base64_image("data:image/png;base64,  abc  ")
            == "abc"
        )

    def test_choose_model_url_supported(self, monkeypatch):
        monkeypatch.setattr(images_router.settings, "MODEL_URLS", {"M": "https://m.example"}, raising=False)
        assert images_router.choose_model_url("M") == "https://m.example"

    def test_choose_model_url_unsupported(self, monkeypatch):
        monkeypatch.setattr(images_router.settings, "MODEL_URLS", {}, raising=False)
        with pytest.raises(HTTPException) as exc:
            images_router.choose_model_url("UNKNOWN")
        assert exc.value.status_code == 400

    def test_build_request_data_non_klein_without_image(self):
        data = images_router.build_request_data("FLUX1_KONTEXT_DEV", "hello")
        assert data == {
            "input": {
                "prompt": "hello",
                "enable_base64_output": True,
            }
        }

    def test_build_request_data_non_klein_with_image(self):
        data = images_router.build_request_data("FLUX1_KONTEXT_DEV", "hello", "img-b64")
        assert data["input"]["image"] == "img-b64"

    def test_build_request_data_klein_with_image(self):
        data = images_router.build_request_data("FLUX2_KLEIN_9B", "hello", "img-b64")
        assert "input" not in data
        assert data["input_images"] == ["img-b64"]

    def test_convert_objects_to_str(self, user):
        oid = ObjectId()
        parent_oid = ObjectId()
        history = [{"_id": oid, "parent_image_id": parent_oid, "prompt": "p"}]

        result = images_router.convert_objects_to_str(history, user)

        assert result[0]["_id"] == str(oid)
        assert result[0]["id"] == str(oid)
        assert result[0]["parent_image_id"] == str(parent_oid)
        assert result[0]["username"] == "image-user"


class TestImagePersistenceHelpers:
    def test_save_image_to_db_generated_only(self, mock_db, user):
        image_id = images_router.save_image_to_db(
            db=mock_db,
            prompt="p",
            model="m",
            image_base64=_b64(b"img"),
            current_user=user,
            image_type="generated",
        )

        assert image_id is not None
        rec = mock_db.images.find_one({"_id": ObjectId(image_id)})
        assert rec is not None
        assert rec["image_type"] == "generated"

    def test_save_image_to_db_inserts_original_when_user_image_provided(self, mock_db, user):
        new_id = images_router.save_image_to_db(
            db=mock_db,
            prompt="edit",
            model="m",
            image_base64=_b64(b"edited"),
            current_user=user,
            image_type="edited",
            user_base64_image=_b64(b"orig"),
            parent_image_id=None,
        )

        assert new_id is not None
        rows = list(mock_db.images.find({"username": "image-user"}))
        assert len(rows) == 2
        types = sorted([row["image_type"] for row in rows])
        assert types == ["edited", "original"]

    def test_save_image_to_db_temp_parent_still_inserts_original(self, mock_db, user):
        new_id = images_router.save_image_to_db(
            db=mock_db,
            prompt="edit",
            model="m",
            image_base64=_b64(b"edited"),
            current_user=user,
            image_type="edited",
            user_base64_image=_b64(b"orig"),
            parent_image_id="temp-id1",
        )

        assert new_id is not None
        rows = list(mock_db.images.find({"username": "image-user"}))
        assert len(rows) == 2

    def test_save_image_to_db_sets_parent_object_id(self, mock_db, user):
        parent_id = str(ObjectId())
        new_id = images_router.save_image_to_db(
            db=mock_db,
            prompt="edit",
            model="m",
            image_base64=_b64(b"edited"),
            current_user=user,
            image_type="edited",
            parent_image_id=parent_id,
            generation_time_ms=55,
        )

        rec = mock_db.images.find_one({"_id": ObjectId(new_id)})
        assert rec["parent_image_id"] == ObjectId(parent_id)
        assert rec["generation_time_ms"] == 55

    def test_save_image_to_db_returns_none_on_error(self, mock_db, user, monkeypatch):
        monkeypatch.setattr(mock_db.images, "insert_one", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("db down")))

        image_id = images_router.save_image_to_db(
            db=mock_db,
            prompt="p",
            model="m",
            image_base64=_b64(b"img"),
            current_user=user,
            image_type="generated",
        )

        assert image_id is None

    def test_build_timed_image_response(self, mock_db, user):
        start = time.perf_counter() - 0.01
        result = images_router.build_timed_image_response(
            db=mock_db,
            prompt="p",
            model="m",
            image_base64=_b64(b"png-bytes"),
            current_user=user,
            image_type="generated",
            start_time=start,
        )

        assert result.media_type == "image/png"
        assert int(result.headers["X-Generation-Time-Ms"]) >= 0
        assert result.headers["X-Image-Id"]
