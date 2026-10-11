"""
Applications (cards): registry, per-user access, and creating users inside
each application.

Every application implements the same small contract (see
shared/documentation/ARCHITECTURE.md -> "Application contract"):

    POST {backend.base_url}{provision_path}            create user as PENDING (idempotent)
    GET  {backend.base_url}{access_path}                {"access": approved|pending|rejected|inactive|missing}
    POST {backend.base_url}{validate_path}  (optional)  check sign-up answers without saving

all with header X-Portal-Key: PORTAL_SERVICE_KEY.
"""
from __future__ import annotations

import asyncio
import json
import logging
from functools import lru_cache
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.project import ProjectSync
from app.models.user import PortalUser

log = logging.getLogger("portal.projects")
TIMEOUT = httpx.Timeout(6.0, connect=2.0)

MESSAGES = {
    "approved": None,
    "pending": "Waiting for approval by the {name} administrator.",
    "rejected": "Your access request for {name} was rejected. Please contact the {name} administrator.",
    "inactive": "Your {name} account is inactive. Please contact the {name} administrator.",
    "missing": "Your {name} account is being set up. Please try again in a minute.",
    "unavailable": "{name} is not reachable right now. Please try again later.",
    "coming_soon": "{name} is not available yet.",
}


def _load(path: str) -> list[dict]:
    # utf-8-sig: also accepts a file saved with a BOM (Windows Notepad / PowerShell 5.1 do that).
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    projects = data["projects"] if isinstance(data, dict) else data
    for p in projects:
        for key in ("id", "name", "launch"):
            if key not in p:
                raise ValueError(f"projects.json: every project needs '{key}' ({p})")
    return sorted(projects, key=lambda p: (p.get("order", 999), p["name"]))


@lru_cache(maxsize=1)
def _cached(path: str, mtime: float) -> tuple:
    return tuple(_load(path))


def registry() -> list[dict]:
    """Re-read automatically when projects.json changes - no restart needed."""
    path = settings.PROJECTS_FILE
    return list(_cached(path, Path(path).stat().st_mtime))


def get_project(project_id: str) -> dict | None:
    return next((p for p in registry() if p["id"] == project_id), None)


def _headers() -> dict:
    return {"X-Portal-Key": settings.PORTAL_SERVICE_KEY}


def _url(p: dict, key: str, **kw) -> str | None:
    be = p.get("backend") or {}
    path = be.get(key)
    if not be.get("base_url") or not path:
        return None
    return be["base_url"].rstrip("/") + path.format(**kw)


def provision_payload(user: PortalUser) -> dict:
    return {
        **(user.profile or {}),
        "id": str(user.id),
        "full_name": user.full_name,
        "employee_code": user.employee_code,
        "email": user.email,
        "department": user.department,
        "password_hash": user.password_hash,
    }


# ── sign-up validation (before the portal account is created) ──────────────

async def validate_signup(payload: dict) -> None:
    """Ask applications with a validate_path whether the sign-up answers are acceptable."""
    from fastapi import HTTPException

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for p in registry():
            url = _url(p, "validate_path")
            if not url or p.get("status", "active") != "active":
                continue
            try:
                r = await client.post(url, json=payload, headers=_headers())
            except httpx.HTTPError:
                continue          # application down: it is created later by the retry job
            if 400 <= r.status_code < 500 and r.status_code not in (401, 404):
                detail = r.json().get("detail") if r.headers.get("content-type", "").startswith("application/json") else None
                if isinstance(detail, list):
                    detail = detail[0].get("msg")
                raise HTTPException(r.status_code, detail or f"{p['name']} did not accept the sign-up details.")


# ── create the user in every application ───────────────────────────────────

async def provision_user(db: Session, user: PortalUser, only: str | None = None) -> dict:
    results = {}
    payload = provision_payload(user)
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for p in registry():
            if only and p["id"] != only:
                continue
            url = _url(p, "provision_path")
            if not url or p.get("status", "active") != "active":
                continue
            row = db.get(ProjectSync, (user.id, p["id"])) or ProjectSync(user_id=user.id, project_id=p["id"], attempts=0)
            row.attempts = (row.attempts or 0) + 1
            try:
                r = await client.post(url, json=payload, headers=_headers())
                if r.status_code < 300:
                    row.status, row.last_error = "done", None
                else:
                    row.status, row.last_error = ("failed" if 400 <= r.status_code < 500 else "pending"), r.text[:500]
            except httpx.HTTPError as exc:
                row.status, row.last_error = "pending", f"{type(exc).__name__}: {exc}"[:500]
            db.add(row)
            results[p["id"]] = row.status
    db.commit()
    return results


async def retry_pending(db: Session) -> int:
    rows = db.query(ProjectSync).filter(ProjectSync.status == "pending", ProjectSync.attempts < 500).all()
    done = 0
    for row in rows:
        user = db.get(PortalUser, row.user_id)
        if user:
            r = await provision_user(db, user, only=row.project_id)
            done += r.get(row.project_id) == "done"
    return done


# ── cards for one user ──────────────────────────────────────────────────────

async def _access(client: httpx.AsyncClient, p: dict, user_id: str) -> str:
    if p.get("status", "active") != "active":
        return "coming_soon"
    url = _url(p, "access_path", user_id=user_id)
    if not url:
        return "approved"          # an application with no access check is open to every signed-in user
    try:
        r = await client.get(url, headers=_headers())
        if r.status_code == 200:
            return r.json().get("access", "missing")
    except httpx.HTTPError:
        pass
    return "unavailable"


async def cards_for(db: Session, user: PortalUser) -> list[dict]:
    projects = [p for p in registry() if p.get("status", "active") != "hidden"]
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        access = await asyncio.gather(*[_access(client, p, str(user.id)) for p in projects])
    out = []
    missing = []
    for p, a in zip(projects, access):
        if a == "missing":
            missing.append(p["id"])
        out.append({
            "id": p["id"],
            "name": p["name"],
            "subtitle": p.get("subtitle", ""),
            "description": p.get("description", ""),
            "icon": p.get("icon"),
            "theme": p.get("theme"),
            "status": p.get("status", "active"),
            "launch": p["launch"],
            "access": a,
            "can_open": a == "approved",
            "message": (MESSAGES.get(a) or "").format(name=p["name"]) or None,
        })
    for pid in missing:   # not created there yet (e.g. app was down at sign-up) - try now
        try:
            await provision_user(db, user, only=pid)
        except Exception as exc:
            log.warning("Provisioning %s for %s failed: %s", pid, user.email, exc)
    return out


async def access_for_admin(user_id: str) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        projects = registry()
        res = await asyncio.gather(*[_access(client, p, user_id) for p in projects])
    return {p["id"]: a for p, a in zip(projects, res)}
