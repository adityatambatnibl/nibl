from datetime import date, datetime

from sqlalchemy import Date, Float, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, UUIDPrimaryKey, ts, utcnow


class Order(UUIDPrimaryKey, Base):
    __tablename__ = "orders"

    order_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    product_name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    customer_name: Mapped[str] = mapped_column(Text, nullable=False)
    planned_delivery_sample: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_delivery_batch: Mapped[date | None] = mapped_column(Date, nullable=True)
    rpd_status: Mapped[str] = mapped_column(
        Text, nullable=False, default="Not received", server_default="Not received"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Business key of the linked APQP project, not a row id.
    apqp_project_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime | None] = ts(nullable=True)
    updated_by: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Deleting an order takes its items and stages with it. Mongo left those
    # orphaned unless the service remembered to clean up; the database now
    # guarantees it.
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )
    stages: Mapped[list["OrderStage"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        Index("orders_customer_name_idx", "customer_name"),
        Index("orders_created_at_idx", text("created_at DESC")),
    )


class OrderItem(UUIDPrimaryKey, Base):
    """One bearing size within an order. Items sharing a schedule group share dates."""

    __tablename__ = "order_items"

    order_no: Mapped[str] = mapped_column(
        Text,
        ForeignKey("apqp.orders.order_no", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
    )
    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    bearing_type: Mapped[str] = mapped_column(Text, nullable=False)
    po_qty: Mapped[str | None] = mapped_column(Text, nullable=True)      # free text: "200+200", "500"
    value: Mapped[float | None] = mapped_column(Float, nullable=True)

    schedule_group: Mapped[str] = mapped_column(Text, nullable=False)
    anchor_a0: Mapped[date | None] = mapped_column(Date, nullable=True)
    anchor_a: Mapped[date] = mapped_column(Date, nullable=False)

    created_at: Mapped[datetime] = ts(nullable=False, default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime | None] = ts(nullable=True)

    order: Mapped["Order"] = relationship(back_populates="items")

    __table_args__ = (
        Index("order_items_order_no_idx", "order_no"),
        Index("order_items_schedule_group_idx", "schedule_group"),
        Index("order_items_order_no_item_description_key", "order_no", "item_description", unique=True),
    )


class OrderStage(UUIDPrimaryKey, Base):
    """One of the 29 stages for one schedule group."""

    __tablename__ = "order_stages"

    order_no: Mapped[str] = mapped_column(
        Text,
        ForeignKey("apqp.orders.order_no", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
    )
    schedule_group: Mapped[str] = mapped_column(Text, nullable=False)
    stage_code: Mapped[str] = mapped_column(Text, nullable=False)
    stage_name: Mapped[str] = mapped_column(Text, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    plan_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    delay_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    updated_at: Mapped[datetime | None] = ts(nullable=True)
    updated_by: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped["Order"] = relationship(back_populates="stages")

    __table_args__ = (
        Index("order_stages_order_no_idx", "order_no"),
        Index("order_stages_plan_date_idx", "plan_date"),
        Index("order_stages_schedule_group_stage_code_key", "schedule_group", "stage_code", unique=True),
    )
