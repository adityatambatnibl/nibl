
import base64
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Legacy Google OAuth compatibility
# ---------------------------------------------------------------------------
# The OIPM API still imports the OAuth helper functions from this module.
# They are kept unchanged so the existing application starts normally and
# existing OAuth endpoints are not broken. Actual email sending below uses
# SMTP instead of Gmail API OAuth.
#
# These can be removed later as a separate cleanup after SMTP is confirmed.
# ---------------------------------------------------------------------------

GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send"
SCOPES = [GMAIL_SCOPE]

BASE_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
    )
)

CREDENTIALS_FILE = os.getenv(
    "GMAIL_CREDENTIALS_FILE",
    "credentials.json",
)

TOKEN_FILE = os.getenv(
    "GMAIL_TOKEN_FILE",
    "token.json",
)

REDIRECT_URI = os.getenv(
    "GMAIL_REDIRECT_URI",
    "http://nibl/api/v1/email/google/callback",
)

SENDER_EMAIL = os.getenv(
    "SMTP_FROM_EMAIL",
    os.getenv("GMAIL_SENDER_EMAIL"),
)

if not os.path.isabs(CREDENTIALS_FILE):
    CREDENTIALS_FILE = os.path.join(
        BASE_DIR,
        CREDENTIALS_FILE,
    )

if not os.path.isabs(TOKEN_FILE):
    TOKEN_FILE = os.path.join(
        BASE_DIR,
        TOKEN_FILE,
    )


def create_google_flow(
    state: Optional[str] = None,
    code_verifier: Optional[str] = None,
):
    """
    Legacy OAuth helper retained because app.api.email imports it.
    """

    from google_auth_oauthlib.flow import Flow

    if not os.path.exists(CREDENTIALS_FILE):
        raise FileNotFoundError(
            f"Google credentials file not found: {CREDENTIALS_FILE}"
        )

    flow = Flow.from_client_secrets_file(
        CREDENTIALS_FILE,
        scopes=SCOPES,
        state=state,
        code_verifier=code_verifier,
    )

    flow.redirect_uri = REDIRECT_URI

    return flow


def get_authorization_url():
    """
    Legacy OAuth helper retained for the existing Google OAuth endpoint.
    """

    flow = create_google_flow()

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    return (
        authorization_url,
        state,
        flow.code_verifier,
    )


def complete_authorization(
    authorization_response: str,
    state: str,
    code_verifier: str,
):
    """
    Legacy OAuth callback helper retained for compatibility.
    """

    flow = create_google_flow(
        state=state,
        code_verifier=code_verifier,
    )

    flow.fetch_token(
        authorization_response=authorization_response
    )

    credentials = flow.credentials

    save_credentials(credentials)

    return credentials


def save_credentials(credentials):
    """
    Legacy OAuth credential storage retained for compatibility.
    SMTP sending does not use token.json.
    """

    with open(
        TOKEN_FILE,
        "w",
        encoding="utf-8",
    ) as token_file:
        token_file.write(
            credentials.to_json()
        )


# ---------------------------------------------------------------------------
# SMTP configuration
# ---------------------------------------------------------------------------

SMTP_HOST = os.getenv(
    "SMTP_HOST",
    "smtp.gmail.com",
)

SMTP_PORT = int(
    os.getenv(
        "SMTP_PORT",
        "587",
    )
)

SMTP_USERNAME = os.getenv(
    "SMTP_USERNAME",
)

SMTP_PASSWORD = os.getenv(
    "SMTP_PASSWORD",
)

SMTP_USE_TLS = os.getenv(
    "SMTP_USE_TLS",
    "true",
).lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def send_email(
    recipient: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
):
    """
    Sends an email through Gmail SMTP.

    The existing function signature is intentionally preserved so
    notification_service.py and the rest of the OIPM workflow do not
    need to change.

    If html_body is supplied, the email contains both a plain-text
    fallback and the HTML version. Existing OIPM HTML email cards
    therefore continue to work.
    """

    if not SMTP_USERNAME:
        raise RuntimeError(
            "SMTP_USERNAME is not configured in the backend .env file."
        )

    if not SMTP_PASSWORD:
        raise RuntimeError(
            "SMTP_PASSWORD is not configured in the backend .env file."
        )

    if not recipient:
        raise ValueError(
            "Email recipient is required."
        )

    message = MIMEMultipart("alternative")

    message.attach(
        MIMEText(
            body or "",
            "plain",
            "utf-8",
        )
    )

    if html_body:
        message.attach(
            MIMEText(
                html_body,
                "html",
                "utf-8",
            )
        )

    message["From"] = (
        SENDER_EMAIL
        or SMTP_USERNAME
    )
    message["To"] = recipient
    message["Subject"] = subject

    try:
        if SMTP_USE_TLS:
            with smtplib.SMTP(
                SMTP_HOST,
                SMTP_PORT,
                timeout=30,
            ) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(
                    SMTP_USERNAME,
                    SMTP_PASSWORD,
                )
                server.send_message(message)

        else:
            with smtplib.SMTP_SSL(
                SMTP_HOST,
                SMTP_PORT,
                timeout=30,
            ) as server:
                server.login(
                    SMTP_USERNAME,
                    SMTP_PASSWORD,
                )
                server.send_message(message)

        logger.info(
            "SMTP email sent successfully to %s: %s",
            recipient,
            subject,
        )

        return {
            "status": "sent",
            "recipient": recipient,
            "subject": subject,
        }

    except smtplib.SMTPAuthenticationError as error:
        logger.exception(
            "SMTP authentication failed for %s: %s",
            recipient,
            error,
        )
        raise RuntimeError(
            "SMTP authentication failed. Check the Gmail App Password "
            "and SMTP configuration."
        ) from error

    except (
        smtplib.SMTPException,
        OSError,
    ) as error:
        logger.exception(
            "SMTP email failed to %s: %s",
            recipient,
            error,
        )
        raise RuntimeError(
            f"SMTP email failed: {error}"
        ) from error

