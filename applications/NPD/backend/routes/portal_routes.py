"""
Portal integration - the two endpoints every NIBL application exposes.

    POST /api/portal/users              create this person here as PENDING (idempotent)
    GET  /api/portal/access/{user_id}   approved | pending | rejected | inactive | missing

Called only by the portal backend, server to server, with the shared
X-Portal-Key header (PORTAL_SERVICE_KEY in .env). Approval itself stays here:
the NPD admin approves NPD users on /npd/admin/approvals exactly as before.
"""

from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, or_, select

from config.settings import settings
from database import repo
from models.user import User
from services import notification_service
from utils.constants import AccountStatus, DEFAULT_USER_PERMISSIONS, Role

router = APIRouter(prefix="/portal", tags=["Portal integration"])


def _check_key(key: str | None) -> None:
    if not settings.PORTAL_SERVICE_KEY or key != settings.PORTAL_SERVICE_KEY:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid portal service key.")


class PortalUser(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr
    employee_code: str | None = None
    department: str | None = None


@router.post("/users")
async def provision(data: PortalUser, x_portal_key: str | None = Header(default=None)):
    _check_key(x_portal_key)
    existing = await repo.find_one(select(User).where(or_(
        User.id == data.id, User.supabase_id == data.id, func.lower(User.email) == data.email.lower(),
    )))
    if existing:
        if existing.supabase_id is None:
            existing.supabase_id = data.id
        return {"status": "exists", "access": _access(existing)}
    user = User(
        id=data.id, supabase_id=data.id, name=data.full_name.strip(), email=data.email.lower().strip(),
        password_hash="", role=Role.USER, status=AccountStatus.PENDING,
        permissions=list(DEFAULT_USER_PERMISSIONS), department=data.department,
    )
    await repo.add(user)
    try:
        await notification_service.notify_signup(str(user.id), user.name, user.email)
    except Exception:
        pass
    return {"status": "created", "access": "pending"}


def _access(u: User | None) -> str:
    if u is None:
        return "missing"
    if not u.is_active:
        return "inactive"
    return {AccountStatus.APPROVED: "approved", AccountStatus.REJECTED: "rejected"}.get(u.status, "pending")


@router.get("/access/{user_id}")
async def access(user_id: UUID, x_portal_key: str | None = Header(default=None)):
    _check_key(x_portal_key)
    u = await repo.find_one(select(User).where(or_(User.id == user_id, User.supabase_id == user_id)))
    return {"access": _access(u)}
