from datetime import date
from pydantic import BaseModel, Field


class StageOffsetOut(BaseModel):
    code: str
    name: str
    sequence: int
    depends_on: str | None
    offset_days: int
    variants: dict[str, int]
    depends_on_variants: dict[str, str]
    anchor_field: str | None = None
    note: str | None
    skip_for: list[str] = Field(default_factory=list)
    actual_avg_offset: float | None = None
    variance: float | None = None
    sample_size: int = 0
    unconfirmed: bool = False


class StageOffsetUpdate(BaseModel):
    code: str
    name: str
    sequence: int
    depends_on: str | None = None
    offset_days: int = 0
    variants: dict[str, int] = Field(default_factory=dict)
    depends_on_variants: dict[str, str] = Field(default_factory=dict)
    anchor_field: str | None = None
    note: str | None = None
    skip_for: list[str] = Field(default_factory=list)


class UpdateStagesRequest(BaseModel):
    stages: list[StageOffsetUpdate]


class LookupsOut(BaseModel):
    bearing_types: list[str]
    rpd_statuses: list[str]
    delay_reasons: list[str]
    responsibilities: list[str]
    check_point_options: list[str]


class PreviewRequest(BaseModel):
    a0_date: date | None = None
    a_date: date | None = None
    order_date: date | None = None
    conditions: list[str] = Field(default_factory=list)


class PreviewStage(BaseModel):
    code: str
    name: str
    sequence: int
    depends_on: str | None
    offset_days: int
    plan_date: date
    days_from_a: int


class PreviewResponse(BaseModel):
    a0_date: date | None
    a_date: date
    total_days: int | None
    stages: list[PreviewStage]