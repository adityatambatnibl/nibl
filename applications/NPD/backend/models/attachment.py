from datetime import datetime

from sqlalchemy import BigInteger, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, ts, utcnow


class Attachment(UUIDPrimaryKey, Base):
    """
    Metadata for one uploaded file.

    The bytes live in the Supabase Storage bucket, not in Postgres.
    `storage_path` is the object key inside that bucket and replaces the
    GridFS object id the MongoDB version stored.
    """

    __tablename__ = "attachments"

    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    sha256: Mapped[str] = mapped_column(Text, nullable=False)

    entity_type: Mapped[str] = mapped_column(Text, nullable=False)   # 'apqp_activity' | 'order_stage' | 'order'
    entity_id: Mapped[str] = mapped_column(Text, nullable=False)
    project_id: Mapped[str | None] = mapped_column(Text, nullable=True)   # denormalised for fast lookup
    order_no: Mapped[str | None] = mapped_column(Text, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_by_name: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())

    __table_args__ = (
        Index("attachments_entity_type_entity_id_idx", "entity_type", "entity_id"),
        Index("attachments_project_id_idx", "project_id"),
        Index("attachments_order_no_idx", "order_no"),
        Index("attachments_uploaded_at_idx", text("uploaded_at DESC")),
    )


class EntityType:
    ORDER = "order"
    ORDER_STAGE = "order_stage"
    APQP_ACTIVITY = "apqp_activity"
    ALL = [ORDER, ORDER_STAGE, APQP_ACTIVITY]
