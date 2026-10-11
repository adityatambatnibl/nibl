"""
Who gets the emails of ONE project (order + its APQP timeline).

Set on "Create new timeline" and changeable later. When a project has a row
here, its Tracking emails go to `stage_owners` and its APQP emails to
`dept_owners` (an empty list means "nobody" for that stage / department).
Projects without a row keep using the global lists in notification_config.
"""

from datetime import datetime

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base, UUIDPrimaryKey, model_list, ts, utcnow
from models.notification_config import ApqpOwner, StageOwner


class ProjectRecipients(UUIDPrimaryKey, Base):
    __tablename__ = "project_recipients"

    order_no: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)
    project_id: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)
    stage_owners: Mapped[list[StageOwner]] = model_list(StageOwner)
    dept_owners: Mapped[list[ApqpOwner]] = model_list(ApqpOwner)
    updated_at: Mapped[datetime] = ts(nullable=False, default=utcnow)
    updated_by: Mapped[str | None] = mapped_column(Text, nullable=True)
