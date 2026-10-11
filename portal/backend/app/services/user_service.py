"""Portal admin: identities (not application approval - that is done inside each application)."""
from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.project import ProjectSync
from app.models.user import PortalUser
from app.services import auth_service, email_service


def list_users(db: Session, q: str = "", page: int = 1, size: int = 50) -> dict:
    query = db.query(PortalUser)
    for term in (q or "").lower().split():
        like = f"%{term}%"
        query = query.filter(or_(func.lower(PortalUser.full_name).like(like), func.lower(PortalUser.email).like(like),
                                 func.lower(PortalUser.employee_code).like(like)))
    total = query.count()
    rows = query.order_by(func.lower(PortalUser.full_name)).offset((max(page, 1) - 1) * size).limit(size).all()
    sync = {}
    if rows:
        for s in db.query(ProjectSync).filter(ProjectSync.user_id.in_([r.id for r in rows])).all():
            sync.setdefault(str(s.user_id), {})[s.project_id] = s.status
    return {
        "items": [{**auth_service.user_out(u), "created_at": u.created_at.isoformat(),
                   "last_login": u.last_login.isoformat() if u.last_login else None,
                   "sync": sync.get(str(u.id), {})} for u in rows],
        "total": total, "page": page, "size": size,
    }


def get(db: Session, user_id) -> PortalUser:
    import uuid
    try:
        u = db.get(PortalUser, uuid.UUID(str(user_id)))
    except ValueError:
        u = None
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    return u


def set_active(db: Session, user_id, active: bool, admin: PortalUser) -> dict:
    u = get(db, user_id)
    if u.id == admin.id and not active:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot deactivate your own account.")
    u.is_active = active
    db.commit()
    return auth_service.user_out(u)


def set_admin(db: Session, user_id, is_admin: bool, admin: PortalUser) -> dict:
    u = get(db, user_id)
    if u.id == admin.id and not is_admin:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own portal admin access.")
    u.is_admin = is_admin
    db.commit()
    return auth_service.user_out(u)


def reset_password(db: Session, user_id) -> dict:
    u = get(db, user_id)
    new = auth_service.new_password_for(u)
    auth_service.set_password(db, u, new)
    sent = email_service.send_password_email(u, new)
    return {"message": "New password emailed to the user." if sent
            else "Password changed, but the email could not be sent. Check SMTP settings."}
