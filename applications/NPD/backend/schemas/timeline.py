from datetime import date
from pydantic import BaseModel


class TimelineBar(BaseModel):
    stage_code: str
    stage_name: str
    sequence: int
    schedule_group: str
    plan_date: date | None
    actual_date: date | None
    status: str
    delay_days: int | None


class TimelineResponse(BaseModel):
    order_no: str
    customer_name: str
    today: date
    range_start: date | None
    range_end: date | None
    groups: list[str]
    bars: list[TimelineBar]























