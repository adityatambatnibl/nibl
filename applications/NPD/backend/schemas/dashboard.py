from datetime import date

from pydantic import BaseModel


class OrderMetrics(BaseModel):
    total: int
    not_started: int
    in_progress: int
    delayed: int
    completed: int
    total_items: int

    # Stage counts across ACTIVE orders only (completed orders excluded).
    active_stages: int = 0
    active_stages_done: int = 0


class AttentionItem(BaseModel):
    order_no: str
    customer_name: str
    stage_code: str
    stage_name: str
    plan_date: date
    days_overdue: int


class RecentOrder(BaseModel):
    order_no: str
    customer_name: str
    product_name: str | None = None
    order_date: date | None
    delivery_date: date | None = None
    status: str
    progress_percent: int


class ApqpAttentionItem(BaseModel):
    project_id: str
    customer: str
    no_label: str
    activity_name: str
    responsibility: str | None
    plan_date: date
    days_overdue: int


class RecentApqp(BaseModel):
    project_id: str
    product_name: str | None = None
    customer: str
    customer_part_no: str | None
    current_phase: str | None
    percent: int
    status: str


class StageGroupCount(BaseModel):
    label: str
    count: int


class WeekItem(BaseModel):
    """One stage falling due - what the 'Coming up' card lists."""
    order_no: str
    product_name: str | None = None
    customer_name: str = ""
    stage_name: str
    plan_date: date


class WeekLoad(BaseModel):
    label: str
    starts: date
    count: int
    items: list[WeekItem] = []      # earliest first, at most WEEK_ITEMS


class CombinedAttentionItem(BaseModel):
    kind: str  # "order" | "apqp"
    record_id: str
    display_name: str | None = None
    customer: str
    code: str  # stage_code or no_label
    name: str
    owner: str | None
    plan_date: date
    days_overdue: int


class AttentionStats(BaseModel):
    """
    Totals over EVERY overdue item. The list itself only carries the worst
    few rows, so the page stays small however much data there is.
    """
    total: int = 0
    orders: int = 0
    apqp: int = 0
    max_days: int = 0
    buckets: list[int] = [0, 0, 0, 0]          # 1-3, 4-7, 8-14, 15+ days
    top_owner: str | None = None
    top_owner_count: int = 0
    # "order:<no>" / "apqp:<id>" -> {days (worst), count (items late),
    # what (name of the worst item)}, for the records in the recent lists only.
    late_by: dict[str, dict] = {}


class ApqpMetrics(BaseModel):
    total: int
    not_started: int
    in_progress: int
    delayed: int
    completed: int
    total_activities: int
    overdue_activities: int
    active_activities: int = 0
    active_activities_done: int = 0


class DashboardSummary(BaseModel):
    orders: OrderMetrics
    stage_counts: dict
    attention: list[AttentionItem]
    recent: list[RecentOrder]
    upcoming_deliveries: list[RecentOrder]

    apqp: ApqpMetrics
    apqp_attention: list[ApqpAttentionItem]
    apqp_recent: list[RecentApqp]

    combined_attention: list[CombinedAttentionItem]
    combined_attention_stats: AttentionStats = AttentionStats()
    stage_groups: list[StageGroupCount]
    week_load: list[WeekLoad]
    due_next_7_days: int