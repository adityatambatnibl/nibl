"""
Folder upload: the drawing library folder IS the drop folder.

    applications/AI-Drawing-Control/data/drawings/
        GBD/SRB/NBD-NA-4905-02.pdf      <- drawing "NBD-NA-4905-02" in folder GBD > SRB
        _history/...                     <- every revision's own copy (the app's, do not touch)
        _deleted/...                     <- library copies of deleted drawings

Copy a PDF into a product folder (or replace one that is there) and refresh the
drawing list - it appears in Drawing Control, already APPROVED. Uploads and
revisions made on screen are written to the same place, so this folder always
shows the current revision of every drawing.

Rules (business owner, 12 Oct 2026):
  * drawing name = file name without ".pdf"; sub-folders = Product Tree
    (a PDF put directly in drawings/ is moved into drawings/Unsorted/)
  * new name                   -> new drawing, revision A, APPROVED (no confirm / deny, no mail)
  * existing drawing, the file
    in its folder was replaced -> new revision, APPROVED; the previous one is LOCKED
  * content already known      -> nothing (e.g. the copy the app itself wrote)
  * same name in another folder, deleted drawing, not a real PDF -> skipped, written to the log
  * the audit trail records the actor as "Folder upload (automatic)"
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import time
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import func, select, update

from database import repo
from database.connection import after_commit, db
from models.drawing import Decision, Drawing, DrawingFolder, DrawingReview, DrawingRevision, DrawingStatus
from services import audit_service, storage_service
from utils.constants import MAX_UPLOAD_BYTES

log = logging.getLogger("drawing.folder_sync")

MIN_GAP_SECONDS = 15          # at most one scan per 15 s, however many people refresh
MAX_HASH_PER_RUN = 300        # unknown / changed files read per scan; the rest next time
MAX_NEW_PER_RUN = 200

ACTOR = SimpleNamespace(id="folder-upload", name="Folder upload (automatic)")

_lock = asyncio.Lock()
_last_run = 0.0
_verified: dict[str, tuple[int, int]] = {}    # path -> (mtime_ns, size) already checked
_reported: dict[str, tuple[int, int]] = {}    # path -> (mtime_ns, size) already logged as skipped
_backfilled = False


def library_dir() -> Path | None:
    if not storage_service._use_local():
        return None
    from services.drawing_service import LIBRARY
    root = storage_service._root() / LIBRARY
    root.mkdir(parents=True, exist_ok=True)
    return root


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _library_pdfs(root: Path) -> list[Path]:
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(("_", "."))]
        for name in filenames:
            if name.lower().endswith(".pdf") and not name.startswith(("~$", ".")):
                out.append(Path(dirpath) / name)
    out.sort(key=lambda p: str(p).lower())
    return out


async def _folder_for(names: list[str], cache: dict) -> DrawingFolder:
    parent = None
    for name in names:
        key = (parent.id if parent else None, name.lower())
        if key in cache:
            parent = cache[key]
            continue
        stmt = select(DrawingFolder).where(func.lower(DrawingFolder.name) == name.lower())
        stmt = stmt.where(DrawingFolder.parent_id.is_(None) if parent is None else DrawingFolder.parent_id == parent.id)
        folder = await repo.find_one(stmt)
        if folder is None:
            folder = DrawingFolder(name=name[:120], parent_id=parent.id if parent else None, created_by=ACTOR.name)
            await repo.add(folder)
            await audit_service.log("dc_folder_created", ACTOR, "drawing_folder", str(folder.id), name,
                                    note="Created by folder upload")
        cache[key] = folder
        parent = folder
    return parent


def _remove_later(key: str):
    async def job():
        try:
            await storage_service.delete([key])
        except Exception as e:  # noqa: BLE001
            log.warning("drawing library: old file %s not removed: %s", key, e)
    return job


class Skip(Exception):
    """A file that is not taken in - the reason is logged once."""


async def _take_in(p: Path, key: str, cache: dict) -> str:
    """Returns 'new', 'revised' or 'same'. Raises Skip(reason)."""
    from services.drawing_service import FIRST_REV, next_rev_unique, folder_map, history_key, library_key, now

    rel = key.split("/")[1:]                 # drop "drawings"

    # A file the app stored here before the library layout (drawings/<tree>/<name>_<rev>_<id>.pdf):
    # copy it into _history, point the revision at the copy, remove the old file after commit.
    legacy = await repo.find_one(select(DrawingRevision).where(func.lower(DrawingRevision.storage_path) == key.lower()))
    if legacy is not None:
        ld = await repo.get(Drawing, legacy.drawing_id)
        fm = await folder_map()
        hist = history_key(fm, ld, legacy.seq, legacy.rev_label)
        if storage_service.local_path(hist).exists():
            hist = hist[:-4] + f"__{str(legacy.id)[:8]}.pdf"
        await storage_service.copy_new(key, hist)
        db().info.setdefault("dc_uploaded", []).append(hist)
        legacy.storage_path = hist
        after_commit(_remove_later(key))
        return "moved"

    name = _norm(p.stem)[:120]
    if not name:
        raise Skip("file name is empty")

    d = await repo.find_one(select(Drawing).where(func.lower(Drawing.drawing_no) == name.lower()))
    if d is not None and d.status == DrawingStatus.DELETED:
        raise Skip(f'drawing "{name}" is deleted - restore it in Drawing Control first')
    if d is not None:
        fm = await folder_map()
        expected = library_key(fm, d)
        if expected.lower() != key.lower():
            raise Skip(f'a drawing named "{name}" already exists in {fm.path_str(d.folder_id)} - '
                       f"replace the file in that folder to make a new revision")

    content = p.read_bytes()
    if not content:
        raise Skip("empty file")
    if len(content) > MAX_UPLOAD_BYTES:
        raise Skip(f"larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    if not content[:1024].lstrip().startswith(b"%PDF-"):
        raise Skip("not a real PDF")
    sha = hashlib.sha256(content).hexdigest()

    old = None
    if d is None:
        folder = await _folder_for([_norm(x) for x in rel[:-1]], cache)
        d = Drawing(folder_id=folder.id, drawing_no=name, item_code="", description="",
                    created_by=ACTOR.name, status=DrawingStatus.APPROVED)
        await repo.add(d)
        seq, label, kind = 1, FIRST_REV, "new"
    else:
        known = set((await db().execute(
            select(DrawingRevision.sha256).where(DrawingRevision.drawing_id == d.id)
        )).scalars().all())
        if sha in known:
            return "same"                    # e.g. the library copy the app itself wrote
        old = await repo.get(DrawingRevision, d.current_revision_id) if d.current_revision_id else None
        seq, label = await next_rev_unique(d)
        kind = "revised"

    fm = await folder_map()
    hist = history_key(fm, d, seq, label)
    await storage_service.upload(hist, content, "application/pdf")
    db().info.setdefault("dc_uploaded", []).append(hist)

    ts = now()
    if old is not None and not old.locked:
        old.locked, old.locked_at, old.locked_by_name = True, ts, ACTOR.name
        await db().execute(
            update(DrawingReview)
            .where(DrawingReview.revision_id == old.id, DrawingReview.decision == Decision.PENDING)
            .values(decision=Decision.CANCELLED)
        )
    rv = DrawingRevision(
        drawing_id=d.id, seq=seq, rev_label=label,
        change_note="Added by folder upload" if kind == "new" else "New version added by folder upload",
        original_filename=p.name, storage_path=hist, size_bytes=len(content), sha256=sha,
        status=DrawingStatus.APPROVED, uploaded_by=ACTOR.id, uploaded_by_name=ACTOR.name, decided_at=ts,
    )
    await repo.add(rv)
    d.current_revision_id, d.current_rev_label, d.revision_count = rv.id, label, seq
    d.status, d.updated_at = DrawingStatus.APPROVED, ts
    await repo.touch()
    await audit_service.log(
        "dc_drawing_folder_upload", ACTOR, "drawing", str(d.id), d.drawing_no,
        before={"rev": old.rev_label} if old else None,
        after={"rev": label, "status": "approved", "folder": fm.path_str(d.folder_id)},
        note=key,
    )
    return kind


async def _backfill_library(budget: int = 500) -> int:
    """Drawings without a readable library copy (e.g. uploaded before this change) get one."""
    from services.drawing_service import folder_map, library_key

    fm = await folder_map()
    rows = (await db().execute(
        select(Drawing, DrawingRevision)
        .join(DrawingRevision, DrawingRevision.id == Drawing.current_revision_id)
        .where(Drawing.status != DrawingStatus.DELETED)
    )).all()
    done = 0
    for d, rv in rows:
        if done >= budget:
            break
        lib = library_key(fm, d)
        try:
            if not storage_service.local_path(lib).exists() and storage_service.local_path(rv.storage_path).is_file():
                await storage_service.publish_copy(rv.storage_path, lib)
                _verified[str(storage_service.local_path(lib)).lower()] = _sig(storage_service.local_path(lib))
                done += 1
        except Exception as e:  # noqa: BLE001
            log.warning("library copy for %s failed: %s", d.drawing_no, e)
    return done


def _sig(p: Path) -> tuple[int, int]:
    st = p.stat()
    return st.st_mtime_ns, st.st_size


async def sync(force: bool = False) -> dict:
    """Take in what is new or replaced in data/drawings/. Never raises - the page must still load."""
    global _last_run, _backfilled
    result = {"new": 0, "revised": 0, "same": 0, "moved": 0, "skipped": []}
    root = library_dir()
    if root is None or _lock.locked() or (not force and time.monotonic() - _last_run < MIN_GAP_SECONDS):
        return result
    async with _lock:
        _last_run = time.monotonic()
        try:
            if not _backfilled:
                n = await _backfill_library()
                _backfilled = n < 500
                if n:
                    log.info("drawing library: %s missing copies written", n)
            files = _library_pdfs(root)
        except Exception as e:  # noqa: BLE001
            log.warning("drawing library: cannot scan %s: %s", root, e)
            return result

        from services.drawing_service import UNSORTED
        cache: dict = {}
        hashed = 0
        for p in files:
            if hashed >= MAX_HASH_PER_RUN or result["new"] + result["revised"] >= MAX_NEW_PER_RUN:
                break
            try:
                sig = _sig(p)
            except OSError:
                continue
            path_id = str(p).lower()
            if _verified.get(path_id) == sig or _reported.get(path_id) == sig:
                continue
            # A PDF put directly in drawings/ goes into Unsorted.
            if p.parent == root:
                target = root / UNSORTED / p.name
                if target.exists():
                    _reported[path_id] = sig
                    result["skipped"].append({"file": p.name, "reason": "Unsorted already has a file with this name"})
                    log.warning("drawing library: %s skipped - Unsorted already has a file with this name", p.name)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                os.replace(p, target)
                p, path_id = target, str(target).lower()
                sig = _sig(p)
            key = "/".join(p.relative_to(storage_service._root()).parts)
            hashed += 1
            written = db().info.setdefault("dc_uploaded", [])
            mark = len(written)
            try:
                async with repo.savepoint():
                    kind = await _take_in(p, key, cache)
                result[kind] += 1
                _verified[path_id] = sig
            except Skip as e:
                _reported[path_id] = sig
                result["skipped"].append({"file": key, "reason": str(e)})
                log.warning("drawing library: %s skipped - %s", key, e)
            except Exception as e:  # noqa: BLE001 - one bad file must not stop the rest
                cache.clear()       # folders made inside the rolled-back savepoint are gone
                orphans = written[mark:]
                del written[mark:]
                await storage_service.delete(orphans)
                result["skipped"].append({"file": key, "reason": f"{type(e).__name__}: {e}"})
                log.warning("drawing library: %s failed - %s: %s", key, type(e).__name__, e)
        if result["new"] or result["revised"]:
            log.info("drawing library: %s new, %s revised", result["new"], result["revised"])
        return result
