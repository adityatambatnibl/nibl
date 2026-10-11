from datetime import datetime
from zoneinfo import ZoneInfo

from config.settings import settings
from sqlalchemy import select

from database import repo
from models.notification_config import EmailType
from models.user import User
from utils.constants import Role, AccountStatus
from services import email_service

def _now_ist() -> str:
    """Timestamps in emails are shown in the reader's timezone, which is
    the one the scheduler already runs in."""
    tz = ZoneInfo(settings.SCHEDULER_TIMEZONE)
    return datetime.now(tz).strftime("%d %b %Y, %I:%M %p IST")


async def admin_emails() -> list[str]:
    admins = await repo.find_all(
        select(User).where(
            User.role == Role.ADMIN,
            User.is_active.is_(True),
            User.status == AccountStatus.APPROVED,
        )
    )
    return [a.email for a in admins if a.email]


async def _cc() -> list[str]:
    from services import order_notification_service
    cfg = await order_notification_service.get_config()
    return list(cfg.cc_emails)


def _button(label: str, path: str) -> str:
    url = f"{settings.APP_BASE_URL.rstrip('/')}{path}"
    return (
        f'<div style="margin-top:20px;">'
        f'<a href="{url}" style="display:inline-block;padding:10px 18px;'
        f'background:#1f3864;color:#ffffff;text-decoration:none;border-radius:6px;'
        f'font-size:14px;font-weight:bold;">{label}</a></div>'
    )


async def notify_signup_request(user: User) -> bool:
    from services import order_notification_service

    cfg = await order_notification_service.get_config()
    if not cfg.signup_alert_enabled:
        return False

    to = await admin_emails()
    if not to:
        return False

    body = (
        "<p>A new user has requested access to the APQP NPD Tracking system "
        "and is waiting for approval.</p>"
        + email_service.table([
            ("Name", user.name),
            ("Email", user.email),
            ("Requested", _now_ist()),
            ("Status", "Pending approval"),
        ])
        + "<p style='margin-top:16px;'>They cannot log in until an admin approves the "
          "account and assigns permissions.</p>"
        + _button("Review this request", "/admin/approvals")
    )

    return await email_service.send(
        to_emails=to,
        cc_emails=await _cc(),
        subject=f"Access request from {user.name}",
        html_body=email_service.wrap("New account request", body),
        email_type=EmailType.SIGNUP_REQUEST,
        dedupe_key=f"signup:{user.id}",
    )


async def notify_password_reset_request(user: User) -> bool:
    from services import order_notification_service

    cfg = await order_notification_service.get_config()
    if not cfg.password_reset_alert_enabled:
        return False

    to = await admin_emails()
    if not to:
        return False

    body = (
        "<p>A user has asked for a password reset. Everyone signs in through the NIBL "
        "Workspace, so the password is reset there (Workspace admin), not in NPD.</p>"
        + email_service.table([
            ("Name", user.name),
            ("Email", user.email),
            ("Requested", _now_ist()),
            ("Role", user.role),
        ])
        + "<p style='margin-top:20px;font-size:12px;color:#64748b;'>If this user did not "
          "request a reset, do not change their password - contact them first.</p>"
    )

    return await email_service.send(
        to_emails=to,
        cc_emails=await _cc(),
        subject=f"Password reset requested by {user.name}",
        html_body=email_service.wrap("Password reset requested", body),
        email_type=EmailType.PASSWORD_RESET_REQUEST,
    )


async def notify_account_approved(user: User) -> bool:
    """Tells the user their account is live."""
    from services import order_notification_service

    cfg = await order_notification_service.get_config()
    if not getattr(cfg, "approval_email_enabled", True):
        return False

    if not user.email:
        return False

    body = (
        f"<p>Hello {user.name},</p>"
        "<p>Your account for the APQP / Order Development Tracking System has been "
        "approved. You can sign in now using the password you chose when you "
        "requested access.</p>"
        + email_service.table([
            ("Email", user.email),
            ("Status", "Approved - active"),
        ])
        + _button("Sign in", "/login")
        + "<p style='margin-top:20px;font-size:12px;color:#64748b;'>Forgotten your "
          "password? Use <b>Forgot password</b> on the sign-in screen and an admin "
          "will reset it for you.</p>"
    )

    return await email_service.send(
        to_emails=[user.email],
        subject="Your account has been approved",
        html_body=email_service.wrap("Account approved", body),
        email_type=EmailType.ACCOUNT_APPROVED,
        dedupe_key=f"approved:{user.id}",
    )


async def notify_account_rejected(user: User) -> bool:
    """Tells the user their request was not granted."""
    from services import order_notification_service

    cfg = await order_notification_service.get_config()
    if not getattr(cfg, "approval_email_enabled", True):
        return False

    if not user.email:
        return False

    body = (
        f"<p>Hello {user.name},</p>"
        "<p>Your request for access to the APQP / Order Development Tracking System "
        "was not approved at this time.</p>"
        + email_service.table([
            ("Email", user.email),
            ("Status", "Not approved"),
        ])
        + "<p style='margin-top:16px;'>If you believe this is a mistake, please contact "
          "your department head or the system administrator.</p>"
    )

    return await email_service.send(
        to_emails=[user.email],
        subject="Update on your access request",
        html_body=email_service.wrap("Access request update", body),
        email_type=EmailType.ACCOUNT_REJECTED,
        dedupe_key=f"rejected:{user.id}",
    )