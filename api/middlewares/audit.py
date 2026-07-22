import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from core.audit_logger import log_human_op, log_api_in

class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # We can read the request body for POST/PUT/PATCH, but it's tricky in middleware without consuming it.
        # So we'll just log the path and query params.
        
        response = await call_next(request)
        process_time = time.time() - start_time
        
        method = request.method
        path = request.url.path
        
        # Only log mutating methods for HUMAN_OP
        if method in ["POST", "PUT", "PATCH", "DELETE"]:
            # Differentiate between human operations from frontend vs external inbound APIs
            # Assume /api/admin/* and /api/knowledge/* are human ops
            if path.startswith("/api/admin/") or path.startswith("/api/knowledge/"):
                log_human_op(
                    action=f"{method} {path}",
                    description=f"User operation via {method} on {path}",
                    status="success" if response.status_code < 400 else "failed",
                    raw_data={"status_code": response.status_code, "duration_ms": round(process_time * 1000)}
                )
            else:
                # Other mutating APIs might be inbound integrations
                log_api_in(
                    action=f"{method} {path}",
                    description=f"Inbound API call via {method} on {path}",
                    status="success" if response.status_code < 400 else "failed",
                    raw_data={"status_code": response.status_code, "duration_ms": round(process_time * 1000)}
                )
                
        return response
