"""/portal-api/users/* - portal admin: identities, passwords, status in each application."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.permissions import require_portal_admin
from app.db.database import get_db
from app.schemas.user import ActiveIn, AdminIn
from app.services import project_service, user_service

router = APIRouter(prefix="/users", tags=["Users (portal admin)"])


@router.get("")
def list_users(q: str = "", page: int = 1, size: int = 50, _=Depends(require_portal_admin), db: Session = Depends(get_db)):
    return user_service.list_users(db, q, page, min(size, 200))


@router.get("/{user_id}/access")
async def user_access(user_id: str, _=Depends(require_portal_admin)):
    return await project_service.access_for_admin(user_id)


@router.post("/{user_id}/sync")
async def resync(user_id: str, _=Depends(require_portal_admin), db: Session = Depends(get_db)):
    return await project_service.provision_user(db, user_service.get(db, user_id))


@router.put("/{user_id}/active")
def set_active(user_id: str, data: ActiveIn, admin=Depends(require_portal_admin), db: Session = Depends(get_db)):
    return user_service.set_active(db, user_id, data.is_active, admin)


@router.put("/{user_id}/admin")
def set_admin(user_id: str, data: AdminIn, admin=Depends(require_portal_admin), db: Session = Depends(get_db)):
    return user_service.set_admin(db, user_id, data.is_admin, admin)


@router.post("/{user_id}/reset-password")
def reset_password(user_id: str, _=Depends(require_portal_admin), db: Session = Depends(get_db)):
    return user_service.reset_password(db, user_id)
