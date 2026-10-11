"""
File bytes, held in a Supabase Storage bucket OR in a folder on this server.

Which one is chosen by STORAGE_BACKEND in backend/.env (see
config/settings.py). The local folder is for running on your own server:
files are written under STORAGE_DIR using the same object keys, and are
still only ever served through /api/attachments/{id}/download, which checks
the caller's session first.

This replaces GridFS. Keeping uploads out of Postgres matters more here than
it did in Mongo: the database is shared with the other project, and a few
hundred 25 MB drawings would eat the whole instance's disk between them.

The bucket is private. Nothing is ever served straight from Supabase to a
browser - every download goes through /api/attachments/{id}/download, which
checks the caller's session first. That is why the service key is used for
these calls and why no public URL is ever handed out.

Callers should use `attachment_service`, not this module; this is only the
byte-level layer.
"""

import asyncio
import os
import uuid
from pathlib import Path
from urllib.parse import quote

import httpx

from config.settings import settings

TIMEOUT = httpx.Timeout(60.0, connect=15.0)


# â”€â”€ Local folder storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _use_local() -> bool:
    mode = (settings.STORAGE_BACKEND or "auto").strip().lower()
    if mode == "local":
        return True
    if mode == "supabase":
        return False
    return not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY)


def _root() -> Path:
    root = Path(settings.STORAGE_DIR or "../data")
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[1] / root
    return root.resolve()


def _local_file(path: str) -> Path:
    """The file for an object key - refusing anything that would leave the folder."""
    root = _root()
    target = (root / path).resolve()
    if root != target and root not in target.parents:
        raise RuntimeError("Invalid storage path.")
    return target


def _write_local(path: str, content: bytes) -> None:
    target = _local_file(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        # Same rule as Supabase's x-upsert=false: never overwrite a file.
        raise RuntimeError("Storage upload failed: a file with this key already exists.")
    tmp = target.with_name(target.name + ".part")
    tmp.write_bytes(content)
    os.replace(tmp, target)          # appears complete or not at all


def _read_local(path: str) -> bytes:
    target = _local_file(path)
    if not target.is_file():
        raise RuntimeError("Storage download failed (404): file not found on the server.")
    return target.read_bytes()


def _delete_local(paths: list[str]) -> None:
    for p in paths:
        try:
            _local_file(p).unlink(missing_ok=True)
        except Exception:
            pass


def _base() -> str:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")
    return f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1"


def _headers(**extra: str) -> dict:
    return {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        **extra,
    }


def build_path(
    entity_type: str,
    entity_id: str,
    filename: str,
    folder_name: str | None = None,
) -> str:
    """
    Builds the physical/object storage path.

    APQP activity files are stored directly inside the product-name
    folder and retain their original filename.

    Example:

        apqp_activity/CN90001/3111903.pdf
    """

    # Keep the product name as the only physical folder.
    # Generate a unique physical filename so the same original filename
    # can be uploaded unlimited times without overwriting an existing file.
    safe_filename = os.path.basename(filename).strip()

    if not safe_filename:
        safe_filename = "attachment"

    if folder_name:
        safe_folder = str(folder_name).strip()
    else:
        safe_folder = str(entity_id).strip()

    stem, ext = os.path.splitext(safe_filename)
    unique_suffix = uuid.uuid4().hex[:12]
    safe_file = f"{stem}_{unique_suffix}{ext}"

    return (
        f"{entity_type}/"
        f"{safe_folder}/"
        f"{safe_file}"
    )

async def upload(path: str, content: bytes, content_type: str) -> str:
    """Writes the bytes and returns the object key they were written to."""
    if _use_local():
        await asyncio.to_thread(_write_local, path, content)
        return path
    url = f"{_base()}/object/{settings.SUPABASE_BUCKET}/{path}"
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.post(
            url,
            content=content,
            headers=_headers(
                **{
                    "Content-Type": content_type or "application/octet-stream",
                    # Refuse to clobber. The key carries a fresh uuid, so a
                    # collision here means something is badly wrong and
                    # silently overwriting somebody's file would hide it.
                    "x-upsert": "false",
                }
            ),
        )
    if res.status_code >= 400:
        raise RuntimeError(f"Storage upload failed ({res.status_code}): {res.text[:300]}")
    return path


async def download(path: str) -> bytes:
    if _use_local():
        return await asyncio.to_thread(_read_local, path)
    url = f"{_base()}/object/{settings.SUPABASE_BUCKET}/{path}"
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.get(url, headers=_headers())
    if res.status_code >= 400:
        raise RuntimeError(f"Storage download failed ({res.status_code}): {res.text[:300]}")
    return res.content


async def delete(paths: list[str]) -> None:
    """
    Removes objects. Best effort - a missing object is not an error.

    Deleting bytes that no row points at is only wasted space; failing a
    user's delete request because the object had already gone would be worse.
    """
    if not paths:
        return
    if _use_local():
        await asyncio.to_thread(_delete_local, paths)
        return
    url = f"{_base()}/object/{settings.SUPABASE_BUCKET}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            await client.request(
                "DELETE",
                url,
                json={"prefixes": paths},
                headers=_headers(**{"Content-Type": "application/json"}),
            )
    except Exception:
        pass


async def ensure_bucket() -> str:
    """
    Creates the private bucket if it is not there yet. Safe to call repeatedly.

    Used by the setup script so a fresh environment does not need anyone to
    click through the Supabase dashboard.
    """
    from utils.constants import ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES  # noqa: F401

    if _use_local():
        _root().mkdir(parents=True, exist_ok=True)
        return f"local folder {_root()}"

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        existing = await client.get(
            f"{_base()}/bucket/{settings.SUPABASE_BUCKET}", headers=_headers()
        )
        if existing.status_code == 200:
            return "already exists"

        res = await client.post(
            f"{_base()}/bucket",
            json={
                "id": settings.SUPABASE_BUCKET,
                "name": settings.SUPABASE_BUCKET,
                "public": False,
                "file_size_limit": MAX_UPLOAD_BYTES,
            },
            headers=_headers(**{"Content-Type": "application/json"}),
        )
    if res.status_code >= 400:
        raise RuntimeError(f"Could not create bucket ({res.status_code}): {res.text[:300]}")
    return "created"


