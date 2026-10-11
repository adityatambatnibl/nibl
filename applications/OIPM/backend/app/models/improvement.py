import uuid

from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
)

from sqlalchemy.dialects.postgresql import (
    UUID,
    JSONB,
)

from app.db.database import Base


class Improvement(Base):

    __tablename__ = "improvements"

    # ========================================================
    # PRIMARY KEY
    # ========================================================

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    # ========================================================
    # PROJECT IDENTIFICATION
    # ========================================================

    project_id = Column(
        String(50),
        unique=True,
        nullable=False,
    )

    employee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    # ========================================================
    # SECTION 1
    # PROJECT IDENTIFICATION
    # ========================================================

    department = Column(
        String(255),
        nullable=False,
    )

    plant = Column(
        String(255),
        nullable=False,
    )

    kaizen_theme = Column(
        Text,
        nullable=False,
    )

    idea = Column(
        Text,
        nullable=False,
    )

    target = Column(
        Text,
        nullable=True,
    )

    machine = Column(
        String(255),
        nullable=True,
    )

    kaizen_start = Column(
        Date,
        nullable=False,
    )

    kaizen_end = Column(
        Date,
        nullable=True,
    )

    # ========================================================
    # OPTIONAL / LEGACY PROJECT FIELDS
    # ========================================================

    project_idea = Column(
        Text,
        nullable=True,
    )

    cycle_month = Column(
        String(100),
        nullable=True,
    )

    date_opened = Column(
        Date,
        nullable=True,
    )

    activity = Column(
        JSONB,
        nullable=True,
    )

    benefit_type = Column(
        JSONB,
        nullable=True,
    )

    sponsor_hod_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    # ========================================================
    # SECTION 2
    # PROBLEM / PRESENT STATUS
    # ========================================================

    problem_present_status = Column(
        JSONB,
        nullable=True,
    )

    problem_images = Column(
        JSONB,
        nullable=True,
    )

    # ========================================================
    # SECTION 3
    # COUNTERMEASURE / ENGINEERING SOLUTION
    # ========================================================

    countermeasure = Column(
        JSONB,
        nullable=True,
    )

    countermeasure_images = Column(
        JSONB,
        nullable=True,
    )

    # ========================================================
    # SECTION 4
    # RESULTS
    # ========================================================

    results = Column(
        JSONB,
        nullable=True,
    )

    result_images = Column(
        JSONB,
        nullable=True,
    )

    # ========================================================
    # SECTION 5
    # COST SAVING CALCULATION
    # ========================================================

    cost_saving_items = Column(
        JSONB,
        nullable=True,
    )

    total_monthly_saving = Column(
        Numeric(15, 2),
        nullable=True,
    )

    annualized_saving = Column(
        Numeric(15, 2),
        nullable=True,
    )

    # ========================================================
    # SECTION 6
    # INVESTMENT REQUIRED / PAYBACK
    # ========================================================

    investment_required = Column(
        String(10),
        nullable=True,
    )

    investment_amount = Column(
        Numeric(15, 2),
        nullable=True,
    )

    payback_period = Column(
        Text,
        nullable=True,
    )

    investment_details = Column(
        Text,
        nullable=True,
    )

    # ========================================================
    # SECTION 7
    # SCOPE & PLAN FOR HORIZONTAL DEPLOYMENT
    # ========================================================

    horizontal_deployment = Column(
        JSONB,
        nullable=True,
    )

    # ========================================================
    # ACCOUNTS / FINANCE
    # ========================================================

    accounts_status = Column(
        String(50),
        nullable=True,
    )

    accounts_remarks = Column(
        Text,
        nullable=True,
    )

    accounts_verified_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    accounts_verified_designation = Column(
        String(150),
        nullable=True,
    )

    accounts_verified_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ========================================================
    # PLANT HEAD
    # ========================================================

    plant_head_status = Column(
        String(50),
        nullable=True,
    )

    plant_head_remarks = Column(
        Text,
        nullable=True,
    )

    plant_head_closed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    plant_head_closed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    plant_head_signoff_date = Column(
        Date,
        nullable=True,
    )

    # ========================================================
    # WORKFLOW
    # ========================================================

    status = Column(
        String(50),
        nullable=False,
        default="pending_accounts",
    )

    current_stage = Column(
        String(50),
        nullable=True,
    )

    # ========================================================
    # REJECTION
    # ========================================================

    rejection_description = Column(
        Text,
        nullable=True,
    )

    rejected_at_stage = Column(
        String(50),
        nullable=True,
    )

    rejected_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    rejected_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ========================================================
    # RESUBMISSION
    # ========================================================

    resubmission_description = Column(
        Text,
        nullable=True,
    )

    resubmission_stage = Column(
        String(50),
        nullable=True,
    )

    resubmission_requested_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    resubmission_requested_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ========================================================
    # TIMESTAMPS
    # ========================================================

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(
            timezone.utc
        ),
        nullable=False,
    )

    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(
            timezone.utc
        ),
        onupdate=lambda: datetime.now(
            timezone.utc
        ),
        nullable=False,
    )