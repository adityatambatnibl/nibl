from uuid import UUID
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from sqlalchemy.orm import Session
from pydantic import BaseModel, Field


from app.core.security import get_current_user
from app.db.database import get_db

from app.models.user import (
    User,
    UserRole,
)

from app.models.improvement import (
    Improvement,
)
from app.services.storage_service import storage_service
from app.services.financial_service import calculate_payback_period, normalize_cost_saving_items, applicable_saving

from app.schemas.improvement_accounts import (
    AccountsActionRequest,
)

def prepare_image_urls(images):
    prepared = []
    for image in images or []:
        if not isinstance(image, dict):
            prepared.append(image)
            continue
        item = dict(image)
        path = item.get("storage_path")
        if path:
            try:
                item["url"] = storage_service.create_signed_url(path, expires_in=3600)
            except Exception:
                item["url"] = None
        prepared.append(item)
    return prepared


# ============================================================
# EMAIL NOTIFICATIONS
#
# ONLY ADDITION REQUIRED FOR THE EMAIL FIX
# ============================================================

from app.services.notification_service import (
    send_improvement_status_email,
)


# ============================================================
# ACCOUNTS ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/v1/accounts",
    tags=["Accounts"],
)

# ============================================================
# ACCOUNTS FINANCIAL UPDATE REQUEST
# ============================================================

class AccountsFinancialUpdateRequest(BaseModel):

    cost_saving_items: list[dict[str, Any]] = Field(
        default_factory=list
    )

    investment_required: Optional[str] = None

    investment_amount: Optional[float] = None

    investment_details: Optional[str] = None


# ============================================================
# ACCOUNTS CHECK
# ============================================================

def require_accounts(
    current_user: User = Depends(
        get_current_user
    ),
):

    role = getattr(
        current_user.role,
        "value",
        str(current_user.role),
    )

    if role != UserRole.ACCOUNTS.value:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,

            detail=(
                "Only Accounts users can "
                "access this resource."
            ),
        )

    return current_user


# ============================================================
# IMPROVEMENT LIST SERIALIZER
# ============================================================

def serialize_improvement(
    improvement,
    employee=None,
):

    return {

        "id":
            improvement.id,

        "project_id":
            improvement.project_id,

        "project_idea":
            getattr(
                improvement,
                "project_idea",
                None,
            ),

        "department":
            getattr(
                improvement,
                "department",
                None,
            ),

        "department_line":
            getattr(
                improvement,
                "department_line",
                None,
            ),

        "plant":
            getattr(
                improvement,
                "plant",
                None,
            ),

        "kaizen_theme":
            getattr(
                improvement,
                "kaizen_theme",
                None,
            ),

        "idea":
            getattr(
                improvement,
                "idea",
                None,
            ),

        "target":
            getattr(
                improvement,
                "target",
                None,
            ),

        "machine":
            getattr(
                improvement,
                "machine",
                None,
            ),

        "activity":
            getattr(
                improvement,
                "activity",
                None,
            ) or [],

        "benefit_type":
            getattr(
                improvement,
                "benefit_type",
                None,
            ) or [],

        "employee_id":
            improvement.employee_id,

        # ----------------------------------------------------
        # OWNER
        # ----------------------------------------------------

        "owner_name":
            employee.full_name
            if employee
            else None,

        "employee_name":
            employee.full_name
            if employee
            else None,

        "employee_code":
            employee.employee_code
            if employee
            else None,

        "employee_email":
            employee.email
            if employee
            else None,

        "employee_role":
            (
                getattr(
                    employee.role,
                    "value",
                    str(employee.role),
                )
                if employee
                else None
            ),

        # ----------------------------------------------------
        # WORKFLOW
        # ----------------------------------------------------

        "status":
            improvement.status,

        "current_stage":
            getattr(
                improvement,
                "current_stage",
                None,
            ),

        "current_status_1":
            getattr(
                improvement,
                "current_status_1",
                None,
            ),

        "current_status_2":
            getattr(
                improvement,
                "current_status_2",
                None,
            ),

        "current_status_3":
            getattr(
                improvement,
                "current_status_3",
                None,
            ),

        # ----------------------------------------------------
        # ACCOUNTS
        # ----------------------------------------------------

        "accounts_status":
            getattr(
                improvement,
                "accounts_status",
                None,
            ),

        "accounts_remarks":
            getattr(
                improvement,
                "accounts_remarks",
                None,
            ),

        "accounts_verified_by":
            getattr(
                improvement,
                "accounts_verified_by",
                None,
            ),

        "accounts_verified_designation":
            getattr(
                improvement,
                "accounts_verified_designation",
                None,
            ),

        "accounts_verified_at":
            getattr(
                improvement,
                "accounts_verified_at",
                None,
            ),

        # ----------------------------------------------------
        # REJECTION
        # ----------------------------------------------------

        "rejection_description":
            getattr(
                improvement,
                "rejection_description",
                None,
            ),

        "rejected_at_stage":
            getattr(
                improvement,
                "rejected_at_stage",
                None,
            ),

        "rejected_by":
            getattr(
                improvement,
                "rejected_by",
                None,
            ),

        "rejected_at":
            getattr(
                improvement,
                "rejected_at",
                None,
            ),

        # ----------------------------------------------------
        # RESUBMISSION
        # ----------------------------------------------------

        "resubmission_description":
            getattr(
                improvement,
                "resubmission_description",
                None,
            ),

        "resubmission_stage":
            getattr(
                improvement,
                "resubmission_stage",
                None,
            ),

        "resubmission_requested_by":
            getattr(
                improvement,
                "resubmission_requested_by",
                None,
            ),

        "resubmission_requested_at":
            getattr(
                improvement,
                "resubmission_requested_at",
                None,
            ),

        # ----------------------------------------------------
        # TIMESTAMPS
        # ----------------------------------------------------

        "created_at":
            improvement.created_at,

        "updated_at":
            improvement.updated_at,

    }


# ============================================================
# SERIALIZE LIST
# ============================================================

def serialize_improvement_list(
    db,
    improvements,
):

    owner_ids = {
        improvement.employee_id
        for improvement in improvements
        if improvement.employee_id
    }

    users_by_id = {}

    if owner_ids:

        users = (
            db.query(User)
            .filter(
                User.id.in_(
                    owner_ids
                )
            )
            .all()
        )

        users_by_id = {
            user.id: user
            for user in users
        }

    return [

        serialize_improvement(
            improvement,
            users_by_id.get(
                improvement.employee_id
            ),
        )

        for improvement in improvements

    ]


# ============================================================
# DASHBOARD SUMMARY
# ============================================================

@router.get(
    "/summary",
)
def get_accounts_summary(

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

    own_query = (
        db.query(Improvement)
        .filter(
            Improvement.employee_id
            == current_user.id
        )
    )

    pending_accounts = (
        db.query(Improvement)
        .filter(
            Improvement.status
            == "pending_accounts"
        )
        .count()
    )

    total_improvements = (
        own_query.count()
    )

    completed = (
        own_query
        .filter(
            Improvement.status.in_(
                [
                    "closed",
                    "done",
                ]
            )
        )
        .count()
    )

    rejected = (
        own_query
        .filter(
            Improvement.status
            == "rejected"
        )
        .count()
    )

    in_progress = (
        own_query
        .filter(
            Improvement.status
            == "in_progress"
        )
        .count()
    )

    return {

        "total_improvements":
            total_improvements,

        "pending_accounts":
            pending_accounts,

        "completed":
            completed,

        "rejected":
            rejected,

        "in_progress":
            in_progress,

    }


# ============================================================
# PENDING ACCOUNTS APPROVAL
#
# GLOBAL QUEUE
# ============================================================

@router.get(
    "/approvals",
)
def get_pending_accounts(

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

    improvements = (
        db.query(Improvement)
        .filter(
            Improvement.status
            == "pending_accounts"
        )
        .order_by(
            Improvement.created_at.desc()
        )
        .all()
    )

    return serialize_improvement_list(
        db,
        improvements,
    )


# ============================================================
# ACCOUNTS HISTORY
#
# Includes:
#   Approved
#   Rejected
#   Resubmission
# ============================================================

@router.get(
    "/history"
)
def get_accounts_history(

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

    history = (
        db.query(Improvement)
        .filter(
            (
                Improvement.accounts_verified_by
                .isnot(None)
            )
            |
            (
                Improvement.rejected_at_stage
                == "accounts"
            )
            |
            (
                Improvement.resubmission_stage
                == "accounts"
            )
        )
        .all()
    )

    def get_accounts_action_date(
        improvement
    ):

        action_dates = [

            getattr(
                improvement,
                "accounts_verified_at",
                None,
            ),

            getattr(
                improvement,
                "rejected_at",
                None,
            ),

            getattr(
                improvement,
                "resubmission_requested_at",
                None,
            ),

        ]

        valid_dates = [

            value
            for value in action_dates
            if value is not None

        ]

        if valid_dates:

            return max(
                valid_dates
            )

        return (
            getattr(
                improvement,
                "updated_at",
                None,
            )
            or
            getattr(
                improvement,
                "created_at",
                None,
            )
            or
            datetime.min.replace(
                tzinfo=timezone.utc
            )
        )

    history.sort(
        key=get_accounts_action_date,
        reverse=True,
    )

    return serialize_improvement_list(
        db,
        history,
    )


# ============================================================
# ACCOUNTS' OWN IMPROVEMENTS
# ============================================================

@router.get(
    "/improvements",
)
def get_accounts_improvements(

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

    improvements = (
        db.query(Improvement)
        .filter(
            Improvement.employee_id
            == current_user.id
        )
        .order_by(
            Improvement.created_at.desc()
        )
        .all()
    )

    return serialize_improvement_list(
        db,
        improvements,
    )


# ============================================================
# ACCOUNTS' OWN COMPLETED IMPROVEMENTS
# ============================================================

@router.get(
    "/improvements/completed",
)
def get_completed_improvements(

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

    improvements = (
        db.query(Improvement)
        .filter(

            Improvement.employee_id
            == current_user.id,

            Improvement.status.in_(
                [
                    "closed",
                    "done",
                ]
            ),

        )
        .order_by(
            Improvement.updated_at.desc()
        )
        .all()
    )

    return serialize_improvement_list(
        db,
        improvements,
    )


# ============================================================
# ACCOUNTS' OWN REJECTED IMPROVEMENTS
# ============================================================

@router.get(
    "/improvements/rejected",
)
def get_rejected_improvements(

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

    improvements = (
        db.query(Improvement)
        .filter(

            Improvement.employee_id
            == current_user.id,

            Improvement.status
            == "rejected",

        )
        .order_by(
            Improvement.updated_at.desc()
        )
        .all()
    )

    return serialize_improvement_list(
        db,
        improvements,
    )


# ============================================================
# ACCOUNTS' OWN IN-PROGRESS IMPROVEMENTS
# ============================================================

@router.get(
    "/improvements/in-progress",
)
def get_in_progress_improvements(

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

    improvements = (
        db.query(Improvement)
        .filter(

            Improvement.employee_id
            == current_user.id,

            Improvement.status
            == "in_progress",

        )
        .order_by(
            Improvement.updated_at.desc()
        )
        .all()
    )

    return serialize_improvement_list(
        db,
        improvements,
    )


# ============================================================
# GET SINGLE IMPROVEMENT
# ============================================================

@router.get(
    "/improvements/{improvement_id}",
)
def get_accounts_improvement(

    improvement_id: UUID,

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

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

    # --------------------------------------------------------
    # ALLOWED ACCESS
    # --------------------------------------------------------

    is_own_improvement = (
        improvement.employee_id
        == current_user.id
    )

    is_pending_accounts = (
        improvement.status
        == "pending_accounts"
    )

    is_approved_by_current_accounts = (
        improvement.accounts_verified_by
        == current_user.id
    )

    is_rejected_by_current_accounts = (
        improvement.rejected_by
        == current_user.id
        and
        improvement.rejected_at_stage
        == "accounts"
    )

    is_resubmission_by_current_accounts = (
        improvement.resubmission_requested_by
        == current_user.id
        and
        improvement.resubmission_stage
        == "accounts"
    )

    if not (

        is_own_improvement

        or is_pending_accounts

        or is_approved_by_current_accounts

        or is_rejected_by_current_accounts

        or is_resubmission_by_current_accounts

    ):

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,

            detail=(
                "You do not have permission "
                "to view this improvement."
            ),
        )

    return improvement


# ============================================================
# ACCOUNTS — UPDATE FINANCIAL DETAILS
#
# Accounts can edit ONLY:
#
#   - Cost Saving Particulars
#   - Before
#   - After
#   - Investment Required
#   - Investment Amount
#   - Investment Details
#
# Backend calculates:
#
#   - Monthly Saving
#   - Total Monthly Saving
#   - Annualized Saving
#   - Payback Period
#
# Workflow DOES NOT CHANGE.
#
# pending_accounts
#       ↓
# pending_accounts
#
# ============================================================

@router.put(
    "/improvements/{improvement_id}/financials",
)
def update_financials(

    improvement_id: UUID,

    payload: AccountsFinancialUpdateRequest,

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

    # ========================================================
    # FIND IMPROVEMENT
    # ========================================================

    improvement = (
        db.query(Improvement)
        .filter(
            Improvement.id == improvement_id
        )
        .first()
    )

    if improvement is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Improvement not found.",
        )

    # ========================================================
    # ONLY PENDING ACCOUNTS CAN BE EDITED
    # ========================================================

    if improvement.status != "pending_accounts":

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Financial details can only be edited "
                "while the improvement is pending Accounts approval."
            ),
        )

    # ========================================================
    # NUMBER VALIDATION
    # ========================================================

    def to_number(
        value,
        field_name,
    ):

        if value in (
            None,
            "",
        ):

            return None

        try:

            number = Decimal(
                str(value)
            )

        except (
            InvalidOperation,
            ValueError,
            TypeError,
        ):

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{field_name} must be a valid number."
                ),
            )

        if number < 0:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{field_name} cannot be negative."
                ),
            )

        return float(number)

    # ========================================================
    # COST SAVING ITEMS
    # ========================================================

    try:
        normalized_items, total_monthly_saving = normalize_cost_saving_items(
            payload.cost_saving_items or []
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # Stored applicable saving follows the selected saving type.
    # Plant Head analytics still calculates financial-year values separately.
    annualized_saving = (
        applicable_saving(normalized_items)
        if improvement.kaizen_start and normalized_items
        else None
    )

    # ========================================================
    # INVESTMENT REQUIRED
    # ========================================================

    investment_required = (

        str(
            payload.investment_required
        ).strip()

        if payload.investment_required
        else None

    )

    if investment_required not in (
        "Yes",
        "No",
        None,
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Investment Required must be Yes or No."
            ),
        )

    # ========================================================
    # INVESTMENT = NO
    # ========================================================

    if investment_required == "No":

        investment_amount = None

        investment_details = None

        payback_period = None

    else:

        # ====================================================
        # INVESTMENT = YES
        # ====================================================

        investment_amount = to_number(
            payload.investment_amount,
            "Investment Amount",
        )

        investment_details = (

            payload.investment_details.strip()

            if (
                payload.investment_details
                and payload.investment_details.strip()
            )

            else None

        )

        # ====================================================
        # PAYBACK CALCULATION
        # Investment / monthly saving, or investment / one-time
        # saving when no recurring or limited-period saving exists.
        # ====================================================
        payback_period = calculate_payback_period(investment_amount, normalized_items)

    # ========================================================
    # SAVE FINANCIAL DATA
    # ========================================================

    improvement.cost_saving_items = (
        normalized_items
    )

    improvement.total_monthly_saving = (
        total_monthly_saving
    )

    improvement.annualized_saving = (
        annualized_saving
    )

    improvement.investment_required = (
        investment_required
    )

    improvement.investment_amount = (
        investment_amount
    )

    improvement.payback_period = (
        payback_period
    )

    improvement.investment_details = (
        investment_details
    )

    # ========================================================
    # IMPORTANT
    #
    # DO NOT CHANGE:
    #
    # improvement.status
    # improvement.current_stage
    #
    # It remains pending_accounts.
    # ========================================================

    improvement.updated_at = (
        datetime.now(
            timezone.utc
        )
    )

    # ========================================================
    # SAVE
    # ========================================================

    db.commit()

    db.refresh(
        improvement
    )

    # ========================================================
    # RETURN UPDATED FINANCIAL DATA
    # ========================================================

    return {

        "message":
            "Financial details updated successfully.",

        "improvement_id":
            improvement.id,

        "cost_saving_items":
            improvement.cost_saving_items or [],

        "total_monthly_saving":
            improvement.total_monthly_saving,

        "annualized_saving":
            improvement.annualized_saving,

        "investment_required":
            improvement.investment_required,

        "investment_amount":
            improvement.investment_amount,

        "payback_period":
            improvement.payback_period,

        "investment_details":
            improvement.investment_details,

        "status":
            improvement.status,

        "current_stage":
            improvement.current_stage,

    }



# ============================================================
# ACCOUNTS APPROVE
#
# WORKFLOW:
#
# pending_accounts
#        ↓
# closed
#
# Accounts is the final approval stage.
# Owner receives the completion email.
# ============================================================

@router.post(
    "/improvements/{improvement_id}/approve",
)
def approve_improvement(

    improvement_id: UUID,

    payload: AccountsActionRequest,

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

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
    # STATUS CHECK
    # ========================================================

    if improvement.status != (
        "pending_accounts"
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,

            detail=(
                "This improvement is not currently "
                "waiting for Accounts approval."
            ),
        )

    # ========================================================
    # CURRENT TIME
    # ========================================================

    now = datetime.now(
        timezone.utc
    )

    # ========================================================
    # SAVE ACCOUNTS VERIFICATION
    # ========================================================

    improvement.accounts_verified_by = (
        current_user.id
    )

    improvement.accounts_verified_designation = (
        payload.designation
    )

    improvement.accounts_verified_at = (
        now
    )

    improvement.accounts_remarks = (
        payload.remarks
    )

    improvement.accounts_status = (
        "approved"
    )

    # ========================================================
    # FINAL ACCOUNTS APPROVAL
    #
    # Plant Head -> Accounts -> Closed
    # Accounts is the final approval stage.
    # ========================================================

    improvement.status = "closed"
    improvement.current_stage = "closed"

    # The Accounts approval date is the completion/end date.
    improvement.kaizen_end = now.date()

    improvement.updated_at = (
        now
    )

    # ========================================================
    # CLEAR OLD RESUBMISSION DATA
    # ========================================================

    improvement.resubmission_description = (
        None
    )

    improvement.resubmission_stage = (
        None
    )

    improvement.resubmission_requested_by = (
        None
    )

    improvement.resubmission_requested_at = (
        None
    )

    # ========================================================
    # SAVE DATABASE
    # ========================================================

    db.commit()

    db.refresh(
        improvement
    )

    # ========================================================
    # GET OWNER
    # ========================================================

    owner = (
        db.query(User)
        .filter(
            User.id
            == improvement.employee_id
        )
        .first()
    )

    # ========================================================
    # EMAIL 1
    #
    # ACCOUNTS APPROVAL -> OWNER
    # ========================================================

    send_improvement_status_email(

        owner,

        improvement.project_id,

        "Approved by Accounts",

        (
            "Accounts has verified and approved "
            "your improvement.\n\n"
            "The improvement is now closed successfully."
        ),

    )

    # ========================================================
    # RESPONSE
    # ========================================================

    return {

        "message":
            "Accounts verification completed successfully.",

        "status":
            improvement.status,

        "current_stage":
            improvement.current_stage,

        "improvement_id":
            improvement.id,

    }


# ============================================================
# ACCOUNTS REJECT
#
# pending_accounts
#        ↓
# rejected
#
# EMAIL:
#
# Owner receives rejection email.
# ============================================================

@router.post(
    "/improvements/{improvement_id}/reject",
)
def reject_improvement(

    improvement_id: UUID,

    payload: AccountsActionRequest,

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

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
    # STATUS CHECK
    # ========================================================

    if improvement.status != (
        "pending_accounts"
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,

            detail=(
                "This improvement is not currently "
                "waiting for Accounts action."
            ),
        )

    # ========================================================
    # DESCRIPTION
    # ========================================================

    description = (
        payload.description or ""
    ).strip()

    if not description:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,

            detail=(
                "Rejection description "
                "is required."
            ),
        )

    # ========================================================
    # SAVE REJECTION
    # ========================================================

    now = datetime.now(
        timezone.utc
    )

    improvement.status = (
        "rejected"
    )

    improvement.accounts_status = (
        "rejected"
    )

    improvement.accounts_remarks = (
        description
    )

    improvement.rejection_description = (
        description
    )

    improvement.rejected_at_stage = (
        "accounts"
    )

    improvement.rejected_by = (
        current_user.id
    )

    improvement.rejected_at = (
        now
    )

    improvement.updated_at = (
        now
    )

    # ========================================================
    # SAVE DATABASE
    # ========================================================

    db.commit()

    db.refresh(
        improvement
    )

    # ========================================================
    # GET OWNER
    # ========================================================

    owner = (
        db.query(User)
        .filter(
            User.id
            == improvement.employee_id
        )
        .first()
    )

    # ========================================================
    # EMAIL
    #
    # ACCOUNTS REJECTION -> OWNER
    # ========================================================

    send_improvement_status_email(

        owner,

        improvement.project_id,

        "Rejected by Accounts",

        (
            "Accounts has rejected your improvement.\n\n"
            f"Reason: {description}"
        ),

    )

    # ========================================================
    # RESPONSE
    # ========================================================

    return {

        "message":
            "Improvement rejected successfully.",

        "status":
            improvement.status,

        "rejected_at_stage":
            improvement.rejected_at_stage,

        "improvement_id":
            improvement.id,

    }


# ============================================================
# ACCOUNTS REQUEST RESUBMISSION
#
# pending_accounts
#        ↓
# resubmission_required
#
# EMAIL:
#
# Owner receives resubmission email.
# ============================================================

@router.post(
    "/improvements/{improvement_id}/resubmit",
)
def request_resubmission(

    improvement_id: UUID,

    payload: AccountsActionRequest,

    current_user: User = Depends(
        require_accounts
    ),

    db: Session = Depends(
        get_db
    ),

):

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
    # STATUS CHECK
    # ========================================================

    if improvement.status != (
        "pending_accounts"
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,

            detail=(
                "This improvement is not currently "
                "waiting for Accounts action."
            ),
        )

    # ========================================================
    # DESCRIPTION
    # ========================================================

    description = (
        payload.description or ""
    ).strip()

    if not description:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,

            detail=(
                "Resubmission description "
                "is required."
            ),
        )

    # ========================================================
    # SAVE RESUBMISSION INFORMATION
    # ========================================================

    now = datetime.now(
        timezone.utc
    )

    improvement.accounts_status = (
        "resubmission"
    )

    improvement.accounts_remarks = (
        description
    )

    improvement.resubmission_description = (
        description
    )

    improvement.resubmission_stage = (
        "accounts"
    )

    improvement.resubmission_requested_by = (
        current_user.id
    )

    improvement.resubmission_requested_at = (
        now
    )

    # ========================================================
    # CHANGE WORKFLOW STATUS
    # ========================================================

    improvement.status = (
        "resubmission_required"
    )

    improvement.current_stage = (
        "accounts"
    )

    improvement.updated_at = (
        now
    )

    # ========================================================
    # SAVE DATABASE
    # ========================================================

    db.commit()

    db.refresh(
        improvement
    )

    # ========================================================
    # GET OWNER
    # ========================================================

    owner = (
        db.query(User)
        .filter(
            User.id
            == improvement.employee_id
        )
        .first()
    )

    # ========================================================
    # EMAIL
    #
    # ACCOUNTS RESUBMISSION -> OWNER
    # ========================================================

    send_improvement_status_email(

        owner,

        improvement.project_id,

        "Returned for Resubmission by Accounts",

        (
            "Accounts has requested changes "
            "before approval.\n\n"
            f"Remarks: {description}"
        ),

    )

    # ========================================================
    # RESPONSE
    # ========================================================

    return {

        "message":
            "Improvement sent back for resubmission successfully.",

        "status":
            improvement.status,

        "current_stage":
            improvement.current_stage,

        "resubmission_stage":
            improvement.resubmission_stage,

        "resubmission_description":
            improvement.resubmission_description,

        "resubmission_requested_at":
            improvement.resubmission_requested_at,

        "improvement_id":
            improvement.id,

    }

