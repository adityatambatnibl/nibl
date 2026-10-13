"""
Drawing Control - business logic.

Routes call into here; nothing in this module knows about HTTP beyond raising
HTTPException with a message the user can act on. Every write runs inside the
request's single transaction (see main.py), so an upload, a confirm or a deny
either happens completely - drawing row, revision, reviews, audit entry - or
not at all. Emails are queued with after_commit(), so a rolled-back request
never sends mail.

Rules (from the Drawing Control project explanation):
  * only drawing admins upload / revise / manage folders and the email list
  * only controlled PDF copies are accepted
  * every listed user must Confirm; Deny needs a reason and closes the revision
  * revising locks the previous revision - admin-only from then on
  * every view and download is logged
"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, func, or_, select, update

from config.settings import settings
from database import repo
from database.connection import after_commit, db
from models.audit import AuditLog
from models.drawing import (
    Decision,
    Drawing,
    DrawingAccessLog,
    DrawingFolder,
    DrawingReview,
    DrawingReviewer,
    DrawingRevision,
    DrawingStatus,
)
from models.user import User
from services import audit_service, notification_service, storage_service
from models.user import AccountStatus, Role
from utils.constants import MAX_UPLOAD_BYTES

AUDIT_TYPES = ("drawing", "drawing_folder", "drawing_access")
MAX_NAME = 120


def now() -> datetime:
    return datetime.now(timezone.utc)


# ───────────────────────────────────────────────────────────────────────────
#  Access
# ───────────────────────────────────────────────────────────────────────────

def can_view(user: User) -> bool:
    """Approved by the Drawing admin (approval lives in this app's own database)."""
    return user.is_approved


def is_dc_admin(user: User) -> bool:
    return user.is_admin


def _clean(value: str | None, field: str, *, required: bool = True, max_len: int = 200) -> str:
    text = re.sub(r"\s+", " ", (value or "")).strip()
    if required and not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} is required.")
    if len(text) > max_len:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} is too long (max {max_len} characters).")
    return text


# ───────────────────────────────────────────────────────────────────────────
#  Folders (product tree)
# ───────────────────────────────────────────────────────────────────────────

@dataclass
class FolderMap:
    by_id: dict[uuid.UUID, DrawingFolder]
    children: dict[uuid.UUID | None, list[DrawingFolder]]

    def path(self, folder_id: uuid.UUID | None) -> list[str]:
        out: list[str] = []
        seen = set()
        cur = self.by_id.get(folder_id) if folder_id else None
        while cur and cur.id not in seen:
            seen.add(cur.id)
            out.append(cur.name)
            cur = self.by_id.get(cur.parent_id) if cur.parent_id else None
        return list(reversed(out))

    def path_str(self, folder_id: uuid.UUID | None) -> str:
        return " › ".join(self.path(folder_id))

    def descendants(self, folder_id: uuid.UUID) -> list[uuid.UUID]:
        out, stack = [], [folder_id]
        while stack:
            fid = stack.pop()
            out.append(fid)
            stack.extend(c.id for c in self.children.get(fid, []))
        return out


async def folder_map() -> FolderMap:
    rows = await repo.find_all(select(DrawingFolder))
    by_id = {f.id: f for f in rows}
    children: dict[uuid.UUID | None, list[DrawingFolder]] = {}
    for f in rows:
        children.setdefault(f.parent_id, []).append(f)
    for lst in children.values():
        lst.sort(key=lambda f: f.name.lower())
    return FolderMap(by_id, children)


async def list_folders() -> list[dict]:
    """Every folder with the number of drawings directly inside it."""
    fm = await folder_map()
    counts = dict(
        (await db().execute(
            select(Drawing.folder_id, func.count()).where(Drawing.status != DrawingStatus.DELETED).group_by(Drawing.folder_id)
        )).all()
    )
    return [
        {
            "id": str(f.id),
            "parent_id": str(f.parent_id) if f.parent_id else None,
            "name": f.name,
            "direct_count": int(counts.get(f.id, 0)),
        }
        for f in sorted(fm.by_id.values(), key=lambda f: f.name.lower())
    ]


async def _folder_or_404(folder_id) -> DrawingFolder:
    f = await repo.get(DrawingFolder, folder_id)
    if not f:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Folder not found.")
    return f


async def _sibling_exists(parent_id, name: str, exclude_id=None) -> bool:
    stmt = select(DrawingFolder.id).where(
        DrawingFolder.parent_id.is_(None) if parent_id is None else DrawingFolder.parent_id == parent_id,
        func.lower(DrawingFolder.name) == name.lower(),
    )
    if exclude_id is not None:
        stmt = stmt.where(DrawingFolder.id != exclude_id)
    return await repo.exists(stmt)


async def create_folder(name: str, parent_id: str | None, user: User) -> DrawingFolder:
    name = _clean(name, "Folder name", max_len=60)
    if "/" in name or "\\" in name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Folder names cannot contain / or \\.")
    parent = await _folder_or_404(parent_id) if parent_id else None
    pid = parent.id if parent else None
    if await _sibling_exists(pid, name):
        raise HTTPException(status.HTTP_409_CONFLICT, f'A folder named "{name}" already exists here.')
    folder = DrawingFolder(parent_id=pid, name=name, created_by=user.name)
    await repo.add(folder)
    fm = await folder_map()
    await audit_service.log("dc_folder_created", user, "drawing_folder", str(folder.id), fm.path_str(folder.id))
    dir_key = folder_key(fm, folder.id)
    after_commit(lambda: storage_service.ensure_dir(dir_key))
    return folder


async def rename_folder(folder_id: str, name: str, user: User) -> DrawingFolder:
    folder = await _folder_or_404(folder_id)
    name = _clean(name, "Folder name", max_len=60)
    if "/" in name or "\\" in name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Folder names cannot contain / or \\.")
    if await _sibling_exists(folder.parent_id, name, exclude_id=folder.id):
        raise HTTPException(status.HTTP_409_CONFLICT, f'A folder named "{name}" already exists here.')
    old = folder.name
    old_dir = folder_key(await folder_map(), folder.id)
    folder.name = name
    folder.updated_at = now()
    await repo.touch()
    fm = await folder_map()
    new_dir = folder_key(fm, folder.id)
    if old_dir.lower() != new_dir.lower():
        after_commit(lambda: storage_service.move_dir(old_dir, new_dir))
    await audit_service.log("dc_folder_renamed", user, "drawing_folder", str(folder.id), fm.path_str(folder.id),
                            before={"name": old}, after={"name": name})
    return folder


async def delete_folder(folder_id: str, user: User) -> None:
    folder = await _folder_or_404(folder_id)
    if await repo.exists(select(DrawingFolder.id).where(DrawingFolder.parent_id == folder.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only empty folders can be deleted. This folder has subfolders.")
    if await repo.exists(select(Drawing.id).where(
        Drawing.folder_id == folder.id, Drawing.status != DrawingStatus.DELETED
    )):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only empty folders can be deleted. This folder has drawings.")

    # Deleted drawings are kept for the record, so they cannot go with the folder.
    # They move up to the parent folder (still deleted, still restorable).
    kept = list(await repo.find_all(select(Drawing).where(
        Drawing.folder_id == folder.id, Drawing.status == DrawingStatus.DELETED
    )))
    if kept and folder.parent_id is None:
        names = ", ".join(d.drawing_no for d in kept[:5]) + (" ..." if len(kept) > 5 else "")
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This folder still holds {len(kept)} deleted drawing{'s' if len(kept) != 1 else ''} kept for the record ({names}). "
            f"Open Drawings -> Deleted, restore {'it' if len(kept) == 1 else 'them'} and move "
            f"{'it' if len(kept) == 1 else 'them'} to another folder, then delete this folder.",
        )
    fm = await folder_map()
    label = fm.path_str(folder.id)
    for d in kept:
        d.folder_id = folder.parent_id
    if kept:
        await repo.touch()
    dir_key = folder_key(fm, folder.id)
    await repo.remove(folder)
    after_commit(lambda: storage_service.remove_empty_dir(dir_key))
    await audit_service.log(
        "dc_folder_deleted", user, "drawing_folder", folder_id, label,
        note=(f"{len(kept)} deleted drawing{'s' if len(kept) != 1 else ''} moved to {fm.path_str(folder.parent_id)}: "
              + ", ".join(d.drawing_no for d in kept)) if kept else None,
    )


# ───────────────────────────────────────────────────────────────────────────
#  Register: search, counts
# ───────────────────────────────────────────────────────────────────────────

SEARCH_FIELDS = {"all", "item", "desc", "dwg"}
SORTS = {
    "drawing_no": Drawing.drawing_no,
    "item_code": Drawing.item_code,
    "description": Drawing.description,
    "status": Drawing.status,
    "updated": Drawing.updated_at,
}


def _like(term: str) -> str:
    return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _search_filter(q: str, field: str):
    terms = [t for t in (q or "").lower().split() if t]
    if not terms:
        return None
    if field == "item":
        col = func.lower(Drawing.item_code)
    elif field == "desc":
        col = func.lower(Drawing.description)
    elif field == "dwg":
        col = func.lower(Drawing.drawing_no)
    else:
        # Same expression as the trigram index in database/connection.py.
        col = func.lower(Drawing.drawing_no + " " + Drawing.item_code + " " + Drawing.description)
    return and_(*[col.like(_like(t), escape="\\") for t in terms])


def _my_pending_ids(user: User):
    return select(DrawingReview.drawing_id).where(
        DrawingReview.user_id == user.id, DrawingReview.decision == Decision.PENDING
    )


async def search(
    user: User,
    q: str = "",
    field: str = "all",
    status_filter: str = "all",
    folder_id: str | None = None,
    include_sub: bool = True,
    sort: str = "updated",
    direction: str = "desc",
    page: int = 1,
    size: int = 10,
) -> dict:
    size = max(1, min(size, 500))
    page = max(1, page)
    fm = await folder_map()

    conds = []
    f = _search_filter(q, field if field in SEARCH_FIELDS else "all")
    if f is not None:
        conds.append(f)
    if status_filter == "deleted":
        if not is_dc_admin(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the drawing administrator can see deleted drawings.")
        conds.append(Drawing.status == DrawingStatus.DELETED)
    else:
        conds.append(Drawing.status != DrawingStatus.DELETED)
    if status_filter == "pending":
        conds.append(Drawing.status.in_([DrawingStatus.UNDER_REVIEW, DrawingStatus.DENIED]))
    elif status_filter in (DrawingStatus.UNDER_REVIEW, DrawingStatus.DENIED, DrawingStatus.APPROVED):
        conds.append(Drawing.status == status_filter)
    elif status_filter == "mine":
        conds.append(Drawing.id.in_(_my_pending_ids(user)))
    if folder_id:
        fid = repo.as_uuid(folder_id)
        if fid is None or fid not in fm.by_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Folder not found.")
        conds.append(Drawing.folder_id.in_(fm.descendants(fid)) if include_sub else Drawing.folder_id == fid)

    base = select(Drawing).where(*conds)
    total = await repo.count(base)

    col = SORTS.get(sort, Drawing.updated_at)
    order = col.desc() if direction == "desc" else col.asc()
    rows = await repo.find_all(base.order_by(order, Drawing.drawing_no.asc()).offset((page - 1) * size).limit(size))

    mine = set()
    if rows:
        mine = set(
            (await db().execute(
                _my_pending_ids(user).where(DrawingReview.drawing_id.in_([d.id for d in rows]))
            )).scalars().all()
        )
    return {
        "items": [_drawing_row(d, fm, d.id in mine) for d in rows],
        "total": total,
        "page": page,
        "size": size,
    }


def _drawing_row(d: Drawing, fm: FolderMap, awaiting_me: bool = False) -> dict:
    return {
        "id": str(d.id),
        "drawing_no": d.drawing_no,
        "item_code": d.item_code,
        "description": d.description,
        "folder_id": str(d.folder_id),
        "folder_path": fm.path_str(d.folder_id),
        "rev_label": d.current_rev_label,
        "revision_count": d.revision_count,
        "status": d.status,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        "awaiting_me": awaiting_me,
    }


async def profile_stats(user: User) -> dict:
    """For the My profile page: Email List membership and this person's answers."""
    rows = dict((await db().execute(
        select(DrawingReview.decision, func.count()).where(DrawingReview.user_id == user.id).group_by(DrawingReview.decision)
    )).all())
    on_list = await repo.exists(select(DrawingReviewer.user_id).where(DrawingReviewer.user_id == user.id))
    return {
        "on_email_list": bool(on_list),
        "waiting": int(rows.get(Decision.PENDING, 0)),
        "confirmed": int(rows.get(Decision.CONFIRMED, 0)),
        "denied": int(rows.get(Decision.DENIED, 0)),
    }


async def counts(user: User) -> dict:
    rows = dict((await db().execute(select(Drawing.status, func.count()).group_by(Drawing.status))).all())
    mine = await repo.count(
        select(DrawingReview.id).where(DrawingReview.user_id == user.id, DrawingReview.decision == Decision.PENDING)
    )
    ur, dn, ap = (int(rows.get(k, 0)) for k in (DrawingStatus.UNDER_REVIEW, DrawingStatus.DENIED, DrawingStatus.APPROVED))
    return {
        "total": ur + dn + ap,
        "under_review": ur,
        "denied": dn,
        "approved": ap,
        "pending": ur + dn,
        "mine": mine,
        "deleted": int(rows.get(DrawingStatus.DELETED, 0)) if is_dc_admin(user) else 0,
    }


async def my_reviews(user: User) -> list[dict]:
    """Drawings waiting for this user's Confirm / Deny, oldest first."""
    fm = await folder_map()
    rows = (await db().execute(
        select(DrawingReview, DrawingRevision, Drawing)
        .join(DrawingRevision, DrawingRevision.id == DrawingReview.revision_id)
        .join(Drawing, Drawing.id == DrawingReview.drawing_id)
        .where(DrawingReview.user_id == user.id, DrawingReview.decision == Decision.PENDING)
        .order_by(DrawingRevision.uploaded_at.asc())
    )).all()
    return [
        {
            **_drawing_row(d, fm, True),
            "revision_id": str(rv.id),
            "sent_at": (r.notified_at or rv.uploaded_at).isoformat(),
            "reminders_sent": r.reminders_sent,
            "change_note": rv.change_note,
        }
        for r, rv, d in rows
    ]


# ───────────────────────────────────────────────────────────────────────────
#  Drawing detail
# ───────────────────────────────────────────────────────────────────────────

async def _drawing_or_404(drawing_id) -> Drawing:
    d = await repo.get(Drawing, drawing_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drawing not found.")
    return d


async def _revision_or_404(revision_id, user: User) -> DrawingRevision:
    rv = await repo.get(DrawingRevision, revision_id)
    if not rv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Revision not found.")
    if rv.locked and not is_dc_admin(user):
        # Locked revisions exist only for the drawing admin.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Revision not found.")
    return rv


def _review_out(r: DrawingReview) -> dict:
    return {
        "user_id": str(r.user_id),
        "user_name": r.user_name,
        "user_email": r.user_email,
        "decision": r.decision,
        "reason": r.reason,
        "decided_at": r.decided_at.isoformat() if r.decided_at else None,
        "notified_at": r.notified_at.isoformat() if r.notified_at else None,
        "reminders_sent": r.reminders_sent,
    }


def _revision_out(rv: DrawingRevision, reviews: list[DrawingReview] | None = None) -> dict:
    out = {
        "id": str(rv.id),
        "seq": rv.seq,
        "rev_label": rv.rev_label,
        "change_note": rv.change_note,
        "original_filename": rv.original_filename,
        "size_bytes": rv.size_bytes,
        "status": DrawingStatus.LOCKED if rv.locked else rv.status,
        "review_status": rv.status,
        "locked": rv.locked,
        "uploaded_by_name": rv.uploaded_by_name,
        "uploaded_at": rv.uploaded_at.isoformat(),
        "decided_at": rv.decided_at.isoformat() if rv.decided_at else None,
        "locked_at": rv.locked_at.isoformat() if rv.locked_at else None,
        "locked_by_name": rv.locked_by_name,
    }
    if reviews is not None:
        out["reviews"] = [_review_out(r) for r in sorted(reviews, key=lambda r: r.user_name.lower())]
        out["confirmed"] = sum(1 for r in reviews if r.decision == Decision.CONFIRMED)
        out["reviewer_total"] = sum(1 for r in reviews if r.decision != Decision.CANCELLED)
    return out


async def _reviews_for(revision_id) -> list[DrawingReview]:
    return list(await repo.find_all(select(DrawingReview).where(DrawingReview.revision_id == revision_id)))


async def detail(drawing_id: str, user: User, revision_id: str | None = None) -> dict:
    d = await _drawing_or_404(drawing_id)
    admin = is_dc_admin(user)
    if d.status == DrawingStatus.DELETED and not admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drawing not found.")
    fm = await folder_map()

    revs = list(await repo.find_all(
        select(DrawingRevision).where(DrawingRevision.drawing_id == d.id).order_by(DrawingRevision.seq.desc())
    ))
    visible = [r for r in revs if admin or not r.locked]

    if revision_id:
        shown = next((r for r in visible if str(r.id) == str(revision_id)), None)
        if shown is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Revision not found.")
    else:
        shown = next((r for r in revs if r.id == d.current_revision_id), visible[0] if visible else None)

    reviews = await _reviews_for(shown.id) if shown else []
    mine = next((r for r in reviews if r.user_id == user.id), None)
    can_decide = bool(
        shown and not shown.locked and d.status != DrawingStatus.DELETED
        and mine and mine.decision in (Decision.PENDING, Decision.DENIED)
    )
    return {
        "drawing": _drawing_row(d, fm, bool(can_decide and mine.decision == Decision.PENDING)),
        "folder_names": fm.path(d.folder_id),
        "revisions": [_revision_out(r) for r in visible],
        "hidden_locked": len(revs) - len(visible),
        "shown": _revision_out(shown, reviews) if shown else None,
        "my_review": _review_out(mine) if mine else None,
        "can_decide": can_decide,
        "is_admin": admin,
        "deleted": await _deleted_info(d) if d.status == DrawingStatus.DELETED else None,
    }


async def _deleted_info(d: Drawing) -> dict | None:
    """Who deleted it, when and why - read from the audit record."""
    row = await repo.find_one(
        select(AuditLog).where(AuditLog.action == "dc_drawing_deleted", AuditLog.target_id == str(d.id))
        .order_by(AuditLog.created_at.desc()).limit(1)
    )
    if not row:
        return {"by": "", "at": None, "reason": ""}
    return {"by": row.actor_name, "at": row.created_at.isoformat(), "reason": row.note or ""}


def _not_deleted(d: Drawing) -> None:
    if d.status == DrawingStatus.DELETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This drawing is deleted. Restore it first.")


async def delete_drawing(drawing_id: str, reason: str, user: User) -> None:
    """Admin only. The drawing disappears for everyone, open reviews stop and no
    more reminders are sent. Nothing is erased: revisions, PDFs, reviews and logs
    stay, and the admin can restore it from Drawings -> Deleted."""
    d = (await db().execute(select(Drawing).where(Drawing.id == repo.as_uuid(drawing_id)).with_for_update())).scalar_one_or_none()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drawing not found.")
    _not_deleted(d)
    reason = _clean(reason, "Reason", max_len=500)
    if len(reason) < 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Please write the reason for deleting.")
    before = d.status
    cancelled = 0
    waiting = []
    if d.current_revision_id:
        waiting = (await db().execute(select(DrawingReview.user_id).where(
            DrawingReview.revision_id == d.current_revision_id, DrawingReview.decision == Decision.PENDING
        ))).scalars().all()
        res = await db().execute(
            update(DrawingReview)
            .where(DrawingReview.revision_id == d.current_revision_id, DrawingReview.decision == Decision.PENDING)
            .values(decision=Decision.CANCELLED)
        )
        cancelled = res.rowcount or 0
    d.status = DrawingStatus.DELETED
    d.updated_at = now()
    await repo.touch()
    fm = await folder_map()
    lib, gone = library_key(fm, d), deleted_key(fm, d)
    after_commit(lambda: storage_service.move(lib, gone))
    await audit_service.log("dc_drawing_deleted", user, "drawing", str(d.id), d.drawing_no,
                            before={"status": before, "rev": d.current_rev_label},
                            after={"status": DrawingStatus.DELETED, "open_reviews_stopped": cancelled},
                            note=reason)
    await notification_service.notify(
        waiting, "Drawing deleted", f"{d.drawing_no} was deleted by {user.name} - no review needed. Reason: {reason}",
        "", skip=user.id)


async def restore_drawing(drawing_id: str, user: User) -> Drawing:
    """Admin only. Brings the drawing back with the status of its current revision;
    if that revision was still under review, the stopped reviews are reopened."""
    d = (await db().execute(select(Drawing).where(Drawing.id == repo.as_uuid(drawing_id)).with_for_update())).scalar_one_or_none()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drawing not found.")
    if d.status != DrawingStatus.DELETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This drawing is not deleted.")
    rv = await repo.get(DrawingRevision, d.current_revision_id) if d.current_revision_id else None
    d.status = rv.status if rv and rv.status in DrawingStatus.ACTIVE else DrawingStatus.UNDER_REVIEW
    reopened = 0
    if rv and rv.status == DrawingStatus.UNDER_REVIEW:
        # Only the delete cancels reviews on the CURRENT revision (a revise
        # cancels them on the old, locked one), so these are safe to reopen.
        res = await db().execute(
            update(DrawingReview)
            .where(DrawingReview.revision_id == rv.id, DrawingReview.decision == Decision.CANCELLED)
            .values(decision=Decision.PENDING)
        )
        reopened = res.rowcount or 0
        back = (await db().execute(select(DrawingReview.user_id).where(
            DrawingReview.revision_id == rv.id, DrawingReview.decision == Decision.PENDING
        ))).scalars().all()
        await notification_service.notify(
            back, "Drawing restored - review again",
            f"{d.drawing_no} Rev {rv.rev_label} is back. Please confirm or deny.", f"/view/{d.id}", skip=user.id)
    d.updated_at = now()
    await repo.touch()
    if rv is not None:
        fm = await folder_map()
        src, lib, gone = rv.storage_path, library_key(fm, d), deleted_key(fm, d)

        async def put_back():
            await storage_service.publish_copy(src, lib)
            await storage_service.delete([gone])     # the copy parked in _deleted is no longer needed
        after_commit(put_back)
    await audit_service.log("dc_drawing_restored", user, "drawing", str(d.id), d.drawing_no,
                            before={"status": DrawingStatus.DELETED},
                            after={"status": d.status, "reviews_reopened": reopened})
    return d


# ───────────────────────────────────────────────────────────────────────────
#  Upload / revise
# ───────────────────────────────────────────────────────────────────────────

async def _read_pdf(file: UploadFile) -> tuple[bytes, str]:
    filename = os.path.basename(file.filename or "").strip()
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Only controlled PDF copies can be uploaded. Please choose a .pdf file.")
    content = await file.read()
    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"The file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    if not content[:1024].lstrip().startswith(b"%PDF-"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "This file is not a real PDF (it may be renamed). Only controlled PDF copies are accepted.")
    return content, filename


def _safe_segment(name: str) -> str:
    seg = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip().rstrip(". ")
    return seg[:80] or "folder"


# ── The drawing library on disk ────────────────────────────────────────────
#   data/drawings/<product tree>/<drawing name>.pdf   the CURRENT revision - people browse
#                                                     this folder and drop new PDFs into it
#   data/drawings/_history/<tree>/<name>__002_rev2.pdf every revision's own permanent copy
#                                                     (what the app opens; never overwritten)
#   data/drawings/_deleted/<tree>/<name>.pdf          library copy of a deleted drawing
LIBRARY = "drawings"
UNSORTED = "Unsorted"


def _tree_segments(fm: "FolderMap", folder_id) -> list[str]:
    return [_safe_segment(p) for p in fm.path(folder_id)] or [UNSORTED]


def folder_key(fm: "FolderMap", folder_id) -> str:
    return "/".join([LIBRARY, *_tree_segments(fm, folder_id)])


def library_key(fm: "FolderMap", d: Drawing) -> str:
    return f"{folder_key(fm, d.folder_id)}/{_safe_segment(d.drawing_no)}.pdf"


def history_key(fm: "FolderMap", d: Drawing, seq: int, label: str) -> str:
    return "/".join([LIBRARY, "_history", *_tree_segments(fm, d.folder_id),
                     f"{_safe_segment(d.drawing_no)}__{seq:03d}_rev{_safe_segment(label)}.pdf"])


def deleted_key(fm: "FolderMap", d: Drawing) -> str:
    return "/".join([LIBRARY, "_deleted", *_tree_segments(fm, d.folder_id), f"{_safe_segment(d.drawing_no)}.pdf"])


async def _resolve_reviewers(reviewer_ids: list[str]) -> list[User]:
    ids = [repo.as_uuid(x) for x in reviewer_ids]
    ids = list(dict.fromkeys(i for i in ids if i is not None))
    if not ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Choose at least one user to confirm this drawing (the Email List may be empty).")
    users = list(await repo.find_all(select(User).where(User.id.in_(ids))))
    usable = [u for u in users if u.is_active and u.status == AccountStatus.APPROVED and u.email]
    if len(usable) != len(ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "One or more selected users are inactive or not approved. Refresh and choose again.")
    return usable


async def _store_revision(
    d: Drawing, fm: FolderMap, content: bytes, filename: str, rev_label: str, change_note: str,
    reviewers: list[User], user: User,
) -> DrawingRevision:
    seq = int((await db().execute(
        select(func.coalesce(func.max(DrawingRevision.seq), 0)).where(DrawingRevision.drawing_id == d.id)
    )).scalar_one()) + 1
    key = history_key(fm, d, seq, rev_label)
    await storage_service.upload(key, content, "application/pdf")
    # If anything later in this request fails, the row is rolled back but the
    # file would stay behind - remove it in that case.
    db().info.setdefault("dc_uploaded", []).append(key)
    # Once saved, the readable library copy becomes this revision.
    lib = library_key(fm, d)
    after_commit(lambda: storage_service.publish_copy(key, lib))

    rv = DrawingRevision(
        drawing_id=d.id,
        seq=seq,
        rev_label=rev_label,
        change_note=change_note,
        original_filename=filename,
        storage_path=key,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        uploaded_by=str(user.id),
        uploaded_by_name=user.name,
        # Released straight away (decided 12 Oct 2026): the listed users are
        # asked to CONFIRM they have seen it; it does not wait for them.
        status=DrawingStatus.APPROVED,
        decided_at=now(),
    )
    await repo.add(rv)
    await repo.add_all([
        DrawingReview(
            revision_id=rv.id, drawing_id=d.id, user_id=u.id, user_name=u.name, user_email=u.email,
        )
        for u in reviewers
    ])

    d.current_revision_id = rv.id
    d.current_rev_label = rev_label
    d.revision_count = seq
    d.status = DrawingStatus.APPROVED
    d.updated_at = now()
    await repo.touch()
    return rv


async def _email_list_users() -> list[User]:
    """Everyone on the Email List who can still confirm (active, approved, has an email)."""
    users = list(await repo.find_all(
        select(User).join(DrawingReviewer, DrawingReviewer.user_id == User.id).where(
            User.is_active.is_(True), User.status == AccountStatus.APPROVED, User.email.isnot(None))
    ))
    if not users:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "The Email List is empty. Add the users who must confirm drawings in "
                            "Users & Approvals -> Email List, then upload again.")
    return users


def _name_from_file(filename: str) -> str:
    """The drawing's name is the PDF file name without ".pdf" (decided 12 Oct 2026)."""
    name = re.sub(r"\s+", " ", os.path.splitext(os.path.basename(filename or ""))[0]).strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The PDF file name is empty.")
    return name[:MAX_NAME]


FIRST_REV = "A"


def rev_letters(n: int) -> str:
    """1 -> A, 2 -> B ... 26 -> Z, 27 -> AA (revision letters, decided 12 Oct 2026)."""
    out = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out or FIRST_REV


def _letters_value(s: str) -> int:
    n = 0
    for ch in s.upper():
        n = n * 26 + (ord(ch) - 64)
    return n


def next_rev_label(current: str, seq: int) -> str:
    """Next revision letter. Old numeric labels (1, 2, 3 from before) continue as letters: after 2 comes C."""
    cur = (current or "").strip()
    if re.fullmatch(r"[A-Za-z]{1,3}", cur):
        return rev_letters(_letters_value(cur) + 1)
    if re.fullmatch(r"\d+", cur):
        return rev_letters(int(cur) + 1)
    return rev_letters(seq)


async def _recipients(reviewer_ids: list[str] | None) -> list[User]:
    """The people picked on screen; nobody picked = everyone on the Email List."""
    return await _resolve_reviewers(reviewer_ids) if reviewer_ids else await _email_list_users()


async def next_rev_unique(d: Drawing) -> tuple[int, str]:
    """(next seq, next revision label) - the label counts on and is never reused."""
    seq = int((await db().execute(
        select(func.coalesce(func.max(DrawingRevision.seq), 0)).where(DrawingRevision.drawing_id == d.id)
    )).scalar_one()) + 1
    label = next_rev_label(d.current_rev_label, seq)
    taken = set((await db().execute(
        select(func.lower(DrawingRevision.rev_label)).where(DrawingRevision.drawing_id == d.id)
    )).scalars().all())
    n = seq
    while label.lower() in taken:
        label = rev_letters(n)
        n += 1
    return seq, label


async def mail_preview(user: User, file_name: str, drawing_id: str | None, reviewer_ids: list[str] | None) -> dict:
    """What the confirmation mail will look like, and who gets it - nothing is saved or sent."""
    from types import SimpleNamespace
    from services import drawing_email_service as M

    recipients = await _recipients(reviewer_ids)
    if drawing_id:
        d = await _drawing_or_404(repo.as_uuid(drawing_id))
        _seq, rev_label = await next_rev_unique(d)
        fname = (file_name or "").strip()
        change_note = f"New version uploaded ({fname})" if fname else "New version uploaded"
        revised, name, did = True, d.drawing_no, d.id
    else:
        name = _name_from_file(file_name or "") if (file_name or "").strip() else "DRAWING-NAME"
        rev_label, change_note, revised, did = FIRST_REV, "First issue", False, "preview"
    fake_d = SimpleNamespace(id=did, drawing_no=name)
    fake_rv = SimpleNamespace(rev_label=rev_label, change_note=change_note,
                              uploaded_by_name=user.name, uploaded_at=now())
    first = recipients[0]
    subject, html = M.review_mail(fake_d, fake_rv, first.name, revised)
    return {
        "subject": subject,
        "html": html,
        "shown_for": first.name,
        "rev_label": rev_label,
        "recipients": [{"name": u.name, "email": u.email, "department": u.department} for u in recipients],
    }


async def upload_new(file: UploadFile, folder_id: str, user: User, reviewer_ids: list[str] | None = None) -> Drawing:
    """New drawing: PDF + folder. Name = file name. Released at once; mail to the selected people."""
    folder = await _folder_or_404(folder_id)
    content, filename = await _read_pdf(file)
    drawing_no = _name_from_file(filename)

    existing = await repo.find_one(select(Drawing).where(func.lower(Drawing.drawing_no) == drawing_no.lower()))
    if existing and existing.status == DrawingStatus.DELETED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f'Drawing "{drawing_no}" was deleted earlier. Restore it from Drawings -> Deleted, then use Revise.',
        )
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f'Drawing "{drawing_no}" already exists. To upload a new version, open it and use Revise.',
        )
    reviewers = await _recipients(reviewer_ids)
    rev_label = FIRST_REV

    d = Drawing(folder_id=folder.id, drawing_no=drawing_no, item_code="", description="", created_by=user.name)
    await repo.add(d)
    fm = await folder_map()
    rv = await _store_revision(d, fm, content, filename, rev_label, "First issue", reviewers, user)

    await audit_service.log("dc_drawing_uploaded", user, "drawing", str(d.id), d.drawing_no,
                            after={"rev": rev_label, "folder": fm.path_str(d.folder_id),
                                   "reviewers": [u.name for u in reviewers]},
                            note=filename)
    await notification_service.notify(
        [u.id for u in reviewers], "New drawing to review",
        f"{d.drawing_no} Rev {rev_label}. Please confirm or deny.", f"/view/{d.id}", skip=user.id)
    _queue_review_mails(rv.id, revised=False)
    return d


async def revise(drawing_id: str, file: UploadFile, user: User, reviewer_ids: list[str] | None = None) -> Drawing:
    """New revision: PDF only; the label counts on. Released at once; mail to the selected people."""
    d = (await db().execute(select(Drawing).where(Drawing.id == repo.as_uuid(drawing_id)).with_for_update())).scalar_one_or_none()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Drawing not found.")
    _not_deleted(d)
    content, filename = await _read_pdf(file)
    reviewers = await _recipients(reviewer_ids)

    _seq, rev_label = await next_rev_unique(d)
    change_note = f"New version uploaded ({filename})"

    # Lock the revision being replaced, and stop its open reviews.
    old = await repo.get(DrawingRevision, d.current_revision_id) if d.current_revision_id else None
    if old and not old.locked:
        old.locked = True
        old.locked_at = now()
        old.locked_by_name = user.name
        await db().execute(
            update(DrawingReview)
            .where(DrawingReview.revision_id == old.id, DrawingReview.decision == Decision.PENDING)
            .values(decision=Decision.CANCELLED)
        )

    fm = await folder_map()
    rv = await _store_revision(d, fm, content, filename, rev_label, change_note, reviewers, user)
    await audit_service.log("dc_drawing_revised", user, "drawing", str(d.id), d.drawing_no,
                            before={"rev": old.rev_label if old else None, "status": old.status if old else None},
                            after={"rev": rev_label, "reviewers": [u.name for u in reviewers]},
                            note=change_note)
    await notification_service.notify(
        [u.id for u in reviewers], "Revised drawing to review",
        f"{d.drawing_no} Rev {rev_label}", f"/view/{d.id}", skip=user.id)
    _queue_review_mails(rv.id, revised=True)
    return d


async def update_details(drawing_id: str, item_code: str, description: str, folder_id: str, user: User) -> Drawing:
    """Fix the item code / description / folder of a drawing. Admin only."""
    d = await _drawing_or_404(drawing_id)
    _not_deleted(d)
    folder = await _folder_or_404(folder_id)
    before = {"item_code": d.item_code, "description": d.description, "folder_id": str(d.folder_id)}
    old_lib = library_key(await folder_map(), d)
    d.item_code = _clean(item_code, "Item code", required=False, max_len=MAX_NAME)
    d.description = _clean(description, "Part description", required=False, max_len=300)
    d.folder_id = folder.id
    d.updated_at = now()
    await repo.touch()
    new_lib = library_key(await folder_map(), d)
    if old_lib.lower() != new_lib.lower():
        after_commit(lambda: storage_service.move(old_lib, new_lib))
    await audit_service.log("dc_drawing_edited", user, "drawing", str(d.id), d.drawing_no, before=before,
                            after={"item_code": d.item_code, "description": d.description, "folder_id": str(d.folder_id)})
    return d


# ───────────────────────────────────────────────────────────────────────────
#  Confirm / Deny
# ───────────────────────────────────────────────────────────────────────────

async def decide(revision_id: str, user: User, decision: str, reason: str | None) -> dict:
    if decision not in (Decision.CONFIRMED, Decision.DENIED):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Decision must be confirm or deny.")
    rid = repo.as_uuid(revision_id)
    # Row lock: two people pressing Confirm at the same moment must not both
    # see "one still pending" and leave the drawing un-approved.
    rv = (await db().execute(select(DrawingRevision).where(DrawingRevision.id == rid).with_for_update())).scalar_one_or_none()
    if not rv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Revision not found.")
    if rv.locked:
        raise HTTPException(status.HTTP_409_CONFLICT, "This revision has been replaced by a newer one. Open the latest revision.")

    review = await repo.find_one(select(DrawingReview).where(
        DrawingReview.revision_id == rv.id, DrawingReview.user_id == user.id
    ))
    if not review:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not on the list of users for this revision.")
    # A person who denied may change their mind and confirm (decided 12 Oct 2026); a confirm is final.
    changed_mind = review.decision == Decision.DENIED and decision == Decision.CONFIRMED
    if review.decision != Decision.PENDING and not changed_mind:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already answered for this revision.")
    earlier_reason = review.reason if changed_mind else None

    reason = "" if decision == Decision.CONFIRMED else (reason or "").strip()
    if decision == Decision.DENIED and len(reason) < 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Please give a reason for denying the drawing.")
    if len(reason) > 1000:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Reason is too long (max 1000 characters).")

    review.decision = decision
    review.reason = reason or None
    review.decided_at = now()

    d = await repo.get(Drawing, rv.drawing_id)
    outcome = "recorded"
    if decision == Decision.DENIED:
        # The drawing stays released and the others are still asked (decided 12 Oct 2026).
        # It is flagged "Denied" until the admin decides: valid -> Revise (new revision).
        rv.status = DrawingStatus.DENIED
        d.status = DrawingStatus.DENIED
        outcome = "denied"
    else:
        await repo.touch()
        left = await repo.count(select(DrawingReview.id).where(
            DrawingReview.revision_id == rv.id, DrawingReview.decision == Decision.PENDING
        ))
        any_deny = await repo.exists(select(DrawingReview.id).where(
            DrawingReview.revision_id == rv.id, DrawingReview.decision == Decision.DENIED
        ))
        if not any_deny:
            # No deny left on this revision -> the "Denied" flag goes, the drawing shows Released.
            rv.status = DrawingStatus.APPROVED
            rv.decided_at = rv.decided_at or now()
            if d.status != DrawingStatus.DELETED:
                d.status = DrawingStatus.APPROVED
            if left == 0:
                outcome = "approved"
    d.updated_at = now()
    await repo.touch()

    await audit_service.log(
        "dc_drawing_confirmed" if decision == Decision.CONFIRMED else "dc_drawing_denied",
        user, "drawing", str(d.id), f"{d.drawing_no} Rev {rv.rev_label}",
        note=(f"Changed from Deny to Confirm. Earlier deny reason: {earlier_reason}" if changed_mind else reason or None),
    )
    if changed_mind and outcome != "approved":
        targets = set(await notification_service.admin_ids())
        await notification_service.notify(
            targets, "Deny withdrawn", f"{user.name} now confirms {d.drawing_no} Rev {rv.rev_label}.",
            f"/view/{d.id}", skip=user.id)
    if outcome == "approved":
        await audit_service.log("dc_drawing_approved", user, "drawing", str(d.id), f"{d.drawing_no} Rev {rv.rev_label}",
                                note="All selected users confirmed")

    if outcome in ("denied", "approved"):
        reviewer_ids = (await db().execute(
            select(DrawingReview.user_id).where(DrawingReview.revision_id == rv.id)
        )).scalars().all()
        targets = set(reviewer_ids) | set(await notification_service.admin_ids())
        if outcome == "denied":
            await notification_service.notify(
                targets, "Drawing denied", f"{d.drawing_no} Rev {rv.rev_label} denied by {user.name}: {reason}",
                f"/view/{d.id}", skip=user.id)
        else:
            await notification_service.notify(
                targets, "Drawing confirmed by all", f"{d.drawing_no} Rev {rv.rev_label} - everyone has confirmed.",
                f"/view/{d.id}")

    from services import drawing_email_service
    if outcome == "denied":
        after_commit(lambda: drawing_email_service.send_denied(rv.id, user.id))
    elif outcome == "approved":
        after_commit(lambda: drawing_email_service.send_approved(rv.id))
    return {"outcome": outcome, "status": d.status, "changed_mind": changed_mind}


def _queue_review_mails(revision_id: uuid.UUID, revised: bool) -> None:
    from services import drawing_email_service
    after_commit(lambda: drawing_email_service.send_review_requests(revision_id, revised))


async def resend_requests(revision_id: str, user: User) -> int:
    """Admin 'send reminder now' for everyone still pending on a revision."""
    rv = await _revision_or_404(revision_id, user)
    if rv.locked:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only the latest revision can be reminded.")
    pending = await repo.count(select(DrawingReview.id).where(
        DrawingReview.revision_id == rv.id, DrawingReview.decision == Decision.PENDING
    ))
    from services import drawing_email_service
    after_commit(lambda: drawing_email_service.send_reminders(revision_id=rv.id, force=True))
    await audit_service.log("dc_reminder_sent", user, "drawing", str(rv.drawing_id), f"Rev {rv.rev_label}",
                            note=f"{pending} {'person' if pending == 1 else 'people'}")
    return pending


# ───────────────────────────────────────────────────────────────────────────
#  Files + access log
# ───────────────────────────────────────────────────────────────────────────

async def open_file(revision_id: str, user: User, action: str, ip: str | None) -> tuple[bytes, DrawingRevision, Drawing]:
    rv = await _revision_or_404(revision_id, user)
    d = await _drawing_or_404(rv.drawing_id)
    if d.status == DrawingStatus.DELETED and not is_dc_admin(user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Revision not found.")
    content = await storage_service.download(rv.storage_path)
    await repo.add(DrawingAccessLog(
        drawing_id=d.id, revision_id=rv.id, drawing_no=d.drawing_no, rev_label=rv.rev_label,
        user_id=str(user.id), user_name=user.name, action=action, ip=ip,
    ))
    return content, rv, d


# ───────────────────────────────────────────────────────────────────────────
#  Email list + access (who may open the app)
# ───────────────────────────────────────────────────────────────────────────

def _user_out(u: User, on_list: bool) -> dict:
    return {
        "id": str(u.id),
        "name": u.name,
        "email": u.email,
        "employee_code": u.employee_code,
        "department": u.department,
        "role": u.role,
        "status": u.status,
        "is_active": u.is_active,
        "can_view": can_view(u),
        "is_dc_admin": is_dc_admin(u),
        "on_email_list": on_list,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


async def list_users() -> list[dict]:
    """Everyone the portal has created here - pending ones first, so approvals are easy to find."""
    users = await repo.find_all(select(User).order_by(
        (User.status != AccountStatus.PENDING), func.lower(User.name)))
    listed = set((await db().execute(select(DrawingReviewer.user_id))).scalars().all())
    return [_user_out(u, u.id in listed) for u in users]


async def reviewer_list() -> list[dict]:
    """The Email List, active approved users only."""
    rows = await repo.find_all(
        select(User).join(DrawingReviewer, DrawingReviewer.user_id == User.id)
        .where(User.is_active.is_(True), User.status == AccountStatus.APPROVED)
        .order_by(func.lower(User.name))
    )
    return [_user_out(u, True) for u in rows]


async def _user_or_404(user_id) -> User:
    u = await repo.get(User, user_id)
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    return u


async def set_status(user_id: str, new_status: str, admin: User) -> dict:
    """Approve / reject a user for Drawing Control."""
    if new_status not in (AccountStatus.APPROVED, AccountStatus.REJECTED, AccountStatus.PENDING):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Status must be approved, rejected or pending.")
    u = await _user_or_404(user_id)
    if u.id == admin.id and new_status != AccountStatus.APPROVED:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own access.")
    before = u.status
    u.status = new_status
    u.decided_by, u.decided_at, u.updated_at = admin.name, now(), now()
    if new_status != AccountStatus.APPROVED:
        existing = await repo.get(DrawingReviewer, u.id)
        if existing:
            await repo.remove(existing)
    await repo.touch()
    if before != new_status:
        await audit_service.log("dc_access_changed", admin, "drawing_access", str(u.id), u.name,
                                before={"status": before}, after={"status": new_status})
    on_list = await repo.get(DrawingReviewer, u.id) is not None
    return _user_out(u, on_list)


async def set_role(user_id: str, role: str, admin: User) -> dict:
    if role not in (Role.ADMIN, Role.USER):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Role must be admin or user.")
    u = await _user_or_404(user_id)
    if u.id == admin.id and role != Role.ADMIN:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own admin access.")
    if role == Role.ADMIN and u.status != AccountStatus.APPROVED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Approve the user before making them an admin.")
    before = u.role
    u.role, u.updated_at = role, now()
    await repo.touch()
    if before != role:
        await audit_service.log("dc_access_changed", admin, "drawing_access", str(u.id), u.name,
                                before={"role": before}, after={"role": role})
    return _user_out(u, await repo.get(DrawingReviewer, u.id) is not None)


async def set_on_list(user_id: str, on: bool, admin: User) -> dict:
    u = await _user_or_404(user_id)
    existing = await repo.get(DrawingReviewer, u.id)
    if on and not existing:
        if not u.is_approved:
            raise HTTPException(status.HTTP_409_CONFLICT, "Approve the user before adding them to the Email List.")
        await repo.add(DrawingReviewer(user_id=u.id, added_by=admin.name))
        await audit_service.log("dc_email_list_added", admin, "drawing_access", str(u.id), u.name)
    elif not on and existing:
        await repo.remove(existing)
        await audit_service.log("dc_email_list_removed", admin, "drawing_access", str(u.id), u.name)
    await repo.touch()
    return _user_out(u, on)


async def admin_emails() -> list[str]:
    users = await repo.find_all(select(User).where(
        User.is_active.is_(True), User.status == AccountStatus.APPROVED, User.role == Role.ADMIN,
    ))
    return [u.email for u in users if u.email]


# ───────────────────────────────────────────────────────────────────────────
#  Records: approvals, locked versions, download log, audit
# ───────────────────────────────────────────────────────────────────────────

def _page(page: int, size: int) -> tuple[int, int]:
    return max(1, page), max(1, min(size, 200))


async def records(q: str, status_filter: str, page: int, size: int, locked: bool | None = None) -> dict:
    page, size = _page(page, size)
    fm = await folder_map()
    conds = []
    if locked is not None:
        conds.append(DrawingRevision.locked.is_(locked))
    if status_filter in (DrawingStatus.UNDER_REVIEW, DrawingStatus.APPROVED, DrawingStatus.DENIED):
        conds.append(DrawingRevision.status == status_filter)
    f = _search_filter(q, "all")
    if f is not None:
        conds.append(f)
    base = select(DrawingRevision, Drawing).join(Drawing, Drawing.id == DrawingRevision.drawing_id).where(*conds)
    total = (await db().execute(select(func.count()).select_from(base.order_by(None).subquery()))).scalar_one()
    order = DrawingRevision.locked_at.desc() if locked else DrawingRevision.uploaded_at.desc()
    rows = (await db().execute(base.order_by(order.nulls_last()).offset((page - 1) * size).limit(size))).all()

    rev_ids = [rv.id for rv, _ in rows]
    reviews: dict[uuid.UUID, list[DrawingReview]] = {}
    if rev_ids:
        for r in await repo.find_all(select(DrawingReview).where(DrawingReview.revision_id.in_(rev_ids))):
            reviews.setdefault(r.revision_id, []).append(r)
    return {
        "items": [
            {
                **_revision_out(rv, reviews.get(rv.id, [])),
                "drawing_id": str(d.id),
                "drawing_no": d.drawing_no,
                "item_code": d.item_code,
                "description": d.description,
                "folder_path": fm.path_str(d.folder_id),
            }
            for rv, d in rows
        ],
        "total": total, "page": page, "size": size,
    }


async def access_log(q: str, action: str | None, date_from: str | None, date_to: str | None,
                     page: int, size: int) -> dict:
    page, size = _page(page, size)
    conds = []
    if action in ("view", "download"):
        conds.append(DrawingAccessLog.action == action)
    for term in (q or "").lower().split():
        like = _like(term)
        conds.append(or_(func.lower(DrawingAccessLog.drawing_no).like(like, escape="\\"),
                         func.lower(DrawingAccessLog.user_name).like(like, escape="\\")))
    local_day = func.date(func.timezone(settings.SCHEDULER_TIMEZONE, DrawingAccessLog.at))
    if date_from:
        conds.append(local_day >= _date(date_from))
    if date_to:
        conds.append(local_day <= _date(date_to))
    base = select(DrawingAccessLog).where(*conds)
    total = await repo.count(base)
    rows = await repo.find_all(base.order_by(DrawingAccessLog.at.desc()).offset((page - 1) * size).limit(size))
    return {
        "items": [
            {"id": str(r.id), "drawing_id": str(r.drawing_id), "drawing_no": r.drawing_no, "rev_label": r.rev_label,
             "user_name": r.user_name, "action": r.action, "ip": r.ip, "at": r.at.isoformat()}
            for r in rows
        ],
        "total": total, "page": page, "size": size,
    }


def _date(value: str):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Dates must be YYYY-MM-DD.")


async def audit(q: str, page: int, size: int, drawing_id: str | None = None) -> dict:
    page, size = _page(page, size)
    conds = [AuditLog.target_type.in_(AUDIT_TYPES)]
    if drawing_id:
        conds.append(AuditLog.target_id == drawing_id)
    for term in (q or "").lower().split():
        like = _like(term)
        conds.append(or_(func.lower(AuditLog.actor_name).like(like, escape="\\"),
                         func.lower(func.coalesce(AuditLog.target_label, "")).like(like, escape="\\"),
                         func.lower(func.coalesce(AuditLog.note, "")).like(like, escape="\\")))
    base = select(AuditLog).where(*conds)
    total = await repo.count(base)
    rows = await repo.find_all(base.order_by(AuditLog.created_at.desc()).offset((page - 1) * size).limit(size))
    return {
        "items": [
            {"id": str(a.id), "action": a.action, "actor_name": a.actor_name, "target_type": a.target_type,
             "target_id": a.target_id, "target_label": a.target_label, "note": a.note,
             "before": a.before, "after": a.after, "created_at": a.created_at.isoformat()}
            for a in rows
        ],
        "total": total, "page": page, "size": size,
    }
