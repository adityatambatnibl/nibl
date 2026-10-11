from datetime import datetime

from sqlalchemy import Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, json_any, ts, utcnow


class AuditLog(UUIDPrimaryKey, Base):
    """Append-only record of who changed what. Never updated, never deleted."""

    __tablename__ = "audit_logs"

    action: Mapped[str] = mapped_column(Text, nullable=False)          # e.g. "user_approved"
    actor_id: Mapped[str] = mapped_column(Text, nullable=False)
    actor_name: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str | None] = mapped_column(Text, nullable=True)   # e.g. "user", "order"
    target_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    before: Mapped[dict | None] = json_any()
    after: Mapped[dict | None] = json_any()
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())

    __table_args__ = (
        Index("audit_logs_created_idx", text("created_at DESC")),
        Index("audit_logs_target_idx", "target_type", "target_id"),
    )
