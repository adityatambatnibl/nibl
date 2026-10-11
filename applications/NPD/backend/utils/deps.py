from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import repo
from models.user import User
from utils.constants import AccountStatus, Role
from utils.security import decode_access_token

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> User:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated.")

    payload = decode_access_token(cred.credentials)
    if not payload or not payload.get("sub"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.")

    user = await repo.get(User, payload["sub"])
    if not user or not user.is_active or user.status != AccountStatus.APPROVED:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is no longer active.")

    return user


def require_role(*roles: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this resource.")
        return user
    return checker


def require_permission(*perms: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if not all(user.has_permission(p) for p in perms):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to perform this action.")
        return user
    return checker


require_admin = require_role(Role.ADMIN)
