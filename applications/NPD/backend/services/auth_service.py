from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select

from database import repo
from models.user import User
from schemas.auth import LoginRequest, OipmSsoRequest, RequestAccessRequest, SignupRequest, UserOut
from services import notification_service
from utils.constants import AccountStatus, DEFAULT_USER_PERMISSIONS, Role
from utils.security import create_access_token, hash_password, verify_password
from config.settings import settings
from jose import JWTError, jwt


def to_user_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id),
        name=user.name,
        email=user.email,
        role=user.role,
        status=user.status,
        permissions=user.permissions,
        last_login=user.last_login,
        must_change_password=user.must_change_password,
    )


def by_email(email: str):
    """
    Look an account up by email, case-insensitively.

    The unique index is on lower(email), so matching the same way means this
    lookup uses the index instead of scanning, and a row that somehow got
    stored with different casing is still found.
    """
    return select(User).where(func.lower(User.email) == email.strip().lower())


async def signup(data: SignupRequest) -> User:
    existing = await repo.find_one(by_email(data.email))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")

    is_first = await repo.count(select(User)) == 0

    user = User(
        name=data.name.strip(),
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        role=Role.USER,
        status=AccountStatus.PENDING,
        permissions=list(DEFAULT_USER_PERMISSIONS),
    )

    # Two people submitting the same address at once still lose the race at
    # the unique index. Inside a savepoint that violation costs only the
    # insert, so we can answer 409 instead of failing the whole request.
    try:
        async with repo.savepoint():
            await repo.add(user)
    except repo.IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")

    if not is_first:
        await notification_service.notify_signup(str(user.id), user.name, user.email)

        try:
            from services import admin_alert_service
            await admin_alert_service.notify_signup_request(user)
        except Exception:
            pass

    return user


async def login(data: LoginRequest) -> tuple[str, User]:
    user = await repo.find_one(by_email(data.email))

    if not user or not user.password_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")

    if not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated.")

    if user.status == AccountStatus.PENDING:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account is awaiting admin approval.")

    if user.status == AccountStatus.REJECTED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account request was rejected.")

    # A loaded row is tracked by the session; the change goes out with the
    # request's commit. No explicit save is needed any more.
    user.last_login = datetime.now(timezone.utc)

    token = create_access_token(str(user.id), {"role": user.role})
    return token, user


async def sso_login(data: OipmSsoRequest) -> tuple[str, User]:
    """
    Exchange a valid OIPM access token for an NPD session.

    The OIPM token proves the identity of the person launching NPD.
    NPD then applies its own user/approval/active checks.
    """
    user = await sso_user(data)
    user.last_login = datetime.now(timezone.utc)
    token = create_access_token(str(user.id), {"role": user.role})
    return token, user


async def sso_check(data: OipmSsoRequest) -> dict:
    """
    Can this OIPM user open NPD? Asked by the OIPM launcher BEFORE it leaves
    the page, so a user without access sees a pop-up there instead of being
    sent to an NPD error screen. Issues no session and changes nothing.
    """
    try:
        await sso_user(data)
    except HTTPException as exc:
        return {"allowed": False, "message": str(exc.detail)}
    return {"allowed": True, "message": None}


async def sso_user(data: OipmSsoRequest) -> User:
    """Validates the OIPM token and NPD approval. Raises with a clear message."""
    if not settings.OIPM_JWT_SECRET:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "NPD SSO is not configured. Set OIPM_JWT_SECRET in the NPD backend environment.",
        )

    try:
        payload = jwt.decode(
            data.oipm_access_token,
            settings.OIPM_JWT_SECRET,
            algorithms=[settings.OIPM_JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Your OIPM session is invalid or has expired. Please sign in again.",
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid OIPM access token.",
        )

    subject = payload.get("sub")
    if not subject:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid OIPM access token.",
        )

    try:
        subject_uuid = UUID(str(subject))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid OIPM user identity.",
        )

    # Current sync reuses public.users.id as user_apqp.id. The supabase_id
    # fallback also supports accounts that were backfilled before that rule.
    user = await repo.find_one(
        select(User).where(
            or_(
                User.id == subject_uuid,
                User.supabase_id == subject_uuid,
            )
        )
    )

    if not user:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your NPD account has not been created yet. Please wait for NPD account synchronization.",
        )

    if not user.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your NPD account is inactive. Please contact the NPD administrator.",
        )

    if user.status == AccountStatus.PENDING:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your NPD access is pending administrator approval.",
        )

    if user.status == AccountStatus.REJECTED:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your NPD access request has been rejected. Please contact the NPD administrator.",
        )

    if user.status != AccountStatus.APPROVED:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your NPD account is not approved for access.",
        )

    return user


async def request_access(data: RequestAccessRequest) -> User:
    """
    A visitor asks for an account. No password here -
    the admin sets the first password when approving.
    """
    existing = await repo.find_one(by_email(data.email))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")

    user = User(
        name=data.full_name.strip(),
        email=data.email.lower(),
        department=data.department,
        password_hash="",                 # admin sets this on approval
        role=Role.USER,
        status=AccountStatus.PENDING,
        permissions=list(DEFAULT_USER_PERMISSIONS),
        must_change_password=True,
    )
    try:
        async with repo.savepoint():
            await repo.add(user)
    except repo.IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")

    await notification_service.notify_signup(str(user.id), user.name, user.email)

    try:
        from services import admin_alert_service
        await admin_alert_service.notify_signup_request(user)
    except Exception:
        pass

    return user
