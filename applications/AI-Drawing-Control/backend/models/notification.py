"""In-app notifications (the bell). One row per person per event."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, ts, utcnow


class Notification(UUIDPrimaryKey, Base):
    __tablename__ = "dc_notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    link: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")   # app route, e.g. /view/<id>
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())

    __table_args__ = (
        Index("dc_notifications_user_idx", "user_id", text("created_at DESC")),
    )
