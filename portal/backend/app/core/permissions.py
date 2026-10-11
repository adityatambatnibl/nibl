"""
Portal permissions.

Only one portal-level permission exists: portal admin (manage identities,
reset passwords, see each user's status in every application).

Access to an APPLICATION is never decided here - each application's own
admin approves its users in that application's database, and the portal
asks the application (GET /portal/access/{user_id}) before opening a card.
"""
from fastapi import Depends, HTTPException, status

from app.core.security import get_current_user


def require_portal_admin(user=Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the portal administrator can do this.")
    return user
