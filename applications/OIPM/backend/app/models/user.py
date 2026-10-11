import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    String,
)

from sqlalchemy.dialects.postgresql import UUID

from sqlalchemy.orm import relationship

from sqlalchemy.sql import func

from app.db.database import Base


# ============================================================
# USER ROLES
# ============================================================

class UserRole(str, enum.Enum):

    ADMIN = "admin"

    PLANT_HEAD = "plant_head"

    HOD = "hod"

    EMPLOYEE = "employee"

    ACCOUNTS = "accounts"


# ============================================================
# REGISTRATION STATUS
# ============================================================

class RegistrationStatus(str, enum.Enum):

    PENDING = "pending"

    APPROVED = "approved"

    REJECTED = "rejected"


# ============================================================
# USER MODEL
# ============================================================

class User(Base):

    __tablename__ = "users"


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
    # BASIC INFORMATION
    # ========================================================

    full_name = Column(
        String(150),

        nullable=False,
    )


    employee_code = Column(
        String(50),

        unique=True,

        nullable=False,

        index=True,
    )


    # ========================================================
    # EMAIL
    #
    # IMPORTANT:
    #
    # Email is intentionally NOT unique.
    #
    # Multiple accounts can now register using the same email
    # address with different roles.
    #
    # Example:
    #
    # yash.davkhar@nibl.in → employee
    # yash.davkhar@nibl.in → admin
    #
    # Admin approval determines which account becomes active.
    # ========================================================

    email = Column(
        String(255),

        nullable=False,

        index=True,
    )


    # ========================================================
    # PASSWORD
    # ========================================================

    password_hash = Column(
        String(255),

        nullable=False,
    )


    # ========================================================
    # ROLE
    #
    # SQLAlchemy stores the actual enum VALUES:
    #
    # admin
    # plant_head
    # hod
    # employee
    # accounts
    # ========================================================

    role = Column(
        Enum(
            UserRole,

            name="user_role",

            values_callable=lambda enum_class: [
                member.value
                for member in enum_class
            ],
        ),

        nullable=False,
    )


    # ========================================================
    # HOD RELATIONSHIP
    #
    # Employees can have an assigned HOD.
    #
    # HOD / Plant Head / Accounts / Admin may have NULL.
    # ========================================================

    hod_id = Column(
        UUID(as_uuid=True),

        ForeignKey(
            "users.id",

            ondelete="SET NULL",
        ),

        nullable=True,
    )


    # ========================================================
    # REGISTRATION STATUS
    #
    # New registration:
    #
    #     pending
    #
    # Admin approves:
    #
    #     approved
    #
    # Admin rejects:
    #
    #     rejected
    # ========================================================

    registration_status = Column(
        Enum(
            RegistrationStatus,

            name="registration_status",

            values_callable=lambda enum_class: [
                member.value
                for member in enum_class
            ],
        ),

        nullable=False,

        default=RegistrationStatus.PENDING,

        server_default="pending",
    )


    # ========================================================
    # ACTIVE STATUS
    #
    # A newly registered user should NOT be able to login
    # until the administrator approves the registration.
    #
    # New users:
    #
    #     is_active = False
    #
    # After Admin approval:
    #
    #     is_active = True
    # ========================================================

    is_active = Column(
        Boolean,

        default=False,

        server_default="false",

        nullable=False,
    )


    # ========================================================
    # APPROVAL TIMESTAMP
    #
    # Records when Admin approved the registration.
    # ========================================================

    approved_at = Column(
        DateTime(timezone=True),

        nullable=True,
    )


    # ========================================================
    # REJECTION TIMESTAMP
    #
    # Records when Admin rejected the registration.
    # ========================================================

    rejected_at = Column(
        DateTime(timezone=True),

        nullable=True,
    )


    # ========================================================
    # TIMESTAMPS
    # ========================================================

    created_at = Column(
        DateTime(timezone=True),

        server_default=func.now(),

        nullable=False,
    )


    updated_at = Column(
        DateTime(timezone=True),

        server_default=func.now(),

        onupdate=func.now(),

        nullable=False,
    )


    # ========================================================
    # HOD RELATIONSHIP
    # ========================================================

    hod = relationship(
        "User",

        remote_side=[id],

        backref="employees",
    )