import os
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from infra.logging.structured_logger import get_structured_logger

logger = get_structured_logger("api.routes.upload")
router = APIRouter()

UPLOAD_DIR = Path("uploads")

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Handle file uploads. Saves the file to the local uploads directory
    and returns its URL and local path.
    """
    try:
        # Generate a unique filename to prevent collisions
        file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
        unique_filename = f"{uuid.uuid4().hex}{file_ext}"
        file_path = UPLOAD_DIR / unique_filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        logger.info(f"File uploaded successfully: {unique_filename} ({file.content_type})")
        
        return {
            "success": True,
            "filename": file.filename,
            "path": str(file_path),
            "url": f"/uploads/{unique_filename}",
            "content_type": file.content_type
        }
    except Exception as e:
        logger.error(f"Failed to upload file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
