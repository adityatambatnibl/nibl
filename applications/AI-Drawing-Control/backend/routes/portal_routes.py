"""
NIBL portal integration - the two endpoints every NIBL application exposes.

    POST /api/portal/users              create this person here as PENDING (idempotent)
    GET  /api/portal/access/{user_id}   approved | pending | rejected | inactive | missing

Called only by the portal backend with the X-Portal-Key header.
"""
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select

from config.settings import settings
from database import repo
from models.user import AccountStatus, User

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


def _access(u: User | None) -> str:
    if u is None:
        return "missing"
    if not u.is_active:
        return "inactive"
    return {AccountStatus.APPROVED: "approved", AccountStatus.REJECTED: "rejected"}.get(u.status, "pending")


@router.post("/users")
async def provision(data: PortalUser, x_portal_key: str | None = Header(default=None)):
    _check_key(x_portal_key)
    existing = await repo.get(User, data.id)
    if existing is None:
        existing = await repo.find_one(select(User).where(func.lower(User.email) == data.email.lower()))
    if existing:
        return {"status": "exists", "access": _access(existing)}
    await repo.add(User(id=data.id, name=data.full_name.strip(), email=data.email.lower().strip(),
                        employee_code=data.employee_code, department=data.department,
                        status=AccountStatus.PENDING))
    from services import notification_service
    await notification_service.notify(
        await notification_service.admin_ids(), "New access request",
        f"{data.full_name.strip()} ({data.email.lower().strip()}) asked for access to Drawing Control.", "/users")
    return {"status": "created", "access": "pending"}


@router.get("/access/{user_id}")
async def access(user_id: UUID, x_portal_key: str | None = Header(default=None)):
    _check_key(x_portal_key)
    return {"access": _access(await repo.get(User, user_id))}
