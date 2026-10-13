from datetime import datetime, timezone
from datetime import date

from pathlib import Path
from typing import Annotated, Any
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    status,
    UploadFile,
)

from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.models.improvement import Improvement
from app.models.user import User, UserRole

from app.schemas.improvement import (
    ImprovementCreate,
    ImprovementResponse,
    ImprovementSummary,
)

from app.services.storage_service import storage_service
from app.services.financial_service import normalize_cost_saving_items, payback_period, applicable_saving

from app.services.notification_service import (
    send_new_improvement_to_accounts,
    send_new_improvement_to_plant_heads,
)


# ============================================================
# IMPROVEMENTS ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/v1/improvements",
    tags=["Improvements"],
)


# ============================================================
# IMAGE CONFIGURATION
# ============================================================

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

ALLOWED_IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
}

MAX_IMAGE_SIZE = 10 * 1024 * 1024


# ============================================================
# PROJECT ID
# ============================================================

def generate_project_id(
    db: Session,
) -> str:

    year = datetime.now(
        timezone.utc
    ).year

    prefix = f"OIPM/{year}/"

    latest = (
        db.query(Improvement)
        .filter(
            Improvement.project_id.like(
                f"{prefix}%"
            )
        )
        .order_by(
            Improvement.project_id.desc()
        )
        .first()
    )

    if latest is None:

        number = 1

    else:

        try:

            number = (
                int(
                    latest.project_id.split("/")[-1]
                )
                + 1
            )

        except (
            ValueError,
            AttributeError,
        ):

            number = 1

    return f"{prefix}{number:05d}"


# ============================================================
# STORAGE PROJECT FOLDER
# ============================================================

def project_storage_name(
    project_id: str,
) -> str:

    return project_id.replace(
        "/",
        "-",
    )


# ============================================================
# ACCOUNTS VERIFIED BY NAME
# ============================================================

def get_accounts_verified_by_name(
    improvement: Improvement,
    db: Session,
) -> str | None:

    if not improvement.accounts_verified_by:
        return None

    verifier = (
        db.query(User)
        .filter(
            User.id
            == improvement.accounts_verified_by
        )
        .first()
    )

    if verifier is None:
        return None

    return (
        getattr(
            verifier,
            "full_name",
            None,
        )
        or getattr(
            verifier,
            "name",
            None,
        )
    )


# ============================================================
# GET IMPROVEMENT OWNER
#
# Used for HOD permission checking.
# ============================================================

def get_improvement_owner(
    improvement: Improvement,
    db: Session,
) -> User | None:

    if not improvement.employee_id:
        return None

    return (
        db.query(User)
        .filter(
            User.id
            == improvement.employee_id
        )
        .first()
    )


# ============================================================
# CHECK WHETHER HOD CAN VIEW IMPROVEMENT
#
# HOD can view:
#
# 1. Their own improvement
# 2. Improvements created by employees whose hod_id
#    matches the logged-in HOD.
#
# HOD cannot edit another employee's improvement.
# ============================================================

def hod_can_view_improvement(
    improvement: Improvement,
    current_user: User,
    db: Session,
) -> bool:

    if current_user.role != UserRole.HOD:

        return False

    # --------------------------------------------------------
    # HOD'S OWN IMPROVEMENT
    # --------------------------------------------------------

    if (
        improvement.employee_id
        == current_user.id
    ):

        return True

    # --------------------------------------------------------
    # EMPLOYEE UNDER THIS HOD
    # --------------------------------------------------------

    owner = get_improvement_owner(
        improvement,
        db,
    )

    if owner is None:

        return False

    return (
        owner.hod_id
        == current_user.id
    )


# ============================================================
# IMAGE URL PREPARATION
# ============================================================

def prepare_images(
    images,
):

    if not images:
        return []

    prepared = []

    for image in images:

        if not isinstance(
            image,
            dict,
        ):
            continue

        image_data = dict(
            image
        )

        storage_path = (
            image_data.get(
                "storage_path"
            )
        )

        if storage_path:

            try:

                image_data["url"] = (
                    storage_service
                    .create_signed_url(
                        storage_path,
                        expires_in=3600,
                    )
                )

            except Exception:

                image_data["url"] = None

        else:

            image_data["url"] = None

        prepared.append(
            image_data
        )

    return prepared


# ============================================================
# ARRAY NORMALIZATION
# ============================================================

def normalize_benefits(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return []
        try:
            import json
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except (ValueError, TypeError):
            pass
        return [value]
    return [str(value)]


# ============================================================
# CREATE IMPROVEMENT
# ============================================================

@router.post(
    "",
    response_model=ImprovementResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_improvement(

    payload: ImprovementCreate,

    current_user=Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    ),
):

    allowed_roles = {
        UserRole.EMPLOYEE,
        UserRole.HOD,
        UserRole.ACCOUNTS,
        UserRole.PLANT_HEAD,
    }

    if current_user.role not in allowed_roles:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your role is not allowed "
                "to create improvements."
            ),
        )

    project_id = generate_project_id(
        db
    )

    now = datetime.now(
        timezone.utc
    )

    try:
        normalized_cost_items, total_monthly_saving = normalize_cost_saving_items(payload.cost_saving_items)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    annualized_saving = (
        applicable_saving(normalized_cost_items)
        if normalized_cost_items else None
    )
    calculated_payback = payback_period(payload.investment_amount, normalized_cost_items) if payload.investment_required == "Yes" else None

    improvement = Improvement(

        project_id=project_id,

        employee_id=current_user.id,

        department=payload.department.strip(),

        plant=payload.plant.strip(),

        kaizen_theme=payload.kaizen_theme.strip(),

        idea=payload.idea.strip(),

        target=(
            payload.target.strip()
            if payload.target
            else None
        ),

        machine=(
            payload.machine.strip()
            if payload.machine
            else None
        ),

        activity=(payload.activity if payload.activity else []),

        benefit_type=(payload.benefit_type if payload.benefit_type else []),

        kaizen_start=payload.kaizen_start,

        kaizen_end=None,

        problem_present_status=(
            payload.problem_present_status
        ),

        problem_images=(
            payload.problem_images
            if payload.problem_images
            else []
        ),

        countermeasure=(
            payload.countermeasure
        ),

        countermeasure_images=(
            payload.countermeasure_images
            if payload.countermeasure_images
            else []
        ),

        results=(
            payload.results
        ),

        result_images=(
            payload.result_images
            if payload.result_images
            else []
        ),

        cost_saving_items=(
            normalized_cost_items
        ),

        total_monthly_saving=(
            total_monthly_saving
        ),

        annualized_saving=(
            annualized_saving
        ),

        investment_required=(
            payload.investment_required
        ),

        investment_amount=(
            payload.investment_amount
        ),

        payback_period=(
            calculated_payback
        ),

        investment_details=(
            payload.investment_details
        ),

        horizontal_deployment=(
            payload.horizontal_deployment
            if payload.horizontal_deployment
            else []
        ),

        # ====================================================
        # ACCOUNTS
        # ====================================================

        accounts_status=None,

        accounts_remarks=None,

        accounts_verified_by=None,

        accounts_verified_designation=None,

        accounts_verified_at=None,

        # ====================================================
        # PLANT HEAD
        # ====================================================

        plant_head_status=None,

        plant_head_remarks=None,

        plant_head_closed_by=None,

        plant_head_closed_at=None,

        plant_head_signoff_date=None,

        # ====================================================
        # WORKFLOW
        # ====================================================

        status="pending_plant_head",

        current_stage="plant_head",

        # ====================================================
        # REJECTION
        # ====================================================

        rejection_description=None,

        rejected_at_stage=None,

        rejected_by=None,

        rejected_at=None,

        # ====================================================
        # RESUBMISSION
        # ====================================================

        resubmission_description=None,

        resubmission_stage=None,

        resubmission_requested_by=None,

        resubmission_requested_at=None,

        # ====================================================
        # TIMESTAMPS
        # ====================================================

        created_at=now,

        updated_at=now,
    )

    # Keep investment data consistent even if a client submits
    # an amount while Investment Required is not Yes.
    if improvement.investment_required != "Yes":
        improvement.investment_amount = None
        improvement.payback_period = None
        improvement.investment_details = None

    db.add(
        improvement
    )

    db.commit()

    db.refresh(
        improvement
    )

    # Notify every active Plant Head after the improvement
    # has been successfully saved.
    send_new_improvement_to_plant_heads(
        db,
        improvement,
        current_user,
    )

    return improvement


# ============================================================
# RESUBMIT / EDIT IMPROVEMENT
#
# HOD RULE:
#
# - HOD can resubmit ONLY their own improvement.
# - HOD cannot resubmit an employee's improvement.
#
# Employee / Accounts / Plant Head behavior remains
# unchanged from the existing ownership model.
# ============================================================

@router.put(
    "/{improvement_id}/resubmit",
    response_model=ImprovementResponse,
)
def resubmit_improvement(

    improvement_id: UUID,

    payload: dict[str, Any],

    current_user=Depends(
        get_current_user
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

    # ========================================================
    # OWNER CHECK
    #
    # This deliberately remains strict.
    #
    # Therefore:
    #
    # HOD's own improvement -> ALLOWED
    #
    # Employee under HOD -> NOT ALLOWED
    #
    # ========================================================

    is_owner = (
        improvement.employee_id
        == current_user.id
    )

    if not is_owner:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only the user who created "
                "this improvement can resubmit it."
            ),
        )

    # ========================================================
    # RESUBMISSION STATUS CHECK
    # ========================================================

    allowed_resubmission_statuses = {

        "resubmission_required",

        "resubmit",

        "resubmission",

    }

    current_status = str(
        improvement.status
        or ""
    ).strip().lower()

    if (
        current_status
        not in allowed_resubmission_statuses
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This improvement is not currently "
                "available for resubmission."
            ),
        )

    # ========================================================
    # EDITABLE FIELDS
    # ========================================================

    editable_fields = {

        "department",

        "plant",

        "kaizen_theme",

        "idea",

        "target",

        "machine",

        "activity",

        "benefit_type",

        "kaizen_start",

        "kaizen_end",

        "problem_present_status",

        "countermeasure",

        "results",

        "cost_saving_items",

        "total_monthly_saving",

        "annualized_saving",

        "investment_required",

        "investment_amount",

        "payback_period",

        "investment_details",

        "horizontal_deployment",
         "payback_period",

    }

    # ========================================================
    # UPDATE EDITABLE FIELDS
    # ========================================================

    for field in editable_fields:

        if field not in payload:
            continue

        value = payload[field]

        # ====================================================
        # STRING FIELDS
        # ====================================================

        if field in {

            "department",

            "plant",

            "kaizen_theme",

            "idea",

            "target",

            "machine",

            "investment_required",

            "investment_details",

        }:

            if value is None:

                value = None

            elif isinstance(
                value,
                str,
            ):

                value = value.strip()

                if value == "":
                    value = None

            else:

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"{field} must be text."
                    ),
                )

        if field in {"activity", "benefit_type"}:
            value = normalize_benefits(value)

        # ====================================================
        # DATE FIELDS
        # ====================================================

        if field in {

            "kaizen_start",

            "kaizen_end",

        }:

            if value in (
                None,
                "",
            ):

                value = None

            elif isinstance(
                value,
                str,
            ):

                try:

                    value = date.fromisoformat(
                        value[:10]
                    )

                except ValueError:

                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Invalid date supplied "
                            f"for {field}."
                        ),
                    )

            elif not isinstance(
                value,
                date,
            ):

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"{field} must be a valid date."
                    ),
                )

        # ====================================================
        # NUMERIC FIELDS
        # ====================================================

        if field in {

            "total_monthly_saving",

            "annualized_saving",

            "investment_amount",

            

        }:

            if value in (
                None,
                "",
            ):

                value = None

            else:

                try:

                    value = float(
                        value
                    )

                except (
                    ValueError,
                    TypeError,
                ):

                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Invalid numeric value "
                            f"for {field}."
                        ),
                    )

        # ====================================================
        # JSON LIST FIELDS
        # ====================================================

        if field in {

            "problem_present_status",

            "countermeasure",

            "results",

            "cost_saving_items",

            "horizontal_deployment",

        }:

            if value is None:

                value = []

            elif not isinstance(
                value,
                list,
            ):

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"{field} must be a list."
                    ),
                )

        setattr(
            improvement,
            field,
            value,
        )

    # ========================================================
    # RECALCULATE FINANCIAL VALUES
    #
    # Never trust client-calculated totals during resubmission.
    # Normalize the actual saving rows so recurring, limited-period,
    # and one-time savings are handled consistently.
    # ========================================================

    if "cost_saving_items" in payload or any(
        field in payload
        for field in (
            "kaizen_start",
            "investment_amount",
            "investment_required",
        )
    ):
        try:
            normalized_items, total_monthly = normalize_cost_saving_items(
                improvement.cost_saving_items or []
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        improvement.cost_saving_items = normalized_items
        improvement.total_monthly_saving = total_monthly

        if improvement.kaizen_start and normalized_items:
            improvement.annualized_saving = applicable_saving(normalized_items)
        else:
            improvement.annualized_saving = None

        improvement.payback_period = (
            payback_period(
                improvement.investment_amount,
                normalized_items,
            )
            if str(improvement.investment_required or "").strip() == "Yes"
            else None
        )
    else:
        improvement.annualized_saving = None

    # ========================================================
    # RETURN TO REQUESTING STAGE
    # ========================================================

    requested_stage = (

        improvement.resubmission_stage

        or "accounts"

    )

    requested_stage = str(
        requested_stage
    ).strip().lower()

    if requested_stage in {

        "accounts",

        "pending_accounts",

        "account",

    }:

        improvement.status = (
            "pending_accounts"
        )

        improvement.current_stage = (
            "accounts"
        )

    elif requested_stage in {

        "plant_head_final",
        "pending_plant_head_final",
        "plant_head_final_approval",
        "final_plant_head",

    } or "final" in requested_stage:

        improvement.status = (
            "pending_plant_head_final"
        )

        improvement.current_stage = (
            "plant_head_final"
        )

    elif (

        "plant" in requested_stage

        or "head" in requested_stage

    ):

        improvement.status = (
            "pending_plant_head"
        )

        improvement.current_stage = (
            "plant_head"
        )

    elif requested_stage in {

        "hod",

        "pending_hod",

    }:

        improvement.status = (
            "pending_hod"
        )

        improvement.current_stage = (
            "hod"
        )

    else:

        improvement.status = (
            "pending_accounts"
        )

        improvement.current_stage = (
            "accounts"
        )

    # ========================================================
    # KEEP RESUBMISSION HISTORY
    # ========================================================

    # Do not clear the resubmission history.

    # ========================================================
    # CLEAR OLD ACCOUNTS VERIFICATION
    # ========================================================

    improvement.accounts_status = None

    improvement.accounts_verified_by = None

    improvement.accounts_verified_designation = None

    improvement.accounts_verified_at = None

    # ========================================================
    # CLEAR OLD REJECTION
    # ========================================================

    improvement.rejection_description = None

    improvement.rejected_at_stage = None

    improvement.rejected_by = None

    improvement.rejected_at = None

    # ========================================================
    # TIMESTAMP
    # ========================================================

    improvement.updated_at = (
        datetime.now(
            timezone.utc
        )
    )

    db.commit()

    db.refresh(
        improvement
    )

    if improvement.current_stage == "accounts":

        send_new_improvement_to_accounts(
            db,
            improvement,
            current_user,
        )

    elif improvement.current_stage in {"plant_head", "plant_head_final"}:

        send_new_improvement_to_plant_heads(
            db,
            improvement,
            current_user,
        )

    return improvement


# ============================================================
# SHARED EDIT HELPERS
# ============================================================

EDITABLE_FIELDS = {
    "department",
    "plant",
    "kaizen_theme",
    "idea",
    "target",
    "machine",
    "activity",
    "benefit_type",
    "kaizen_start",
    "problem_present_status",
    "countermeasure",
    "results",
    "cost_saving_items",
    "total_monthly_saving",
    "annualized_saving",
    "investment_required",
    "investment_amount",
    "payback_period",
    "investment_details",
    "horizontal_deployment",
}


def apply_improvement_edit(improvement: Improvement, payload: dict[str, Any]):
    for field in EDITABLE_FIELDS:
        if field not in payload:
            continue

        value = payload[field]

        if field in {
            "department", "plant", "kaizen_theme", "idea", "target",
            "machine", "investment_required", "payback_period",
            "investment_details",
        }:
            if value is not None and not isinstance(value, str):
                raise HTTPException(
                    status_code=400,
                    detail=f"{field} must be text.",
                )
            value = value.strip() if isinstance(value, str) else value
            if value == "":
                value = None

        elif field in {"activity", "benefit_type"}:
            value = normalize_benefits(value)

        elif field in {"kaizen_start"}:
            if value in (None, ""):
                value = None
            elif isinstance(value, str):
                try:
                    value = date.fromisoformat(value[:10])
                except ValueError as exc:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid date supplied for {field}.",
                    ) from exc
            elif not isinstance(value, date):
                raise HTTPException(status_code=400, detail=f"{field} must be a valid date.")

        elif field in {
            "problem_present_status", "countermeasure", "results",
            "cost_saving_items", "horizontal_deployment",
        }:
            if value is None:
                value = []
            elif not isinstance(value, list):
                raise HTTPException(status_code=400, detail=f"{field} must be a list.")

        elif field in {"total_monthly_saving", "annualized_saving", "investment_amount"}:
            if value in (None, ""):
                value = None
            else:
                try:
                    value = float(value)
                except (TypeError, ValueError) as exc:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid numeric value for {field}.",
                    ) from exc

        setattr(improvement, field, value)

    # Investment amount/details/payback are valid only when
    # Investment Required is explicitly Yes.
    if improvement.investment_required != "Yes":
        improvement.investment_amount = None
        improvement.payback_period = None
        improvement.investment_details = None

    if any(field in payload for field in ("cost_saving_items", "kaizen_start", "investment_amount", "investment_required")):
        try:
            normalized_items, total_monthly = normalize_cost_saving_items(improvement.cost_saving_items or [])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        improvement.cost_saving_items = normalized_items
        improvement.total_monthly_saving = total_monthly
        if improvement.kaizen_start and normalized_items:
            improvement.annualized_saving = applicable_saving(normalized_items)
        else:
            improvement.annualized_saving = None
        improvement.payback_period = (
            payback_period(improvement.investment_amount, normalized_items)
            if improvement.investment_required == "Yes" else None
        )

    improvement.updated_at = datetime.now(timezone.utc)


@router.put(
    "/{improvement_id}/owner-edit",
    response_model=ImprovementResponse,
)
def owner_edit_improvement(
    improvement_id: UUID,
    payload: dict[str, Any],
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    improvement = db.query(Improvement).filter(Improvement.id == improvement_id).first()
    if improvement is None:
        raise HTTPException(status_code=404, detail="Improvement not found.")

    if improvement.employee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the improvement owner can edit this improvement.")

    editable_statuses = {
        "in_progress",
        "pending_plant_head",
        "pending_plant_head_final",
        "pending_accounts",
        "resubmission_required",
        "resubmit",
        "resubmission",
    }
    if improvement.status not in editable_statuses:
        raise HTTPException(
            status_code=400,
            detail="Rejected and completed improvements cannot be edited.",
        )

    was_resubmission = improvement.status in {
        "resubmission_required", "resubmit", "resubmission"
    }
    was_in_progress_submission = improvement.status == "in_progress"
    requested_stage = str(improvement.resubmission_stage or "").strip().lower()

    apply_improvement_edit(improvement, payload)

    if was_in_progress_submission:
        improvement.status = "pending_plant_head_final"
        improvement.current_stage = "plant_head_final"
    elif was_resubmission:
        if "final" in requested_stage:
            improvement.status = "pending_plant_head_final"
            improvement.current_stage = "plant_head_final"
        elif "plant" in requested_stage or "head" in requested_stage:
            improvement.status = "pending_plant_head"
            improvement.current_stage = "plant_head"
        else:
            improvement.status = "pending_accounts"
            improvement.current_stage = "accounts"

        improvement.resubmission_description = None
        improvement.resubmission_requested_by = None
        improvement.resubmission_requested_at = None

    db.commit()
    db.refresh(improvement)

    if (was_resubmission or was_in_progress_submission) and improvement.current_stage in {"plant_head", "plant_head_final"}:
        send_new_improvement_to_plant_heads(db, improvement, current_user)
    elif was_resubmission and improvement.current_stage == "accounts":
        send_new_improvement_to_accounts(db, improvement, current_user)

    return improvement


@router.put(
    "/{improvement_id}/reviewer-edit",
    response_model=ImprovementResponse,
)
def reviewer_edit_improvement(
    improvement_id: UUID,
    payload: dict[str, Any],
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    improvement = db.query(Improvement).filter(Improvement.id == improvement_id).first()
    if improvement is None:
        raise HTTPException(status_code=404, detail="Improvement not found.")

    role = getattr(current_user.role, "value", str(current_user.role))

    if role == UserRole.PLANT_HEAD.value:
        if improvement.status not in {
            "pending_plant_head",
            "pending_plant_head_final",
        }:
            raise HTTPException(
                status_code=400,
                detail="Only improvements currently pending Plant Head approval can be edited.",
            )
    elif role == UserRole.ACCOUNTS.value:
        if improvement.status != "pending_accounts":
            raise HTTPException(status_code=400, detail="Only improvements pending Accounts approval can be edited.")
    else:
        raise HTTPException(status_code=403, detail="Only Plant Head or Accounts can use this edit action.")

    apply_improvement_edit(improvement, payload)
    db.commit()
    db.refresh(improvement)
    return improvement


# ============================================================
# UPLOAD MULTIPLE IMPROVEMENT IMAGES
#
# HOD:
#
# - Own improvement -> allowed
# - Employee improvement under HOD -> NOT allowed
# ============================================================

@router.post(
    "/{improvement_id}/images",
)
async def upload_improvement_images(

    improvement_id: UUID,

    files: Annotated[
        list[UploadFile],
        File(
            ...,
            description=(
                "Upload one or more JPG, PNG or WEBP images."
            ),
        ),
    ],

    section: str = Query(
        ...,
        description=(
            "Image section: "
            "problem, countermeasure, or results"
        ),
    ),

    current_user=Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    ),
):

    section_map = {

        "problem":
            "problem_images",

        "countermeasure":
            "countermeasure_images",

        "results":
            "result_images",

    }

    if section not in section_map:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid image section. "
                "Use problem, countermeasure, or results."
            ),
        )

    db_field = section_map[
        section
    ]

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
    # PERMISSION
    # ========================================================

    is_owner = (
        improvement.employee_id
        == current_user.id
    )

    is_accounts = (
        current_user.role
        == UserRole.ACCOUNTS
    )

    is_plant_head = (
        current_user.role
        == UserRole.PLANT_HEAD
    )

    # --------------------------------------------------------
    # HOD:
    #
    # Own improvement = allowed
    # Employee under HOD = NOT allowed
    # --------------------------------------------------------

    if current_user.role == UserRole.HOD:

        if not is_owner:

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "HOD can only upload images "
                    "for their own improvement."
                ),
            )

    elif not (
        is_owner
        or is_accounts
        or is_plant_head
    ):

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission "
                "to upload images for this improvement."
            ),
        )

    if not files:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one image is required.",
        )

    current_images = getattr(
        improvement,
        db_field,
        None,
    )

    if not current_images:

        current_images = []

    else:

        current_images = list(
            current_images
        )

    project_folder = project_storage_name(
        improvement.project_id
    )

    try:

        project_year = (
            improvement.project_id
            .split("/")[1]
        )

    except (
        IndexError,
        AttributeError,
    ):

        project_year = str(
            datetime.now(
                timezone.utc
            ).year
        )

    uploaded_images = []

    for file in files:

        original_name = (
            file.filename
            or "image"
        )

        if file.content_type not in ALLOWED_IMAGE_TYPES:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{original_name} is not a supported "
                    "image type. Please use JPG, PNG or WEBP."
                ),
            )

        file_bytes = await file.read()

        if not file_bytes:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{original_name} is empty."
                ),
            )

        if len(file_bytes) > MAX_IMAGE_SIZE:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{original_name} is larger than 10 MB."
                ),
            )

        suffix = (
            Path(original_name)
            .suffix
            .lower()
        )

        if suffix not in ALLOWED_IMAGE_EXTENSIONS:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{original_name} must be "
                    "JPG, JPEG, PNG or WEBP."
                ),
            )

        unique_name = (

            datetime.now(
                timezone.utc
            ).strftime(
                "%Y%m%d%H%M%S%f"
            )

            + suffix

        )

        storage_path = (

            f"{project_year}/"
            f"{project_folder}/"
            f"{section}/"
            f"{unique_name}"

        )

        try:

            storage_service.upload_image(

                file_bytes=file_bytes,

                storage_path=storage_path,

                content_type=file.content_type,

            )

        except Exception as exc:

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Failed to upload image "
                    f"{original_name}: {str(exc)}"
                ),
            )

        image_record = {

            "name":
                original_name,

            "storage_path":
                storage_path,

            "content_type":
                file.content_type,

            "size":
                len(file_bytes),

        }

        current_images.append(
            image_record
        )

        try:
            image_record["url"] = storage_service.create_signed_url(storage_path, expires_in=3600)
        except Exception:
            image_record["url"] = None

        uploaded_images.append(
            image_record
        )

    setattr(
        improvement,
        db_field,
        current_images,
    )

    improvement.updated_at = (
        datetime.now(
            timezone.utc
        )
    )

    db.commit()

    db.refresh(
        improvement
    )

    return {

        "message":
            f"{len(uploaded_images)} image{'s' if len(uploaded_images) != 1 else ''} "
            "uploaded successfully.",

        "improvement_id":
            str(improvement.id),

        "project_id":
            improvement.project_id,

        "section":
            section,

        "images":
            uploaded_images,

        "total_images_in_section":
            len(current_images),

    }


@router.delete("/{improvement_id}/images")
def delete_improvement_image(improvement_id: UUID, section: str = Query(...), storage_path: str = Query(...), current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    section_map = {"problem": "problem_images", "countermeasure": "countermeasure_images", "results": "result_images"}
    if section not in section_map:
        raise HTTPException(status_code=400, detail="Invalid image section.")
    improvement = db.query(Improvement).filter(Improvement.id == improvement_id).first()
    if improvement is None:
        raise HTTPException(status_code=404, detail="Improvement not found.")
    is_owner = improvement.employee_id == current_user.id
    role = getattr(current_user.role, "value", str(current_user.role))
    if not (is_owner or role in {UserRole.ACCOUNTS.value, UserRole.PLANT_HEAD.value}):
        raise HTTPException(status_code=403, detail="You do not have permission to delete images for this improvement.")
    if is_owner and improvement.status != "in_progress":
        raise HTTPException(status_code=400, detail="Images can only be changed after the improvement is approved to start.")
    db_field = section_map[section]
    current_images = list(getattr(improvement, db_field, None) or [])
    kept_images = [img for img in current_images if not (isinstance(img, dict) and img.get("storage_path") == storage_path)]
    if len(kept_images) == len(current_images):
        raise HTTPException(status_code=404, detail="Image not found in this section.")
    try:
        storage_service.delete_image(storage_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete image: {exc}") from exc
    setattr(improvement, db_field, kept_images)
    improvement.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Image deleted successfully.", "section": section, "storage_path": storage_path}


# ============================================================
# MY IMPROVEMENTS
# ============================================================

@router.get(
    "/my",
    response_model=list[ImprovementResponse],
)
def get_my_improvements(

    current_user=Depends(
        get_current_user
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

    response = []

    for improvement in improvements:

        data = {
            **improvement.__dict__,
            "activity": improvement.activity or [],
            "benefit_type": normalize_benefits(improvement.benefit_type),
        }
        item = ImprovementResponse.model_validate(data)

        item.accounts_verified_by_name = (
            get_accounts_verified_by_name(
                improvement,
                db,
            )
        )

        response.append(
            item
        )

    return response


# ============================================================
# MY SUMMARY
# ============================================================

@router.get(
    "/my/summary",
    response_model=ImprovementSummary,
)
def get_my_summary(

    current_user=Depends(
        get_current_user
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

        .all()

    )

    total = len(
        improvements
    )

    pending_statuses = {

        "draft",

        "pending_accounts",

        "pending_plant_head",

        "pending_hod",

        "pending_plant_head_2",

        "pending_plant_head_3",

        "resubmission_required",

        "resubmit",

        "resubmission",

    }

    pending = sum(

        1

        for item in improvements

        if item.status
        in pending_statuses

    )

    in_progress = sum(

        1

        for item in improvements

        if item.status
        == "in_progress"

    )

    rejected = sum(

        1

        for item in improvements

        if item.status
        == "rejected"

    )

    done = sum(

        1

        for item in improvements

        if item.status
        in {
            "done",
            "closed",
        }

    )

    return ImprovementSummary(

        total=total,

        pending=pending,

        in_progress=in_progress,

        rejected=rejected,

        done=done,

    )


# ============================================================
# ALL IMPROVEMENTS (REFERENCE ONLY)
# ============================================================

@router.get(
    "/all",
    response_model=list[ImprovementResponse],
)
def get_all_improvements_reference(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {UserRole.EMPLOYEE, UserRole.HOD}:
        raise HTTPException(status_code=403, detail="This list is available only to Employees and HODs.")
    improvements = db.query(Improvement).order_by(Improvement.created_at.desc()).all()
    response = []
    for item in improvements:
        employee = db.query(User).filter(User.id == item.employee_id).first()
        response.append(ImprovementResponse.model_validate({
            **item.__dict__,
            "activity": item.activity or [],
            "benefit_type": normalize_benefits(item.benefit_type),
            "employee_name": employee.full_name if employee else None,
            "owner_name": employee.full_name if employee else None,
        }))
    return response


# ============================================================
# GET IMPROVEMENT REFERENCE DETAIL
#
# Employees and HODs can use this read-only endpoint for the
# All Improvements report. It does not grant edit rights.
# ============================================================

@router.get(
    "/all/{improvement_id}",
    response_model=ImprovementResponse,
)
def get_reference_improvement_detail(
    improvement_id: UUID,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {UserRole.EMPLOYEE, UserRole.HOD}:
        raise HTTPException(status_code=403, detail="This reference report is available only to Employees and HODs.")

    improvement = db.query(Improvement).filter(Improvement.id == improvement_id).first()
    if improvement is None:
        raise HTTPException(status_code=404, detail="Improvement not found.")

    owner = db.query(User).filter(User.id == improvement.employee_id).first()
    data = {
        **improvement.__dict__,
        "activity": improvement.activity or [],
        "benefit_type": normalize_benefits(improvement.benefit_type),
        "problem_present_status": improvement.problem_present_status or [],
        "problem_images": prepare_images(improvement.problem_images),
        "countermeasure": improvement.countermeasure or [],
        "countermeasure_images": prepare_images(improvement.countermeasure_images),
        "results": improvement.results or [],
        "result_images": prepare_images(improvement.result_images),
        "cost_saving_items": improvement.cost_saving_items or [],
        "horizontal_deployment": improvement.horizontal_deployment or [],
        "employee_name": owner.full_name if owner else None,
        "owner_name": owner.full_name if owner else None,
        "accounts_verified_by_name": get_accounts_verified_by_name(improvement, db),
    }
    return ImprovementResponse.model_validate(data)


# ============================================================
# GET IMPROVEMENT DETAIL
#
# THIS IS THE IMPORTANT FIX.
#
# HOD can now open:
#
# 1. Their own improvement
# 2. Any improvement created by an employee under them
#
# HOD still cannot edit employee improvements.
# ============================================================

@router.get(
    "/{improvement_id}",
    response_model=ImprovementResponse,
)
def get_improvement_detail(

    improvement_id: UUID,

    current_user=Depends(
        get_current_user
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

    # ========================================================
    # BASIC ACCESS
    # ========================================================

    is_owner = (

        improvement.employee_id
        == current_user.id

    )

    is_accounts = (

        current_user.role
        == UserRole.ACCOUNTS

    )

    is_plant_head = (

        current_user.role
        == UserRole.PLANT_HEAD

    )

    # ========================================================
    # HOD ACCESS
    # ========================================================

    is_hod_team_member = False

    if current_user.role == UserRole.HOD:

        is_hod_team_member = (
            hod_can_view_improvement(
                improvement,
                current_user,
                db,
            )
        )

    # ========================================================
    # FINAL PERMISSION
    # ========================================================

    if not (

        is_owner

        or is_accounts

        or is_plant_head

        or is_hod_team_member

    ):

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission "
                "to view this improvement."
            ),
        )

    # ========================================================
    # ACCOUNTS VERIFIED NAME
    # ========================================================

    accounts_verified_by_name = (
        get_accounts_verified_by_name(
            improvement,
            db,
        )
    )

    # ========================================================
    # RESPONSE
    # ========================================================

    response_data = {

        "id":
            improvement.id,

        "project_id":
            improvement.project_id,

        "employee_id":
            improvement.employee_id,

        "department":
            improvement.department,

        "plant":
            improvement.plant,

        "kaizen_theme":
            improvement.kaizen_theme,

        "idea":
            improvement.idea,

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
            normalize_benefits(improvement.benefit_type),

        # ====================================================
        # PROBLEM
        # ====================================================

        "problem_present_status":
            improvement.problem_present_status
            or [],

        "problem_images":
            prepare_images(
                improvement.problem_images
            ),

        # ====================================================
        # COUNTERMEASURE
        # ====================================================

        "countermeasure":
            improvement.countermeasure
            or [],

        "countermeasure_images":
            prepare_images(
                improvement.countermeasure_images
            ),

        # ====================================================
        # RESULTS
        # ====================================================

        "results":
            improvement.results
            or [],

        "result_images":
            prepare_images(
                improvement.result_images
            ),

        # ====================================================
        # COST SAVING
        # ====================================================

        "cost_saving_items":
            improvement.cost_saving_items
            or [],

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
            improvement.investment_amount
            if improvement.investment_required == "Yes"
            else None,

        "payback_period":
            improvement.payback_period
            if improvement.investment_required == "Yes"
            else None,

        "investment_details":
            improvement.investment_details
            if improvement.investment_required == "Yes"
            else None,

        # ====================================================
        # HORIZONTAL DEPLOYMENT
        # ====================================================

        "horizontal_deployment":
            improvement.horizontal_deployment
            or [],

        # ====================================================
        # ACCOUNTS
        # ====================================================

        "accounts_status":
            improvement.accounts_status,

        "accounts_remarks":
            improvement.accounts_remarks,

        "accounts_verified_by":
            improvement.accounts_verified_by,

        "accounts_verified_by_name":
            accounts_verified_by_name,

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

    return response_data