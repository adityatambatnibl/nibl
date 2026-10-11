from fastapi import APIRouter, Depends

from models.user import User
from schemas.dashboard import DashboardSummary
from services import dashboard_service, read_cache
from utils.constants import Permission
from utils.deps import require_permission

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def summary(_: User = Depends(require_permission(Permission.DASHBOARD_VIEW))):
    return await read_cache.get(
        "dashboard", lambda: dashboard_service.summary(attention_limit=50)
    )