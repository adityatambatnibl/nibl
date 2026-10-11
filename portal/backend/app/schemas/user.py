from pydantic import BaseModel, Field


class PortalUserOut(BaseModel):
    id: str
    full_name: str
    employee_code: str
    email: str
    department: str | None = None
    is_admin: bool = False
    is_active: bool = True
    role: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: PortalUserOut


class ActiveIn(BaseModel):
    is_active: bool


class AdminIn(BaseModel):
    is_admin: bool


class InternalPasswordIn(BaseModel):
    new_password: str = Field(min_length=8, max_length=72)
