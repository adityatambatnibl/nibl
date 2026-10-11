from datetime import date, datetime, timezone
from pathlib import Path
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.models.draft import Draft
from app.models.improvement import Improvement
from app.services.financial_service import normalize_cost_saving_items, calculate_payback_period, applicable_saving, normalize_saving_type
from app.schemas.draft import DraftCreate, DraftResponse
from app.api.improvements import generate_project_id
from app.services.notification_service import (
    send_new_improvement_to_plant_heads,
)
from app.services.storage_service import storage_service


# ============================================================
# LOCAL DRAFT IMAGE LIFECYCLE
# ============================================================

def _iter_image_items(payload):
    if not isinstance(payload, dict):
        return

    for key in (
        "problem_images",
        "countermeasure_images",
        "result_images",
    ):
        images = payload.get(key) or []

        if isinstance(images, list):
            for image in images:
                if isinstance(image, dict):
                    yield image


def _move_draft_images_to_improvement(
    image_payload,
    project_id,
):
    """
    Move all draft images into the final improvement folder
    when the draft is submitted.
    """

    current_year = date.today().year

    migrated_payload = {}

    for field_name in (
        "problem_images",
        "countermeasure_images",
        "result_images",
    ):

        images = image_payload.get(field_name) or []

        migrated_images = []

        for image in images:

            image_copy = dict(image)

            storage_path = image_copy.get("storage_path")

            if not storage_path:
                migrated_images.append(image_copy)
                continue

            # Already in final improvement storage.
            if not storage_path.startswith("drafts/"):
                migrated_images.append(image_copy)
                continue

            path_parts = Path(storage_path).parts

            if len(path_parts) < 5:
                raise ValueError(
                    f"Invalid draft image path: {storage_path}"
                )

            section = path_parts[3]
            filename = path_parts[4]

            project_folder = project_id.replace("/", "-")

            destination_path = (
                f"{current_year}/"
                f"{project_folder}/"
                f"{section}/"
                f"{filename}"
            )

            storage_service.move_image(
                storage_path,
                destination_path,
            )

            image_copy["storage_path"] = destination_path

            image_copy["url"] = (
                storage_service.create_signed_url(
                    destination_path,
                    expires_in=3600,
                )
            )

            migrated_images.append(image_copy)

        migrated_payload[field_name] = migrated_images

    return migrated_payload


router = APIRouter(
    prefix="/api/v1/drafts",
    tags=["Improvement Drafts"],
)


# ============================================================
# HELPERS
# ============================================================

def _owner_draft(
    draft_id: UUID,
    current_user,
    db: Session,
):
    draft = (
        db.query(Draft)
        .filter(Draft.id == draft_id)
        .first()
    )

    if draft is None:
        raise HTTPException(
            status_code=404,
            detail="Draft not found.",
        )

    if draft.employee_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail=(
                "Only the draft owner can "
                "access this draft."
            ),
        )

    return draft


def _normalize_decimal(value):
    """
    Convert financial values saved by the frontend
    into values accepted by Pydantic Decimal fields.

    Examples:

        323891
        "323891"
        "3,23,891"
        "₹ 3,23,891"

    all become:

        Decimal("323891")

    Empty values become None.
    """

    if value is None:
        return None

    if isinstance(value, Decimal):
        return value

    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        return Decimal(str(value))

    value = str(value).strip()

    if not value:
        return None

    # Remove currency symbol and thousands separators.
    value = value.replace("₹", "")
    value = value.replace(",", "")
    value = value.strip()

    if not value:
        return None

    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid financial value. "
                "Please enter a valid numeric amount."
            ),
        )


def _normalize_date(value):
    """
    Accept both ISO dates and the application's
    displayed DD-MM-YYYY format.
    """

    if value in (None, ""):
        return None

    if isinstance(value, date):
        return value

    value = str(value).strip()

    # Standard API format.
    try:
        return date.fromisoformat(
            value[:10]
        )
    except ValueError:
        pass

    # Application display format.
    try:
        return datetime.strptime(
            value,
            "%d-%m-%Y",
        ).date()
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid date supplied. "
                "Please use a valid date."
            ),
        ) from exc


def _normalize_array(value):
    """
    Normalize Activity / Benefit values.

    Supports:

        None
        []
        ["JH", "PM"]
        "JH"
        '["JH", "PM"]'
    """

    if value is None:
        return []

    if isinstance(value, list):
        return [
            str(item).strip()
            for item in value
            if str(item).strip()
        ]

    if isinstance(value, str):
        value = value.strip()

        if not value:
            return []

        # Handle JSON array saved as a string.
        try:
            import json

            parsed = json.loads(value)

            if isinstance(parsed, list):
                return [
                    str(item).strip()
                    for item in parsed
                    if str(item).strip()
                ]

        except (ValueError, TypeError):
            pass

        # Backward compatibility for old single-value records.
        return [value]

    return [str(value).strip()]


def _refresh_draft_image_urls(payload):
    """
    Return draft payload with only real/persisted image records.

    A draft can contain temporary browser File/preview objects while
    the form is open. Those must never be stored as image records.
    Only records with a permanent storage path or a usable URL are
    retained. Duplicate records for the same stored image are removed.
    """
    refreshed = dict(payload or {})

    for field in (
        "problem_images",
        "countermeasure_images",
        "result_images",
    ):
        images = refreshed.get(field)

        if not isinstance(images, list):
            refreshed[field] = []
            continue

        updated_images = []
        seen = set()

        for image in images:
            if not isinstance(image, dict):
                continue

            item = dict(image)

            storage_path = (
                item.get("storage_path")
                or item.get("path")
            )

            existing_url = (
                item.get("url")
                or item.get("signed_url")
                or item.get("signedUrl")
                or item.get("signedURL")
                or item.get("public_url")
                or item.get("publicUrl")
            )

            # A name-only object is normally the placeholder created
            # by the browser before its File is uploaded. Do not keep it.
            if not storage_path and not existing_url:
                continue

            # Prefer the permanent storage path as the unique identity.
            # Fall back to URL for legacy records.
            identity = (
                f"path:{storage_path}"
                if storage_path
                else f"url:{existing_url}"
            )

            if identity in seen:
                continue

            seen.add(identity)

            if storage_path:
                item["storage_path"] = storage_path

                try:
                    signed_url = (
                        storage_service.create_signed_url(
                            storage_path,
                            expires_in=3600,
                        )
                    )

                    if signed_url:
                        item["url"] = signed_url

                except Exception:
                    # Keep an existing URL if signing temporarily fails.
                    pass

            updated_images.append(item)

        refreshed[field] = updated_images

    return refreshed



def _json_safe(value):
    """Convert Decimal values inside JSON/JSONB data to JSON-safe numbers."""
    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, list):
        return [_json_safe(item) for item in value]

    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}

    return value


def _draft_number(value):
    if value in (None, ""):
        return None
    try:
        return float(_normalize_decimal(value))
    except HTTPException:
        return None


def _recalculate_draft_financials(payload):
    """
    Rebuild draft financial values every time a draft is saved.

    Drafts are allowed to be incomplete, so this helper never applies
    the strict final-submission validation. It only recalculates values
    when enough information is present and otherwise keeps the draft
    usable.
    """
    clean = dict(payload or {})
    raw_items = clean.get("cost_saving_items")

    if not isinstance(raw_items, list):
        return clean

    normalized_items = []

    for raw in raw_items:
        if not isinstance(raw, dict):
            continue

        item = dict(raw)

        try:
            saving_type = normalize_saving_type(
                item.get("saving_type")
            )
        except ValueError:
            saving_type = "recurring"

        item["saving_type"] = saving_type

        particular = str(
            item.get("particular") or ""
        ).strip()
        item["particular"] = particular

        if saving_type == "one_time":
            item["before"] = None
            item["after"] = None
            item["monthly_saving"] = None
            one_time = _draft_number(
                item.get("one_time_saving")
            )
            item["one_time_saving"] = (
                one_time
                if one_time is not None
                else item.get("one_time_saving")
            )
            item.pop("duration_months", None)
        else:
            before = _draft_number(
                item.get("before")
            )
            after = _draft_number(
                item.get("after")
            )

            if before is not None and after is not None:
                monthly = max(
                    0.0,
                    before - after,
                )
            else:
                monthly = _draft_number(
                    item.get("monthly_saving")
                )

            item["before"] = (
                before
                if before is not None
                else item.get("before")
            )
            item["after"] = (
                after
                if after is not None
                else item.get("after")
            )
            item["monthly_saving"] = (
                round(monthly, 2)
                if monthly is not None
                else item.get("monthly_saving")
            )
            item["one_time_saving"] = None

            if saving_type == "limited":
                duration = _draft_number(
                    item.get("duration_months")
                )
                if duration is not None:
                    item["duration_months"] = int(duration)
            else:
                item.pop("duration_months", None)

        if particular:
            item["sl_no"] = len(normalized_items) + 1
            normalized_items.append(item)

    clean["cost_saving_items"] = normalized_items

    total_monthly = sum(
        float(item.get("monthly_saving") or 0)
        for item in normalized_items
        if normalize_saving_type(
            item.get("saving_type")
        ) != "one_time"
    )

    clean["total_monthly_saving"] = (
        round(total_monthly, 2)
        if normalized_items
        else None
    )

    clean["annualized_saving"] = (
        applicable_saving(normalized_items)
        if normalized_items
        else None
    )

    if clean.get("investment_required") != "Yes":
        clean["payback_period"] = None
    else:
        clean["payback_period"] = (
            calculate_payback_period(
                clean.get("investment_amount"),
                normalized_items,
            )
            if normalized_items
            else None
        )

    return clean


def _prepare_submission_data(data):
    """
    Prepare draft data before it is validated by
    ImprovementCreate.

    This keeps the frontend free to store/display
    formatted values while the backend receives
    proper API types.
    """

    clean_data = dict(data)

    # ========================================================
    # ACTIVITY / BENEFIT
    # ========================================================

    clean_data["activity"] = _normalize_array(
        clean_data.get("activity")
    )

    clean_data["benefit_type"] = _normalize_array(
        clean_data.get("benefit_type")
    )

    # ========================================================
    # DATE
    # ========================================================

    if clean_data.get("kaizen_start") not in (
        None,
        "",
    ):
        clean_data["kaizen_start"] = (
            _normalize_date(
                clean_data.get(
                    "kaizen_start"
                )
            )
        )

    if clean_data.get("kaizen_end") not in (
        None,
        "",
    ):
        clean_data["kaizen_end"] = (
            _normalize_date(
                clean_data.get(
                    "kaizen_end"
                )
            )
        )

    # ========================================================
    # FINANCIAL VALUES
    # ========================================================

    clean_data["total_monthly_saving"] = (
        _normalize_decimal(
            clean_data.get(
                "total_monthly_saving"
            )
        )
    )

    clean_data["annualized_saving"] = (
        _normalize_decimal(
            clean_data.get(
                "annualized_saving"
            )
        )
    )

    clean_data["investment_amount"] = (
        _normalize_decimal(
            clean_data.get(
                "investment_amount"
            )
        )
    )

    # Investment values must exist only when the user explicitly
    # selected Yes. This also cleans older drafts that still contain
    # an amount after the Yes -> No/blank change.
    if clean_data.get("investment_required") != "Yes":
        clean_data["investment_amount"] = None
        clean_data["payback_period"] = None
        clean_data["investment_details"] = None

    # ========================================================
    # COST SAVING ITEMS
    #
    # Keep the existing structure but normalize common
    # numeric fields if they are present.
    # ========================================================

    cost_saving_items = (
        clean_data.get(
            "cost_saving_items"
        )
    )

    if isinstance(
        cost_saving_items,
        list,
    ):
        normalized_items = []

        for item in cost_saving_items:

            if not isinstance(
                item,
                dict,
            ):
                normalized_items.append(
                    item
                )
                continue

            normalized_item = dict(item)

            normalized_item["saving_type"] = normalized_item.get("saving_type") or "recurring"

            for key in (
                "before",
                "after",
                "monthly_saving",
                "one_time_saving",
                "required_amount",
            ):
                if key in normalized_item:
                    normalized_item[key] = (
                        _normalize_decimal(
                            normalized_item[key]
                        )
                    )

            if normalized_item.get("duration_months") not in (None, ""):
                try:
                    normalized_item["duration_months"] = int(float(normalized_item["duration_months"]))
                except (TypeError, ValueError):
                    normalized_item["duration_months"] = normalized_item["duration_months"]

            normalized_items.append(
                normalized_item
            )

        clean_data[
            "cost_saving_items"
        ] = normalized_items

    return clean_data


# ============================================================
# LIST DRAFTS
# ============================================================

@router.get(
    "",
    response_model=list[DraftResponse],
)
def list_drafts(
    current_user=Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    ),
):
    drafts = (
        db.query(Draft)
        .filter(
            Draft.employee_id
            == current_user.id
        )
        .order_by(
            Draft.updated_at.desc()
        )
        .all()
    )
    for draft in drafts:
        draft.payload = _refresh_draft_image_urls(draft.payload)
    return drafts


# ============================================================
# CREATE / UPDATE DRAFT
# ============================================================

@router.post(
    "",
    response_model=DraftResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_or_update_draft(
    payload: DraftCreate,
    current_user=Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    ),
):

    draft_id = payload.draft_id
    draft = None

    if draft_id:
        try:
            draft = _owner_draft(
                UUID(str(draft_id)),
                current_user,
                db,
            )
        except ValueError:
            draft = None

    clean_payload = dict(
        payload.payload or {}
    )

    clean_payload.pop(
        "draft_id",
        None,
    )

    clean_payload = _recalculate_draft_financials(
        clean_payload
    )

    if draft is None:

        draft = Draft(
            employee_id=current_user.id,
            payload=clean_payload,
        )

        db.add(draft)

    else:

        draft.payload = clean_payload

        draft.updated_at = (
            datetime.now(
                timezone.utc
            )
        )

    db.commit()

    db.refresh(
        draft
    )

    draft.payload = _refresh_draft_image_urls(
        draft.payload
    )

    return draft


# ============================================================
# GET DRAFT
# ============================================================

@router.get(
    "/{draft_id}",
    response_model=DraftResponse,
)
def get_draft(
    draft_id: UUID,
    current_user=Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    ),
):
    draft = _owner_draft(
        draft_id,
        current_user,
        db,
    )
    draft.payload = _refresh_draft_image_urls(draft.payload)
    return draft


# ============================================================
# DELETE DRAFT
# ============================================================

@router.delete(
    "/{draft_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_draft(
    draft_id: UUID,
    current_user=Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    ),
):

    draft = _owner_draft(
        draft_id,
        current_user,
        db,
    )

    db.delete(
        draft
    )

    db.commit()


# ============================================================
# DRAFT IMAGE UPLOAD
# ============================================================

@router.post("/{draft_id}/images")
async def upload_draft_images(
    draft_id: UUID,
    files: list[UploadFile] = File(...),
    section: str = Query(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draft = _owner_draft(draft_id, current_user, db)
    section_map = {
        "problem": "problem_images",
        "countermeasure": "countermeasure_images",
        "results": "result_images",
    }
    if section not in section_map:
        raise HTTPException(status_code=400, detail="Invalid image section.")
    if not files:
        raise HTTPException(status_code=400, detail="At least one image is required.")

    import uuid as uuid_module
    allowed = {"image/jpeg", "image/png", "image/webp"}
    max_size = 10 * 1024 * 1024
    payload = _refresh_draft_image_urls(
        draft.payload
    )
    field = section_map[section]
    current_images = list(
        payload.get(field) or []
    )

    for file in files:
        if file.content_type not in allowed:
            raise HTTPException(status_code=400, detail=f"{file.filename or 'Image'} is not a supported image type.")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail=f"{file.filename or 'Image'} is empty.")
        if len(data) > max_size:
            raise HTTPException(status_code=400, detail=f"{file.filename or 'Image'} is larger than 10 MB.")
        suffix = Path(file.filename or "image").suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(status_code=400, detail="Images must be JPG, JPEG, PNG or WEBP.")

        storage_path = f"drafts/{current_user.id}/{draft.id}/{section}/{uuid_module.uuid4().hex}{suffix}"
        storage_service.upload_image(data, storage_path, file.content_type)
        url = storage_service.create_signed_url(storage_path, expires_in=3600)
        current_images.append({
            "name": file.filename or "image",
            "storage_path": storage_path,
            "content_type": file.content_type,
            "size": len(data),
            "url": url,
        })

    payload[field] = current_images
    draft.payload = payload
    draft.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(draft)

    refreshed_payload = _refresh_draft_image_urls(
        draft.payload
    )
    draft.payload = refreshed_payload
    draft.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(draft)

    return {
        "message": "Draft images uploaded successfully.",
        "images": refreshed_payload.get(
            field,
            [],
        ),
    }


# ============================================================
# SUBMIT DRAFT
# ============================================================

@router.post(
    "/{draft_id}/submit",
    response_model=dict,
)
def submit_draft(
    draft_id: UUID,
    current_user=Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    ),
):

    draft = _owner_draft(
        draft_id,
        current_user,
        db,
    )

    # ========================================================
    # COPY DRAFT DATA
    # ========================================================

    data = dict(
        draft.payload or {}
    )

    # ========================================================
    # NORMALIZE DATA BEFORE VALIDATION
    #
    # This is the important fix.
    # ========================================================

    data = _prepare_submission_data(
        data
    )

    # ========================================================
    # REQUIRED FIELDS
    # ========================================================

    required = {
        "department": (
            data.get("department")
            or data.get("department_line")
        ),
        "plant": data.get("plant"),
        "kaizen_theme": data.get(
            "kaizen_theme"
        ),
        "idea": data.get("idea"),
        "kaizen_start": data.get(
            "kaizen_start"
        ),
        "activity": data.get(
            "activity"
        ) or [],
        "benefit_type": data.get(
            "benefit_type"
        ) or [],
    }

    missing = [
        key
        for key, value in required.items()
        if value in (
            None,
            "",
            [],
        )
    ]

    if missing:

        raise HTTPException(
            status_code=400,
            detail=(
                "Please complete the required "
                "fields before submitting: "
                + ", ".join(missing)
                + "."
            ),
        )

    # ========================================================
    # VALIDATE AGAINST IMPROVEMENT SCHEMA
    # ========================================================

    try:

        from app.schemas.improvement import (
            ImprovementCreate,
        )

        validation_data = {
            **data,
            **required,
        }

        validated = (
            ImprovementCreate.model_validate(
                validation_data
            )
        )

    except HTTPException:
        raise

    except Exception as exc:

        detail = getattr(
            exc,
            "errors",
            lambda: str(exc),
        )()

        raise HTTPException(
            status_code=400,
            detail=detail,
        ) from exc

    # ========================================================
    # CREATE IMPROVEMENT
    # ========================================================

    now = datetime.now(
        timezone.utc
    )

    try:
        normalized_cost_items, total_monthly_saving = normalize_cost_saving_items(validated.cost_saving_items or [])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    annualized_saving = (
        applicable_saving(normalized_cost_items)
        if normalized_cost_items else None
    )
    calculated_payback = (
        calculate_payback_period(validated.investment_amount, normalized_cost_items)
        if validated.investment_required == "Yes" else None
    )

    project_id = generate_project_id(
        db
    )

    # ========================================================
    # MOVE DRAFT IMAGES INTO FINAL IMPROVEMENT STORAGE
    # ========================================================

    migrated_images = _move_draft_images_to_improvement(
        {
            "problem_images": validated.problem_images or [],
            "countermeasure_images": validated.countermeasure_images or [],
            "result_images": validated.result_images or [],
        },
        project_id,
    )

    validated = validated.model_copy(
        update=migrated_images
    )

    improvement = Improvement(

        project_id=project_id,

        employee_id=current_user.id,

        department=(
            validated.department.strip()
        ),

        plant=(
            validated.plant.strip()
        ),

        kaizen_theme=(
            validated.kaizen_theme.strip()
        ),

        idea=(
            validated.idea.strip()
        ),

        target=(
            validated.target.strip()
            if validated.target
            else None
        ),

        machine=(
            validated.machine.strip()
            if validated.machine
            else None
        ),

        activity=_json_safe(
            validated.activity
        ),

        benefit_type=_json_safe(
            validated.benefit_type
        ),

        kaizen_start=(
            validated.kaizen_start
        ),

        kaizen_end=None,

        # ====================================================
        # PROBLEM
        # ====================================================

        problem_present_status=_json_safe(
            validated.problem_present_status
        ),

        problem_images=_json_safe(
            validated.problem_images
            or []
        ),

        # ====================================================
        # COUNTERMEASURE
        # ====================================================

        countermeasure=_json_safe(
            validated.countermeasure
        ),

        countermeasure_images=_json_safe(
            validated.countermeasure_images
            or []
        ),

        # ====================================================
        # RESULTS
        # ====================================================

        results=_json_safe(
            validated.results
        ),

        result_images=_json_safe(
            validated.result_images
            or []
        ),

        # ====================================================
        # COST SAVING
        # ====================================================

        cost_saving_items=_json_safe(
            normalized_cost_items
        ),

        total_monthly_saving=(
            total_monthly_saving
        ),

        annualized_saving=(
            annualized_saving
        ),

        # ====================================================
        # INVESTMENT
        # ====================================================

        investment_required=(
            validated.investment_required
        ),

        investment_amount=(
            validated.investment_amount
        ),

        payback_period=(
            calculated_payback
        ),

        investment_details=(
            validated.investment_details
        ),

        # ====================================================
        # HORIZONTAL DEPLOYMENT
        # ====================================================

        horizontal_deployment=_json_safe(
            validated.horizontal_deployment
            or []
        ),

        # ====================================================
        # WORKFLOW
        # ====================================================

        status="pending_plant_head",

        current_stage="plant_head",

        # ====================================================
        # TIMESTAMP
        # ====================================================

        created_at=now,

        updated_at=now,
    )

    db.add(
        improvement
    )

    # ========================================================
    # DELETE DRAFT ONLY AFTER IMPROVEMENT IS READY
    # ========================================================

    db.delete(
        draft
    )

    db.commit()

    db.refresh(
        improvement
    )

    # ========================================================
    # NOTIFY PLANT HEADS
    # ========================================================

    send_new_improvement_to_plant_heads(
        db,
        improvement,
        current_user,
    )

    return {
        "message": (
            "Draft submitted successfully."
        ),
        "improvement_id": str(
            improvement.id
        ),
        "project_id": (
            improvement.project_id
        ),
    }