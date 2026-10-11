from datetime import date
from pydantic import BaseModel


class StageBottleneck(BaseModel):
    stage_code: str
    stage_name: str
    sequence: int
    total_records: int
    completed: int
    on_time: int
    late: int
    still_overdue: int
    avg_delay_days: float | None
    max_delay_days: int | None
    late_rate: float          # % of completed that were late


class DelayReasonCount(BaseModel):
    reason: str
    count: int
    avg_delay_days: float | None


class OnTimeSummary(BaseModel):
    dispatch_stage: str
    total_with_actual: int
    on_time: int
    late: int
    on_time_rate: float
    avg_delay_days: float | None


class MonthlyTrend(BaseModel):
    month: str                # "2026-08"
    completed: int
    on_time: int
    on_time_rate: float


class LeadTimeComparison(BaseModel):
    stage_code: str
    stage_name: str
    template_offset: int
    actual_avg_offset: float | None
    variance: float | None
    sample_size: int


class DepartmentLoad(BaseModel):
    responsibility: str
    total: int
    completed: int
    overdue: int
    percent: int

class IntakeMonth(BaseModel):
    month: str
    received: int
    completed: int
    value: float = 0.0          # order value received that month (admin only, else 0)


class OrderBook(BaseModel):
    total: float
    delivered: float
    in_progress: float
    not_started: float
    order_count: int


class CustomerShare(BaseModel):
    customer: str
    value: float
    orders: int
    percent: float


class CycleTime(BaseModel):
    month: str
    avg_days: float
    orders: int

class PhaseProgress(BaseModel):
    phase_code: str
    phase_name: str
    total: int
    completed: int
    overdue: int
    percent: int
    avg_delay_days: float | None


class ApqpProjectProgress(BaseModel):
    project_id: str
    customer: str
    product_name: str | None
    total: int
    completed: int
    overdue: int
    percent: int
    current_phase: str | None


class AnalyticsFilters(BaseModel):
    month: str | None = None 
    customer: str | None = None
    bearing_type: str | None = None


class AnalyticsResponse(BaseModel):
    filters_applied: AnalyticsFilters
    order_count: int
    item_count: int
    bottlenecks: list[StageBottleneck]
    delay_reasons: list[DelayReasonCount]
    on_time: OnTimeSummary | None
    trend: list[MonthlyTrend]
    lead_times: list[LeadTimeComparison]
    apqp_departments: list[DepartmentLoad]
    apqp_phases: list[PhaseProgress] = []
    apqp_projects: list[ApqpProjectProgress] = []
    apqp_project_count: int = 0
    apqp_activity_count: int = 0
    available_customers: list[str]
    available_months: list[str] = []
    intake: list[IntakeMonth] = []
    cycles: list[CycleTime] = []
    order_book: OrderBook | None = None      # admin only
    customers: list[CustomerShare] = []      # admin only
    currency: str = "\u20b9"
    matched_orders: list[str] = []