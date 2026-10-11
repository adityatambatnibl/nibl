import hashlib
import os
import re

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select

from database import repo
from database.connection import after_commit
from models.apqp import ApqpActivityRecord, ApqpProject
from models.attachment import Attachment, EntityType
from models.order import Order, OrderStage
from models.user import User
from services import storage_service
from utils.constants import ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES

EXCEL_EXTENSIONS = {".xlsx", ".xls", ".xlsm"}


def is_excel(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in EXCEL_EXTENSIONS


def _safe_product_folder(product_name: str | None, fallback: str) -> str:
    """
    Converts the product name into a safe folder name for Windows/local
    storage and Supabase object paths.
    """
    name = (product_name or "").strip()

    if not name:
        name = fallback

    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"[\x00-\x1f]", "_", name)
    name = re.sub(r"\s+", " ", name).strip()
    name = name.rstrip(". ")

    if not name:
        name = fallback

    reserved = {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "COM1",
        "COM2",
        "COM3",
        "COM4",
        "COM5",
        "COM6",
        "COM7",
        "COM8",
        "COM9",
        "LPT1",
        "LPT2",
        "LPT3",
        "LPT4",
        "LPT5",
        "LPT6",
        "LPT7",
        "LPT8",
        "LPT9",
    }

    if name.upper() in reserved:
        name = f"{name}_product"

    return name[:150].rstrip(". ")


async def _resolve_entity(
    entity_type: str,
    entity_id: str,
) -> tuple[str | None, str | None, str | None]:
    """
    Resolve the attachment target.

    IMPORTANT:
    ApqpProject.id is the UUID primary key.
    ApqpProject.project_id is a separate TEXT business key.

    Therefore project_id MUST be resolved with a WHERE query,
    never with repo.get(ApqpProject, project_id).
    """

    if entity_type == EntityType.APQP_ACTIVITY:

        rec = await repo.get(
            ApqpActivityRecord,
            entity_id,
        )

        if not rec:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Activity not found.",
            )

        activity_project_id = str(rec.project_id).strip()

        project = await repo.find_one(
            select(ApqpProject).where(
                ApqpProject.project_id == activity_project_id
            )
        )

        if not project:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                f"APQP project not found for project_id '{activity_project_id}'.",
            )

        product_folder = _safe_product_folder(
            project.product_name,
            project.project_id,
        )

        return (
            project.project_id,
            None,
            product_folder,
        )

    if entity_type == EntityType.ORDER_STAGE:

        stage = await repo.get(
            OrderStage,
            entity_id,
        )

        if not stage:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Stage not found.",
            )

        return None, stage.order_no, None

    if entity_type == EntityType.ORDER:

        order = await repo.find_one(
            select(Order).where(
                Order.order_no == entity_id
            )
        )

        if not order:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Order not found.",
            )

        return None, order.order_no, None

    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        f"entity_type must be one of: {', '.join(EntityType.ALL)}",
    )

async def upload(
    file: UploadFile,
    entity_type: str,
    entity_id: str,
    user: User,
    description: str | None = None,
) -> Attachment:

    filename = os.path.basename(file.filename or "").strip()

    if not filename:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No filename supplied.",
        )

    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_UPLOAD_EXTENSIONS))

        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"File type '{ext or 'unknown'}' is not allowed. Permitted: {allowed}",
        )

    content = await file.read()

    if len(content) == 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The file is empty.",
        )

    if len(content) > MAX_UPLOAD_BYTES:
        limit_mb = MAX_UPLOAD_BYTES // (1024 * 1024)

        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File is too large. The maximum size is {limit_mb} MB.",
        )

    project_id, order_no, storage_folder = await _resolve_entity(
        entity_type,
        entity_id,
    )

    path = storage_service.build_path(
        entity_type=entity_type,
        entity_id=entity_id,
        filename=filename,
        folder_name=storage_folder,
    )

    try:
        await storage_service.upload(
            path,
            content,
            file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Could not store the file: {exc}",
        ) from exc

    record = Attachment(
        original_filename=filename,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        storage_path=path,
        sha256=hashlib.sha256(content).hexdigest(),
        entity_type=entity_type,
        entity_id=entity_id,
        project_id=project_id,
        order_no=order_no,
        description=description,
        uploaded_by=str(user.id),
        uploaded_by_name=user.name,
    )

    await repo.add(record)

    return record


async def read_bytes(attachment: Attachment) -> bytes:
    try:
        return await storage_service.download(attachment.storage_path)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Could not read the file: {exc}",
        ) from exc


async def get_or_404(attachment_id: str) -> Attachment:
    record = await repo.get(Attachment, attachment_id)

    if not record:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Attachment not found.",
        )

    return record


async def list_for_entity(
    entity_type: str,
    entity_id: str,
) -> list[Attachment]:

    return list(
        await repo.find_all(
            select(Attachment)
            .where(
                Attachment.entity_type == entity_type,
                Attachment.entity_id == entity_id,
            )
            .order_by(Attachment.uploaded_at.asc())
        )
    )


async def list_for_project(project_id: str) -> list[Attachment]:
    return list(
        await repo.find_all(
            select(Attachment).where(
                Attachment.project_id == project_id
            )
        )
    )


async def list_for_order(order_no: str) -> list[Attachment]:
    return list(
        await repo.find_all(
            select(Attachment).where(
                Attachment.order_no == order_no
            )
        )
    )


async def counts_by_entity(
    entity_ids: list[str],
) -> dict[str, int]:

    if not entity_ids:
        return {}

    rows = await repo.db().execute(
        select(
            Attachment.entity_id,
            func.count(),
        )
        .where(Attachment.entity_id.in_(entity_ids))
        .group_by(Attachment.entity_id)
    )

    return {
        entity_id: n
        for entity_id, n in rows.all()
    }


async def delete(attachment_id: str) -> None:
    record = await get_or_404(attachment_id)

    path = record.storage_path

    await repo.remove(record)

    async def delete_physical_file() -> None:
        await storage_service.delete([path])

    after_commit(delete_physical_file)

async def delete_for_project(project_id: str) -> int:
    return await _delete_where(
        Attachment.project_id == project_id
    )


async def delete_for_order(order_no: str) -> int:
    return await _delete_where(
        Attachment.order_no == order_no
    )


async def _delete_where(*where) -> int:
    records = list(
        await repo.find_all(
            select(Attachment).where(*where)
        )
    )

    if not records:
        return 0

    paths = [r.storage_path for r in records]

    await repo.remove_where(
        Attachment,
        *where
    )

    async def delete_physical_files() -> None:
        await storage_service.delete(paths)

    after_commit(delete_physical_files)

    return len(records)


