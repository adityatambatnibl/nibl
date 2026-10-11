"""
Portal emails - same look and same SMTP settings as OIPM (template copied from
applications/OIPM/backend/app/services/notification_service.py).
"""
import logging, os, smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger("portal.email")

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
NIBL Application Portal
</strong>



<br>

This is an automated notification from the NIBL Application Portal

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



# ============================================================
# SMTP (same settings as OIPM: SMTP_HOST, SMTP_PORT, SMTP_USERNAME,
# SMTP_PASSWORD, SMTP_USE_TLS, SMTP_FROM_EMAIL)
# ============================================================

def send_email(recipient: str, subject: str, body: str, html_body: Optional[str] = None) -> None:
    from app.core.config import settings

    if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        raise RuntimeError("SMTP_USERNAME / SMTP_PASSWORD are not set in portal/backend/.env.")
    message = MIMEMultipart("alternative")
    message.attach(MIMEText(body or "", "plain", "utf-8"))
    if html_body:
        message.attach(MIMEText(html_body, "html", "utf-8"))
    message["From"] = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
    message["To"] = recipient
    message["Subject"] = subject
    if settings.SMTP_USE_TLS:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            server.ehlo(); server.starttls(); server.ehlo()
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(message)
    else:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(message)


def send_password_email(user, new_password: str, reason: str = "changed") -> bool:
    """The new password is sent by email - the existing OIPM password-reset rule."""
    subject = "NIBL Application Portal | Password Changed"
    plain = (
        f"Hello {user.full_name},\n\n"
        "Your NIBL password has been changed.\n\n"
        f"Email: {user.email}\nEmployee Code: {user.employee_code}\nNew Password: {new_password}\n\n"
        "Use it to sign in to the NIBL Application Portal. It works for every application you are approved for.\n\n"
        "Regards,\nNIBL Application Portal"
    )
    html = _build_html_email(
        title="Password Changed",
        greeting=f"Hello {user.full_name},",
        message=("Your NIBL password has been changed.<br><br>"
                 "Use the credentials below to sign in. They work for every application you are approved for."),
        details=[("Email", user.email), ("Employee Code", str(user.employee_code)), ("New Password", str(new_password))],
        button_text="Sign in to NIBL",
    )
    try:
        send_email(user.email, subject, plain, html)
        logger.info("Password email sent to %s", user.email)
        return True
    except Exception:
        logger.exception("Password email failed to %s", user.email)
        return False
