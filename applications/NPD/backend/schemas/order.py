from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field


class OrderItemIn(BaseModel):
    item_description: str = Field(min_length=1, max_length=200)
    bearing_type: str
    po_qty: str | None = None
    value: float | None = None


class ScheduleGroupIn(BaseModel):
    """A set of items that share one 29-stage schedule."""
    label: str | None = None
    anchor_a0: date | None = None
    anchor_a: date | None = None
    items: list[OrderItemIn] = Field(min_length=1)


class CreateOrderRequest(BaseModel):
    # "   " is treated as empty, so it fails min_length instead of being saved.
    model_config = ConfigDict(str_strip_whitespace=True)
    # Product name is the identity shown everywhere; the order number is
    # optional and falls back to the product name when left blank.
    product_name: str = Field(min_length=1, max_length=200)
    order_no: str | None = Field(default=None, max_length=50)
    order_date: date
    customer_name: str = Field(min_length=1, max_length=200)
    planned_delivery_sample: date | None = None
    planned_delivery_batch: date | None = None
    rpd_status: str = "Not received"
    notes: str | None = None
    groups: list[ScheduleGroupIn] = Field(min_length=1)


class UpdateOrderRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    product_name: str | None = Field(default=None, max_length=200)
    order_date: date | None = None
    customer_name: str | None = None
    planned_delivery_sample: date | None = None
    planned_delivery_batch: date | None = None
    rpd_status: str | None = None
    notes: str | None = None


class OrderItemOut(BaseModel):
    id: str
    item_description: str
    bearing_type: str
    po_qty: str | None
    value: float | None
    schedule_group: str
    anchor_a0: date | None
    anchor_a: date


class StageOut(BaseModel):
    id: str
    schedule_group: str
    stage_code: str
    stage_name: str
    sequence: int
    plan_date: date | None
    actual_date: date | None
    remark: str | None
    delay_reason: str | None
    status: str
    delay_days: int | None


class OrderListItem(BaseModel):
    order_no: str
    customer_name: str
    product_name: str | None = None
    order_date: date | None
    planned_delivery_sample: date | None
    planned_delivery_batch: date | None
    rpd_status: str
    item_count: int
    status: str
    progress_percent: int
    overdue_count: int


class OrderDetail(BaseModel):
    order_no: str
    order_date: date | None
    product_name: str | None = None
    customer_name: str
    planned_delivery_sample: date | None
    planned_delivery_batch: date | None
    rpd_status: str
    notes: str | None
    apqp_project_id: str | None
    created_at: datetime
    items: list[OrderItemOut]
    stages: list[StageOut]
    status: str
    progress: dict
    stage_counts: dict
    overdue_count: int


class StageUpdate(BaseModel):
    stage_id: str
    plan_date: date | None = None
    actual_date: date | None = None
    remark: str | None = None
    delay_reason: str | None = None


class UpdateItemRequest(BaseModel):
    """Edit one item row. schedule_group moves it to another group of the same order."""
    item_description: str = Field(min_length=1, max_length=200)
    bearing_type: str = Field(min_length=1, max_length=100)
    po_qty: str | None = None
    value: float | None = None
    schedule_group: str | None = None


class UpdateAnchorsRequest(BaseModel):
    """Sample study (A0) / Proposal drawing (A) dates of one schedule group."""
    anchor_a0: date | None = None
    anchor_a: date | None = None


class UpdateStagesRequest(BaseModel):
    updates: list[StageUpdate] = Field(min_length=1)