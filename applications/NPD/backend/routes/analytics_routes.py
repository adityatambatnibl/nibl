from datetime import date

from fastapi import APIRouter, Depends, Query

from models.user import User
from schemas.analytics import AnalyticsResponse, AnalyticsFilters
from services import analytics_service, read_cache
from utils.constants import Permission
from utils.deps import require_permission

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("", response_model=AnalyticsResponse)
async def analytics(
    month: str | None = Query(default=None),
    customer: str | None = Query(default=None),
    bearing_type: str | None = Query(default=None),
    months: int = Query(default=6, ge=3, le=36, description="How many months the Business charts show"),
    user: User = Depends(require_permission(Permission.ANALYTICS_VIEW)),
):
    return await read_cache.get(
        "analytics",
        lambda: analytics_service.build(
            AnalyticsFilters(
                month=month,
                customer=customer,
                bearing_type=bearing_type,
            ),
            is_admin=user.is_admin,
            months=months,
        ),
        month, customer, bearing_type, user.is_admin, months,
    )