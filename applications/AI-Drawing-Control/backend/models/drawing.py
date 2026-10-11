"""
AI Drawing Control - tables (schema `apqp`, names prefixed `dc_`).

Business rules these tables carry (from the AI Drawing Control project
explanation, Oct 2026):

* Drawings are filed in a product tree of folders (any depth).
* Only controlled PDF copies are uploaded, and only by a drawing admin.
* Every new drawing / revision goes to a list of users. Each must Confirm or
  Deny on screen; Deny needs a reason. The revision is Approved only when
  every listed user has confirmed. Any Deny closes the revision - the admin
  uploads a new revision and the cycle starts again.
* When a drawing is revised, the previous revision is LOCKED: kept for the
  record, visible to drawing admins only. Users see only the latest.
* Every view / download is logged.

`dc_drawings.status` and `dc_drawings.current_revision_id` are stored, not
computed, so the register can filter 20,000+ drawings with an index instead
of scanning reviews. They are updated in the same transaction as the upload,
confirm or deny that changes them.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, ts, utcnow


class DrawingStatus:
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    DENIED = "denied"
    LOCKED = "locked"            # revisions only: superseded by a newer one
    DELETED = "deleted"          # drawings only: removed by the admin, kept for the record, can be restored
    ACTIVE = [UNDER_REVIEW, APPROVED, DENIED]


class Decision:
    PENDING = "pending"
    CONFIRMED = "confirmed"
    DENIED = "denied"
    CANCELLED = "cancelled"      # revision was superseded / closed before this person answered


class DrawingFolder(UUIDPrimaryKey, Base):
    """One folder in the product tree (GBD > SRB > 22205 ...)."""

    __tablename__ = "dc_folders"

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drawing.dc_folders.id", ondelete="RESTRICT"), nullable=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime | None] = ts(nullable=True)

    __table_args__ = (
        # Sibling names are unique, case-insensitively. coalesce() lets the
        # top level (parent_id NULL) take part in the same rule.
        Index(
            "dc_folders_sibling_name_key",
            func.coalesce(parent_id, text("'00000000-0000-0000-0000-000000000000'::uuid")),
            func.lower(name),
            unique=True,
        ),
        Index("dc_folders_parent_idx", "parent_id"),
    )


class Drawing(UUIDPrimaryKey, Base):
    """A controlled drawing. One row per drawing number; revisions hang off it."""

    __tablename__ = "dc_drawings"

    folder_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drawing.dc_folders.id", ondelete="RESTRICT"), nullable=False
    )
    drawing_no: Mapped[str] = mapped_column(Text, nullable=False)
    item_code: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    # Denormalised from the current revision - see module docstring.
    current_revision_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    current_rev_label: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    revision_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    status: Mapped[str] = mapped_column(
        Text, nullable=False, default=DrawingStatus.UNDER_REVIEW, server_default=DrawingStatus.UNDER_REVIEW
    )

    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())

    __table_args__ = (
        Index("dc_drawings_drawing_no_key", func.lower(drawing_no), unique=True),
        Index("dc_drawings_folder_idx", "folder_id"),
        Index("dc_drawings_status_idx", "status"),
        Index("dc_drawings_updated_idx", text("updated_at DESC")),
        Index("dc_drawings_item_code_idx", func.lower(item_code)),
    )


class DrawingRevision(UUIDPrimaryKey, Base):
    """One uploaded PDF of a drawing, with its own review cycle."""

    __tablename__ = "dc_revisions"

    drawing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drawing.dc_drawings.id", ondelete="CASCADE"), nullable=False
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)          # 1, 2, 3 ... upload order
    rev_label: Mapped[str] = mapped_column(Text, nullable=False)       # as printed on the drawing
    change_note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")

    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(
        Text, nullable=False, default=DrawingStatus.UNDER_REVIEW, server_default=DrawingStatus.UNDER_REVIEW
    )
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    uploaded_by: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_by_name: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    decided_at: Mapped[datetime | None] = ts(nullable=True)            # approved or denied
    locked_at: Mapped[datetime | None] = ts(nullable=True)
    locked_by_name: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("dc_revisions_drawing_seq_key", "drawing_id", "seq", unique=True),
        Index("dc_revisions_locked_idx", "locked", text("locked_at DESC")),
    )


class DrawingReview(UUIDPrimaryKey, Base):
    """One person's Confirm / Deny on one revision."""

    __tablename__ = "dc_reviews"

    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drawing.dc_revisions.id", ondelete="CASCADE"), nullable=False
    )
    drawing_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_name: Mapped[str] = mapped_column(Text, nullable=False)
    user_email: Mapped[str] = mapped_column(Text, nullable=False)

    decision: Mapped[str] = mapped_column(Text, nullable=False, default=Decision.PENDING, server_default=Decision.PENDING)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = ts(nullable=True)

    notified_at: Mapped[datetime | None] = ts(nullable=True)           # first email
    reminders_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_reminded_at: Mapped[datetime | None] = ts(nullable=True)

    __table_args__ = (
        Index("dc_reviews_revision_user_key", "revision_id", "user_id", unique=True),
        Index("dc_reviews_user_pending_idx", "user_id", "decision"),
        Index("dc_reviews_pending_idx", "decision", "last_reminded_at"),
    )


class DrawingReviewer(Base):
    """The standing Email List: everyone on it is asked to confirm each new drawing."""

    __tablename__ = "dc_reviewer_list"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    added_by: Mapped[str] = mapped_column(Text, nullable=False)
    added_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())


class DrawingAccessLog(UUIDPrimaryKey, Base):
    """Every on-screen view and every download - the download log."""

    __tablename__ = "dc_access_log"

    drawing_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    revision_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    drawing_no: Mapped[str] = mapped_column(Text, nullable=False)
    rev_label: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    user_name: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)          # view | download
    ip: Mapped[str | None] = mapped_column(Text, nullable=True)
    at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())

    __table_args__ = (
        Index("dc_access_log_at_idx", text("at DESC")),
        Index("dc_access_log_drawing_idx", "drawing_id", text("at DESC")),
        Index("dc_access_log_user_idx", "user_id", text("at DESC")),
    )


DRAWING_TABLES = [
    DrawingFolder.__table__,
    Drawing.__table__,
    DrawingRevision.__table__,
    DrawingReview.__table__,
    DrawingReviewer.__table__,
    DrawingAccessLog.__table__,
]
