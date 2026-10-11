from datetime import date

from fastapi import APIRouter, Depends

from models.user import User
from schemas.timeline import TimelineResponse, TimelineBar
from services import order_service, status_service
from utils.constants import Permission
from utils.deps import require_permission

router = APIRouter(prefix="/orders", tags=["Timeline"])


@router.get("/{order_no}/timeline", response_model=TimelineResponse)
async def timeline(
    order_no: str,
    _: User = Depends(require_permission(Permission.TRACKING_VIEW)),
):
    order = await order_service.resolve(order_no)
    order_no = order.order_no
    stages = await order_service.get_stages(order_no)

    bars = []
    dates: list[date] = []

    for s in stages:
        info = status_service.describe(s)
        bars.append(TimelineBar(
            stage_code=s.stage_code,
            stage_name=s.stage_name,
            sequence=s.sequence,
            schedule_group=s.schedule_group,
            plan_date=s.plan_date,
            actual_date=s.actual_date,
            status=info["status"],
            delay_days=info["delay_days"],
        ))
        dates.extend(d for d in (s.plan_date, s.actual_date) if d)

    today = date.today()
    dates.append(today)

    return TimelineResponse(
        order_no=order.order_no,
        customer_name=order.customer_name,
        today=today,
        range_start=min(dates) if dates else None,
        range_end=max(dates) if dates else None,
        groups=sorted({s.schedule_group for s in stages}),
        bars=bars,
    )



