"""/portal-api/internal/* - called by applications (server to server, X-Portal-Key)."""
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.schemas.user import InternalPasswordIn
from app.services import auth_service, user_service

router = APIRouter(prefix="/internal", tags=["Internal (applications)"])


def _key(x_portal_key: str | None = Header(default=None)):
    if not settings.PORTAL_SERVICE_KEY or x_portal_key != settings.PORTAL_SERVICE_KEY:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid portal service key.")


@router.post("/users/{user_id}/password", dependencies=[Depends(_key)])
def set_password(user_id: str, data: InternalPasswordIn, db: Session = Depends(get_db)):
    """OIPM admin 'change password' keeps working: the new password becomes the sign-in password."""
    auth_service.set_password(db, user_service.get(db, user_id), data.new_password)
    return {"message": "Password updated."}
