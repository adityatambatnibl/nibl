"""
AI Drawing Control API  -  /api/drawings/...  (also reachable as /npd/api/drawings/...)

Access (decided by the AI Drawing admin, stored in nibl_drawing.drawing.users):
  approved user   open the app, search, view, confirm / deny
  approved admin  everything above + upload, revise, folders, users, email list, records
"""

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from database.connection import db
from models.user import User
from services import drawing_service as svc
from services import import_service, notification_service, storage_service
from utils.deps import get_current_user, get_identity

router = APIRouter(prefix="/drawings", tags=["AI Drawing Control"])


# ── access dependencies ─────────────────────────────────────────────────────

async def dc_user(user: User = Depends(get_current_user)) -> User:
    if not svc.can_view(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to AI Drawing Control.")
    return user


async def dc_admin(user: User = Depends(get_current_user)) -> User:
    if not svc.is_dc_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the drawing administrator can do this.")
    return user


def _ids(raw: str | None) -> list[str]:
    return [x.strip() for x in (raw or "").split(",") if x.strip()]


async def _with_upload_cleanup(coro):
    """If the request fails after the PDF was written, remove the file again."""
    try:
        return await coro
    except Exception:
        await storage_service.delete(db().info.pop("dc_uploaded", []))
        raise


# ── bulk import (drawing admin) ─────────────────────────────────────────────

@router.get("/import")
async def import_preview(user: User = Depends(dc_admin)):
    """What is waiting in data/import/ and what would happen to each file."""
    return await import_service.preview()


@router.post("/import")
async def import_run(limit: int = Query(default=100, ge=1, le=200), user: User = Depends(dc_admin)):
    """Import up to `limit` ready PDFs as approved drawings. Call again while 'remaining' > 0."""
    return await _with_upload_cleanup(import_service.run(user, limit))


# ── notifications (the bell) ────────────────────────────────────────────────

@router.get("/notifications")
async def notifications(user: User = Depends(dc_user)):
    return await notification_service.list_for(user)


@router.get("/notifications/unread-count")
async def notifications_unread(user: User = Depends(dc_user)):
    return {"count": await notification_service.unread_count(user)}


@router.post("/notifications/read-all", status_code=204)
async def notifications_read_all(user: User = Depends(dc_user)):
    await notification_service.mark_all_read(user)


@router.post("/notifications/{notification_id}/read", status_code=204)
async def notification_read(notification_id: str, user: User = Depends(dc_user)):
    await notification_service.mark_read(notification_id, user)


@router.delete("/notifications", status_code=204)
async def notifications_delete(user: User = Depends(dc_user)):
    await notification_service.delete_all(user)


# ── session / dashboard ─────────────────────────────────────────────────────

@router.get("/me")
async def me(user: User | None = Depends(get_identity)):
    """Works for pending users too, so the app can say why it will not open."""
    if user is None:
        return {"can_view": False, "is_admin": False, "status": "missing"}
    return {
        "id": str(user.id), "name": user.name, "email": user.email, "status": user.status,
        "can_view": svc.can_view(user), "is_admin": svc.is_dc_admin(user),
    }


@router.get("/counts")
async def counts(user: User = Depends(dc_user)):
    return await svc.counts(user)


@router.get("/reviews/mine")
async def my_reviews(user: User = Depends(dc_user)):
    return await svc.my_reviews(user)


# ── folders ─────────────────────────────────────────────────────────────────

class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    parent_id: str | None = None


class FolderRename(BaseModel):
    name: str = Field(min_length=1, max_length=60)


@router.get("/folders")
async def folders(_: User = Depends(dc_user)):
    return await svc.list_folders()


@router.post("/folders", status_code=201)
async def create_folder(data: FolderIn, user: User = Depends(dc_admin)):
    f = await svc.create_folder(data.name, data.parent_id, user)
    return {"id": str(f.id), "name": f.name, "parent_id": str(f.parent_id) if f.parent_id else None}


@router.put("/folders/{folder_id}")
async def rename_folder(folder_id: str, data: FolderRename, user: User = Depends(dc_admin)):
    f = await svc.rename_folder(folder_id, data.name, user)
    return {"id": str(f.id), "name": f.name}


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(folder_id: str, user: User = Depends(dc_admin)):
    await svc.delete_folder(folder_id, user)


# ── users, access and email list (admin) ────────────────────────────────────

class StatusIn(BaseModel):
    status: str          # approved | rejected | pending


class RoleIn(BaseModel):
    role: str            # admin | user


class ListIn(BaseModel):
    on: bool


@router.get("/users")
async def users(_: User = Depends(dc_admin)):
    return await svc.list_users()


@router.put("/users/{user_id}/status")
async def set_status(user_id: str, data: StatusIn, admin: User = Depends(dc_admin)):
    return await svc.set_status(user_id, data.status, admin)


@router.put("/users/{user_id}/role")
async def set_role(user_id: str, data: RoleIn, admin: User = Depends(dc_admin)):
    return await svc.set_role(user_id, data.role, admin)


@router.put("/users/{user_id}/email-list")
async def set_on_list(user_id: str, data: ListIn, admin: User = Depends(dc_admin)):
    return await svc.set_on_list(user_id, data.on, admin)


@router.get("/email-list")
async def email_list(_: User = Depends(dc_admin)):
    return await svc.reviewer_list()


# ── records (admin) ─────────────────────────────────────────────────────────

@router.get("/records")
async def records(
    q: str = "", status_filter: str = Query("all", alias="status"),
    page: int = 1, size: int = 25, _: User = Depends(dc_admin),
):
    return await svc.records(q, status_filter, page, size, locked=False)


@router.get("/locked")
async def locked(q: str = "", page: int = 1, size: int = 25, _: User = Depends(dc_admin)):
    return await svc.records(q, "all", page, size, locked=True)


@router.get("/downloads")
async def downloads(
    q: str = "", action: str | None = None,
    date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to"),
    page: int = 1, size: int = 25, _: User = Depends(dc_admin),
):
    return await svc.access_log(q, action, date_from, date_to, page, size)


@router.get("/audit")
async def audit(q: str = "", page: int = 1, size: int = 25, drawing_id: str | None = None,
                _: User = Depends(dc_admin)):
    return await svc.audit(q, page, size, drawing_id)


# ── revisions: decide, remind, file ─────────────────────────────────────────

class DecisionIn(BaseModel):
    decision: str            # confirm | deny
    reason: str | None = Field(default=None, max_length=1000)


@router.post("/revisions/{revision_id}/decision")
async def decide(revision_id: str, data: DecisionIn, user: User = Depends(dc_user)):
    mapping = {"confirm": "confirmed", "deny": "denied"}
    if data.decision not in mapping:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Decision must be confirm or deny.")
    return await svc.decide(revision_id, user, mapping[data.decision], data.reason)


@router.post("/revisions/{revision_id}/remind")
async def remind(revision_id: str, user: User = Depends(dc_admin)):
    return {"reminded": await svc.resend_requests(revision_id, user)}


@router.get("/revisions/{revision_id}/file")
async def revision_file(revision_id: str, request: Request, download: bool = False,
                        user: User = Depends(dc_user)):
    content, rv, d = await svc.open_file(
        revision_id, user, "download" if download else "view",
        request.client.host if request.client else None,
    )
    # The file keeps the name it was uploaded with (fallback: drawing no + revision).
    name = (rv.original_filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip() or f"{d.drawing_no}_Rev_{rv.rev_label}.pdf"
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    disposition = "attachment" if download else "inline"
    return Response(
        content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(name)}",
            "Cache-Control": "no-store",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# ── drawings ────────────────────────────────────────────────────────────────

@router.get("")
async def search(
    q: str = "", field: str = "all", status_filter: str = Query("all", alias="status"),
    folder_id: str | None = None, include_sub: bool = True,
    sort: str = "updated", dir: str = "desc", page: int = 1, size: int = 10,
    user: User = Depends(dc_user),
):
    return await svc.search(user, q, field, status_filter, folder_id, include_sub, sort, dir, page, size)


@router.post("", status_code=201)
async def upload(
    file: UploadFile = File(...),
    folder_id: str = Form(...),
    drawing_no: str = Form(...),
    item_code: str = Form(...),
    description: str = Form(...),
    rev_label: str = Form(...),
    change_note: str = Form(""),
    reviewer_ids: str = Form(""),
    user: User = Depends(dc_admin),
):
    d = await _with_upload_cleanup(svc.upload_new(
        file, folder_id, drawing_no, item_code, description, rev_label, change_note, _ids(reviewer_ids), user,
    ))
    return {"id": str(d.id), "drawing_no": d.drawing_no}


@router.get("/{drawing_id}")
async def detail(drawing_id: str, revision_id: str | None = None, user: User = Depends(dc_user)):
    return await svc.detail(drawing_id, user, revision_id)


class DetailsIn(BaseModel):
    item_code: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=300)
    folder_id: str


@router.put("/{drawing_id}")
async def update_details(drawing_id: str, data: DetailsIn, user: User = Depends(dc_admin)):
    d = await svc.update_details(drawing_id, data.item_code, data.description, data.folder_id, user)
    return {"id": str(d.id)}


@router.post("/{drawing_id}/revise")
async def revise(
    drawing_id: str,
    file: UploadFile = File(...),
    rev_label: str = Form(...),
    change_note: str = Form(...),
    reviewer_ids: str = Form(""),
    user: User = Depends(dc_admin),
):
    d = await _with_upload_cleanup(svc.revise(drawing_id, file, rev_label, change_note, _ids(reviewer_ids), user))
    return {"id": str(d.id), "rev_label": d.current_rev_label}


class DeleteIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.post("/{drawing_id}/delete", status_code=204)
async def delete_drawing(drawing_id: str, data: DeleteIn, user: User = Depends(dc_admin)):
    """Soft delete: hidden from everyone, kept for the record, can be restored."""
    await svc.delete_drawing(drawing_id, data.reason, user)


@router.post("/{drawing_id}/restore")
async def restore_drawing(drawing_id: str, user: User = Depends(dc_admin)):
    d = await svc.restore_drawing(drawing_id, user)
    return {"id": str(d.id), "status": d.status}
