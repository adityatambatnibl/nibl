from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)


# ============================================================
# CREATE
# ============================================================

class ImprovementCreate(BaseModel):

    # ========================================================
    # SECTION 1
    # ========================================================

    department: str = Field(
        min_length=1,
        max_length=255,
    )

    plant: str = Field(
        min_length=1,
        max_length=255,
    )

    kaizen_theme: str = Field(
        min_length=1,
    )

    idea: str = Field(
        min_length=1,
    )

    target: Optional[str] = None

    kaizen_start: date

    machine: Optional[str] = None

    # ========================================================
    # BENEFIT
    # ========================================================

    activity: list[str] = Field(default_factory=list)

    benefit_type: list[str] = Field(default_factory=list)

    # ========================================================
    # SECTION 2
    # PROBLEM / PRESENT STATUS
    # ========================================================

    problem_present_status: list[
        dict[str, Any]
    ] = Field(
        default_factory=list
    )

    problem_images: list[
        dict[str, Any]
    ] = Field(
        default_factory=list
    )

    # ========================================================
    # SECTION 3
    # COUNTERMEASURE
    # ========================================================

    countermeasure: list[
        dict[str, Any]
    ] = Field(
        default_factory=list
    )

    countermeasure_images: list[
        dict[str, Any]
    ] = Field(
        default_factory=list
    )

    # ========================================================
    # SECTION 4
    # RESULTS
    # ========================================================

    results: list[
        dict[str, Any]
    ] = Field(
        default_factory=list
    )

    result_images: list[
        dict[str, Any]
    ] = Field(
        default_factory=list
    )

    # ========================================================
    # SECTION 5
    # COST SAVING
    # ========================================================

    cost_saving_items: list[
        dict[str, Any]
    ] = Field(
        default_factory=list
    )

    total_monthly_saving: Optional[
        Decimal
    ] = None

    annualized_saving: Optional[
        Decimal
    ] = None

    # ========================================================
    # SECTION 6
    # INVESTMENT / PAYBACK
    # ========================================================

    investment_required: Optional[
        str
    ] = None

    investment_amount: Optional[
        Decimal
    ] = None

    payback_period: Optional[str] = None

    investment_details: Optional[
        str
    ] = None

    # ========================================================
    # SECTION 7
    # HORIZONTAL DEPLOYMENT
    # ========================================================

    horizontal_deployment: list[
        dict[str, Any]
    ] = Field(
        default_factory=list
    )


# ============================================================
# RESPONSE
# ============================================================

class ImprovementResponse(BaseModel):

    model_config = ConfigDict(
        from_attributes=True
    )

    # ========================================================
    # PRIMARY IDENTIFICATION
    # ========================================================

    id: UUID

    project_id: str

    employee_id: UUID

    employee_name: Optional[str] = None
    owner_name: Optional[str] = None

    # ========================================================
    # SECTION 1
    # PROJECT IDENTIFICATION
    # ========================================================

    department: str

    plant: str

    kaizen_theme: str

    idea: str

    target: Optional[str]

    machine: Optional[str]

    kaizen_start: date

    kaizen_end: Optional[date]

    # ========================================================
    # BENEFIT
    # ========================================================

    activity: Optional[list[str]]

    benefit_type: Optional[list[str]]

    # ========================================================
    # SECTION 2
    # PROBLEM / PRESENT STATUS
    # ========================================================

    problem_present_status: Optional[
        list[dict[str, Any]]
    ]

    problem_images: Optional[
        list[dict[str, Any]]
    ]

    # ========================================================
    # SECTION 3
    # COUNTERMEASURE
    # ========================================================

    countermeasure: Optional[
        list[dict[str, Any]]
    ]

    countermeasure_images: Optional[
        list[dict[str, Any]]
    ]

    # ========================================================
    # SECTION 4
    # RESULTS
    # ========================================================

    results: Optional[
        list[dict[str, Any]]
    ]

    result_images: Optional[
        list[dict[str, Any]]
    ]

    # ========================================================
    # SECTION 5
    # COST SAVING
    # ========================================================

    cost_saving_items: Optional[
        list[dict[str, Any]]
    ]

    total_monthly_saving: Optional[
        Decimal
    ]

    annualized_saving: Optional[
        Decimal
    ]

    # ========================================================
    # SECTION 6
    # INVESTMENT / PAYBACK
    # ========================================================

    investment_required: Optional[
        str
    ]

    investment_amount: Optional[
        Decimal
    ]

    payback_period: Optional[
        str
    ]

    investment_details: Optional[
        str
    ]

    # ========================================================
    # SECTION 7
    # HORIZONTAL DEPLOYMENT
    # ========================================================

    horizontal_deployment: Optional[
        list[dict[str, Any]]
    ]

    # ========================================================
    # ACCOUNTS VERIFICATION
    # ========================================================

    accounts_status: Optional[
        str
    ]

    accounts_remarks: Optional[
        str
    ]

    accounts_verified_by: Optional[
        UUID
    ]

    # NEW:
    # Human-readable name of the Accounts user
    # who verified the improvement.
    accounts_verified_by_name: Optional[str]  = None

    accounts_verified_designation: Optional[
        str
    ]

    accounts_verified_at: Optional[
        datetime
    ]

    # ========================================================
    # PLANT HEAD
    # ========================================================

    plant_head_status: Optional[
        str
    ]

    plant_head_remarks: Optional[
        str
    ]

    plant_head_closed_by: Optional[
        UUID
    ]

    plant_head_closed_at: Optional[
        datetime
    ]

    plant_head_signoff_date: Optional[
        date
    ]

    # ========================================================
    # WORKFLOW
    # ========================================================

    status: str

    current_stage: Optional[
        str
    ]

    # ========================================================
    # REJECTION
    # ========================================================

    rejection_description: Optional[
        str
    ]

    rejected_at_stage: Optional[
        str
    ]

    rejected_by: Optional[
        UUID
    ]

    rejected_at: Optional[
        datetime
    ]

    # ========================================================
    # RESUBMISSION
    # ========================================================

    resubmission_description: Optional[
        str
    ]

    resubmission_stage: Optional[
        str
    ]

    resubmission_requested_by: Optional[
        UUID
    ]

    resubmission_requested_at: Optional[
        datetime
    ]

    # ========================================================
    # TIMESTAMPS
    # ========================================================

    created_at: datetime

    updated_at: datetime


# ============================================================
# SUMMARY
# ============================================================

class ImprovementSummary(BaseModel):

    total: int

    pending: int

    in_progress: int

    rejected: int

    done: int