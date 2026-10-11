from datetime import datetime
import os
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)

from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_refresh_token,
)

from app.db.database import get_db

from app.models.user import (
    User,
    UserRole,
    RegistrationStatus,
)

from app.schemas.user import (
    TokenResponse,
    UserLogin,
    UserResponse,
    UserSignup,
)

from app.services.notification_service import (
    send_account_registration_notification,
    send_password_changed_email,
)
from app.core.config import cookie_secure


# ============================================================
# AUTHENTICATION ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication"],
)


# ============================================================
# REGISTER
# ============================================================

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: UserSignup,
    db: Session = Depends(get_db),
):

    email = (
        payload.email
        .lower()
        .strip()
    )

    employee_code = (
        payload.employee_code
        .strip()
    )


    if not email.endswith(("@nibl.in", "@nibc.in", "@niblkorta.in")):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only NIBL email addresses "
                "are allowed."
            ),
        )


    existing_employee = (
        db.query(User)
        .filter(
            User.employee_code ==
            employee_code
        )
        .first()
    )


    if existing_employee:

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This employee code "
                "is already registered."
            ),
        )


    hod = None


    if payload.role == UserRole.EMPLOYEE:

        if payload.hod_id:

            hod = (
                db.query(User)
                .filter(
                    User.id ==
                    payload.hod_id,

                    User.role ==
                    UserRole.HOD,

                    User.is_active.is_(True),

                    User.registration_status ==
                    RegistrationStatus.APPROVED,
                )
                .first()
            )


            if not hod:

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Selected HOD is "
                        "not available."
                    ),
                )


    else:

        if payload.hod_id is not None:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Only employees can "
                    "have an HOD."
                ),
            )


    user = User(

        full_name=(
            payload.full_name
            .strip()
        ),

        employee_code=(
            employee_code
        ),

        email=(
            email
        ),

        password_hash=(
            hash_password(
                payload.password
            )
        ),

        role=(
            payload.role
        ),

        hod_id=(
            hod.id
            if hod
            else None
        ),

        registration_status=(
            RegistrationStatus.PENDING
        ),

        is_active=False,

        approved_at=None,

        rejected_at=None,
    )


    db.add(user)

    db.commit()

    db.refresh(user)


    send_account_registration_notification(
        db,
        user,
    )


    return user


# ============================================================
# LOGIN
# ============================================================

@router.post(
    "/login",
    response_model=TokenResponse,
)
def login(
    payload: UserLogin,
    response: Response,
    db: Session = Depends(get_db),
):

    email = (
        payload.email
        .lower()
        .strip()
    )


    users = (
        db.query(User)
        .filter(
            User.email == email
        )
        .order_by(
            User.created_at.desc()
        )
        .all()
    )


    if not users:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Invalid email or password."
            ),
        )


    password_matches = []


    for user in users:

        try:

            if verify_password(
                payload.password,
                user.password_hash,
            ):

                password_matches.append(
                    user
                )

        except Exception:

            continue


    if not password_matches:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Invalid email or password."
            ),
        )


    approved_users = [

        user

        for user in password_matches

        if user.registration_status ==
        RegistrationStatus.APPROVED

        and user.is_active
    ]


    if approved_users:

        user = approved_users[0]


    else:

        pending_users = [

            user

            for user in password_matches

            if user.registration_status ==
            RegistrationStatus.PENDING
        ]


        if pending_users:

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Your registration is "
                    "pending administrator approval. "
                    "You will be able to login "
                    "after the administrator approves "
                    "your account."
                ),
            )


        rejected_users = [

            user

            for user in password_matches

            if user.registration_status ==
            RegistrationStatus.REJECTED
        ]


        if rejected_users:

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Your registration has been "
                    "rejected by the administrator. "
                    "Please contact the administrator."
                ),
            )


        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is not "
                "authorized to login."
            ),
        )


    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is currently inactive."
            ),
        )


    if (
        user.registration_status !=
        RegistrationStatus.APPROVED
    ):

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account has not "
                "been approved yet."
            ),
        )


    # ========================================================
    # CREATE ACCESS TOKEN
    # ========================================================

    access_token = create_access_token(
        str(user.id)
    )


    # ========================================================
    # CREATE REFRESH TOKEN
    # ========================================================

    refresh_token = create_refresh_token(
        str(user.id)
    )


    # ========================================================
    # STORE REFRESH TOKEN
    # ========================================================

    response.set_cookie(
        key="oipm_refresh_token",

        value=refresh_token,

        httponly=True,

        secure=cookie_secure(),

        samesite="lax",

        max_age=30 * 24 * 60 * 60,

        path="/api/v1/auth",
    )


    # ========================================================
    # RETURN ACCESS TOKEN
    # ========================================================

    return {

        "access_token":
            access_token,

        "token_type":
            "bearer",

        "user":
            user,
    }


# ============================================================
# REFRESH ACCESS TOKEN
# ============================================================

@router.post(
    "/refresh",
    response_model=TokenResponse,
)
def refresh_access_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # READ HTTPONLY REFRESH COOKIE
    # --------------------------------------------------------

    # The NIBL portal signs people in once and leaves a portal_refresh_token
    # cookie (same signing key, same format), so opening OIPM from the
    # portal card needs no second sign-in. OIPM's own approval checks below
    # still decide whether the person may use OIPM.
    refresh_token = request.cookies.get(
        "oipm_refresh_token"
    ) or request.cookies.get(
        "portal_refresh_token"
    )


    if not refresh_token:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Refresh token is missing. "
                "Please log in again."
            ),
        )


    # --------------------------------------------------------
    # VERIFY REFRESH TOKEN
    # --------------------------------------------------------

    user_id = verify_refresh_token(
        refresh_token
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
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "User account could not "
                "be found."
            ),
        )


    # --------------------------------------------------------
    # ACTIVE CHECK
    # --------------------------------------------------------

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is inactive."
            ),
        )


    # --------------------------------------------------------
    # APPROVAL CHECK
    # --------------------------------------------------------

    if (
        user.registration_status !=
        RegistrationStatus.APPROVED
    ):

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is not approved."
            ),
        )


    # --------------------------------------------------------
    # CREATE NEW ACCESS TOKEN
    # --------------------------------------------------------

    access_token = create_access_token(
        str(user.id)
    )


    # --------------------------------------------------------
    # ROTATE REFRESH TOKEN
    #
    # This gives the browser a fresh 30-day
    # refresh token as well.
    # --------------------------------------------------------

    new_refresh_token = create_refresh_token(
        str(user.id)
    )


    response.set_cookie(
        key="oipm_refresh_token",

        value=new_refresh_token,

        httponly=True,

        secure=cookie_secure(),

        samesite="lax",

        max_age=30 * 24 * 60 * 60,

        path="/api/v1/auth",
    )


    # --------------------------------------------------------
    # RETURN NEW ACCESS TOKEN
    # --------------------------------------------------------

    return {

        "access_token":
            access_token,

        "token_type":
            "bearer",

        "user":
            user,
    }


# ============================================================
# LOGOUT
# ============================================================

@router.post(
    "/logout",
)
def logout(
    response: Response,
):

    response.delete_cookie(
        key="oipm_refresh_token",

        path="/api/v1/auth",
    )


    return {
        "message":
            "Logged out successfully."
    }


# ============================================================
# GET ACTIVE / APPROVED HODS
# ============================================================

@router.get(
    "/hods",
    response_model=list[UserResponse],
)
def get_hods(
    db: Session = Depends(get_db),
):

    return (
        db.query(User)

        .filter(

            User.role ==
            UserRole.HOD,

            User.is_active.is_(True),

            User.registration_status ==
            RegistrationStatus.APPROVED,
        )

        .order_by(
            User.full_name
        )

        .all()
    )


# ============================================================
# FORGOT PASSWORD
# ============================================================
#
# User provides:
#
#     Email
#     Employee Code
#
# Both must match the same approved/active account.
#
# If both match:
#
#     1. Generate new password
#     2. Update password in database
#     3. Send new credentials to the user's email
#
# Password format:
#
#     FirstName#DDMMYYYY
#
# Example:
#
#     Yash#29082026
#
# ============================================================

@router.post(
    "/forgot-password",
)
def forgot_password(
    payload: dict,
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # READ EMAIL
    # --------------------------------------------------------

    email = (
        str(
            payload.get(
                "email",
                "",
            )
        )
        .lower()
        .strip()
    )


    # --------------------------------------------------------
    # READ EMPLOYEE CODE
    # --------------------------------------------------------

    employee_code = (
        str(
            payload.get(
                "employee_code",
                "",
            )
        )
        .strip()
    )


    # --------------------------------------------------------
    # VALIDATE EMAIL
    # --------------------------------------------------------

    if not email:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Please enter your registered "
                "NIBL email address."
            ),
        )


    # --------------------------------------------------------
    # VALIDATE EMPLOYEE CODE
    # --------------------------------------------------------

    if not employee_code:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Please enter your employee code."
            ),
        )


    # --------------------------------------------------------
    # FIND USER
    #
    # Email AND employee code must match.
    # --------------------------------------------------------

    user = (
        db.query(User)
        .filter(
            User.email == email,

            User.employee_code ==
            employee_code,
        )
        .first()
    )


    if user is None:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Email and employee code "
                "do not match."
            ),
        )


    # --------------------------------------------------------
    # ACCOUNT MUST BE APPROVED AND ACTIVE
    # --------------------------------------------------------

    if (
        user.registration_status !=
        RegistrationStatus.APPROVED
        or not user.is_active
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This account is not currently "
                "eligible for a password change."
            ),
        )


    # ========================================================
    # GENERATE NEW PASSWORD
    # ========================================================

    import secrets

    SPECIAL_CHARACTERS = "!@#$%^&*"
    DIGITS = "0123456789"

    first_name = (
        user.full_name
        .strip()
        .split()[0]
    )

    first_name = (
        first_name[:1].upper()
        + first_name[1:].lower()
    )

    special_character = secrets.choice(
        SPECIAL_CHARACTERS
    )

    random_numbers = "".join(
        secrets.choice(DIGITS)
        for _ in range(4)
    )

    new_password = (
        f"{first_name}"
        f"{special_character}"
        f"{random_numbers}"
    )


    # ========================================================
    # UPDATE PASSWORD
    # ========================================================

    user.password_hash = (
        hash_password(
            new_password
        )
    )


    db.commit()

    db.refresh(user)


    # ========================================================
    # SEND NEW PASSWORD TO USER
    # ========================================================

    email_sent = (
        send_password_changed_email(
            user=user,
            new_password=new_password,
        )
    )


    # ========================================================
    # EMAIL FAILURE
    # ========================================================

    if not email_sent:

        return {

            "success": True,

            "message": (
                "Your password has been changed, "
                "but the password email could not "
                "be sent. Please contact Admin."
            ),
        }


    # ========================================================
    # SUCCESS
    # ========================================================

    return {

        "success": True,

        "message": (
            "Your password has been changed "
            "successfully. The new password has "
            "been sent to your registered email."
        ),
    }