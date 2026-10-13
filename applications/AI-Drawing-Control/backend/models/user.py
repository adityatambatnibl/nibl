"""
Drawing Control's own users (database nibl_drawing).

A row is created by the NIBL portal when someone registers (PENDING).
The Drawing admin approves or rejects here - approval in OIPM or NPD
means nothing to this application, and the other way round.

role:   admin  -> upload, revise, folders, users, records
        user   -> view drawings, confirm / deny
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, ts, utcnow


class AccountStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Role:
    ADMIN = "admin"
    USER = "user"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)   # = portal user id
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    employee_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    department: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(Text, nullable=False, default=Role.USER, server_default=Role.USER)
    status: Mapped[str] = mapped_column(Text, nullable=False, default=AccountStatus.PENDING, server_default=AccountStatus.PENDING)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime | None] = ts(nullable=True)
    decided_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = ts(nullable=True)

    __table_args__ = (
        Index("users_email_key", func.lower(email), unique=True),
        Index("users_status_idx", "status"),
    )

    @property
    def is_approved(self) -> bool:
        return self.is_active and self.status == AccountStatus.APPROVED

    @property
    def is_admin(self) -> bool:
        return self.is_approved and self.role == Role.ADMIN
