from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, UUIDPrimaryKey, json_dict, json_list, ts, utcnow


class ApqpProject(UUIDPrimaryKey, Base):
    __tablename__ = "apqp_projects"

    project_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    order_no: Mapped[str | None] = mapped_column(Text, nullable=True)   # optional link to a production order
    customer: Mapped[str] = mapped_column(Text, nullable=False)
    product_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_part_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    program_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    application: Mapped[str | None] = mapped_column(Text, nullable=True)
    supply_condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    enquiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    order_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    original_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ppap_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sample_submission_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Timing-plan grid window: 5 consecutive months, "YYYY-MM".
    months: Mapped[list[str]] = json_list()

    template_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime | None] = ts(nullable=True)
    updated_by: Mapped[str | None] = mapped_column(Text, nullable=True)

    activities: Mapped[list["ApqpActivityRecord"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", passive_deletes=True
    )
    signoff: Mapped["ApqpSignOff | None"] = relationship(
        back_populates="project", cascade="all, delete-orphan", passive_deletes=True, uselist=False
    )

    __table_args__ = (
        Index("apqp_projects_order_no_idx", "order_no"),
        Index("apqp_projects_customer_idx", "customer"),
        Index("apqp_projects_product_name_idx", "product_name"),
        Index("apqp_projects_created_at_idx", text("created_at DESC")),
    )


class ApqpActivityRecord(UUIDPrimaryKey, Base):
    __tablename__ = "apqp_activities"

    project_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("apqp.apqp_projects.project_id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
    )
    activity_id: Mapped[str] = mapped_column(Text, nullable=False)    # stable template id, e.g. "P0-001"
    phase_code: Mapped[str] = mapped_column(Text, nullable=False)
    no_label: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    activity_name: Mapped[str] = mapped_column(Text, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    check_point: Mapped[str | None] = mapped_column(Text, nullable=True)   # doc reference, NOT a file path
    responsibility: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_heading: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    plan_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    plan_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    week_flags: Mapped[dict] = json_dict()            # plan
    actual_week_flags: Mapped[dict] = json_dict()     # actual
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)

    updated_at: Mapped[datetime | None] = ts(nullable=True)
    updated_by: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["ApqpProject"] = relationship(back_populates="activities")

    __table_args__ = (
        Index("apqp_activities_project_id_idx", "project_id"),
        Index("apqp_activities_phase_code_idx", "phase_code"),
        Index("apqp_activities_project_id_activity_id_key", "project_id", "activity_id", unique=True),
    )


class ApqpSignOff(UUIDPrimaryKey, Base):
    __tablename__ = "apqp_signoffs"

    project_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("apqp.apqp_projects.project_id", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    team: Mapped[dict] = json_dict()                  # "1".."12" -> name
    prepared_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime | None] = ts(nullable=True)

    project: Mapped["ApqpProject"] = relationship(back_populates="signoff")
