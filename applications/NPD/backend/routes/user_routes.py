from fastapi import APIRouter, Depends, Query

from models.user import User
from schemas.user import (
    UserListItem, UpdatePermissionsRequest, UpdateRoleRequest, UpdateActiveRequest,
)
from services import user_service
from utils.constants import Permission, AccountStatus
from utils.deps import require_admin

router = APIRouter(prefix="/users", tags=["User Management"])


@router.get("", response_model=list[UserListItem])
async def list_users(
    status: str | None = Query(default=None, description="pending | approved | rejected"),
    _: User = Depends(require_admin),
):
    return await user_service.list_users(status)


@router.get("/permissions", response_model=list[str])
async def available_permissions(_: User = Depends(require_admin)):
    return [
            Permission.DASHBOARD_VIEW,
            Permission.APQP_VIEW,
            Permission.APQP_EDIT,
            Permission.ATTACHMENT_UPLOAD,
            Permission.TRACKING_VIEW,
            Permission.TRACKING_EDIT,
            Permission.ANALYTICS_VIEW,
            Permission.EXCEL_EXPORT,
            Permission.TIMELINE_CREATE,
        ]

@router.post("/sync-supabase")
async def sync_supabase(_: User = Depends(require_admin)):
    from config.settings import settings
    from services import user_sync_service
    if not settings.USER_SYNC_ENABLED:
        # Users now arrive from the NIBL portal the moment they register.
        return {"found": 0, "created": 0, "already_present": 0, "new_users": [],
                "message": "New users are added automatically by the NIBL portal."}
    return await user_sync_service.sync()

@router.post("/{user_id}/approve", response_model=UserListItem)
async def approve(user_id: str, admin: User = Depends(require_admin)):
    return await user_service.approve(user_id, admin)


@router.post("/{user_id}/reject", response_model=UserListItem)
async def reject(user_id: str, admin: User = Depends(require_admin)):
    return await user_service.reject(user_id, admin)


@router.put("/{user_id}/permissions", response_model=UserListItem)
async def update_permissions(
    user_id: str,
    data: UpdatePermissionsRequest,
    admin: User = Depends(require_admin),
):
    return await user_service.set_permissions(user_id, data.permissions, admin)

@router.put("/{user_id}/role", response_model=UserListItem)
async def update_role(user_id: str, data: UpdateRoleRequest, admin: User = Depends(require_admin)):
    return await user_service.set_role(user_id, data.role, admin)


@router.put("/{user_id}/active", response_model=UserListItem)
async def update_active(user_id: str, data: UpdateActiveRequest, admin: User = Depends(require_admin)):
    return await user_service.set_active(user_id, data.is_active, admin)

@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: str, admin: User = Depends(require_admin)):
    await user_service.delete(user_id, admin)
