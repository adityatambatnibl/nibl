from datetime import datetime

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)

from sqlalchemy import or_
from sqlalchemy.orm import Session, aliased

from app.core.security import get_current_user
from app.db.database import get_db
from app.models.user import User, UserRole
from app.models.improvement import Improvement


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/v1/hod",
    tags=["HOD"],
)


# ============================================================
# HOD ROLE CHECK
# ============================================================

def require_hod(
    current_user: User = Depends(
        get_current_user
    ),
):
    role = getattr(
        current_user.role,
        "value",
        str(current_user.role),
    )

    if role != UserRole.HOD.value:

        raise HTTPException(

            status_code=
                status.HTTP_403_FORBIDDEN,

            detail=
                "Only HOD users can access "
                "this resource.",

        )

    return current_user


# ============================================================
# SERIALIZE IMPROVEMENT
# ============================================================

def serialize_improvement(
    improvement,
    employee=None,
):

    return {

        # ----------------------------------------------------
        # PRIMARY
        # ----------------------------------------------------

        "id":
            improvement.id,

        "project_id":
            improvement.project_id,

        # ----------------------------------------------------
        # PROJECT INFORMATION
        # ----------------------------------------------------

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

        # ----------------------------------------------------
        # EMPLOYEE
        # ----------------------------------------------------

        "employee_id":
            improvement.employee_id,

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

        # ----------------------------------------------------
        # TIMESTAMPS
        # ----------------------------------------------------

        "created_at":
            improvement.created_at,

        "updated_at":
            improvement.updated_at,

    }


# ============================================================
# COMMON FILTERS
# ============================================================

def apply_filters(
    query,
    employee,
    status_filter,
    start_date,
    end_date,
    search,
):

    # --------------------------------------------------------
    # STATUS
    # --------------------------------------------------------

    if (
        status_filter
        and status_filter != "all"
    ):

        query = query.filter(
            Improvement.status
            == status_filter
        )


    # --------------------------------------------------------
    # START DATE
    # --------------------------------------------------------

    if start_date:

        try:

            start = datetime.strptime(
                start_date,
                "%Y-%m-%d",
            )

        except ValueError:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid start_date. "
                    "Use YYYY-MM-DD."
                ),
            )

        query = query.filter(
            Improvement.created_at
            >= start
        )


    # --------------------------------------------------------
    # END DATE
    # --------------------------------------------------------

    if end_date:

        try:

            end = datetime.strptime(
                end_date,
                "%Y-%m-%d",
            )

        except ValueError:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid end_date. "
                    "Use YYYY-MM-DD."
                ),
            )

        end = end.replace(
            hour=23,
            minute=59,
            second=59,
        )

        query = query.filter(
            Improvement.created_at
            <= end
        )


    # --------------------------------------------------------
    # SEARCH
    # --------------------------------------------------------

    if search:

        value = (
            f"%{search.strip()}%"
        )

        conditions = [

            Improvement.project_id.ilike(
                value
            ),

            Improvement.project_idea.ilike(
                value
            ),

            employee.full_name.ilike(
                value
            ),

            employee.employee_code.ilike(
                value
            ),

            employee.email.ilike(
                value
            ),

        ]


        for field_name in (
            "department",
            "department_line",
            "plant",
        ):

            column = getattr(
                Improvement,
                field_name,
                None,
            )

            if column is not None:

                conditions.append(
                    column.ilike(value)
                )


        query = query.filter(
            or_(*conditions)
        )


    return query


# ============================================================
# EMPLOYEES UNDER HOD
# ============================================================

@router.get(
    "/employees"
)
def get_employees_under_hod(

    current_user: User =
        Depends(require_hod),

    db: Session =
        Depends(get_db),

):

    employees = (

        db.query(User)

        .filter(

            User.hod_id
            == current_user.id,

            User.is_active.is_(True),

        )

        .order_by(
            User.full_name.asc()
        )

        .all()

    )


    return [

        {

            "id":
                employee.id,

            "full_name":
                employee.full_name,

            "employee_code":
                employee.employee_code,

            "email":
                employee.email,

            "role":
                getattr(
                    employee.role,
                    "value",
                    str(employee.role),
                ),

            "is_active":
                employee.is_active,

        }

        for employee in employees

    ]


# ============================================================
# EMPLOYEE COUNT
# ============================================================

@router.get(
    "/employees/summary"
)
def get_employee_summary(

    current_user: User =
        Depends(require_hod),

    db: Session =
        Depends(get_db),

):

    total = (

        db.query(User)

        .filter(

            User.hod_id
            == current_user.id,

            User.is_active.is_(True),

        )

        .count()

    )


    return {

        "total_employees":
            total,

    }


# ============================================================
# MY IMPROVEMENTS
#
# ONLY improvements created by HOD.
# ============================================================

@router.get(
    "/my-improvements"
)
def get_my_improvements(

    current_user: User =
        Depends(require_hod),

    db: Session =
        Depends(get_db),

):

    employee = aliased(User)


    rows = (

        db.query(
            Improvement,
            employee,
        )

        .join(
            employee,
            Improvement.employee_id
            == employee.id,
        )

        .filter(

            Improvement.employee_id
            == current_user.id,

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
# UNDER ME IMPROVEMENTS
#
# ONLY improvements belonging to employees
# whose hod_id is this HOD.
# ============================================================

@router.get(
    "/under-me-improvements"
)
def get_under_me_improvements(

    status_filter: str | None =
        Query(
            default=None,
            alias="status",
        ),

    start_date: str | None = None,

    end_date: str | None = None,

    search: str | None = None,

    current_user: User =
        Depends(require_hod),

    db: Session =
        Depends(get_db),

):

    employee = aliased(User)


    query = (

        db.query(
            Improvement,
            employee,
        )

        .join(
            employee,
            Improvement.employee_id
            == employee.id,
        )

        .filter(

            employee.hod_id
            == current_user.id,

        )

    )


    query = apply_filters(

        query,

        employee,

        status_filter,

        start_date,

        end_date,

        search,

    )


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
# ALL IMPROVEMENTS AVAILABLE TO HOD
#
# Includes:
#
# 1. HOD's own improvements
# 2. Improvements of employees under HOD
#
# Nothing outside this scope.
# ============================================================

@router.get(
    "/all-improvements"
)
def get_all_improvements(

    status_filter: str | None =
        Query(
            default=None,
            alias="status",
        ),

    start_date: str | None = None,

    end_date: str | None = None,

    search: str | None = None,

    current_user: User =
        Depends(require_hod),

    db: Session =
        Depends(get_db),

):

    employee = aliased(User)


    query = (

        db.query(
            Improvement,
            employee,
        )

        .join(
            employee,
            Improvement.employee_id
            == employee.id,
        )

        .filter(

            or_(

                Improvement.employee_id
                == current_user.id,

                employee.hod_id
                == current_user.id,

            )

        )

    )


    query = apply_filters(

        query,

        employee,

        status_filter,

        start_date,

        end_date,

        search,

    )


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
# ALL HOD-VISIBLE IMPROVEMENTS
#
# Compatibility endpoint used by existing frontend.
# ============================================================

@router.get(
    "/improvements"
)
def get_hod_improvements(

    current_user: User =
        Depends(require_hod),

    db: Session =
        Depends(get_db),

):

    employee = aliased(User)


    rows = (

        db.query(
            Improvement,
            employee,
        )

        .join(
            employee,
            Improvement.employee_id
            == employee.id,
        )

        .filter(

            or_(

                Improvement.employee_id
                == current_user.id,

                employee.hod_id
                == current_user.id,

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
# SUMMARY
# ============================================================

@router.get(
    "/summary"
)
def get_hod_summary(

    current_user: User =
        Depends(require_hod),

    db: Session =
        Depends(get_db),

):

    employee = aliased(User)


    # --------------------------------------------------------
    # MY IMPROVEMENTS
    # --------------------------------------------------------

    my = (

        db.query(Improvement)

        .filter(

            Improvement.employee_id
            == current_user.id,

        )

    )


    # --------------------------------------------------------
    # TEAM IMPROVEMENTS
    # --------------------------------------------------------

    team = (

        db.query(Improvement)

        .join(

            employee,

            Improvement.employee_id
            == employee.id,

        )

        .filter(

            employee.hod_id
            == current_user.id,

        )

    )


    # --------------------------------------------------------
    # EMPLOYEE COUNT
    # --------------------------------------------------------

    total_employees = (

        db.query(User)

        .filter(

            User.hod_id
            == current_user.id,

            User.is_active.is_(True),

        )

        .count()

    )


    # --------------------------------------------------------
    # STATUS HELPER
    # --------------------------------------------------------

    def count_in(
        query,
        values,
    ):

        return (

            query

            .filter(
                Improvement.status.in_(
                    values
                )
            )

            .count()

        )


    # --------------------------------------------------------
    # MY COUNTS
    # --------------------------------------------------------

    my_pending = count_in(

        my,

        [

            "pending_accounts",

            "pending_plant_head",

            "pending_hod",

            "pending_plant_head_2",

            "pending_accounts_2",

            "pending_plant_head_3",

        ],

    )


    my_resubmission = count_in(

        my,

        [

            "resubmission_required",

            "resubmit",

            "resubmission",

        ],

    )


    my_done = count_in(

        my,

        [

            "closed",

            "done",

        ],

    )


    # --------------------------------------------------------
    # TEAM COUNTS
    # --------------------------------------------------------

    team_approved = (

        team

        .filter(
            Improvement.status
            == "approved"
        )

        .count()

    )


    team_resubmission = count_in(

        team,

        [

            "resubmission_required",

            "resubmit",

            "resubmission",

        ],

    )


    team_pending = count_in(

        team,

        [

            "pending_accounts",

            "pending_plant_head",

            "pending_hod",

            "pending_plant_head_2",

            "pending_accounts_2",

            "pending_plant_head_3",

        ],

    )


    team_in_progress = (

        team

        .filter(
            Improvement.status
            == "in_progress"
        )

        .count()

    )


    team_rejected = (

        team

        .filter(
            Improvement.status
            == "rejected"
        )

        .count()

    )


    team_done = count_in(

        team,

        [

            "closed",

            "done",

        ],

    )


    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return {

        # ====================================================
        # EMPLOYEES
        # ====================================================

        "total_employees":
            total_employees,


        # ====================================================
        # MY IMPROVEMENTS
        # ====================================================

        "my_total":
            my.count(),

        "my_pending":
            my_pending,

        "my_in_progress":
            my

            .filter(
                Improvement.status
                == "in_progress"
            )

            .count(),

        "my_rejected":
            my

            .filter(
                Improvement.status
                == "rejected"
            )

            .count(),

        "my_done":
            my_done,

        "my_resubmission":
            my_resubmission,


        # ====================================================
        # UNDER ME
        # ====================================================

        "under_me_employees":
            total_employees,

        "under_me_total":
            team.count(),

        "under_me_approved":
            team_approved,

        "under_me_resubmission":
            team_resubmission,

        "under_me_pending":
            team_pending,

        "under_me_in_progress":
            team_in_progress,

        "under_me_rejected":
            team_rejected,

        "under_me_done":
            team_done,


        # ====================================================
        # COMPATIBILITY VALUES
        # ====================================================

        "total_improvements":
            team.count(),

        "pending_approvals":
            team

            .filter(
                Improvement.status
                == "pending_hod"
            )

            .count(),

        "completed":
            team_done,

        "rejected":
            team_rejected,

        "resubmission_required":
            team_resubmission,

    }