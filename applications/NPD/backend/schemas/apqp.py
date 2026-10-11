from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field
from schemas.order import ScheduleGroupIn

class CreateApqpRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    # Long enough for a product name, which becomes the id of a combined
    # order + APQP record when no order number is given.
    project_id: str = Field(min_length=1, max_length=200)
    order_no: str | None = None
    customer: str = Field(min_length=1, max_length=200)
    product_name: str | None = None
    customer_part_no: str | None = None
    program_name: str | None = None
    application: str | None = None
    supply_condition: str | None = None
    enquiry_date: date | None = None
    order_date: date | None = None
    original_date: date | None = None
    ppap_date: date | None = None
    sample_submission_date: date | None = None
    start_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="First of 5 months, e.g. 2026-09")


class UpdateApqpRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    order_no: str | None = Field(default=None, max_length=50)
    customer: str | None = Field(default=None, max_length=200)
    product_name: str | None = Field(default=None, max_length=200)
    customer_part_no: str | None = None
    program_name: str | None = None
    application: str | None = None
    supply_condition: str | None = None
    enquiry_date: date | None = None
    order_date: date | None = None
    original_date: date | None = None
    ppap_date: date | None = None
    sample_submission_date: date | None = None


class ActivityOut(BaseModel):
    id: str
    activity_id: str
    phase_code: str
    no_label: str
    activity_name: str
    sequence: int
    check_point: str | None
    responsibility: str | None
    is_heading: bool
    plan_start: date | None
    plan_end: date | None
    actual_start: date | None
    actual_end: date | None
    week_flags: dict[str, bool]
    actual_week_flags: dict[str, bool]
    remark: str | None
    status: str
    delay_days: int | None


class PhaseSummary(BaseModel):
    phase_code: str
    phase_name: str
    sequence: int
    plan_start: date | None
    plan_end: date | None
    actual_start: date | None
    actual_end: date | None
    total: int
    completed: int
    overdue: int
    percent: int
    status: str


class SignOffOut(BaseModel):
    team: dict[str, str]
    prepared_by: str | None
    reviewed_by: str | None
    approved_by: str | None


class ApqpListItem(BaseModel):
    project_id: str
    order_no: str | None
    customer: str
    product_name: str | None
    customer_part_no: str | None
    current_phase: str | None
    total_activities: int
    completed: int
    overdue: int
    percent: int
    status: str


class ApqpDetail(BaseModel):
    project_id: str
    order_no: str | None
    customer: str
    product_name: str | None
    customer_part_no: str | None
    program_name: str | None
    application: str | None
    supply_condition: str | None
    enquiry_date: date | None = None
    order_date: date | None = None
    original_date: date | None
    ppap_date: date | None
    sample_submission_date: date | None
    months: list[str]
    week_columns: list[str]
    created_at: datetime
    phases: list[PhaseSummary]
    activities: list[ActivityOut]
    sign_off: SignOffOut
    percent: int
    overdue_count: int
    status: str


class ActivityUpdate(BaseModel):
    id: str
    check_point: str | None = None
    responsibility: str | None = None
    plan_start: date | None = None
    plan_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    week_flags: dict[str, bool] | None = None
    actual_week_flags: dict[str, bool] | None = None
    remark: str | None = None


class UpdateActivitiesRequest(BaseModel):
    updates: list[ActivityUpdate] = Field(min_length=1)


class UpdateSignOffRequest(BaseModel):
    team: dict[str, str] = Field(default_factory=dict)
    prepared_by: str | None = None
    reviewed_by: str | None = None
    approved_by: str | None = None

class CreateCombinedRequest(BaseModel):
    """One form that creates a production order and its APQP project together."""
    model_config = ConfigDict(str_strip_whitespace=True)

    # ── shared ──
    customer: str = Field(min_length=1, max_length=200)

    # ── order ──
    # The product name is the identity of the order AND its APQP project.
    product_name: str = Field(min_length=1, max_length=200)
    order_no: str | None = Field(default=None, max_length=50)   # optional
    order_date: date
    planned_delivery_sample: date | None = None
    planned_delivery_batch: date | None = None
    rpd_status: str = "Not received"
    notes: str | None = None
    groups: list[ScheduleGroupIn] = Field(min_length=1)

    # ── apqp (project_id is generated, not supplied) ──
    customer_part_no: str | None = None
    program_name: str | None = None
    application: str | None = None
    supply_condition: str | None = None
    enquiry_date: date | None = None
    original_date: date | None = None
    ppap_date: date | None = None
    sample_submission_date: date | None = None
    start_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="First of 5 months, e.g. 2026-09")

    # ── who gets this project's emails (optional) ──
    # stage_code -> emails (Tracking) and department -> emails (APQP)
    stage_owners: dict[str, list[str]] | None = None
    dept_owners: dict[str, list[str]] | None = None


class CombinedCreated(BaseModel):
    order_no: str
    project_id: str
