import io
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from database import repo
from models.apqp import ApqpProject
from models.order import Order
from models.user import User
from services import apqp_service, attachment_service, audit_service, order_service
from utils.constants import Permission
from utils.deps import get_current_user, require_permission

router = APIRouter(prefix="/attachments", tags=["Attachments"])


class AttachmentOut(BaseModel):
    id: str
    original_filename: str
    content_type: str
    size_bytes: int
    entity_type: str
    entity_id: str
    description: str | None
    uploaded_by_name: str
    uploaded_at: str
    is_excel: bool


def _out(a) -> AttachmentOut:
    return AttachmentOut(
        id=str(a.id),
        original_filename=a.original_filename,
        content_type=a.content_type,
        size_bytes=a.size_bytes,
        entity_type=a.entity_type,
        entity_id=a.entity_id,
        description=a.description,
        uploaded_by_name=a.uploaded_by_name,
        uploaded_at=a.uploaded_at.isoformat(),
        is_excel=attachment_service.is_excel(a.original_filename),
    )


@router.post("", response_model=AttachmentOut, status_code=201)
async def upload(
    file: UploadFile = File(...),
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    description: str | None = Form(default=None),
    user: User = Depends(require_permission(Permission.ATTACHMENT_UPLOAD)),
):
    record = await attachment_service.upload(file, entity_type, entity_id, user, description)
    await audit_service.log("file_uploaded", user, "attachment", str(record.id),
                            await _product_of(record), note=record.original_filename)
    return _out(record)


@router.get("", response_model=list[AttachmentOut])
async def list_attachments(
    entity_type: str = Query(...),
    entity_id: str = Query(...),
    _: User = Depends(get_current_user),
):
    records = await attachment_service.list_for_entity(entity_type, entity_id)
    return [_out(r) for r in records]


@router.get("/project/{project_id}", response_model=list[AttachmentOut])
async def list_for_project(project_id: str, _: User = Depends(get_current_user)):
    # The URL carries a product name now, but attachments are indexed by the
    # real project id.
    project_id = (await apqp_service.resolve_project(project_id)).project_id
    records = await attachment_service.list_for_project(project_id)
    return [_out(r) for r in records]


@router.get("/order/{order_no}", response_model=list[AttachmentOut])
async def list_for_order(order_no: str, _: User = Depends(get_current_user)):
    order_no = (await order_service.resolve(order_no)).order_no
    records = await attachment_service.list_for_order(order_no)
    return [_out(r) for r in records]


@router.get("/{attachment_id}/download")
async def download(attachment_id: str, _: User = Depends(get_current_user)):
    record = await attachment_service.get_or_404(attachment_id)
    content = await attachment_service.read_bytes(record)
    return StreamingResponse(
        io.BytesIO(content),
        media_type=record.content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(record.original_filename)}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.delete("/{attachment_id}", status_code=204)
async def delete(
    attachment_id: str,
    user: User = Depends(require_permission(Permission.ATTACHMENT_UPLOAD)),
):
    record = await attachment_service.get_or_404(attachment_id)
    label, filename = await _product_of(record), record.original_filename
    await attachment_service.delete(attachment_id)
    await audit_service.log("file_deleted", user, "attachment", attachment_id, label, note=filename)


async def _product_of(record) -> str | None:
    """The product a file belongs to, for the audit trail."""
    if record.project_id:
        p = await repo.find_one(select(ApqpProject).where(ApqpProject.project_id == record.project_id))
        if p:
            return p.product_name or p.project_id
    if record.order_no:
        o = await repo.find_one(select(Order).where(Order.order_no == record.order_no))
        if o:
            return o.product_name
    return None
