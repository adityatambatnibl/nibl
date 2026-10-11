from utils.text import plural
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from models.user import User
from services import notification_service
from utils.deps import require_admin

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    message: str
    link: str | None
    ref_id: str | None
    is_read: bool
    created_at: str


def _out(n) -> NotificationOut:
    return NotificationOut(
        id=str(n.id), type=n.type, title=n.title, message=n.message,
        link=n.link, ref_id=n.ref_id, is_read=n.is_read,
        created_at=n.created_at.isoformat(),
    )


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = Query(default=False),
    _: User = Depends(require_admin),
):
    return [_out(n) for n in await notification_service.list_notifications(unread_only)]


@router.get("/unread-count")
async def unread_count(_: User = Depends(require_admin)):
    return {"count": await notification_service.unread_count()}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, _: User = Depends(require_admin)):
    if not await notification_service.mark_read(notification_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found.")
    return {"message": "Marked as read."}


@router.delete("")
async def delete_all(_: User = Depends(require_admin)):
    count = await notification_service.delete_all()
    return {"message": f"{plural(count, 'notification')} deleted."}


@router.post("/read-all")
async def mark_all_read(_: User = Depends(require_admin)):
    count = await notification_service.mark_all_read()
    return {"message": f"{plural(count, 'notification')} marked as read."}