"""/portal-api/auth/* - one sign-in for every NIBL application."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import cookie_secure, settings
from app.core.security import (REFRESH_COOKIE, create_access_token, create_refresh_token, decode,
                               get_current_user, _uuid)
from app.db.database import get_db
from app.models.user import PortalUser
from app.schemas.auth import ChangePasswordRequest, ForgotPasswordRequest, LoginRequest, RegisterRequest
from app.schemas.user import PortalUserOut, TokenResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_refresh(response: Response, user_id: str) -> None:
    # Path "/" so OIPM's own /api/v1/auth/refresh can also read it (opening OIPM
    # from the card needs no second sign-in). httpOnly: scripts cannot read it.
    response.set_cookie(
        REFRESH_COOKIE, create_refresh_token(user_id), httponly=True, samesite="lax",
        secure=cookie_secure(), max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, path="/",
    )


def _token_response(response: Response, user: PortalUser) -> dict:
    _set_refresh(response, str(user.id))
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer",
            "user": auth_service.user_out(user)}


@router.post("/register", status_code=201)
async def register(data: RegisterRequest, db: Session = Depends(get_db)):
    await auth_service.register(db, data)
    return {"message": "Account created. You can sign in now. Each application's administrator "
                       "must approve you before its card opens."}


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    return _token_response(response, auth_service.login(db, data.email, data.password))


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    sub = decode(request.cookies.get(REFRESH_COOKIE, ""), "refresh")
    user = db.get(PortalUser, _uuid(sub)) if sub else None
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in.")
    return _token_response(response, user)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(REFRESH_COOKIE, path="/")
    response.delete_cookie("oipm_refresh_token", path="/api/v1/auth")   # OIPM's own session, if any
    return {"message": "Signed out."}


@router.get("/me", response_model=PortalUserOut)
def me(user: PortalUser = Depends(get_current_user)):
    return auth_service.user_out(user)


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    return auth_service.forgot_password(db, data.email, data.employee_code)


@router.post("/change-password")
def change_password(data: ChangePasswordRequest, user: PortalUser = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    auth_service.change_password(db, db.merge(user), data.current_password, data.new_password)
    return {"message": "Your password has been changed."}
