import asyncio
from datetime import datetime
from app.verda_service import VerdaService

class ContainerHandler:
    def __init__(self):
        self.active_containers: dict = {}
        self._watchdog_task: asyncio.Task | None = None
        self.verda_service = VerdaService()


    def add_container(self, container_info: dict):
        self.active_containers[container_info["name"]] = {
            **container_info,
            "last_request_time": datetime.now()  
        }


    async def delete_container(self, container_name: str):
        if container_name in self.active_containers:
            res = await asyncio.to_thread(self.verda_service.delete_deployment, container_name)
            print(f"Deleted container {container_name} response: {res}")
            del self.active_containers[container_name]
            print(f"Container {container_name} deleted.")


    def set_latest_request_timestamp(self, container_name: str):
        """ this is called in every req to update the last_request_time for the container """
        if container_name in self.active_containers:
            old_time = self.active_containers[container_name].get("last_request_time")
            self.active_containers[container_name]["last_request_time"] = datetime.now()
            if old_time:
                elapsed = (datetime.now() - old_time).total_seconds() / 60
                print(f"Container {container_name} timestamp updated, was idle {elapsed:.2f} min")
                
    
    async def _check_idle_containers(self, timeout_minutes: int = 15):
        """ check for containers that have been idle longer than timeout_minutes and delete them """
        for container_name, container_info in list(self.active_containers.items()):
            last_request_time = container_info.get("last_request_time") 
            if last_request_time:
                elapsed = (datetime.now() - last_request_time).total_seconds() / 60
                if elapsed > timeout_minutes:
                    print(f"Container {container_name} idle {elapsed:.2f} min, deleting...")
                    await self.delete_container(container_name)


    async def start_watchdog(self, timeout_minutes: int = 15, check_interval_seconds: int = 30):
        self._watchdog_task = asyncio.create_task(
            self._watch(timeout_minutes, check_interval_seconds)
        )


    async def _watch(self, timeout_minutes: int, interval: int):
        while True:
            await asyncio.sleep(interval)
            if not self.active_containers:
                continue # if there are no active containers, skip the check and the print statement to reduce unnecessary logs
            print("checking for idle containers...")
            await self._check_idle_containers(timeout_minutes)


    async def cleanup(self):
        if self._watchdog_task:
            self._watchdog_task.cancel()
        
        # delete all active containers/deployments on shutdown
        # for container_name in list(self.active_containers.keys()):
        #     await self.delete_container(container_name)