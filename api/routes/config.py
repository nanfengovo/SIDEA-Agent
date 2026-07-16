from fastapi import APIRouter
from infra.config_store import ConfigStore
from pydantic import BaseModel

router = APIRouter()
store = ConfigStore()

class ConfigUpdate(BaseModel):
    config_value: str
    category: str = "general"
    description: str = ""

@router.get("/config")
def get_all_configs():
    return store.get_all()

@router.post("/config/{key}")
def update_config(key: str, data: ConfigUpdate):
    store.set(key, data.config_value, data.category, data.description)
    return {"status": "success", "key": key}

@router.delete("/config/{key}")
def delete_config(key: str):
    success = store.delete(key)
    return {"status": "success" if success else "failed", "key": key}
