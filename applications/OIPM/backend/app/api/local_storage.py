from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.storage_service import storage_service


router = APIRouter(
    prefix="/api/v1/images",
    tags=["Local Image Storage"],
)


@router.get("/{storage_path:path}")
def serve_image(storage_path: str):
    """
    Serve an OIPM image from the local filesystem.

    The storage service validates that the requested path
    remains inside the configured OIPM data directory.
    """

    try:
        file_path = storage_service._safe_path(storage_path)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid image path.",
        )

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Image not found.",
        )

    return FileResponse(
        path=file_path,
    )
