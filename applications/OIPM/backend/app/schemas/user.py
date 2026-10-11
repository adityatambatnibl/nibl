from datetime import datetime
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
)

from app.models.user import (
    UserRole,
    RegistrationStatus,
)


# ============================================================
# USER SIGNUP
# ============================================================

class UserSignup(BaseModel):

    full_name: str = Field(
        min_length=3,
        max_length=150,
    )

    employee_code: str = Field(
        min_length=1,
        max_length=50,
    )

    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128,
    )

    role: UserRole

    hod_id: UUID | None = None


# ============================================================
# USER LOGIN
# ============================================================

class UserLogin(BaseModel):

    email: EmailStr

    password: str


# ============================================================
# USER RESPONSE
# ============================================================

class UserResponse(BaseModel):

    model_config = ConfigDict(
        from_attributes=True,
    )


    # --------------------------------------------------------
    # BASIC USER INFORMATION
    # --------------------------------------------------------

    id: UUID

    full_name: str

    employee_code: str

    email: EmailStr

    role: UserRole

    hod_id: UUID | None


    # --------------------------------------------------------
    # ACCOUNT STATUS
    # --------------------------------------------------------

    is_active: bool

    registration_status: RegistrationStatus


    # --------------------------------------------------------
    # APPROVAL INFORMATION
    # --------------------------------------------------------

    approved_at: datetime | None = None

    rejected_at: datetime | None = None


    # --------------------------------------------------------
    # TIMESTAMPS
    # --------------------------------------------------------

    created_at: datetime | None = None

    updated_at: datetime | None = None


# ============================================================
# LOGIN TOKEN RESPONSE
# ============================================================

class TokenResponse(BaseModel):

    access_token: str

    token_type: str = "bearer"

    user: UserResponse


# ============================================================
# ADMIN — CHANGE USER PASSWORD
# ============================================================

class AdminChangePassword(BaseModel):

    new_password: str = Field(
        min_length=8,
        max_length=128,
    )