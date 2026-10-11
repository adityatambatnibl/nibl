from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DraftCreate(BaseModel):
    draft_id: Optional[UUID] = None
    payload: dict[str, Any] = Field(default_factory=dict)


class DraftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_id: UUID
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime
