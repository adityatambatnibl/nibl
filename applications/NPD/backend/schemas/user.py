from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserListItem(BaseModel):
    id: str
    name: str
    # Plain str on the way OUT: one unusual stored address (e.g. @corp.local)
    # must not make the whole Users page fail. Inputs still use EmailStr.
    email: str
    role: str
    status: str
    permissions: list[str]
    is_active: bool
    last_login: datetime | None
    created_at: datetime
    can_delete: bool


class ApprovalRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class UpdatePermissionsRequest(BaseModel):
    permissions: list[str]


class UpdateRoleRequest(BaseModel):
    role: str


class UpdateActiveRequest(BaseModel):
    is_active: bool