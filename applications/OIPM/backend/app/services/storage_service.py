from pathlib import Path
import shutil

from app.core.config import settings


class StorageService:
    """
    Local filesystem storage for OIPM images.

    All image paths are relative to settings.OIPM_DATA_DIR
    (default: applications/OIPM/data).
    """

    def __init__(self):
        self.base_dir = Path(settings.OIPM_DATA_DIR)

        # Create the two top-level storage areas.
        (self.base_dir / "drafts").mkdir(parents=True, exist_ok=True)
        (self.base_dir / "2026").mkdir(parents=True, exist_ok=True)

    def _safe_path(self, storage_path: str) -> Path:
        """
        Convert a relative storage path into a safe path under base_dir.
        Prevents paths such as ../../outside.txt.
        """
        if not storage_path:
            raise ValueError("Storage path cannot be empty.")

        relative = Path(storage_path.replace("\\", "/"))

        if relative.is_absolute():
            raise ValueError("Absolute storage paths are not allowed.")

        full_path = (self.base_dir / relative).resolve()
        base_path = self.base_dir.resolve()

        try:
            full_path.relative_to(base_path)
        except ValueError:
            raise ValueError("Invalid storage path.")

        return full_path

    # ========================================================
    # UPLOAD
    # ========================================================

    def upload_image(
        self,
        file_bytes: bytes,
        storage_path: str,
        content_type: str,
    ):
        path = self._safe_path(storage_path)

        path.parent.mkdir(parents=True, exist_ok=True)

        if path.exists():
            raise FileExistsError(
                f"Image already exists: {storage_path}"
            )

        path.write_bytes(file_bytes)

        return {
            "storage_path": storage_path,
            "size": len(file_bytes),
            "content_type": content_type,
        }

    # ========================================================
    # DELETE
    # ========================================================

    def delete_image(self, storage_path: str):
        path = self._safe_path(storage_path)

        if path.exists():
            if not path.is_file():
                raise ValueError("Storage path is not a file.")

            path.unlink()

        # Remove empty section/improvement/draft directories
        # without deleting the top-level drafts/2026 folders.
        self._remove_empty_parents(path.parent)

        return {
            "storage_path": storage_path,
            "deleted": True,
        }

    def _remove_empty_parents(self, directory: Path):
        base_path = self.base_dir.resolve()

        current = directory.resolve()

        while current != base_path:
            try:
                current.relative_to(base_path)
            except ValueError:
                break

            try:
                if current.exists() and current.is_dir():
                    if any(current.iterdir()):
                        break

                    current.rmdir()
            except OSError:
                break

            current = current.parent

    # ========================================================
    # MOVE
    # ========================================================

    def move_image(
        self,
        source_path: str,
        destination_path: str,
    ):
        """
        Move an image from one local storage path to another.

        Used when a draft is submitted and its images are moved
        from the temporary drafts directory into the final
        improvement directory.
        """

        source = self._safe_path(source_path)
        destination = self._safe_path(destination_path)

        if not source.exists() or not source.is_file():
            raise FileNotFoundError(
                f"Source image not found: {source_path}"
            )

        destination.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        if destination.exists():
            raise FileExistsError(
                f"Destination image already exists: {destination_path}"
            )

        shutil.move(
            str(source),
            str(destination),
        )

        self._remove_empty_parents(
            source.parent
        )

        return {
            "source_path": source_path,
            "destination_path": destination_path,
            "moved": True,
        }

    # ========================================================
    # LOCAL URL
    # ========================================================

    def create_signed_url(
        self,
        storage_path: str,
        expires_in: int = 3600,
    ):
        """
        Kept with the same method name so existing OIPM code
        does not need to change.

        Local filesystem images do not require signed URLs.
        The API image-serving route will validate the path.
        """

        self._safe_path(storage_path)

        normalized = storage_path.replace("\\", "/").lstrip("/")

        return f"/api/v1/images/{normalized}"


storage_service = StorageService()
