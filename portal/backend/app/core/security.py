"""
Passwords and tokens.

Token format is IDENTICAL to the one OIPM always issued
({"sub": <user id>, "type": "access" | "refresh", "exp": ...}, HS256, JWT_SECRET_KEY),
which is why OIPM, NPD (via OIPM_JWT_SECRET) and AI Drawing accept it unchanged.
"""
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)

REFRESH_COOKIE = "portal_refresh_token"


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, TypeError):
        return False


def _token(sub: str, kind: str, delta: timedelta) -> str:
    if not settings.JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY is not set in portal/backend/.env")
    payload = {"sub": str(sub), "type": kind, "exp": datetime.now(timezone.utc) + delta}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(sub: str) -> str:
    return _token(sub, "access", timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(sub: str) -> str:
    return _token(sub, "refresh", timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def decode(token: str, kind: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != kind or not payload.get("sub"):
        return None
    return str(payload["sub"])


def get_current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    from app.models.user import PortalUser
    from app.db.database import SessionLocal  # noqa: F401

    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")
    sub = decode(cred.credentials, "access")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")
    user = db.get(PortalUser, _uuid(sub))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account is not active.")
    return user


def _uuid(v):
    import uuid
    try:
        return uuid.UUID(str(v))
    except (ValueError, TypeError):
        return None
