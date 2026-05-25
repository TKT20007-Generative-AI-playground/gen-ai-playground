import asyncio
from datetime import datetime
from unittest.mock import patch
from app.container_handler import ContainerHandler


def test_add_and_delete_container():
    with patch("app.container_handler.VerdaService") as mock_verda_service:
        mock_verda_instance = mock_verda_service.return_value
        mock_verda_instance.delete_deployment.return_value = {"status": "success"}

        handler = ContainerHandler()
        container_info = {
            "name": "deepseek-container",
            "model": "test-model",
            "version": "1.0",
        }

        handler.add_container(container_info)

        assert "deepseek-container" in handler.active_containers
        assert handler.active_containers["deepseek-container"]["model"] == "test-model"

        handler.delete_container("deepseek-container")

        mock_verda_instance.delete_deployment.assert_called_once_with("deepseek-container")
        assert "deepseek-container" not in handler.active_containers


def test_set_latest_request_timestamp():
    with patch("app.container_handler.VerdaService"):
        with patch("app.container_handler.datetime") as mock_datetime:
            first_time = datetime(2026, 5, 25, 12, 0, 0)
            second_time = datetime(2026, 5, 25, 12, 1, 0)
            third_time = datetime(2026, 5, 25, 12, 1, 0)
            mock_datetime.now.side_effect = [first_time, second_time, third_time]

            handler = ContainerHandler()
            container_info = {
                "name": "deepseek-container",
                "model": "test-model",
                "version": "1.0",
            }
            handler.add_container(container_info)

            initial_timestamp = handler.active_containers["deepseek-container"]["last_request_time"]
            handler.set_latest_request_timestamp("deepseek-container")
            updated_timestamp = handler.active_containers["deepseek-container"]["last_request_time"]

            assert updated_timestamp > initial_timestamp
            
def test_check_idle_containers():
    with patch("app.container_handler.VerdaService") as mock_verda_service:
        mock_verda_instance = mock_verda_service.return_value
        mock_verda_instance.delete_deployment.return_value = {"status": "success"}

        with patch("app.container_handler.datetime") as mock_datetime:
            first_time = datetime(2026, 5, 25, 12, 0, 0)
            second_time = datetime(2026, 5, 25, 12, 20, 0)
            mock_datetime.now.side_effect = [first_time, second_time]

            handler = ContainerHandler()
            handler.add_container({
                "name": "idle-container",
                "model": "test-model",
                "version": "1.0",
            })

            handler._check_idle_containers(timeout_minutes=15)

            mock_verda_instance.delete_deployment.assert_called_once_with("idle-container")
            assert "idle-container" not in handler.active_containers


def test_check_idle_containers_no_delete_when_recent():
    with patch("app.container_handler.VerdaService") as mock_verda_service:
        mock_verda_instance = mock_verda_service.return_value

        with patch("app.container_handler.datetime") as mock_datetime:
            first_time = datetime(2026, 5, 25, 12, 0, 0)
            second_time = datetime(2026, 5, 25, 12, 10, 0)
            mock_datetime.now.side_effect = [first_time, second_time]

            handler = ContainerHandler()
            handler.add_container({
                "name": "recent-container",
                "model": "test-model",
                "version": "1.0",
            })

            handler._check_idle_containers(timeout_minutes=15)

            mock_verda_instance.delete_deployment.assert_not_called()
            assert "recent-container" in handler.active_containers


def test_start_watchdog_creates_task():
    with patch("app.container_handler.VerdaService"):
        handler = ContainerHandler()
        sentinel_task = object()

        with patch("app.container_handler.asyncio.create_task", return_value=sentinel_task) as create_task:
            asyncio.run(handler.start_watchdog(timeout_minutes=5, check_interval_seconds=7))

        create_task.assert_called_once()
        assert handler._watchdog_task is sentinel_task


def test_watch_skips_when_no_active_containers():
    with patch("app.container_handler.VerdaService"):
        handler = ContainerHandler()

        async def run_once():
            with patch("app.container_handler.asyncio.sleep", side_effect=asyncio.CancelledError()):
                with patch.object(handler, "_check_idle_containers") as check_idle:
                    try:
                        await handler._watch(timeout_minutes=15, interval=0)
                    except asyncio.CancelledError:
                        pass

                    check_idle.assert_not_called()

        asyncio.run(run_once())
