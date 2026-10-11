"""
Template configuration: the 29 production stages and the 64 APQP activities.

The nested stage/phase/activity structures stay as jsonb. They are always
read and written whole - the UI edits the entire template and saves it back -
so normalising them into child tables would add joins without buying a single
query we actually make. The Pydantic shapes below are kept as the contract
for what goes into those columns, and the schemas/ layer validates against
them.
"""

from datetime import datetime

from sqlalchemy import Boolean, Index, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, json_list, model_list, ts, utcnow
from pydantic import BaseModel, Field


class StageOffset(BaseModel):
    code: str
    name: str
    sequence: int
    depends_on: str | None = None
    offset_days: int = 0
    variants: dict[str, int] = Field(default_factory=dict)
    depends_on_variants: dict[str, str] = Field(default_factory=dict)
    anchor_field: str | None = None
    note: str | None = None
    # Bearing types this stage does not apply to - no plan date is made for
    # them, and the stages after it follow on from its parent instead.
    skip_for: list[str] = Field(default_factory=list)


class ApqpActivity(BaseModel):
    """One of the 64 APQP timing-plan activities."""

    activity_id: str                   # stable id, e.g. "P0-001"
    phase_code: str                    # "PHASE0"
    no_label: str                      # "0.1", "a", "2.10", ""
    name: str
    sequence: int
    default_responsibility: str | None = None
    default_check_point: str | None = None
    is_heading: bool = False


class ApqpPhase(BaseModel):
    phase_code: str
    phase_name: str
    sequence: int
    activities: list[ApqpActivity] = Field(default_factory=list)


class Template(UUIDPrimaryKey, Base):
    """Singleton-per-kind config. kind = 'production_stages' | 'apqp_phases' | 'lookups'."""

    __tablename__ = "templates"

    kind: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    # These two come back as StageOffset / ApqpPhase objects, not dicts, so
    # the reporting and scheduling code reads them by attribute exactly as it
    # did under Beanie.
    stages: Mapped[list[StageOffset]] = model_list(StageOffset)
    phases: Mapped[list[ApqpPhase]] = model_list(ApqpPhase)
    bearing_types: Mapped[list] = json_list()
    rpd_statuses: Mapped[list] = json_list()
    delay_reasons: Mapped[list] = json_list()
    responsibilities: Mapped[list] = json_list()
    check_point_options: Mapped[list] = json_list()

    updated_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    updated_by: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("templates_kind_is_active_idx", "kind", "is_active"),
    )


class TemplateKind:
    PRODUCTION_STAGES = "production_stages"
    APQP_PHASES = "apqp_phases"
    LOOKUPS = "lookups"
