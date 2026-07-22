import json
import os
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

class EquipmentTopology(BaseModel):
    erack_count: int = Field(default=0, description="Total number of Eracks on site")
    naming_rule: str = Field(default="ERACK-{id:02d}", description="Formatting rule for Erack IDs")
    slot_rows: int = Field(default=2, description="Rows of slots per Erack")
    slot_cols: int = Field(default=4, description="Columns of slots per Erack")

class LogPaths(BaseModel):
    rcs: str = Field(default="", description="Glob pattern for RCS logs")
    tm: str = Field(default="", description="Glob pattern for TM logs")

class SiteProfile(BaseModel):
    site_id: str
    site_name: str
    rcs_type: str
    abp_base_url: str
    auth_token_env_key: str
    equipment_topology: EquipmentTopology = Field(default_factory=EquipmentTopology)
    log_paths: LogPaths = Field(default_factory=LogPaths)
    enabled_agent_roles: list[str] = Field(default_factory=list)

class SiteProfileManager:
    """Manages the loading and caching of site profiles from configs/ directory."""
    
    _instance = None
    
    def __init__(self):
        self.profiles: Dict[str, SiteProfile] = {}
        self.active_site_id: Optional[str] = None
        
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
            cls._instance.load_all_profiles()
        return cls._instance

    def load_all_profiles(self, config_dir: str = "configs"):
        """Load all .json files in the configs directory."""
        if not os.path.exists(config_dir):
            return
            
        for filename in os.listdir(config_dir):
            if filename.endswith("_site_profile.json") or filename == "default_site_profile.json":
                filepath = os.path.join(config_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        profile = SiteProfile(**data)
                        self.profiles[profile.site_id] = profile
                        
                        # Set default if none active
                        if self.active_site_id is None:
                            self.active_site_id = profile.site_id
                except Exception as e:
                    print(f"Failed to load site profile {filepath}: {e}")
                    
    def set_active_site(self, site_id: str):
        if site_id in self.profiles:
            self.active_site_id = site_id
            return True
        return False
        
    def get_active_profile(self) -> Optional[SiteProfile]:
        if self.active_site_id and self.active_site_id in self.profiles:
            return self.profiles[self.active_site_id]
        return None
