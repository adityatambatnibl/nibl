from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, json_list, model_list, ts, utcnow


# The shapes stored inside the jsonb columns below. Kept as Pydantic models
# so the routes can still validate what an admin submits.
class StageOwner(BaseModel):
    stage_code: str
    emails: list[str] = Field(default_factory=list)
    label: str | None = None            # e.g. "Turning shop"


class ApqpOwner(BaseModel):
    responsibility: str                 # "MKTG", "TOOL ROOM", ...
    label: str | None = None            # "Tool room team"
    emails: list[str] = Field(default_factory=list)


class NotificationConfig(UUIDPrimaryKey, Base):
    """Single row holding stage owners and global mail settings."""

    __tablename__ = "notification_config"

    key: Mapped[str] = mapped_column(
        Text, nullable=False, unique=True,
        default="order_stage_owners", server_default="order_stage_owners",
    )
    owners: Mapped[list[StageOwner]] = model_list(StageOwner)
    cc_emails: Mapped[list[str]] = json_list()
    handoff_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    overdue_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    apqp_owners: Mapped[list[ApqpOwner]] = model_list(ApqpOwner)
    apqp_handoff_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    apqp_overdue_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    signup_alert_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    password_reset_alert_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    password_email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    approval_email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # The daily management summary to the CC list. Off until an admin turns
    # it on - it is a new email people have not received before.
    summary_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    overdue_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=9, server_default="9")
    overdue_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    updated_at: Mapped[datetime | None] = ts(nullable=True)
    updated_by: Mapped[str | None] = mapped_column(Text, nullable=True)


class EmailLog(UUIDPrimaryKey, Base):
    """Audit trail of every email, and the dedupe guard for handoffs."""

    __tablename__ = "email_logs"

    email_type: Mapped[str] = mapped_column(Text, nullable=False)   # "handoff" | "overdue_digest" | ...
    to_emails: Mapped[list[str]] = json_list()
    cc_emails: Mapped[list[str]] = json_list()
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    order_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    dedupe_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="sent", server_default="sent")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())

    __table_args__ = (
        # Partial, not plain unique: the many rows that carry no dedupe_key
        # must not collide with each other. In Mongo this needed a
        # partialFilterExpression for the same reason - Postgres spells it
        # as a WHERE clause on the index.
        Index("email_logs_dedupe_key", "dedupe_key", unique=True,
              postgresql_where=text("dedupe_key IS NOT NULL")),
        Index("email_logs_sent_at_idx", text("sent_at DESC")),
        Index("email_logs_order_no_idx", "order_no"),
    )


class EmailType:
    HANDOFF = "handoff"
    OVERDUE_DIGEST = "overdue_digest"
    SIGNUP_REQUEST = "signup_request"
    PASSWORD_RESET_REQUEST = "password_reset_request"
    PASSWORD_ISSUED = "password_issued"
    ACCOUNT_APPROVED = "account_approved"
    ACCOUNT_REJECTED = "account_rejected"
    APQP_HANDOFF = "apqp_handoff"
    APQP_PHASE_HANDOFF = "apqp_phase_handoff"
    APQP_OVERDUE_DIGEST = "apqp_overdue_digest"
