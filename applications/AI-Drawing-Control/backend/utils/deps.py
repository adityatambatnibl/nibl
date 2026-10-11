"""
Who is calling? The browser sends the NIBL portal access token (Bearer).
It is checked with PORTAL_JWT_SECRET, then the person must be APPROVED in
this application's own user table.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config.settings import settings
from database import repo
from models.user import User

bearer = HTTPBearer(auto_error=False)


async def get_identity(cred: HTTPAuthorizationCredentials | None = Depends(bearer)) -> User | None:
    """The person's row here (any status), or 401 if the token is missing / expired."""
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.")
    try:
        payload = jwt.decode(cred.credentials, settings.PORTAL_JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")
    if payload.get("type") != "access" or not payload.get("sub"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session.")
    return await repo.get(User, payload["sub"])


async def get_current_user(user: User | None = Depends(get_identity)) -> User:
    if user is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your AI Drawing Control account has not been created yet.")
    if not user.is_approved:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your access to AI Drawing Control is not approved yet.")
    return user
