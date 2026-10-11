"""Register, sign in, refresh, forgot / change password - the portal identity."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models.user import PortalUser
from app.services import email_service, project_service


def now():
    return datetime.now(timezone.utc)


def user_out(u: PortalUser) -> dict:
    return {
        "id": str(u.id), "full_name": u.full_name, "employee_code": u.employee_code, "email": u.email,
        "department": u.department, "is_admin": u.is_admin, "is_active": u.is_active,
        "role": (u.profile or {}).get("role"),
    }


def by_email(db: Session, email: str) -> PortalUser | None:
    return db.query(PortalUser).filter(func.lower(PortalUser.email) == email.strip().lower()).first()


async def register(db: Session, data) -> PortalUser:
    email = data.email.strip().lower()
    code = data.employee_code.strip()
    if settings.ALLOWED_EMAIL_DOMAINS and not email.endswith(tuple("@" + d for d in settings.ALLOWED_EMAIL_DOMAINS)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only NIBL email addresses are allowed.")
    if by_email(db, email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Please sign in.")
    if db.query(PortalUser).filter(func.lower(PortalUser.employee_code) == code.lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "This employee code is already registered.")

    import uuid
    user = PortalUser(
        id=uuid.uuid4(), full_name=data.full_name.strip(), employee_code=code, email=email,
        password_hash=hash_password(data.password), department=(data.department or None),
        profile={k: v for k, v in {"role": data.role, "hod_id": str(data.hod_id) if data.hod_id else None}.items() if v is not None},
    )
    # Let applications check their own sign-up rules first (e.g. OIPM: the chosen HOD).
    await project_service.validate_signup(project_service.provision_payload(user))
    db.add(user)
    db.commit()
    db.refresh(user)
    # Create the user (pending) in every application's database.
    await project_service.provision_user(db, user)
    return user


def login(db: Session, email: str, password: str) -> PortalUser:
    user = by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated. Please contact the administrator.")
    user.last_login = now()
    db.commit()
    return user


def new_password_for(user: PortalUser) -> str:
    """Same pattern as OIPM always used: Firstname + special + 4 digits."""
    first = (user.full_name.strip().split() or ["User"])[0]
    first = first[:1].upper() + first[1:].lower()
    return f"{first}{secrets.choice('!@#$%^&*')}{''.join(secrets.choice('0123456789') for _ in range(4))}"


def set_password(db: Session, user: PortalUser, plain: str) -> None:
    user.password_hash = hash_password(plain)
    user.password_changed_at = now()
    user.updated_at = now()
    db.commit()


def forgot_password(db: Session, email: str, employee_code: str) -> dict:
    user = by_email(db, email)
    if not user or user.employee_code.strip().lower() != employee_code.strip().lower():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Email and employee code do not match.")
    if not user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This account is not currently eligible for a password change.")
    new_password = new_password_for(user)
    set_password(db, user, new_password)
    if not email_service.send_password_email(user, new_password):
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Your password has been changed, but the password email could not be sent. Please contact the administrator.",
        )
    return {"message": "Your password has been changed successfully. The new password has been sent to your registered email."}


def change_password(db: Session, user: PortalUser, current: str, new: str) -> None:
    if not verify_password(current, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is not correct.")
    set_password(db, user, new)
