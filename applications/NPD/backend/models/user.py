import uuid
from datetime import datetime

from sqlalchemy import Boolean, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, json_list, ts, utcnow
from utils.constants import AccountStatus, Role


class User(UUIDPrimaryKey, Base):
    """
    An account in THIS application.

    Rows are seeded from the shared `public.users` table that the common
    NPD/OPIM signup screen writes to, but only name, email and password come
    across. Role, permissions and above all `status` belong to this app
    alone: the two projects have different admins, and an approval here must
    not follow from - or leak into - an approval over there.
    """

    __tablename__ = "user_apqp"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    role: Mapped[str] = mapped_column(Text, nullable=False, default=Role.USER, server_default=Role.USER)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, default=AccountStatus.PENDING, server_default=AccountStatus.PENDING
    )
    permissions: Mapped[list[str]] = json_list()
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    last_login: Mapped[datetime | None] = ts(nullable=True)
    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime | None] = ts(nullable=True)
    # Approve and reject keep separate timestamps. The Mongo version wrote
    # both through approved_at, so "when was this account rejected?" had no
    # answer once the status had been changed again.
    approved_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_at: Mapped[datetime | None] = ts(nullable=True)
    rejected_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejected_at: Mapped[datetime | None] = ts(nullable=True)

    reset_token_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    reset_expires_at: Mapped[datetime | None] = ts(nullable=True)
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    department: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # The public.users row this account was synced from. Equal to `id` for
    # synced accounts; null for anyone created directly inside this app.
    supabase_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        # Uniqueness is enforced on lower(email), not email, so a stray
        # mixed-case insert can no longer create a second account for the
        # same person the way it could in Mongo.
        Index("user_apqp_email_key", func.lower(email), unique=True),
        Index("user_apqp_status_idx", "status"),
        Index(
            "user_apqp_supabase_id_key",
            "supabase_id",
            unique=True,
            postgresql_where=supabase_id.isnot(None),
        ),
    )

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN

    def has_permission(self, perm: str) -> bool:
        return self.is_admin or perm in self.permissions
