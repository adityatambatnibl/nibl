"""
NIBL portal integration - the two endpoints every NIBL application exposes.

    POST /api/v1/portal/users              create this person in OIPM as PENDING (idempotent)
    GET  /api/v1/portal/access/{user_id}   approved | pending | rejected | inactive | missing

Called only by the portal backend (server to server) with the X-Portal-Key
header (PORTAL_SERVICE_KEY). The OIPM rules for a new account are the same
as the old /auth/register: NIBL email, unique employee code, an employee's
HOD must be an approved HOD, and the account waits for the OIPM admin.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.user import RegistrationStatus, User, UserRole
from app.services.notification_service import send_account_registration_notification

router = APIRouter(prefix="/api/v1/portal", tags=["Portal integration"])


def _check_key(key: str | None) -> None:
    if not settings.PORTAL_SERVICE_KEY or key != settings.PORTAL_SERVICE_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid portal service key.")


class PortalUser(BaseModel):
    id: UUID
    full_name: str
    employee_code: str
    email: EmailStr
    password_hash: str
    # OIPM-specific sign-up fields (collected on the portal sign-up page)
    role: UserRole = UserRole.EMPLOYEE
    hod_id: UUID | None = None


def _access(u: User | None) -> str:
    if u is None:
        return "missing"
    reg = getattr(u.registration_status, "value", u.registration_status)
    if reg == RegistrationStatus.REJECTED.value:
        return "rejected"
    if reg == RegistrationStatus.APPROVED.value and u.is_active:
        return "approved"
    if reg == RegistrationStatus.APPROVED.value and not u.is_active:
        return "inactive"
    return "pending"


@router.post("/validate")
def validate(payload: PortalUser, db: Session = Depends(get_db), x_portal_key: str | None = Header(default=None)):
    """Same checks as /users but writes nothing - the portal asks first, so a bad HOD is shown on the sign-up form."""
    _check_key(x_portal_key)
    _rules(payload, db)
    return {"ok": True}


def _rules(payload: PortalUser, db: Session):
    email = payload.email.lower().strip()
    if not email.endswith(("@nibl.in", "@nibc.in", "@niblkorta.in")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only NIBL email addresses are allowed.")
    clash = db.query(User).filter(User.employee_code == payload.employee_code.strip(), User.id != payload.id).first()
    if clash:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This employee code is already registered.")
    hod = None
    if payload.role == UserRole.EMPLOYEE:
        if payload.hod_id:
            hod = db.query(User).filter(
                User.id == payload.hod_id, User.role == UserRole.HOD,
                User.is_active.is_(True), User.registration_status == RegistrationStatus.APPROVED,
            ).first()
            if not hod:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected HOD is not available.")
    elif payload.hod_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only employees can have an HOD.")
    return hod


@router.post("/users")
def provision(payload: PortalUser, db: Session = Depends(get_db), x_portal_key: str | None = Header(default=None)):
    _check_key(x_portal_key)
    existing = db.query(User).filter(User.id == payload.id).first()
    if existing is None:
        existing = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if existing:
        return {"status": "exists", "access": _access(existing)}
    hod = _rules(payload, db)
    user = User(
        id=payload.id,
        full_name=payload.full_name.strip(),
        employee_code=payload.employee_code.strip(),
        email=payload.email.lower().strip(),
        # Passwords are checked by the portal. This copy only keeps the
        # NOT NULL column filled; it is never used to sign in.
        password_hash=payload.password_hash,
        role=payload.role,
        hod_id=hod.id if hod else None,
        registration_status=RegistrationStatus.PENDING,
        is_active=False,
        approved_at=None,
        rejected_at=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    try:
        send_account_registration_notification(db, user)
    except Exception:
        pass
    return {"status": "created", "access": "pending"}


@router.get("/access/{user_id}")
def access(user_id: UUID, db: Session = Depends(get_db), x_portal_key: str | None = Header(default=None)):
    _check_key(x_portal_key)
    return {"access": _access(db.query(User).filter(User.id == user_id).first())}
