"""
Bulk import of existing drawings.

How it is used
  1. Drop PDFs into   applications/AI-Drawing-Control/data/import/
     Sub-folders become the Product Tree, e.g.  import/GBD/Rings/NBD-NA-4905-02.pdf
     (files directly in import/ go to the folder "Unsorted").
  2. Optional: an Excel (.xlsx) or .csv file directly in import/ with columns
        drawing_no | item_code | description | rev
     Rows are matched to PDFs by drawing no. (= file name without .pdf).
  3. Drawing admin -> Bulk Import -> Check -> Import.

Every imported drawing is created UNDER REVIEW for everyone on the Email List,
exactly like a normal upload. Each person gets ONE email listing the whole
batch (not one per drawing) and a bell notification; after that the daily
09:00 reminder lists whatever they still have to Confirm / Deny. Imported PDFs are moved to
import/_done/ after the import has been saved, so pressing Import twice never
creates duplicates. Nothing is ever deleted.
"""

from __future__ import annotations

import csv
import hashlib
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import func, select

from database import repo
from database.connection import after_commit, db
from models.drawing import Drawing, DrawingFolder, DrawingReview, DrawingReviewer, DrawingRevision, DrawingStatus
from models.user import AccountStatus, User
from services import audit_service, notification_service, storage_service
from utils.constants import MAX_UPLOAD_BYTES

DONE = "_done"
UNSORTED = "Unsorted"
INDEX_ALIASES = {
    "drawing_no": {"drawing_no", "drawing no", "drawing no.", "drawing number", "dwg no", "dwg no.", "drawing"},
    "item_code": {"item_code", "item code", "item", "part no", "part no.", "part number"},
    "description": {"description", "part description", "desc", "part name"},
    "rev": {"rev", "revision", "rev no", "rev."},
}


def import_dir() -> Path:
    if not storage_service._use_local():
        raise HTTPException(status.HTTP_409_CONFLICT, "Bulk import needs local storage (STORAGE_BACKEND=local).")
    root = storage_service._root() / "import"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _header_key(h: str) -> str | None:
    h = _norm(str(h or "")).lower()
    for key, names in INDEX_ALIASES.items():
        if h in names:
            return key
    return None


def _read_index(root: Path) -> tuple[dict[str, dict], list[str]]:
    """{drawing_no.lower(): {item_code, description, rev}} from .xlsx / .csv files in import/."""
    rows: dict[str, dict] = {}
    notes: list[str] = []
    for f in sorted(root.iterdir()):
        if not f.is_file() or f.name.startswith("~$"):
            continue
        table: list[list] = []
        try:
            if f.suffix.lower() == ".csv":
                with open(f, newline="", encoding="utf-8-sig") as fh:
                    table = [r for r in csv.reader(fh)]
            elif f.suffix.lower() in (".xlsx", ".xlsm"):
                import openpyxl
                wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
                table = [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
                wb.close()
            else:
                continue
        except Exception as e:  # noqa: BLE001 - report, do not stop
            notes.append(f"Could not read {f.name}: {e}")
            continue
        if not table:
            continue
        keys = [_header_key(h) for h in table[0]]
        if "drawing_no" not in keys:
            notes.append(f"{f.name}: no 'drawing_no' column - ignored.")
            continue
        n = 0
        for r in table[1:]:
            rec = {k: _norm(str(v)) if v is not None else "" for k, v in zip(keys, r) if k}
            dno = rec.get("drawing_no", "")
            if dno:
                rows[dno.lower()] = rec
                n += 1
        notes.append(f"{f.name}: {n} row(s) read.")
    return rows, notes


@dataclass
class Found:
    path: Path
    rel: str                 # path inside import/, with "/"
    folders: list[str]       # Product Tree path
    drawing_no: str
    status: str = "ready"    # ready | exists | invalid
    reason: str = ""


def _scan(root: Path) -> list[Found]:
    out: list[Found] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != DONE and not d.startswith(".")]
        for name in filenames:
            p = Path(dirpath) / name
            if p.suffix.lower() != ".pdf":
                continue
            rel_parts = p.relative_to(root).parts
            folders = [_norm(x) for x in rel_parts[:-1]] or [UNSORTED]
            out.append(Found(path=p, rel="/".join(rel_parts), folders=folders, drawing_no=_norm(p.stem)))
    out.sort(key=lambda f: f.rel.lower())
    return out


async def _check(found: list[Found]) -> None:
    existing = {
        n.lower() for n in (await db().execute(select(Drawing.drawing_no))).scalars().all()
    }
    seen: set[str] = set()
    for f in found:
        key = f.drawing_no.lower()
        try:
            size = f.path.stat().st_size
            with open(f.path, "rb") as fh:
                head = fh.read(1024)
        except OSError as e:
            f.status, f.reason = "invalid", f"cannot read: {e}"
            continue
        if not f.drawing_no:
            f.status, f.reason = "invalid", "file name is empty"
        elif size == 0:
            f.status, f.reason = "invalid", "empty file"
        elif size > MAX_UPLOAD_BYTES:
            f.status, f.reason = "invalid", f"larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"
        elif not head.lstrip().startswith(b"%PDF-"):
            f.status, f.reason = "invalid", "not a real PDF"
        elif key in existing:
            f.status, f.reason = "exists", "drawing no. already in the system - use Revise to add a new revision"
        elif key in seen:
            f.status, f.reason = "invalid", "same drawing no. appears twice in the import folder"
        seen.add(key)


async def preview() -> dict:
    root = import_dir()
    found = _scan(root)
    await _check(found)
    index, notes = _read_index(root)
    ready = [f for f in found if f.status == "ready"]
    return {
        "folder": str(root),
        "total": len(found),
        "ready": len(ready),
        "exists": sum(f.status == "exists" for f in found),
        "invalid": sum(f.status == "invalid" for f in found),
        "with_details": sum(f.drawing_no.lower() in index for f in ready),
        "index_notes": notes,
        "files": [
            {"file": f.rel, "drawing_no": f.drawing_no, "folder": " › ".join(f.folders),
             "status": f.status, "reason": f.reason,
             "item_code": index.get(f.drawing_no.lower(), {}).get("item_code", ""),
             "description": index.get(f.drawing_no.lower(), {}).get("description", ""),
             "rev": index.get(f.drawing_no.lower(), {}).get("rev", "") or "A"}
            for f in found[:500]
        ],
    }


async def _folder_for(path: list[str], user: User, cache: dict) -> DrawingFolder:
    parent = None
    for name in path:
        key = (parent.id if parent else None, name.lower())
        if key in cache:
            parent = cache[key]
            continue
        stmt = select(DrawingFolder).where(func.lower(DrawingFolder.name) == name.lower())
        stmt = stmt.where(DrawingFolder.parent_id.is_(None) if parent is None else DrawingFolder.parent_id == parent.id)
        folder = await repo.find_one(stmt)
        if folder is None:
            folder = DrawingFolder(name=name[:120], parent_id=parent.id if parent else None, created_by=user.name)
            await repo.add(folder)
            await audit_service.log("dc_folder_created", user, "drawing_folder", str(folder.id), name,
                                    note="Created by bulk import")
        cache[key] = folder
        parent = folder
    return parent


def _move_done(root: Path, moves: list[tuple[Path, str]]):
    async def job():
        for src, rel in moves:
            dst = root / DONE / rel
            try:
                dst.parent.mkdir(parents=True, exist_ok=True)
                if dst.exists():
                    dst = dst.with_name(f"{dst.stem}_{os.getpid()}{dst.suffix}")
                shutil.move(str(src), str(dst))
            except OSError:
                pass   # the drawing is imported; leaving the file is harmless (it shows as "exists")
    return job


async def run(user: User, limit: int = 100) -> dict:
    from services.drawing_service import _safe_segment, folder_map, now

    root = import_dir()
    found = _scan(root)
    await _check(found)
    index, _ = _read_index(root)
    ready = [f for f in found if f.status == "ready"]
    batch, rest = ready[:max(1, min(limit, 200))], ready[max(1, min(limit, 200)):]

    reviewers = list(await repo.find_all(
        select(User).join(DrawingReviewer, DrawingReviewer.user_id == User.id).where(
            User.is_active.is_(True), User.status == AccountStatus.APPROVED, User.email.isnot(None))
    ))
    if batch and not reviewers:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "The Email List is empty. Add the users who must confirm drawings in "
                            "Users & Approvals -> Email List, then import again.")

    imported, failed, moves, cache, rev_ids = [], [], [], {}, []
    for f in batch:
        info = index.get(f.drawing_no.lower(), {})
        rev = (info.get("rev") or "A")[:20]
        item = (info.get("item_code") or f.drawing_no)[:120]
        desc = (info.get("description") or f.drawing_no)[:300]
        key = None
        try:
            content = f.path.read_bytes()
            async with repo.savepoint():
                folder = await _folder_for(f.folders, user, cache)
                d = Drawing(folder_id=folder.id, drawing_no=f.drawing_no[:120], item_code=item, description=desc,
                            created_by=user.name, status=DrawingStatus.UNDER_REVIEW)
                await repo.add(d)
                fm = await folder_map()
                fpath = "/".join(_safe_segment(p) for p in fm.path(folder.id)) or "unfiled"
                key = storage_service.build_path("drawings", str(d.id),
                                                 f"{_safe_segment(d.drawing_no)}_{_safe_segment(rev)}.pdf",
                                                 folder_name=fpath)
                await storage_service.upload(key, content, "application/pdf")
                db().info.setdefault("dc_uploaded", []).append(key)
                ts = now()
                rv = DrawingRevision(
                    drawing_id=d.id, seq=1, rev_label=rev, change_note="First issue (bulk upload)",
                    original_filename=f.path.name, storage_path=key, size_bytes=len(content),
                    sha256=hashlib.sha256(content).hexdigest(), status=DrawingStatus.UNDER_REVIEW,
                    uploaded_by=str(user.id), uploaded_by_name=user.name,
                )
                await repo.add(rv)
                await repo.add_all([
                    DrawingReview(revision_id=rv.id, drawing_id=d.id, user_id=u.id, user_name=u.name, user_email=u.email)
                    for u in reviewers
                ])
                d.current_revision_id, d.current_rev_label, d.revision_count = rv.id, rev, 1
                d.updated_at = ts
                await repo.touch()
                await audit_service.log("dc_drawing_imported", user, "drawing", str(d.id), d.drawing_no,
                                        after={"rev": rev, "folder": " › ".join(f.folders), "status": "under_review",
                                               "reviewers": [u.name for u in reviewers]},
                                        note=f.rel)
            imported.append({"file": f.rel, "drawing_no": f.drawing_no, "folder": " › ".join(f.folders), "rev": rev})
            moves.append((f.path, f.rel))
            rev_ids.append(rv.id)
        except Exception as e:  # noqa: BLE001 - one bad file must not stop the rest
            cache.clear()   # folders made inside the rolled-back savepoint are gone
            if key:
                await storage_service.delete([key])
            failed.append({"file": f.rel, "reason": getattr(e, "detail", None) or str(e)})

    if moves:
        after_commit(_move_done(root, moves))
    if rev_ids:
        n = len(rev_ids)
        await notification_service.notify(
            [u.id for u in reviewers], f"{n} new drawing{'s' if n != 1 else ''} to review",
            f"Uploaded by {user.name}. Please confirm or deny each one.", "/reviews", skip=user.id)
        from services import drawing_email_service
        ids = list(rev_ids)
        after_commit(lambda: drawing_email_service.send_bulk_requests(ids))
    return {
        "imported": imported,
        "failed": failed,
        "remaining": len(rest),
        "skipped_existing": sum(f.status == "exists" for f in found),
        "skipped_invalid": sum(f.status == "invalid" for f in found),
    }
