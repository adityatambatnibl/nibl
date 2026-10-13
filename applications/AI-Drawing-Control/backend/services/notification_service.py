"""
The bell: in-app notifications for Drawing Control.

Who gets what
  reviewers  a drawing / revision is waiting for their Confirm or Deny; a drawing
             they were reviewing is denied, approved, deleted or restored
  admins     a revision is denied or approved; a new person asks for access
Rows are written in the same transaction as the event, so they never get lost.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, update

from database import repo
from database.connection import db
from models.notification import Notification
from models.user import AccountStatus, Role, User

KEEP = 100          # newest notifications kept per person


async def admin_ids() -> list[uuid.UUID]:
    rows = await repo.find_all(select(User.id).where(
        User.is_active.is_(True), User.status == AccountStatus.APPROVED, User.role == Role.ADMIN,
    ))
    return list(rows)


async def notify(user_ids: Iterable, title: str, message: str = "", link: str = "", skip=None) -> int:
    ids = {repo.as_uuid(str(u)) for u in user_ids if u} - ({repo.as_uuid(str(skip))} if skip else set())
    ids.discard(None)
    for uid in ids:
        db().add(Notification(user_id=uid, title=title[:200], message=(message or "")[:600], link=link or ""))
    return len(ids)


async def list_for(user: User, limit: int = 50) -> list[dict]:
    rows = await repo.find_all(
        select(Notification).where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc()).limit(max(1, min(limit, KEEP)))
    )
    return [{"id": str(n.id), "title": n.title, "message": n.message, "link": n.link,
             "is_read": n.is_read, "created_at": n.created_at.isoformat()} for n in rows]


async def unread_count(user: User) -> int:
    return int((await db().execute(
        select(func.count()).select_from(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
    )).scalar_one())


async def mark_read(notification_id: str, user: User) -> None:
    res = await db().execute(update(Notification).where(
        Notification.id == repo.as_uuid(notification_id), Notification.user_id == user.id
    ).values(is_read=True))
    if not res.rowcount:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found.")


async def mark_all_read(user: User) -> None:
    await db().execute(update(Notification).where(
        Notification.user_id == user.id, Notification.is_read.is_(False)
    ).values(is_read=True))


async def delete_all(user: User) -> None:
    await db().execute(delete(Notification).where(Notification.user_id == user.id))
