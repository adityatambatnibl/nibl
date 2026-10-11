from datetime import datetime, timezone
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.models.improvement import Improvement
from app.models.user import User, UserRole

from app.schemas.improvement_accounts import (
    AccountsVerificationUpdate,
    AccountsVerificationResponse,
)


router = APIRouter(
    prefix="/api/v1/improvements",
    tags=["Improvement Accounts"],
)


# ============================================================
# ACCOUNTS VERIFICATION
# ============================================================

@router.patch(
    "/{improvement_id}/accounts-verification",
    response_model=AccountsVerificationResponse,
)
def update_accounts_verification(

    improvement_id: UUID,

    payload: AccountsVerificationUpdate,

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    ),
):

    # ========================================================
    # ROLE CHECK
    # ========================================================

    if current_user.role != UserRole.ACCOUNTS:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only Accounts users can "
                "complete Finance verification."
            ),
        )

    # ========================================================
    # FIND IMPROVEMENT
    # ========================================================

    improvement = (
        db.query(Improvement)
        .filter(
            Improvement.id
            == improvement_id
        )
        .first()
    )

    if improvement is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Improvement not found.",
        )

    # ========================================================
    # ONLY ACCOUNTS STAGE
    # ========================================================

    if improvement.status != "pending_accounts":

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This improvement is not "
                "currently awaiting Accounts verification."
            ),
        )

    # ========================================================
    # SAVE
    # ========================================================

    improvement.accounts_verified_by = (
        current_user.id
    )

    improvement.accounts_verified_designation = (
        payload.designation
    )

    improvement.accounts_verified_at = (
        datetime.now(timezone.utc)
    )

    improvement.accounts_remarks = (
        payload.remarks
    )

    # ========================================================
    # MOVE TO PLANT HEAD
    # ========================================================

    improvement.status = (
        "pending_plant_head"
    )

    improvement.updated_at = (
        datetime.now(timezone.utc)
    )

    db.commit()

    db.refresh(
        improvement
    )

    return {
        "improvement_id": improvement.id,
        "verified_by": current_user.full_name,
        "designation": (
            improvement.accounts_verified_designation
        ),
        "verification_date": (
            improvement.accounts_verified_at
        ),
        "remarks": (
            improvement.accounts_remarks
        ),
        "status": improvement.status,
    }