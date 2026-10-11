from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select

from database import repo
from models.user import User
from schemas.user import UserListItem
from services import audit_service, notification_service
from utils.constants import AccountStatus, AuditAction, Permission, Role


def to_list_item(u: User, deletable: bool = False) -> UserListItem:
    return UserListItem(
        id=str(u.id), name=u.name, email=u.email, role=u.role, status=u.status,
        permissions=u.permissions, is_active=u.is_active,
        last_login=u.last_login, created_at=u.created_at,
        can_delete=deletable,
    )


async def _get(user_id: str) -> User:
    user = await repo.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    return user


async def can_delete(user: User) -> tuple[bool, str | None]:
    """Hard delete only if the account never had access or created nothing."""
    from models.apqp import ApqpProject
    from models.order import Order

    if user.status in (AccountStatus.PENDING, AccountStatus.REJECTED):
        return True, None

    if user.last_login is None:
        return True, None

    uid = str(user.id)
    if await repo.exists(select(Order).where(Order.created_by == uid)):
        return False, "This user has created orders. Deactivate the account instead so the history is kept."
    if await repo.exists(select(ApqpProject).where(ApqpProject.created_by == uid)):
        return False, "This user has created APQP projects. Deactivate the account instead so the history is kept."

    return True, None


# async def list_users(status_filter: str | None = None) -> list[UserListItem]:
#     stmt = select(User).order_by(User.created_at.desc())
#     if status_filter:
#         stmt = stmt.where(User.status == status_filter)
async def list_users(status: str | None = None) -> list[UserListItem]:
    stmt = select(User)
    if status:
        stmt = stmt.where(User.status == status)
    else:
        # Users are people who can actually sign in. Pending and rejected
        # accounts live on the Approvals screen instead. Rejected rows are
        # KEPT, not deleted - the Supabase sync would re-import them as
        # pending within 30 seconds otherwise.
        stmt = stmt.where(User.status == AccountStatus.APPROVED)
    users = await repo.find_all(stmt)

    out = []
    for u in users:
        allowed, _ = await can_delete(u)
        out.append(to_list_item(u, allowed))
    return out


async def approve(user_id: str, admin: User) -> UserListItem:
    user = await _get(user_id)
    if user.status == AccountStatus.APPROVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This user is already approved.")

    now = datetime.now(timezone.utc)
    user.status = AccountStatus.APPROVED
    user.approved_by = str(admin.id)
    user.approved_at = now
    user.updated_at = now
    await audit_service.log(AuditAction.USER_APPROVED, admin, "user", str(user.id), user.email)
    await notification_service.mark_read_by_ref(str(user.id))

    try:
        from services import admin_alert_service
        await admin_alert_service.notify_account_approved(user)
    except Exception:
        pass

    return to_list_item(user, (await can_delete(user))[0])


async def reject(user_id: str, admin: User) -> UserListItem:
    user = await _get(user_id)
    if user.is_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An admin account cannot be rejected.")

    now = datetime.now(timezone.utc)
    user.status = AccountStatus.REJECTED
    user.rejected_by = str(admin.id)
    user.rejected_at = now
    user.updated_at = now
    await audit_service.log(AuditAction.USER_REJECTED, admin, "user", str(user.id), user.email)
    await notification_service.mark_read_by_ref(str(user.id))

    try:
        from services import admin_alert_service
        await admin_alert_service.notify_account_rejected(user)
    except Exception:
        pass

    return to_list_item(user, (await can_delete(user))[0])


async def set_permissions(user_id: str, permissions: list[str], admin: User) -> UserListItem:
    valid = {v for k, v in vars(Permission).items() if not k.startswith("_")}
    unknown = set(permissions) - valid
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown permissions: {', '.join(sorted(unknown))}")

    user = await _get(user_id)
    before = list(user.permissions)
    user.permissions = sorted(set(permissions))
    user.updated_at = datetime.now(timezone.utc)
    await audit_service.log(
        AuditAction.USER_PERMISSIONS_CHANGED, admin, "user", str(user.id), user.email,
        before={"permissions": before}, after={"permissions": user.permissions},
    )
    return to_list_item(user, (await can_delete(user))[0])


async def set_role(user_id: str, role: str, admin: User) -> UserListItem:
    if role not in Role.ALL:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Role must be one of: {', '.join(Role.ALL)}")

    user = await _get(user_id)
    if str(user.id) == str(admin.id) and role != Role.ADMIN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot remove your own admin role.")

    if user.is_admin and role != Role.ADMIN:
        others = await repo.count(
            select(User).where(
                User.role == Role.ADMIN,
                User.is_active.is_(True),
                User.status == AccountStatus.APPROVED,
                User.id != user.id,
            )
        )
        if others == 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "This is the only active admin. Promote someone else first.",
            )

    before = user.role
    user.role = role
    user.updated_at = datetime.now(timezone.utc)
    await audit_service.log(
        AuditAction.USER_ROLE_CHANGED, admin, "user", str(user.id), user.email,
        before={"role": before}, after={"role": role},
    )
    return to_list_item(user, (await can_delete(user))[0])


async def set_active(user_id: str, is_active: bool, admin: User) -> UserListItem:
    user = await _get(user_id)
    if str(user.id) == str(admin.id) and not is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot deactivate your own account.")

    user.is_active = is_active
    user.updated_at = datetime.now(timezone.utc)
    action = AuditAction.USER_ACTIVATED if is_active else AuditAction.USER_DEACTIVATED
    await audit_service.log(action, admin, "user", str(user.id), user.email)
    return to_list_item(user, (await can_delete(user))[0])


async def delete(user_id: str, admin: User) -> None:
    user = await _get(user_id)

    if str(user.id) == str(admin.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account.")

    allowed, reason = await can_delete(user)
    if not allowed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, reason)

    await audit_service.log(
        AuditAction.USER_DELETED, admin, "user", str(user.id), user.email,
        before={"name": user.name, "email": user.email, "role": user.role, "status": user.status},
    )
    await notification_service.mark_read_by_ref(str(user.id))
    await repo.remove(user)
