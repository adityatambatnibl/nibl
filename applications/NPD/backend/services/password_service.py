from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select

from database import repo
from models.notification import Notification
from models.user import User
from services import audit_service, notification_service
from utils.constants import AccountStatus, AuditAction, NotificationType
from utils.security import hash_password, hash_reset_token, verify_password


async def request_reset(email: str) -> None:
    """Notifies admins instead of emailing the user. Silent either way."""
    from services.auth_service import by_email

    user = await repo.find_one(by_email(email))

    if not user or not user.is_active or user.status != AccountStatus.APPROVED:
        return

    existing = await repo.find_one(
        select(Notification).where(
            Notification.type == NotificationType.PASSWORD_RESET,
            Notification.ref_id == str(user.id),
            Notification.is_read.is_(False),
        )
    )
    if existing:
        return

    await notification_service.create(
        type=NotificationType.PASSWORD_RESET,
        title="Password reset requested",
        message=f"{user.name} ({user.email}) has asked for a password reset.",
        link="/admin/users",
        ref_id=str(user.id),
    )

    await audit_service.log(AuditAction.PASSWORD_RESET_REQUESTED, user, "user", str(user.id), user.email)

    try:
        from services import admin_alert_service
        await admin_alert_service.notify_password_reset_request(user)
    except Exception:
        pass


async def reset_with_token(token: str, new_password: str) -> None:
    token_hash = hash_reset_token(token)
    user = await repo.find_one(select(User).where(User.reset_token_hash == token_hash))

    if not user or not user.reset_expires_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is not valid.")

    # Postgres returns timestamptz already aware, unlike Mongo which handed
    # back naive datetimes - but the guard costs nothing and keeps the
    # comparison safe for any row written before the migration.
    expires = user.reset_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if expires < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link has expired. Please request a new one.")

    user.password_hash = hash_password(new_password)
    user.reset_token_hash = None
    user.reset_expires_at = None
    user.must_change_password = False
    user.updated_at = datetime.now(timezone.utc)

    await audit_service.log(AuditAction.PASSWORD_RESET_COMPLETED, user, "user", str(user.id), user.email)


async def change_own(user: User, current_password: str, new_password: str) -> None:
    if not user.password_hash:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "You sign in through the NIBL Workspace, so there is no NPD password to change. "
            "Change your Workspace password instead.",
        )

    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is not correct.")

    if verify_password(new_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The new password must be different.")

    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.updated_at = datetime.now(timezone.utc)

    await audit_service.log(AuditAction.PASSWORD_CHANGED, user, "user", str(user.id), user.email)

