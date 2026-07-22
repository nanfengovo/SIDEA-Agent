import json
import logging
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
import urllib.request
import urllib.error

from infra.site_profile import SiteProfileManager

logger = logging.getLogger(__name__)

# --- Pydantic Schemas for Tools ---

class QueryErackSlotStateParams(BaseModel):
    erack_id: str = Field(..., description="ID of the Erack (e.g., '1', 'ERACK-01')")
    slot_id: str = Field(..., description="ID of the Slot (e.g., '1-1')")

class FetchShiftMetricsParams(BaseModel):
    shift_date: str = Field(..., description="Date of the shift in YYYY-MM-DD format (e.g., '2026-07-20')")
    shift_code: Optional[str] = Field(None, description="Shift code (e.g., 'Morning', 'Night')")

class FetchActiveAlarmsParams(BaseModel):
    severity: Optional[str] = Field(None, description="Filter by severity (e.g., 'High', 'Critical')")

# --- Tool Implementations ---

def _mock_or_fetch(endpoint: str, mock_data: Dict[str, Any]) -> str:
    """Helper to try fetching from real ABP endpoint, falling back to mock data if it fails or URL is invalid."""
    pm = SiteProfileManager.get_instance()
    profile = pm.get_active_profile()
    
    if not profile or not profile.abp_base_url.startswith("http"):
        return json.dumps(mock_data, ensure_ascii=False)
        
    url = f"{profile.abp_base_url.rstrip('/')}{endpoint}"
    
    try:
        req = urllib.request.Request(url, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=3.0) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        logger.warning(f"Failed to reach ABP API {url}: {e}. Returning mock data.")
        return json.dumps(mock_data, ensure_ascii=False)


def query_erack_slot_state(params: QueryErackSlotStateParams) -> str:
    """查询特定 Erack 和 Slot 的系统与 PLC 物料状态对比。"""
    endpoint = f"/api/sidea/v1/readonly/devices/eracks/{params.erack_id}/slots/{params.slot_id}"
    
    # Mock data showing an inconsistency
    mock_response = {
        "success": True,
        "data": {
            "erackId": params.erack_id,
            "slotId": params.slot_id,
            "system": {"state": "Occupied", "materialCode": f"MAT-{params.erack_id}-{params.slot_id}"},
            "plc": {"state": "Empty", "materialCode": None},
            "isConsistent": False,
            "lastUpdated": "2026-07-20T08:00:00Z"
        }
    }
    
    return _mock_or_fetch(endpoint, mock_response)


def fetch_shift_metrics(params: FetchShiftMetricsParams) -> str:
    """获取指定日期的班次自动化率等核心指标。"""
    endpoint = f"/api/sidea/v1/readonly/metrics/shift?date={params.shift_date}"
    if params.shift_code:
        endpoint += f"&shift={params.shift_code}"
        
    mock_response = {
        "success": True,
        "data": {
            "date": params.shift_date,
            "shiftCode": params.shift_code or "All",
            "taskAutoCompletionRate": 92.5,
            "manualInterventionRate": 4.1,
            "autoRecoveryRate": 88.0,
            "agvUtilizationRate": 76.3,
            "compositeAutomationIndex": 89.2
        }
    }
    
    return _mock_or_fetch(endpoint, mock_response)


def fetch_active_alarms(params: FetchActiveAlarmsParams) -> str:
    """获取现场当前处于未恢复状态的报警列表。"""
    endpoint = "/api/sidea/v1/readonly/alarms/active"
    if params.severity:
        endpoint += f"?severity={params.severity}"
        
    mock_response = {
        "success": True,
        "data": {
            "totalActive": 2,
            "alarms": [
                {"id": "ALM-001", "level": "High", "device": "AGV-04", "message": "通讯超时", "durationMin": 15},
                {"id": "ALM-002", "level": "Medium", "device": "ERACK-01", "message": "库位传感器异常", "durationMin": 120}
            ]
        }
    }
    
    return _mock_or_fetch(endpoint, mock_response)
