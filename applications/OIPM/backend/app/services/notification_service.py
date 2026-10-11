"""
OIPM Email Notifications

Centralized notification helpers.

All OIPM notification emails use one common NRB/OIPM
HTML email template.

Email failures are logged and do not roll back a
successful OIPM database action.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
import os
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.models.improvement import Improvement
from app.services.gmail_service import send_email


logger = logging.getLogger(__name__)
# ============================================================
# BENEFIT DISPLAY HELPER
# ============================================================

BENEFIT_LABELS = {
    "P": "P - Productivity",
    "Q": "Q - Quality",
    "C": "C - Cost",
    "D": "D - Delivery",
    "S": "S - Safety",
    "M": "M - Morale",
}


def _first_benefit_label(value) -> str:
    """Return only the first selected benefit with its full label."""
    if isinstance(value, list):
        value = value[0] if value else None
    if value is None:
        return "Not specified"
    value = str(value).strip()
    if not value:
        return "Not specified"
    return BENEFIT_LABELS.get(value.upper(), value)



# ============================================================
# OIPM / NRB EMAIL DESIGN
# ============================================================

NRB_LOGO_URL = "https://nrbindustrialbearings.com/img/logo.jpg"

DASHBOARD_URL = os.getenv(
    "FRONTEND_URL",
    "http://nibl",
)


# ============================================================
# COMMON HTML TEMPLATE
# ============================================================

def _build_html_email(
    title: str,
    greeting: str,
    message: str,
    details: Optional[list[tuple[str, str]]] = None,
    button_text: str = "Open Dashboard",
    button_url: Optional[str] = None,
) -> str:
    """
    Builds the common NRB/OIPM branded email template.

    Every OIPM notification uses this same design.
    Only the content changes.
    """

    details = details or []

    if button_url is None:
        button_url = DASHBOARD_URL

    details_html = ""

    if details:

        rows = ""

        for label, value in details:

            rows += f"""
            <tr>
                <td style="
                    padding:10px 12px;
                    border-bottom:1px solid #eeeeee;
                    color:#667085;
                    font-size:12px;
                    font-weight:700;
                    width:38%;
                ">
                    {label}
                </td>

                <td style="
                    padding:10px 12px;
                    border-bottom:1px solid #eeeeee;
                    color:#172033;
                    font-size:12px;
                    font-weight:600;
                ">
                    {value}
                </td>
            </tr>
            """

        details_html = f"""
        <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="
                margin:22px 0;
                border:1px solid #e5e7eb;
                border-radius:10px;
                overflow:hidden;
                background:#ffffff;
            "
        >
            {rows}
        </table>
        """

    return f"""
<!DOCTYPE html>

<html>

<body
    style="
        margin:0;
        padding:25px 12px;
        background:#f2f4f7;
        font-family:Segoe UI,Arial,sans-serif;
    "
>

<table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
>

<tr>

<td align="center">

<table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
        max-width:680px;
        background:#ffffff;
        border-radius:14px;
        overflow:hidden;
        box-shadow:0 5px 20px rgba(15,23,42,0.10);
    "
>

<!-- ======================================================
     TOP RED BAR
     ====================================================== -->

<tr>

<td
    height="6"
    style="
        background:#c91515;
        font-size:0;
        line-height:0;
    "
>
&nbsp;
</td>

</tr>


<!-- ======================================================
     HEADER
     ====================================================== -->

<tr>

<td
    align="center"
    style="
        padding:28px 25px 20px 25px;
        background:#ffffff;
    "
>

<img
    src="{NRB_LOGO_URL}"
    alt="NRB Industrial Bearings"
    width="170"
    style="
        display:block;
        width:170px;
        max-width:60%;
        height:auto;
        margin:0 auto 17px auto;
        border-radius:5px;
    "
>


<div
    style="
        color:#c91515;
        font-size:11px;
        font-weight:800;
        letter-spacing:2px;
        text-transform:uppercase;
        margin-bottom:6px;
    "
>
NIBL INTERNAL WORKSPACE
</div>


<h1
    style="
        margin:0;
        color:#172033;
        font-size:22px;
        line-height:1.3;
        font-weight:800;
    "
>
{title}
</h1>

</td>

</tr>


<!-- ======================================================
     CONTENT
     ====================================================== -->

<tr>

<td
    style="
        padding:5px 28px 30px 28px;
    "
>

<div
    style="
        padding:20px;
        border:1px solid #e5e7eb;
        border-radius:10px;
        background:#ffffff;
    "
>

<p
    style="
        margin:0 0 15px 0;
        color:#172033;
        font-size:14px;
        font-weight:700;
    "
>
{greeting}
</p>


<div
    style="
        color:#475467;
        font-size:13px;
        line-height:1.7;
    "
>
{message}
</div>


{details_html}


<div
    style="
        text-align:center;
        margin-top:25px;
    "
>

<a
    href="{button_url}"
    style="
        display:inline-block;
        padding:11px 22px;
        border-radius:8px;
        background:#c91515;
        color:#ffffff;
        text-decoration:none;
        font-size:12px;
        font-weight:800;
    "
>
{button_text}
</a>

</div>

</div>

</td>

</tr>


<!-- ======================================================
     FOOTER
     ====================================================== -->

<tr>

<td
    style="
        padding:20px 25px;
        background:#f8f9fb;
        border-top:1px solid #edf0f4;
        text-align:center;
        color:#98a2b3;
        font-size:11px;
        line-height:1.6;
    "
>

<strong
    style="
        color:#475467;
        font-size:12px;
    "
>
NIBL Internal Workspace Team
</strong>



<br>

This is an automated notification from the Internal Workspace system

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
"""


# ============================================================
# EMAIL SENDER WRAPPER
# ============================================================

def _send(
    recipient: str | None,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
) -> bool:

    if not recipient:
        return False

    try:

        send_email(
            recipient=recipient,
            subject=subject,
            body=body,
            html_body=html_body,
        )

        logger.info(
            "OIPM email sent to %s: %s",
            recipient,
            subject,
        )

        return True

    except Exception:

        logger.exception(
            "OIPM email failed to %s: %s",
            recipient,
            subject,
        )

        return False


# ============================================================
# ROLE HELPER
# ============================================================

def _role_value(user: User) -> str:

    return getattr(
        user.role,
        "value",
        str(user.role),
    )


# ============================================================
# 1. NEW USER REGISTRATION â†’ ADMIN
# ============================================================

def send_account_registration_notification(
    db: Session,
    user: User,
) -> int:
    """
    Notify every active Admin about a newly registered user.
    """

    users = (
        db.query(User)
        .filter(
            User.is_active.is_(True)
        )
        .all()
    )

    admins = [
        u
        for u in users
        if _role_value(u)
        == UserRole.ADMIN.value
    ]
    aditya_email = "aditya.tambat@nibl.in"

    recipients = {
        admin.email
        for admin in admins
        if admin.email
    }

    recipients.add(aditya_email)

    subject = "NIBL INTERNAL WORKSPACE | New Account Registration"

    plain_body = (
        "Hello Admin,\n\n"
        "A new user has registered for the NIBL Internal Workspace system "
        "and is waiting for account approval.\n\n"
        f"Name: {user.full_name}\n"
        f"Employee Code: {user.employee_code}\n"
        f"Email: {user.email}\n"
        f"Role: {_role_value(user)}\n\n"
        "Please log in to the NIBL Internal Workspace system to review "
        "the registration.\n\n"
        "Regards,\n"
        "NIBL Internal Workspace Team"
    )

    html_body = _build_html_email(

        title="New Account Registration",

        greeting="Hello Admin,",

        message=(
            "A new user has registered for the "
            "NIBL Internal Workspace system and is waiting for "
            "account approval."
        ),

        details=[
            ("Name", user.full_name),
            (
                "Employee Code",
                str(user.employee_code),
            ),
            ("Email", user.email),
            (
                "Role",
                _role_value(user),
            ),
        ],
    )

    return sum(
        _send(
            recipient,
            subject,
            plain_body,
            html_body,
        )
        for recipient in recipients
    )


# ============================================================
# 2. ADMIN APPROVED ACCOUNT â†’ USER
# ============================================================

def send_account_approved_email(
    user: User,
) -> bool:

    subject = "NIBL Internal Workspace | Account Approved"

    plain_body = (
        f"Hello {user.full_name},\n\n"
        "Your NIBL Internal Workspace account has been approved by Admin. "
        "You can now log in to the NIBL Internal Workspace system using your "
        "registered email address and password.\n\n"
        "If you need to change your password, please contact Admin.\n\n"
        "Regards,\n"
        "NIBL Internal Workspace Team"
    )

    html_body = _build_html_email(

        title="Account Approved",

        greeting=f"Hello {user.full_name},",

        message=(
            "Your NIBL Internal Workspace account has been approved by Admin. "
            "You can now log in to the system using "
            "your registered email address and password."
            "<br><br>"
            "If you need to change your password, "
            "please contact Admin."
        ),

        details=[
            (
                "Account Status",
                "Approved",
            ),
            (
                "Email",
                user.email,
            ),
        ],
    )

    return _send(
        user.email,
        subject,
        plain_body,
        html_body,
    )


# ============================================================
# 3. ADMIN REJECTED ACCOUNT â†’ USER
# ============================================================

def send_account_rejected_email(
    user: User,
) -> bool:

    subject = "NIBL Internal Workspace system | Account Registration Rejected"

    plain_body = (
        f"Hello {user.full_name},\n\n"
        "Your NIBL Internal Workspace account registration has been rejected "
        "by Admin.\n\n"
        "Please contact Admin for further information.\n\n"
        "Regards,\n"
        "NIBL Internal Workspace Team"
    )

    html_body = _build_html_email(

        title="Account Registration Rejected",

        greeting=f"Hello {user.full_name},",

        message=(
            "Your NIBL Internal Workspace account registration has been "
            "rejected by Admin."
            "<br><br>"
            "Please contact Admin for further information."
        ),

        details=[
            (
                "Account Status",
                "Rejected",
            ),
            (
                "Email",
                user.email,
            ),
        ],
    )

    return _send(
        user.email,
        subject,
        plain_body,
        html_body,
    )


# ============================================================
# 4. PASSWORD CHANGED â†’ USER
# ============================================================

def send_password_changed_email(
    user: User,
    new_password: str,
) -> bool:
    """
    Notify the user after the system changes their password.

    The new password is intentionally included in the email
    according to the current OIPM password-reset requirement.
    """

    subject = "NIBL Internal Workspace system | Password Changed"

    plain_body = (
        f"Hello {user.full_name},\n\n"
        "Your NIBL Internal Workspace system password has been successfully changed.\n\n"
        f"Email: {user.email}\n"
        f"Employee Code: {user.employee_code}\n"
        f"New Password: {new_password}\n\n"
        "You can now log in to the NIBL Internal Workspace system using "
        "your new password.\n\n"
        "Regards,\n"
        "NIBL Internal Workspace Team"
    )

    html_body = _build_html_email(

        title="Password Changed",

        greeting=f"Hello {user.full_name},",

        message=(
            "Your NIBL Internal Workspace system password has been successfully changed."
            "<br><br>"
            "You can now log in using the credentials below."
        ),

        details=[
            (
                "Email",
                user.email,
            ),
            (
                "Employee Code",
                str(user.employee_code),
            ),
            (
                "New Password",
                str(new_password),
            ),
        ],

        button_text="Login to NIBL System ",
    )

    return _send(
        user.email,
        subject,
        plain_body,
        html_body,
    )


# ============================================================
# 5. NEW IMPROVEMENT â†’ ACCOUNTS
# ============================================================

def send_new_improvement_to_accounts(
    db: Session,
    improvement: Improvement,
    owner: Optional[User] = None,
) -> int:
    """
    Notify every active Accounts user about
    a new improvement awaiting approval.
    """

    users = (
        db.query(User)
        .filter(
            User.is_active.is_(True)
        )
        .all()
    )

    accounts_users = [
        u
        for u in users
        if _role_value(u)
        == UserRole.ACCOUNTS.value
    ]

    owner_name = (
        owner.full_name
        if owner
        else "OIPM User"
    )

    benefit = _first_benefit_label(getattr(improvement, "benefit_type", None))

    subject = (
        "NIBL OIPM | New Improvement Awaiting Accounts Approval"
    )

    plain_body = (
        "Hello,\n\n"
        "A new improvement has been submitted and is waiting "
        "for Accounts approval.\n\n"
        f"Improvement ID: {improvement.project_id}\n"
        f"Owner: {owner_name}\n"
        f"Benefit: {benefit}\n\n"
        "Please log in to the OIPM dashboard to review "
        "the improvement.\n\n"
        "Regards,\n"
        "NIBL OIPM Team"
    )

    html_body = _build_html_email(

        title="New Improvement Awaiting Approval",

        greeting="Hello,",

        message=(
            "A new improvement has been submitted "
            "and is waiting for Accounts approval."
        ),

        details=[
            (
                "Improvement ID",
                str(improvement.project_id),
            ),
            (
                "Owner",
                owner_name,
            ),
            (
                "Benefit",
                str(benefit),
            ),
            (
                "Current Stage",
                "Accounts Approval",
            ),
        ],
    )

    return sum(
        _send(
            account.email,
            subject,
            plain_body,
            html_body,
        )
        for account in accounts_users
    )


# ============================================================
# 6. IMPROVEMENT STATUS â†’ OWNER
# ============================================================

def send_improvement_status_email(
    owner: Optional[User],
    project_id: str,
    action: str,
    details: str,
) -> bool:

    if owner is None:
        return False

    subject = (
        f"NIBL OIPM | Improvement {action}"
    )

    plain_body = (
        f"Hello {owner.full_name},\n\n"
        f"Your improvement {project_id} has been "
        f"{action.lower()}.\n\n"
        f"{details}\n\n"
        "Please log in to the OIPM dashboard for more details.\n\n"
        "Regards,\n"
        "NIBL OIPM Team"
    )

    html_body = _build_html_email(

        title=f"Improvement {action}",

        greeting=f"Hello {owner.full_name},",

        message=(
            f"Your improvement <strong>"
            f"{project_id}"
            f"</strong> has been "
            f"{action.lower()}."
            "<br><br>"
            f"{details}"
        ),

        details=[
            (
                "Improvement ID",
                str(project_id),
            ),
            (
                "Status",
                action,
            ),
        ],
    )

    return _send(
        owner.email,
        subject,
        plain_body,
        html_body,
    )


# ============================================================
# 7. NEW IMPROVEMENT â†’ PLANT HEADS
# ============================================================

def send_new_improvement_to_plant_heads(
    db: Session,
    improvement: Improvement,
    owner: Optional[User] = None,
) -> int:
    """
    Notify every active Plant Head about a new
    improvement awaiting approval.
    """

    users = (
        db.query(User)
        .filter(
            User.is_active.is_(True)
        )
        .all()
    )

    plant_heads = [
        u
        for u in users
        if _role_value(u)
        == UserRole.PLANT_HEAD.value
    ]

    owner_name = (
        owner.full_name
        if owner
        else "OIPM User"
    )

    benefit = _first_benefit_label(getattr(improvement, "benefit_type", None))

    subject = (
        "NIBL OIPM | New Improvement Awaiting Plant Head Approval"
    )

    plain_body = (
        "Hello,\n\n"
        "An improvement is waiting for Plant Head approval.\n\n"
        f"Improvement ID: {improvement.project_id}\n"
        f"Owner: {owner_name}\n"
        f"Benefit: {benefit}\n\n"
        "Please log in to the OIPM dashboard to review "
        "the improvement.\n\n"
        "Regards,\n"
        "NIBL OIPM Team"
    )

    html_body = _build_html_email(

        title="Improvement Awaiting Plant Head Approval",

        greeting="Hello,",

        message=(
            "An improvement has reached the Plant Head "
            "approval stage and is waiting for review."
        ),

        details=[
            (
                "Improvement ID",
                str(improvement.project_id),
            ),
            (
                "Owner",
                owner_name,
            ),
            (
                "Benefit",
                str(benefit),
            ),
            (
                "Current Stage",
                "Plant Head Approval",
            ),
        ],
    )

    return sum(
        _send(
            plant_head.email,
            subject,
            plain_body,
            html_body,
        )
        for plant_head in plant_heads
    )


# ============================================================
# 8. DAILY PLANT HEAD SUMMARY
# ============================================================

def send_daily_plant_head_summary(
    db: Session,
    target_date=None,
) -> int:
    """
    Send OIPM summary to all active Plant Heads.

    Summary contains:

    Overall:
        - All Improvements
        - All Completed / Closed
        - All Rejected

    Target date:
        - Yesterday's New Improvements
        - Yesterday's Completed / Closed
        - Yesterday's Rejected
    """

    if target_date is None:

        target_date = (
            datetime.now(timezone.utc)
            - timedelta(days=1)
        ).date()


    # ========================================================
    # TARGET DATE RANGE
    # ========================================================

    start = datetime.combine(
        target_date,
        datetime.min.time(),
        tzinfo=timezone.utc,
    )

    end = datetime.combine(
        target_date,
        datetime.max.time(),
        tzinfo=timezone.utc,
    )


    # ========================================================
    # OVERALL COUNTS
    # ========================================================

    all_improvements = (
        db.query(Improvement)
        .count()
    )


    all_completed_closed = (
        db.query(Improvement)
        .filter(
            Improvement.status.in_(
                [
                    "closed",
                    "done",
                ]
            )
        )
        .count()
    )


    all_rejected = (
        db.query(Improvement)
        .filter(
            Improvement.status == "rejected"
        )
        .count()
    )


    # ========================================================
    # YESTERDAY'S COUNTS
    # ========================================================

    yesterday_new_improvements = (
        db.query(Improvement)
        .filter(
            Improvement.created_at >= start,
            Improvement.created_at <= end,
        )
        .count()
    )


    yesterday_completed_closed = (
        db.query(Improvement)
        .filter(
            Improvement.updated_at >= start,
            Improvement.updated_at <= end,
            Improvement.status.in_(
                [
                    "closed",
                    "done",
                ]
            ),
        )
        .count()
    )


    yesterday_rejected = (
        db.query(Improvement)
        .filter(
            Improvement.updated_at >= start,
            Improvement.updated_at <= end,
            Improvement.status == "rejected",
        )
        .count()
    )


    # ========================================================
    # GET ACTIVE PLANT HEADS
    # ========================================================

    users = (
        db.query(User)
        .filter(
            User.is_active.is_(True)
        )
        .all()
    )


    plant_heads = [
        u
        for u in users
        if _role_value(u)
        == UserRole.PLANT_HEAD.value
    ]


    # ========================================================
    # EMAIL CONTENT
    # ========================================================

    date_display = target_date.strftime(
        "%d-%b-%Y"
    )


    subject = (
        f"NIBL OIPM | Daily Summary | "
        f"{date_display}"
    )


    plain_body = (
        "Hello,\n\n"
        f"Here is the OIPM activity summary "
        f"for {date_display}.\n\n"
        "Overall OIPM:\n"
        f"All Improvements: {all_improvements}\n"
        f"All Completed / Closed: {all_completed_closed}\n"
        f"All Rejected: {all_rejected}\n\n"
        f"Yesterday's Activity ({date_display}):\n"
        f"New Improvements: {yesterday_new_improvements}\n"
        f"Completed / Closed: {yesterday_completed_closed}\n"
        f"Rejected: {yesterday_rejected}\n\n"
        "Regards,\n"
        "NIBL OIPM Team"
    )


    # ========================================================
    # HTML EMAIL
    # ========================================================

    html_body = _build_html_email(

        title="Daily OIPM Summary",

        greeting="Hello Plant Head,",

        message=(
            f"Here is the OIPM activity summary "
            f"for <strong>{date_display}</strong>."
        ),

        details=[
            (
                "All Improvements",
                str(all_improvements),
            ),
            (
                "All Completed / Closed",
                str(all_completed_closed),
            ),
            (
                "All Rejected",
                str(all_rejected),
            ),
            (
                "Yesterday's New Improvements",
                str(yesterday_new_improvements),
            ),
            (
                "Yesterday's Completed / Closed",
                str(yesterday_completed_closed),
            ),
            (
                "Yesterday's Rejected",
                str(yesterday_rejected),
            ),
        ],

        button_text="Open Dashboard",
    )


    # ========================================================
    # SEND TO ALL PLANT HEADS
    # ========================================================

    return sum(
        _send(
            plant_head.email,
            subject,
            plain_body,
            html_body,
        )
        for plant_head in plant_heads
    )
