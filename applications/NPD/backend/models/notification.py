from datetime import datetime

from sqlalchemy import Boolean, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, ts, utcnow


class Notification(UUIDPrimaryKey, Base):
    """One entry in the admin notification bell."""

    __tablename__ = "notifications"

    type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str | None] = mapped_column(Text, nullable=True)
    ref_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    read_at: Mapped[datetime | None] = ts(nullable=True)

    # Unread-first, newest-first: the exact order the bell renders in, so the
    # query is answered by an index scan with no sort step.
    __table_args__ = (
        Index("notifications_unread_idx", "is_read", text("created_at DESC")),
    )
