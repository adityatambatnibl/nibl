from datetime import datetime, timezone

from sqlalchemy import delete, select, update

from database import repo
from database.connection import db
from models.notification import Notification
from utils.constants import NotificationType


async def create(
    type: str,
    title: str,
    message: str,
    link: str | None = None,
    ref_id: str | None = None,
) -> Notification:
    n = Notification(type=type, title=title, message=message, link=link, ref_id=ref_id)
    await repo.add(n)
    return n


async def notify_signup(user_id: str, name: str, email: str) -> None:
    await create(
        type=NotificationType.SIGNUP_REQUEST,
        title="New account request",
        message=f"{name} ({email}) has requested access.",
        link="/admin/approvals",
        ref_id=user_id,
    )


async def list_notifications(unread_only: bool = False, limit: int = 50) -> list[Notification]:
    stmt = select(Notification).order_by(Notification.created_at.desc()).limit(limit)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    return list(await repo.find_all(stmt))


async def unread_count() -> int:
    return await repo.count(select(Notification).where(Notification.is_read.is_(False)))


async def mark_read(notification_id: str) -> bool:
    n = await repo.get(Notification, notification_id)
    if not n:
        return False
    n.is_read = True
    n.read_at = datetime.now(timezone.utc)
    return True


async def mark_all_read() -> int:
    """
    One UPDATE instead of a read-then-save loop.

    The Beanie version loaded every unread notification and saved them back
    one at a time, which was a round trip per row. Marking them in place is a
    single statement and cannot race with a notification arriving mid-loop.
    """
    result = await db().execute(
        update(Notification)
        .where(Notification.is_read.is_(False))
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    return result.rowcount or 0


async def delete_all() -> int:
    """Removes every notification. One statement."""
    result = await db().execute(delete(Notification))
    return result.rowcount or 0


async def mark_read_by_ref(ref_id: str) -> int:
    """Clears notifications tied to a record once it's been actioned."""
    result = await db().execute(
        update(Notification)
        .where(Notification.ref_id == ref_id, Notification.is_read.is_(False))
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    return result.rowcount or 0
