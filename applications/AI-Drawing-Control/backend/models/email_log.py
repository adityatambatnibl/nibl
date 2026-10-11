from datetime import datetime

from sqlalchemy import Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, json_list, ts, utcnow


class EmailLog(UUIDPrimaryKey, Base):
    """Every email sent, and the dedupe guard (same design as NPD's email log)."""

    __tablename__ = "email_logs"

    email_type: Mapped[str] = mapped_column(Text, nullable=False)
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
        Index("email_logs_dedupe_key", "dedupe_key", unique=True, postgresql_where=text("dedupe_key IS NOT NULL")),
        Index("email_logs_sent_at_idx", text("sent_at DESC")),
    )



