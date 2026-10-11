
from uuid import UUID
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    status,
)

from sqlalchemy import func

from sqlalchemy.orm import Session

from app.core.security import (
    get_current_user,
    hash_password,
)

from app.db.database import get_db

from app.models.user import (
    User,
    RegistrationStatus,
)

from app.models.improvement import (
    Improvement,
)

from app.schemas.user import (
    UserResponse,
)

from app.services.notification_service import (
    send_account_approved_email,
    send_account_rejected_email,
)


# ============================================================
# ADMIN ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["Admin"],
)


# ============================================================
# ADMIN CHECK
# ============================================================

def require_admin(
    current_user: User = Depends(
        get_current_user
    ),
):

    role = getattr(
        current_user.role,
        "value",
        str(current_user.role),
    )

    if role != "admin":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,

            detail=(
                "Only the administrator can "
                "access this resource."
            ),
        )

    return current_user


# ============================================================
# GET ALL USERS
# ============================================================

@router.get(
    "/users",
    response_model=list[UserResponse],
)
def get_all_users(

    current_user: User = Depends(
        require_admin
    ),

    db: Session = Depends(
        get_db
    ),
):

    users = (
        db.query(User)
        .order_by(
            User.full_name.asc()
        )
        .all()
    )

    return users


# ============================================================
# GET PENDING REGISTRATIONS
# ============================================================

@router.get(
    "/registrations/pending",
    response_model=list[UserResponse],
)
def get_pending_registrations(

    current_user: User = Depends(
        require_admin
    ),

    db: Session = Depends(
        get_db
    ),
):

    users = (
        db.query(User)

        .filter(
            User.registration_status ==
            RegistrationStatus.PENDING
        )

        .order_by(
            User.created_at.asc()
        )

        .all()
    )

    return users


# ============================================================
# APPROVE REGISTRATION
# ============================================================

@router.post(
    "/users/{user_id}/approve",
    response_model=UserResponse,
)
def approve_user_registration(

    user_id: UUID,

    current_user: User = Depends(
        require_admin
    ),

    db: Session = Depends(
        get_db
    ),
):

    # --------------------------------------------------------
    # FIND USER
    # --------------------------------------------------------

    user = (
        db.query(User)

        .filter(
            User.id == user_id
        )

        .first()
    )


    if user is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,

            detail="User not found.",
        )


    # --------------------------------------------------------
    # ALREADY APPROVED
    # --------------------------------------------------------

    if (
        user.registration_status ==
        RegistrationStatus.APPROVED
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,

            detail=(
                "This registration "
                "has already been approved."
            ),
        )


    # --------------------------------------------------------
    # APPROVE
    # --------------------------------------------------------

    user.registration_status = (
        RegistrationStatus.APPROVED
    )

    user.is_active = True

    user.approved_at = (
        datetime.now(timezone.utc)
    )

    user.rejected_at = None


    db.commit()

    db.refresh(user)

    # Email is sent only after the database action succeeds.
    # A mail failure does not undo the Admin decision.
    send_account_approved_email(user)


    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return user


# ============================================================
# REJECT REGISTRATION
# ============================================================

@router.post(
    "/users/{user_id}/reject",
    response_model=UserResponse,
)
def reject_user_registration(

    user_id: UUID,

    current_user: User = Depends(
        require_admin
    ),

    db: Session = Depends(
        get_db
    ),
):

    # --------------------------------------------------------
    # FIND USER
    # --------------------------------------------------------

    user = (
        db.query(User)

        .filter(
            User.id == user_id
        )

        .first()
    )


    if user is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,

            detail="User not found.",
        )


    # --------------------------------------------------------
    # ALREADY REJECTED
    # --------------------------------------------------------

    if (
        user.registration_status ==
        RegistrationStatus.REJECTED
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,

            detail=(
                "This registration "
                "has already been rejected."
            ),
        )


    # --------------------------------------------------------
    # REJECT
    # --------------------------------------------------------

    user.registration_status = (
        RegistrationStatus.REJECTED
    )

    user.is_active = False

    user.rejected_at = (
        datetime.now(timezone.utc)
    )

    user.approved_at = None


    db.commit()

    db.refresh(user)

    # Email is sent only after the database action succeeds.
    # A mail failure does not undo the Admin decision.
    send_account_rejected_email(user)


    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return user


# ============================================================
# GET ALL IMPROVEMENTS
# ============================================================

@router.get(
    "/improvements",
)
def get_all_improvements(

    current_user: User = Depends(
        require_admin
    ),

    db: Session = Depends(
        get_db
    ),
):

    improvements = (
        db.query(Improvement)
        .order_by(
            Improvement.created_at.desc()
        )
        .all()
    )

    return improvements


# ============================================================
# IMPROVEMENT SUMMARY
# ============================================================

@router.get(
    "/improvements/summary",
)
def get_improvement_summary(

    current_user: User = Depends(
        require_admin
    ),

    db: Session = Depends(
        get_db
    ),
):

    # --------------------------------------------------------
    # TOTAL
    # --------------------------------------------------------

    total_improvements = (
        db.query(
            func.count(
                Improvement.id
            )
        )
        .scalar()
        or 0
    )


    # --------------------------------------------------------
    # PENDING APPROVAL
    #
    # Include every approval stage currently
    # used by the OIPM workflow.
    # --------------------------------------------------------

    pending_approval = (
        db.query(
            func.count(
                Improvement.id
            )
        )
        .filter(
            Improvement.status.in_(
                [
                    "pending_plant_head",

                    "pending_hod",

                    "pending_plant_head_2",

                    "pending_accounts",

                    "pending_plant_head_3",

                    "pending_approval",
                ]
            )
        )
        .scalar()
        or 0
    )


    # --------------------------------------------------------
    # IN PROGRESS
    # --------------------------------------------------------

    in_progress = (
        db.query(
            func.count(
                Improvement.id
            )
        )
        .filter(
            Improvement.status ==
            "in_progress"
        )
        .scalar()
        or 0
    )


    # --------------------------------------------------------
    # REJECTED
    # --------------------------------------------------------

    rejected = (
        db.query(
            func.count(
                Improvement.id
            )
        )
        .filter(
            Improvement.status ==
            "rejected"
        )
        .scalar()
        or 0
    )


    # --------------------------------------------------------
    # COMPLETED
    #
    # Support both existing "done" and
    # new "closed" status.
    # --------------------------------------------------------

    done = (
        db.query(
            func.count(
                Improvement.id
            )
        )
        .filter(
            Improvement.status.in_(
                [
                    "done",
                    "closed",
                ]
            )
        )
        .scalar()
        or 0
    )


    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return {

        "total_improvements":
            total_improvements,

        "pending_approval":
            pending_approval,

        "in_progress":
            in_progress,

        "rejected":
            rejected,

        "done":
            done,
    }


# ============================================================
# CHANGE USER PASSWORD
# ============================================================

@router.post(
    "/users/{user_id}/change-password",
)
def change_user_password(

    user_id: UUID,

    new_password: str = Body(
        ...,
        embed=True,
    ),

    current_user: User = Depends(
        require_admin
    ),

    db: Session = Depends(
        get_db
    ),
):

    # --------------------------------------------------------
    # VALIDATE PASSWORD
    # --------------------------------------------------------

    if not new_password.strip():

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,

            detail="New password is required.",
        )


    if len(new_password) < 8:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,

            detail=(
                "Password must contain "
                "at least 8 characters."
            ),
        )


    # --------------------------------------------------------
    # FIND USER
    # --------------------------------------------------------

    user = (
        db.query(User)

        .filter(
            User.id == user_id
        )

        .first()
    )


    if user is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,

            detail="User not found.",
        )


    # --------------------------------------------------------
    # CHANGE PASSWORD
    # --------------------------------------------------------

    user.password_hash = (
        hash_password(
            new_password
        )
    )


    db.commit()

    db.refresh(user)

    # Sign-in passwords live in the NIBL portal: send the new one there too,
    # so the person can sign in with it.
    _push_password_to_portal(str(user.id), new_password)


    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return {

        "message": (
            f"Password changed successfully "
            f"for {user.full_name}."
        )
    }


def _push_password_to_portal(user_id: str, new_password: str) -> None:
    """Best effort: the OIPM change is kept even if the portal is unreachable."""
    import json
    import logging
    import urllib.request

    from app.core.config import settings

    if not settings.PORTAL_SERVICE_KEY:
        return
    req = urllib.request.Request(
        f"{settings.PORTAL_INTERNAL_URL.rstrip('/')}/internal/users/{user_id}/password",
        data=json.dumps({"new_password": new_password}).encode(),
        headers={"Content-Type": "application/json", "X-Portal-Key": settings.PORTAL_SERVICE_KEY},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as exc:
        logging.getLogger("oipm").warning("Could not update the portal password: %s", exc)
