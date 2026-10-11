
from typing import Optional
import re
from uuid import UUID
from datetime import date, datetime, timezone

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Query,
    status,
)

from pydantic import BaseModel

from sqlalchemy.orm import Session

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
from app.services.financial_service import saving_for_month, saving_for_fy

from app.services.notification_service import (
    send_improvement_status_email,
    send_new_improvement_to_accounts,
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
# PLANT HEAD ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/v1/plant-head",
    tags=["Plant Head"],
)


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class PlantHeadRejectRequest(BaseModel):

    description: Optional[str] = None

    rejection_description: Optional[str] = None


class PlantHeadResubmissionRequest(BaseModel):

    description: Optional[str] = None

    resubmission_description: Optional[str] = None


# ============================================================
# ROLE CHECK
# ============================================================

def require_plant_head(
    current_user: User = Depends(
        get_current_user
    ),
):

    role = getattr(
        current_user.role,
        "value",
        str(current_user.role),
    )

    if role != UserRole.PLANT_HEAD.value:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only the Plant Head can "
                "access this resource."
            ),
        )

    return current_user


# ============================================================
# COMMON STATUS GROUPS
# ============================================================

PENDING_STATUSES = {
    "draft",
    "pending_accounts",
    "pending_hod",
    "pending_plant_head",
    "pending_plant_head_2",
    "pending_plant_head_3",
    "pending_plant_head_final",
}

RESUBMISSION_STATUSES = {
    "resubmission_required",
    "resubmit",
    "resubmission",
}

DONE_STATUSES = {
    "done",
    "closed",
}

PLANT_HEAD_APPROVAL_STATUSES = {
    "pending_plant_head",
    "pending_plant_head_final",
}


# ============================================================
# SERIALIZATION HELPERS
# ============================================================

def serialize_improvement(
    improvement: Improvement,
    employee: Optional[User] = None,
):

    user_name = (
        employee.full_name
        if employee
        else None
    )

    employee_code = (
        employee.employee_code
        if employee
        else None
    )

    return {

        # ====================================================
        # BASIC
        # ====================================================

        "id":
            improvement.id,

        "project_id":
            improvement.project_id,

        "employee_id":
            improvement.employee_id,

        "user_name":
            user_name,

        "employee_name":
            user_name,

        "employee_code":
            employee_code,

        # ====================================================
        # PROJECT
        # ====================================================

        "department":
            improvement.department,

        "plant":
            improvement.plant,

        "kaizen_theme":
            improvement.kaizen_theme,

        "idea":
            improvement.idea,

        "project_idea":
            improvement.project_idea,

        "target":
            improvement.target,

        "machine":
            improvement.machine,

        "kaizen_start":
            improvement.kaizen_start,

        "kaizen_end":
            improvement.kaizen_end,

        "activity":
            improvement.activity or [],

        "benefit_type":
            improvement.benefit_type or [],

        # ====================================================
        # PROBLEM
        # ====================================================

        "problem_present_status":
            improvement.problem_present_status or [],

        "problem_images":
            prepare_image_urls(improvement.problem_images),

        # ====================================================
        # COUNTERMEASURE
        # ====================================================

        "countermeasure":
            improvement.countermeasure or [],

        "countermeasure_images":
            prepare_image_urls(improvement.countermeasure_images),

        # ====================================================
        # RESULTS
        # ====================================================

        "results":
            improvement.results or [],

        "result_images":
            prepare_image_urls(improvement.result_images),

        # ====================================================
        # COST SAVING
        # ====================================================

        "cost_saving_items":
            improvement.cost_saving_items or [],

        "total_monthly_saving":
            improvement.total_monthly_saving,

        "annualized_saving":
            improvement.annualized_saving,

        # ====================================================
        # INVESTMENT
        # ====================================================

        "investment_required":
            improvement.investment_required,

        "investment_amount":
            improvement.investment_amount,

        "payback_period":
            improvement.payback_period,

        "investment_details":
            improvement.investment_details,

        # ====================================================
        # HORIZONTAL DEPLOYMENT
        # ====================================================

        "horizontal_deployment":
            improvement.horizontal_deployment or [],

        # ====================================================
        # ACCOUNTS
        # ====================================================

        "accounts_status":
            improvement.accounts_status,

        "accounts_remarks":
            improvement.accounts_remarks,

        "accounts_verified_by":
            improvement.accounts_verified_by,

        "accounts_verified_designation":
            improvement.accounts_verified_designation,

        "accounts_verified_at":
            improvement.accounts_verified_at,

        # ====================================================
        # PLANT HEAD
        # ====================================================

        "plant_head_status":
            improvement.plant_head_status,

        "plant_head_remarks":
            improvement.plant_head_remarks,

        "plant_head_closed_by":
            improvement.plant_head_closed_by,

        "plant_head_closed_at":
            improvement.plant_head_closed_at,

        "plant_head_signoff_date":
            improvement.plant_head_signoff_date,

        # ====================================================
        # WORKFLOW
        # ====================================================

        "status":
            improvement.status,

        "current_stage":
            improvement.current_stage,

        # ====================================================
        # REJECTION
        # ====================================================

        "rejection_description":
            improvement.rejection_description,

        "rejected_at_stage":
            improvement.rejected_at_stage,

        "rejected_by":
            improvement.rejected_by,

        "rejected_at":
            improvement.rejected_at,

        # ====================================================
        # RESUBMISSION
        # ====================================================

        "resubmission_description":
            improvement.resubmission_description,

        "resubmission_stage":
            improvement.resubmission_stage,

        "resubmission_requested_by":
            improvement.resubmission_requested_by,

        "resubmission_requested_at":
            improvement.resubmission_requested_at,

        # ====================================================
        # TIMESTAMPS
        # ====================================================

        "created_at":
            improvement.created_at,

        "updated_at":
            improvement.updated_at,
    }


# ============================================================
# QUERY IMPROVEMENTS WITH EMPLOYEE INFORMATION
# ============================================================

def get_improvements_with_users(
    db: Session,
    query=None,
):

    if query is None:

        query = db.query(
            Improvement
        )

    rows = (
        query
        .outerjoin(
            User,
            Improvement.employee_id
            == User.id,
        )
        .order_by(
            Improvement.created_at.desc()
        )
        .all()
    )

    return [
        serialize_improvement(
            improvement,
            employee,
        )
        for improvement, employee
        in rows
    ]


# ============================================================
# SUMMARY
# ============================================================

@router.get(
    "/summary",
)
def get_plant_head_summary(

    current_user: User = Depends(
        require_plant_head
    ),

    db: Session = Depends(
        get_db
    ),
):

    # ========================================================
    # MY IMPROVEMENTS
    # ========================================================

    my_improvements = (
        db.query(
            Improvement
        )
        .filter(
            Improvement.employee_id
            == current_user.id
        )
        .all()
    )

    my_total = len(
        my_improvements
    )

    my_pending = sum(
        1
        for item in my_improvements
        if (
            item.status in PENDING_STATUSES
            or
            item.status in RESUBMISSION_STATUSES
        )
    )

    my_in_progress = sum(
        1
        for item in my_improvements
        if item.status == "in_progress"
    )

    my_rejected = sum(
        1
        for item in my_improvements
        if item.status == "rejected"
    )

    my_done = sum(
        1
        for item in my_improvements
        if item.status in DONE_STATUSES
    )

    # ========================================================
    # TOTAL ACTIVE USERS
    # ========================================================

    total_employees = (
        db.query(User)
        .filter(
            User.is_active.is_(True)
        )
        .count()
    )

    # ========================================================
    # ALL IMPROVEMENTS
    # ========================================================

    total_improvements = (
        db.query(
            Improvement
        )
        .count()
    )

    # ========================================================
    # APPROVED / ACCEPTED
    #
    # CLOSED is the final Plant Head approved state.
    # ========================================================

    approved = (
        db.query(
            Improvement
        )
        .filter(
            (
                Improvement.status.in_(
                    [
                        "in_progress",
                        "done",
                        "closed",
                    ]
                )
            )
            |
            (
                Improvement.accounts_status
                == "approved"
            )
        )
        .count()
    )

    # ========================================================
    # RESUBMISSION
    # ========================================================

    resubmission_required = (
        db.query(
            Improvement
        )
        .filter(
            Improvement.status.in_(
                list(
                    RESUBMISSION_STATUSES
                )
            )
        )
        .count()
    )

    # ========================================================
    # PENDING
    # ========================================================

    pending = (
        db.query(
            Improvement
        )
        .filter(
            Improvement.status.in_(
                list(
                    PENDING_STATUSES
                )
            )
        )
        .count()
    )

    # ========================================================
    # IN PROGRESS
    # ========================================================

    in_progress = (
        db.query(
            Improvement
        )
        .filter(
            Improvement.status
            == "in_progress"
        )
        .count()
    )

    # ========================================================
    # REJECTED
    # ========================================================

    rejected = (
        db.query(
            Improvement
        )
        .filter(
            Improvement.status
            == "rejected"
        )
        .count()
    )

    # ========================================================
    # DONE
    #
    # Both "done" and "closed" are treated as completed.
    # ========================================================

    done = (
        db.query(
            Improvement
        )
        .filter(
            Improvement.status.in_(
                list(
                    DONE_STATUSES
                )
            )
        )
        .count()
    )

    # ========================================================
    # PLANT HEAD APPROVALS
    # ========================================================

    stage_1 = (
        db.query(
            Improvement
        )
        .filter(
            Improvement.status
            == "pending_plant_head"
        )
        .count()
    )

    stage_2 = (
        db.query(
            Improvement
        )
        .filter(
            Improvement.status
            == "pending_plant_head_2"
        )
        .count()
    )

    stage_3 = (
        db.query(
            Improvement
        )
        .filter(
            Improvement.status
            == "pending_plant_head_3"
        )
        .count()
    )

    total_approvals = (
        stage_1
        + stage_2
        + stage_3
    )

    return {

        # ====================================================
        # MY CARDS
        # ====================================================

        "my_total":
            my_total,

        "my_pending":
            my_pending,

        "my_in_progress":
            my_in_progress,

        "my_rejected":
            my_rejected,

        "my_done":
            my_done,

        # ====================================================
        # OVERALL CARDS
        # ====================================================

        "total_employees":
            total_employees,

        "total_improvements":
            total_improvements,

        "approved":
            approved,

        "accepted":
            approved,

        "resubmission_required":
            resubmission_required,

        "resubmission":
            resubmission_required,

        "pending":
            pending,

        "in_progress":
            in_progress,

        "rejected":
            rejected,

        "done":
            done,

        "closed":
            done,

        "total_approvals":
            total_approvals,

        "completed":
            done,

        # ====================================================
        # APPROVAL BREAKDOWN
        # ====================================================

        "approvals": {

            "total":
                total_approvals,

            "stage_1":
                stage_1,

            "stage_2":
                stage_2,

            "stage_3":
                stage_3,
        },
    }


# ============================================================
# PLANT HEAD ANALYTICS
# ============================================================

def _financial_year_start(year: int) -> date:
    return date(year, 4, 1)


def _financial_year_label(start_year: int) -> str:
    return f"FY{start_year % 100:02d}-{(start_year + 1) % 100:02d}"


def _financial_year_for_date(value: date) -> str:
    start_year = value.year if value.month >= 4 else value.year - 1
    return _financial_year_label(start_year)


def _parse_financial_year(value: Optional[str]) -> int:
    if not value:
        today = date.today()
        return today.year if today.month >= 4 else today.year - 1

    normalized = value.strip().upper().replace(" ", "")

    if normalized.startswith("FY"):
        normalized = normalized[2:]

    match = re.match(r"^(\d{2})[-/]?(\d{2})$", normalized)
    if match:
        first = int(match.group(1))
        return 2000 + first

    match = re.match(r"^(\d{4})[-/]?(\d{2}|\d{4})$", normalized)
    if match:
        return int(match.group(1))

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid financial year. Use FY26-27 format.",
    )


def _money(value) -> float:
    return round(float(value or 0), 2)


@router.get("/analytics")
def get_plant_head_analytics(
    fy: Optional[str] = Query(default=None),
    current_user: User = Depends(require_plant_head),
    db: Session = Depends(get_db),
):
    selected_start_year = _parse_financial_year(fy)
    fy_start = _financial_year_start(selected_start_year)
    fy_end = _financial_year_start(selected_start_year + 1)
    selected_fy = _financial_year_label(selected_start_year)

    improvements = (
        db.query(Improvement)
        .filter(
            # Include improvements created in earlier FYs when their
            # recurring/limited-period saving is still active in the
            # selected FY. The received count is calculated separately
            # from kaizen_start inside each month.
            Improvement.kaizen_start < fy_end,
        )
        .order_by(Improvement.kaizen_start.asc(), Improvement.created_at.asc())
        .all()
    )

    # Available FYs are driven by actual OIPM records, with the current FY
    # always present so a newly opened FY can be selected immediately.
    all_dates = (
        db.query(Improvement.kaizen_start)
        .filter(Improvement.kaizen_start.isnot(None))
        .all()
    )
    available_years = {selected_start_year}
    for (kaizen_start,) in all_dates:
        if kaizen_start:
            available_years.add(
                kaizen_start.year if kaizen_start.month >= 4 else kaizen_start.year - 1
            )

    current_today = date.today()
    current_start_year = current_today.year if current_today.month >= 4 else current_today.year - 1
    available_years.add(current_start_year)

    fy_options = [
        _financial_year_label(year)
        for year in sorted(available_years, reverse=True)
    ]

    months = []
    for offset in range(12):
        month_index = 4 + offset
        if month_index <= 12:
            year = selected_start_year
            month = month_index
        else:
            year = selected_start_year + 1
            month = month_index - 12
        months.append(date(year, month, 1))

    employee_ids = {
        item.accounts_verified_by
        for item in improvements
        if item.accounts_verified_by
    }
    verifier_names = {}
    if employee_ids:
        verifier_names = {
            str(user.id): user.full_name
            for user in db.query(User).filter(User.id.in_(employee_ids)).all()
        }

    monthly = []
    top_projects = []
    for month_start in months:
        next_month = (
            date(month_start.year + 1, 1, 1)
            if month_start.month == 12
            else date(month_start.year, month_start.month + 1, 1)
        )
        year = month_start.year
        month = month_start.month
        received_items = [
            item for item in improvements
            if item.kaizen_start and month_start <= item.kaizen_start < next_month
        ]
        active_items = [
            item for item in improvements
            if item.kaizen_start and saving_for_month(item.kaizen_start, item.cost_saving_items or [], year, month) > 0
        ]

        proposed_monthly = sum(
            saving_for_month(item.kaizen_start, item.cost_saving_items or [], year, month)
            for item in active_items
            if item.kaizen_start
        )
        validated_items = [
            item for item in active_items
            if str(item.accounts_status or "").strip().lower() in {"approved", "validated"}
        ]
        validated_monthly = sum(
            saving_for_month(item.kaizen_start, item.cost_saving_items or [], year, month)
            for item in validated_items
            if item.kaizen_start
        )

        monthly.append({
            "month": month_start.strftime("%b-%y"),
            "date": month_start.isoformat(),
            "oipms_received": len(received_items),
            "monthly_saving_proposed": round(proposed_monthly, 2),
            "monthly_saving_validated": round(validated_monthly, 2),
            "annualized_saving_proposed": round(
                sum(
                    saving_for_fy(item.kaizen_start, item.cost_saving_items or [], selected_start_year)
                    for item in received_items
                    if item.kaizen_start
                ), 2
            ),
            "annualized_saving_validated": round(
                sum(
                    saving_for_fy(item.kaizen_start, item.cost_saving_items or [], selected_start_year)
                    for item in received_items
                    if item.kaizen_start and str(item.accounts_status or "").strip().lower() in {"approved", "validated"}
                ), 2
            ),
        })

        ranked = sorted(
            [
                item for item in active_items
                if item.kaizen_start and saving_for_month(item.kaizen_start, item.cost_saving_items or [], year, month) > 0
            ],
            key=lambda item: (
                -saving_for_month(item.kaizen_start, item.cost_saving_items or [], year, month),
                str(item.project_id),
            ),
        )[:3]
        projects = []
        for item in ranked:
            proposed_saving = saving_for_month(
                item.kaizen_start,
                item.cost_saving_items or [],
                year,
                month,
            )
            is_validated = str(item.accounts_status or "").strip().lower() in {
                "approved",
                "validated",
            }
            projects.append({
                "project_id": item.project_id,
                "staff_name": verifier_names.get(str(item.employee_id)) or "",
                "employee_id": str(item.employee_id),
                "proposed_saving": proposed_saving,
                "validated_saving": proposed_saving if is_validated else 0,
                # Backward-compatible key for existing consumers.
                "saving": proposed_saving,
            })

        # Replace the staff lookup above with the creator's actual name.
        creator_ids = {item.employee_id for item in ranked if item.employee_id}
        if creator_ids:
            creator_names = {
                str(user.id): user.full_name
                for user in db.query(User).filter(User.id.in_(creator_ids)).all()
            }
            for project in projects:
                project["staff_name"] = creator_names.get(project["employee_id"], "")

        while len(projects) < 3:
            projects.append({
                "project_id": "—",
                "staff_name": "—",
                "employee_id": "",
                "proposed_saving": 0,
                "validated_saving": 0,
                "saving": 0,
            })
        top_projects.append({"month": month_start.strftime("%b-%y"), "projects": projects})

    total_received = sum(row["oipms_received"] for row in monthly)
    # FY cards represent the saving that actually occurs inside the
    # selected April-to-March financial year. This is deliberately not
    # monthly_total * 12 because limited-period and one-time savings
    # have finite timing.
    proposed_fy_total = sum(
        saving_for_fy(
            item.kaizen_start,
            item.cost_saving_items or [],
            selected_start_year,
        )
        for item in improvements
        if item.kaizen_start
    )
    validated_fy_total = sum(
        saving_for_fy(
            item.kaizen_start,
            item.cost_saving_items or [],
            selected_start_year,
        )
        for item in improvements
        if item.kaizen_start
        and str(item.accounts_status or "").strip().lower() in {"approved", "validated"}
    )

    return {
        "current_fy": _financial_year_label(current_start_year),
        "selected_fy": selected_fy,
        "fy_options": fy_options,
        "kpis": {
            "total_received": total_received,
            "annual_saving_proposed": round(proposed_fy_total, 2),
            "annual_saving_validated": round(validated_fy_total, 2),
        },
        "monthly_summary": monthly,
        "top_projects": top_projects,
    }

# ============================================================
# MY IMPROVEMENTS
# ============================================================

@router.get(
    "/improvements",
)
def get_plant_head_improvements(

    current_user: User = Depends(
        require_plant_head
    ),

    db: Session = Depends(
        get_db
    ),
):

    rows = (
        db.query(
            Improvement,
            User,
        )
        .outerjoin(
            User,
            Improvement.employee_id
            == User.id,
        )
        .filter(
            Improvement.employee_id
            == current_user.id
        )
        .order_by(
            Improvement.created_at.desc()
        )
        .all()
    )

    return [
        serialize_improvement(
            improvement,
            employee,
        )
        for improvement, employee
        in rows
    ]


# ============================================================
# PENDING PLANT HEAD APPROVALS
# ============================================================

@router.get(
    "/approvals",
)
def get_plant_head_approvals(

    current_user: User = Depends(
        require_plant_head
    ),

    db: Session = Depends(
        get_db
    ),
):

    rows = (
        db.query(
            Improvement,
            User,
        )
        .outerjoin(
            User,
            Improvement.employee_id
            == User.id,
        )
        .filter(
            Improvement.status.in_(
                list(
                    PLANT_HEAD_APPROVAL_STATUSES
                )
            )
        )
        .order_by(
            Improvement.created_at.desc()
        )
        .all()
    )

    return [
        serialize_improvement(
            improvement,
            employee,
        )
        for improvement, employee
        in rows
    ]


# ============================================================
# ALL IMPROVEMENTS
# ============================================================

@router.get(
    "/all-improvements",
)
def get_plant_head_all_improvements(

    current_user: User = Depends(
        require_plant_head
    ),

    db: Session = Depends(
        get_db
    ),

    status_filter: Optional[str] = Query(
        default=None,
        alias="status",
    ),

    from_date: Optional[str] = Query(
        default=None,
        alias="start_date",
    ),

    to_date: Optional[str] = Query(
        default=None,
        alias="end_date",
    ),

    search: Optional[str] = Query(
        default=None,
    ),
):

    query = (
        db.query(
            Improvement,
            User,
        )
        .outerjoin(
            User,
            Improvement.employee_id
            == User.id,
        )
    )

    # ========================================================
    # STATUS FILTER
    # ========================================================

    if (
        status_filter
        and status_filter.lower()
        != "all"
    ):

        query = query.filter(
            Improvement.status
            == status_filter
        )

    # ========================================================
    # DATE FILTER
    # ========================================================

    if from_date:

        try:

            parsed_from = datetime.strptime(
                from_date,
                "%Y-%m-%d",
            )

            query = query.filter(
                Improvement.created_at
                >= parsed_from
            )

        except ValueError:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Invalid start_date. "
                    "Use YYYY-MM-DD."
                ),
            )

    if to_date:

        try:

            parsed_to = datetime.strptime(
                to_date,
                "%Y-%m-%d",
            )

            parsed_to = (
                parsed_to
                .replace(
                    hour=23,
                    minute=59,
                    second=59,
                    microsecond=999999,
                )
            )

            query = query.filter(
                Improvement.created_at
                <= parsed_to
            )

        except ValueError:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Invalid end_date. "
                    "Use YYYY-MM-DD."
                ),
            )

    # ========================================================
    # SEARCH
    # ========================================================

    if search:

        search_value = (
            search.strip()
        )

        if search_value:

            pattern = (
                f"%{search_value}%"
            )

            query = query.filter(

                (
                    Improvement.project_id.ilike(
                        pattern
                    )
                )
                |
                (
                    Improvement.department.ilike(
                        pattern
                    )
                )
                |
                (
                    Improvement.plant.ilike(
                        pattern
                    )
                )
                |
                (
                    User.full_name.ilike(
                        pattern
                    )
                )
                |
                (
                    User.employee_code.ilike(
                        pattern
                    )
                )
            )

    # ========================================================
    # EXECUTE
    # ========================================================

    rows = (
        query
        .order_by(
            Improvement.created_at.desc()
        )
        .all()
    )

    return [
        serialize_improvement(
            improvement,
            employee,
        )
        for improvement, employee
        in rows
    ]


# ============================================================
# EMPLOYEES
# ============================================================

@router.get(
    "/employees",
)
def get_plant_head_employees(

    current_user: User = Depends(
        require_plant_head
    ),

    db: Session = Depends(
        get_db
    ),
):

    users = (
        db.query(
            User
        )
        .filter(
            User.is_active.is_(True)
        )
        .order_by(
            User.full_name.asc()
        )
        .all()
    )

    return [

        {
            "id":
                user.id,

            "full_name":
                user.full_name,

            "employee_name":
                user.full_name,

            "employee_code":
                user.employee_code,

            "email":
                user.email,

            "role":
                getattr(
                    user.role,
                    "value",
                    str(user.role),
                ),

            "is_active":
                user.is_active,
        }

        for user in users
    ]


# ============================================================
# APPROVE IMPROVEMENT
#
# IMPORTANT:
#
# Plant Head is the FINAL approval.
#
# Any improvement waiting for Plant Head approval becomes:
#
#     status = closed
#     current_stage = closed
#
# This means:
#
# Plant Head Dashboard:
#     Done +1
#
# Employee Dashboard:
#     Done +1
#
# All Improvements:
#     Record remains visible as closed
#
# ============================================================

@router.post(
    "/improvements/{improvement_id}/approve",
)
def approve_improvement(

    improvement_id: UUID,

    current_user: User = Depends(
        require_plant_head
    ),

    db: Session = Depends(
        get_db
    ),
):

    improvement = (
        db.query(
            Improvement
        )
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
    # ONLY PLANT HEAD PENDING RECORDS
    # ========================================================

    if improvement.status not in (
        PLANT_HEAD_APPROVAL_STATUSES
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This improvement is not currently "
                "waiting for Plant Head approval."
            ),
        )

    now = datetime.now(
        timezone.utc
    )

    # ========================================================
    # FIRST APPROVAL = APPROVE TO START
    # FINAL APPROVAL = SEND TO ACCOUNTS
    # ========================================================

    if improvement.status == "pending_plant_head":
        improvement.status = "in_progress"
        improvement.current_stage = "improvement"
        improvement.plant_head_status = "approved_to_start"
        subject = "Approved to Start by Plant Head"
        body = (
            "Your improvement has been approved to start by the Plant Head.\n\n"
            "Please start working on the improvement. Once the improvement is complete, "
            "open it from your dashboard, update the required information/images, and click "
            "Submit Improvement for final Plant Head approval."
        )
    else:
        improvement.status = "pending_accounts"
        improvement.current_stage = "accounts"
        improvement.plant_head_status = "approved"
        subject = "Final Approval by Plant Head"
        body = (
            "Your improvement has received final Plant Head approval and has been forwarded "
            "to Accounts for final verification."
        )

    if improvement.status == "pending_accounts":
        improvement.plant_head_closed_by = current_user.id
        improvement.plant_head_closed_at = now
        improvement.plant_head_signoff_date = now.date()

    improvement.updated_at = now

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
    # SAVE
    # ========================================================

    db.commit()

    db.refresh(
        improvement
    )

    owner = (
        db.query(User)
        .filter(User.id == improvement.employee_id)
        .first()
    )

    send_improvement_status_email(
        owner,
        improvement.project_id,
        subject,
        body,
    )

    if improvement.status == "pending_accounts":
        send_new_improvement_to_accounts(
            db,
            improvement,
            owner,
        )

    return {

        "message":
            "Improvement approved successfully.",

        "status":
            improvement.status,

        "current_stage":
            improvement.current_stage,

        "improvement_id":
            improvement.id,
    }


# ============================================================
# REJECT IMPROVEMENT
#
# Supports BOTH:
#
# 1. Query parameter:
#
#    ?rejection_description=Reason
#
# 2. JSON body:
#
#    {
#        "description": "Reason"
#    }
#
# 3. JSON body:
#
#    {
#        "rejection_description": "Reason"
#    }
#
# This prevents the "Field required" problem regardless of
# which version of the frontend sends the request.
# ============================================================

@router.post(
    "/improvements/{improvement_id}/reject",
)
def reject_improvement(

    improvement_id: UUID,

    rejection_description: Optional[str] = Query(
        default=None
    ),

    payload: Optional[
        PlantHeadRejectRequest
    ] = Body(
        default=None
    ),

    current_user: User = Depends(
        require_plant_head
    ),

    db: Session = Depends(
        get_db
    ),
):

    improvement = (
        db.query(
            Improvement
        )
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
    # GET DESCRIPTION FROM QUERY OR BODY
    # ========================================================

    description = (
        rejection_description
    )

    if (
        not description
        and payload is not None
    ):

        description = (
            payload.description
            or
            payload.rejection_description
        )

    description = (
        description.strip()
        if description
        else ""
    )

    # ========================================================
    # VALIDATE DESCRIPTION
    # ========================================================

    if not description:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Rejection description "
                "is required."
            ),
        )

    # ========================================================
    # VALID PLANT HEAD STAGE
    # ========================================================

    stage_map = {
        "pending_plant_head": "plant_head_start",
        "pending_plant_head_final": "plant_head_final",
    }

    current_stage = (
        stage_map.get(
            improvement.status
        )
    )

    if current_stage is None:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This improvement is not currently "
                "waiting for Plant Head action."
            ),
        )

    now = datetime.now(
        timezone.utc
    )

    # ========================================================
    # REJECT
    # ========================================================

    improvement.status = (
        "rejected"
    )

    improvement.current_stage = (
        current_stage
    )

    improvement.plant_head_status = (
        "rejected"
    )

    improvement.plant_head_remarks = (
        description
    )

    improvement.rejection_description = (
        description
    )

    improvement.rejected_at_stage = (
        current_stage
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
    # CLEAR RESUBMISSION DATA
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
    # SAVE
    # ========================================================

    db.commit()

    db.refresh(
        improvement
    )

    owner = (
        db.query(User)
        .filter(User.id == improvement.employee_id)
        .first()
    )

    send_improvement_status_email(
        owner,
        improvement.project_id,
        "Rejected by Plant Head",
        f"Plant Head rejected your improvement. Reason: {description}",
    )

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
# REQUEST RESUBMISSION
#
# Plant Head can return an improvement for correction.
#
# The creator can then edit it using the common
# View Improvement component.
# ============================================================

@router.post(
    "/improvements/{improvement_id}/resubmit",
)
def request_resubmission(

    improvement_id: UUID,

    resubmission_description: Optional[str] = Query(
        default=None
    ),

    payload: Optional[
        PlantHeadResubmissionRequest
    ] = Body(
        default=None
    ),

    current_user: User = Depends(
        require_plant_head
    ),

    db: Session = Depends(
        get_db
    ),
):

    improvement = (
        db.query(
            Improvement
        )
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
    # GET DESCRIPTION
    # ========================================================

    description = (
        resubmission_description
    )

    if (
        not description
        and payload is not None
    ):

        description = (
            payload.description
            or
            payload.resubmission_description
        )

    description = (
        description.strip()
        if description
        else ""
    )

    # ========================================================
    # VALIDATE
    # ========================================================

    if not description:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Resubmission description "
                "is required."
            ),
        )

    # ========================================================
    # ONLY PLANT HEAD PENDING STAGES
    # ========================================================

    stage_map = {
        "pending_plant_head": "plant_head_start",
        "pending_plant_head_final": "plant_head_final",
    }

    current_stage = (
        stage_map.get(
            improvement.status
        )
    )

    if current_stage is None:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This improvement is not currently "
                "available for Plant Head resubmission."
            ),
        )

    now = datetime.now(
        timezone.utc
    )

    # ========================================================
    # RETURN TO CREATOR
    # ========================================================

    improvement.status = (
        "resubmission_required"
    )

    improvement.current_stage = (
        "resubmission"
    )

    improvement.resubmission_description = (
        description
    )

    improvement.resubmission_stage = (
        current_stage
    )

    improvement.resubmission_requested_by = (
        current_user.id
    )

    improvement.resubmission_requested_at = (
        now
    )

    improvement.updated_at = (
        now
    )

    # ========================================================
    # SAVE
    # ========================================================

    db.commit()

    db.refresh(
        improvement
    )

    owner = (
        db.query(User)
        .filter(User.id == improvement.employee_id)
        .first()
    )

    send_improvement_status_email(
        owner,
        improvement.project_id,
        "Returned for Resubmission by Plant Head",
        f"Plant Head requested changes before approval. Remarks: {description}",
    )

    return {

        "message":
            "Improvement returned for resubmission.",

        "status":
            improvement.status,

        "current_stage":
            improvement.current_stage,

        "resubmission_stage":
            improvement.resubmission_stage,

        "resubmission_description":
            improvement.resubmission_description,

        "improvement_id":
            improvement.id,
    }