from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    employee_code: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    department: str | None = Field(default=None, max_length=150)
    # OIPM sign-up answers (kept on the portal user and passed to OIPM)
    role: str | None = Field(default="employee", max_length=30)
    hod_id: UUID | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    employee_code: str = Field(min_length=1, max_length=50)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)
