from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    Field,
)


# ============================================================
# ACCOUNTS ACTION REQUEST
#
# Used for:
#
# Approve
# Reject
# Resubmit
#
# The fields are optional at schema level because:
#
# - Approve may only need designation/remarks
# - Reject requires description
# - Resubmit requires description
#
# The endpoint performs the appropriate validation.
# ============================================================

class AccountsActionRequest(BaseModel):

    description: Optional[str] = Field(
        default=None,
        max_length=2000,
    )

    designation: Optional[str] = Field(
        default=None,
        max_length=150,
    )

    remarks: Optional[str] = Field(
        default=None,
        max_length=2000,
    )


# ============================================================
# LEGACY / COMPATIBILITY SCHEMA
#
# Kept so existing code importing
# AccountsVerificationUpdate does not immediately break.
# ============================================================

class AccountsVerificationUpdate(BaseModel):

    verified_by: Optional[str] = None

    designation: Optional[str] = None

    remarks: Optional[str] = None


# ============================================================
# LEGACY RESPONSE
# ============================================================

class AccountsVerificationResponse(BaseModel):

    improvement_id: UUID

    verified_by: Optional[str]

    designation: Optional[str]

    verification_date: Optional[datetime]

    remarks: Optional[str]

    status: str