"""
Shared email plumbing for the APQP / Order Development Tracking System.

Everything user-visible goes through the helpers here so that all fifteen
notification emails look and read the same:

  esc()          - escape any value coming from the database
  fmt_date()     - the ONE date format used everywhere: 05-Mar-2026 (no time)
  as_date()      - normalise date/datetime for arithmetic
  days_between() - safe day difference
  today()        - "today" in the application timezone, not the server's
  wrap()         - the branded shell
  table()        - key / value block
  data_table()   - multi-column listing
  heading()      - "Grinding (GR) · Ready to start"
  button()       - the single call-to-action style
  send()         - sends, logs, dedupes, and never blocks the event loop
"""

from __future__ import annotations

import asyncio
import html
import re
import smtplib
from dataclasses import dataclass
from datetime import date, datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

from config.settings import settings
from sqlalchemy import select

from database.connection import independent_scope
from models.email_log import EmailLog

# ── Brand palette (matches frontend/src/index.css) ────────────────────────────
BRAND_600 = "#B0392A"     # nav bar red
BRAND_700 = "#942F23"     # button fill
BRAND_50 = "#FDF3F2"
INK = "#0F172A"
MUTED = "#64748B"
LINE = "#E2E8F0"
PAGE_BG = "#F1F5F9"
LATE = "#C52C2C"
EARLY = "#15803D"
SLIP = "#B45309"

LOGO_URL = "https://nrbindustrialbearings.com/img/logo.jpg"
COMPANY = "NRB Industrial Bearings Ltd."
SYSTEM_NAME = "AI Drawing Control"

DATE_FMT = "%d-%b-%Y"
DASH = "—"


# ── Time ──────────────────────────────────────────────────────────────────────

def _tz():
    name = getattr(settings, "APP_TIMEZONE", "Asia/Kolkata")
    if ZoneInfo is None:
        return None
    try:
        return ZoneInfo(name)
    except Exception:
        return None


def today() -> date:
    """Today in the application timezone. Use this instead of date.today()."""
    tz = _tz()
    return datetime.now(tz).date() if tz else date.today()


def as_date(value) -> date | None:
    """Normalise a date, datetime or None to a plain date for arithmetic."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def fmt_date(value) -> str:
    """The only date format in the system. Never prints a time."""
    d = as_date(value)
    return d.strftime(DATE_FMT) if d else DASH


def days_between(start, end) -> int | None:
    """end - start in whole days, tolerant of date/datetime/None mixes."""
    a, b = as_date(start), as_date(end)
    if a is None or b is None:
        return None
    return (b - a).days


# ── Text safety ───────────────────────────────────────────────────────────────

def esc(value) -> str:
    """Escape anything coming from the database before it enters HTML."""
    if value is None:
        return DASH
    if isinstance(value, (date, datetime)):
        return fmt_date(value)
    text = getattr(value, "value", value)          # unwrap Enum members
    text = str(text).strip()
    return html.escape(text) if text else DASH


def plain_subject(text: str) -> str:
    """Subject headers are plain text - no HTML entities allowed."""
    return html.unescape(str(text)).replace("\n", " ").strip()


# ── Building blocks ───────────────────────────────────────────────────────────

def button(label: str, path: str) -> str:
    """The single call-to-action style used by every email."""
    base = str(getattr(settings, "APP_BASE_URL", "")).rstrip("/")
    url = f"{base}{path}"
    return (
        f'<div style="margin-top:22px;">'
        f'<a href="{html.escape(url)}" style="display:inline-block;padding:11px 20px;'
        f'background:{BRAND_700};color:#ffffff;text-decoration:none;border-radius:6px;'
        f'font-size:14px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">'
        f'{html.escape(label)}</a></div>'
    )


def heading(name: str | None, prefix: str, tag: str | None = None) -> str:
    """'Grinding (GR) · Ready to start' - name first, code second, state last."""
    label = esc(name)
    code = f' <span style="font-size:13px;font-weight:normal;">({esc(tag)})</span>' if tag else ""
    return (
        f"{label}{code}"
        f'<span style="font-size:12px;font-weight:normal;color:{MUTED};'
        f'letter-spacing:0.5px;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;{esc(prefix)}</span>'
    )


def clean_stage_name(name: str | None) -> str:
    """
    'GR press operations (6*3)' -> 'GR press operations'.

    The bracketed quantity note means something on the shop floor and
    nothing in an inbox. Brackets holding real words - '(Nitriding OSP)' -
    are part of the process name and stay.
    """
    return re.sub(r"\s*\(\s*\d+\s*[*x×]\s*\d+\s*\)", "", name or "").strip()


def stage_label(code: str | None, name: str | None) -> str:
    """Stage name as shown in emails - clean name only, no code."""
    return esc(clean_stage_name(name))


def stage_title(prefix: str, code: str | None, name: str | None) -> str:
    """Email heading for a stage - clean name, no code."""
    return heading(clean_stage_name(name), prefix, None)


def table(rows: list[tuple[str, str]]) -> str:
    """
    Key / value block. Values are inserted as-is, so callers must pass
    esc()'d text or intentional markup.
    """
    cells = "".join(
        f"<tr>"
        f'<td width="36%" style="padding:9px 16px 9px 14px;background:{BRAND_50};color:{MUTED};'
        f"font-size:12px;text-transform:uppercase;letter-spacing:0.4px;"
        f'border-bottom:1px solid #ffffff;vertical-align:top;">{html.escape(str(k))}</td>'
        f'<td style="padding:9px 14px;background:#F8FAFC;font-weight:bold;color:{INK};'
        f'font-size:14px;border-bottom:1px solid #ffffff;">{v}</td>'
        f"</tr>"
        for k, v in rows
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="font-family:Arial,Helvetica,sans-serif;margin:18px 0;border-radius:8px;'
        f'overflow:hidden;border:1px solid {LINE};">{cells}</table>'
    )


def data_table(headers: list[str], rows: list[list[str]]) -> str:
    """
    Multi-column listing. Cell contents are inserted as-is, so callers must
    pass esc()'d text or intentional markup.
    """
    head = "".join(
        f'<th align="left" style="padding:8px 10px;font-size:11px;font-weight:bold;'
        f"text-transform:uppercase;letter-spacing:0.4px;color:{MUTED};"
        f'border-bottom:2px solid #CBD5E1;">{html.escape(str(h))}</th>'
        for h in headers
    )
    body = "".join(
        "<tr>"
        + "".join(
            f'<td style="padding:8px 10px;border-bottom:1px solid {LINE};'
            f'vertical-align:top;">{c}</td>'
            for c in row
        )
        + "</tr>"
        for row in rows
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="font-family:Arial,Helvetica,sans-serif;font-size:13px;margin:16px 0;'
        f'border-collapse:collapse;">'
        f'<tr style="background:#FFF7F6;">{head}</tr>{body}</table>'
    )


def late_cell(days: int | None) -> str:
    """Red 'N d' cell for overdue tables."""
    if days is None:
        return DASH
    unit = "day" if days == 1 else "days"
    return f'<span style="color:{LATE};font-weight:bold;">{days} {unit}</span>'


def note(text: str) -> str:
    """Small grey footnote paragraph."""
    return f'<p style="margin-top:20px;font-size:12px;color:{MUTED};">{text}</p>'


def _header() -> str:
    """White brand bar with the NRB logo, red accent rule underneath."""
    return f"""
  <tr>
    <td style="padding:18px 28px;background:#ffffff;border-bottom:4px solid {BRAND_600};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="left" style="vertical-align:middle;">
          <img src="{LOGO_URL}" alt="NRB Industrial Bearings" width="150" height="38"
               style="display:block;border:0;outline:none;text-decoration:none;
                      height:auto;max-width:150px;font-family:Arial,Helvetica,sans-serif;
                      font-size:16px;font-weight:bold;color:{INK};">
        </td>
        <td align="right" style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;
            font-size:10px;color:{MUTED};letter-spacing:0.8px;text-transform:uppercase;
            line-height:1.5;">
          AI Drawing<br>Control
        </td>
      </tr></table>
    </td>
  </tr>"""


def wrap(title: str, body_html: str, preheader: str = "") -> str:
    """Shared email shell - inline CSS and tables only, for client compatibility."""
    pre = ""
    if preheader:
        pre = (
            f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;'
            f'mso-hide:all;">{html.escape(preheader)}</div>'
        )
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{PAGE_BG};">
{pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:{PAGE_BG};padding:28px 12px;">
<tr><td align="center">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="max-width:600px;width:100%;background:#ffffff;border:1px solid {LINE};
                border-radius:10px;overflow:hidden;">
{_header()}
    <tr>
      <td style="padding:26px 28px 6px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:19px;font-weight:bold;color:{INK};line-height:1.3;">{title}</div>
        <div style="height:3px;width:44px;background:{BRAND_600};margin-top:10px;
                    border-radius:2px;"></div>
      </td>
    </tr>

    <tr>
      <td style="padding:16px 28px 26px 28px;font-family:Arial,Helvetica,sans-serif;
                 font-size:14px;color:#334155;line-height:1.65;">
        {body_html}
      </td>
    </tr>

    <tr>
      <td style="padding:16px 28px;background:#F8FAFC;border-top:1px solid {LINE};
                 font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94A3B8;
                 line-height:1.6;">
        {SYSTEM_NAME} &nbsp;&middot;&nbsp; {COMPANY}<br>
        Automated message - please do not reply to this address.
      </td>
    </tr>
  </table>

</td></tr>
</table>
</body></html>"""


# ── Plain-text alternative ────────────────────────────────────────────────────

def to_plain_text(html_body: str) -> str:
    """A readable text/plain part. Spam filters penalise HTML-only mail."""
    text = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", "", html_body)
    text = re.sub(r"(?is)<div[^>]*display:none.*?</div>", "", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)<li[^>]*>", "\n  - ", text)
    text = re.sub(r"(?i)</t[dh]>", "  ", text)
    text = re.sub(r"(?i)</(p|div|tr|table|ul|ol|h[1-6])>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t]{2,}", "  ", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() or "Open the tracking system for details."


# ── Sending ───────────────────────────────────────────────────────────────────

# Set by the Email Settings "Preview" button: while it holds a list, send()
# puts each message there instead of delivering it.
from contextvars import ContextVar
_preview: ContextVar[list | None] = ContextVar("email_preview", default=None)


def start_preview() -> list:
    box: list = []
    _preview.set(box)
    return box

@dataclass
class SendResult:
    """Truthy only when the message actually went out."""
    status: str                      # sent | skipped | duplicate | failed | no_recipients
    recipients: list[str]
    error: str | None = None

    def __bool__(self) -> bool:
        return self.status == "sent"

    @property
    def delivered(self) -> bool:
        return self.status == "sent"

    @property
    def reason(self) -> str | None:
        return {
            "sent": None,
            "skipped": "Email delivery is switched off (EMAIL_ENABLED is false).",
            "duplicate": "Already sent - a matching message is in the email log.",
            "no_recipients": "No email address configured.",
            "failed": self.error or "Sending failed - check the email log.",
        }.get(self.status, self.error)


def _build_message(
    to_emails: list[str],
    cc_emails: list[str],
    subject: str,
    html_body: str,
) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = plain_subject(subject)
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
    msg["To"] = ", ".join(to_emails)
    if cc_emails:
        msg["Cc"] = ", ".join(cc_emails)
    reply_to = getattr(settings, "SMTP_REPLY_TO", None)
    if reply_to:
        msg["Reply-To"] = reply_to
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()
    msg["Auto-Submitted"] = "auto-generated"
    msg["X-Auto-Response-Suppress"] = "All"
    msg.set_content(to_plain_text(html_body))
    msg.add_alternative(html_body, subtype="html")
    return msg


def _deliver(msg: EmailMessage) -> None:
    """Blocking SMTP send. Always called from a worker thread."""
    host = settings.SMTP_HOST
    port = int(settings.SMTP_PORT)
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=30) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        return
    with smtplib.SMTP(host, port, timeout=30) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)



async def _already_sent(dedupe_key: str) -> bool:
    """Has this exact mail gone out before?"""
    async with independent_scope() as s:
        found = await s.execute(
            select(EmailLog.id).where(EmailLog.dedupe_key == dedupe_key).limit(1)
        )
        return found.first() is not None


async def _record(log: EmailLog) -> None:
    """
    Writes the email log in its own transaction, committed immediately.

    This row is both the audit trail and the dedupe guard, so it must not
    share the fate of the request that triggered the mail. If a handoff email
    is delivered and the request then fails for an unrelated reason, rolling
    the log back with it would leave the mail sent and no trace of it - and
    the next overdue sweep would send it a second time.

    Failing to write the log must not fail the send, so this stays
    best-effort, exactly as the Mongo version was.
    """
    try:
        async with independent_scope() as s:
            s.add(log)
    except Exception:
        pass


async def send(
    to_emails: list[str],
    subject: str,
    html_body: str,
    cc_emails: list[str] | None = None,
    email_type: str = "generic",
    order_no: str | None = None,
    stage_code: str | None = None,
    dedupe_key: str | None = None,
) -> SendResult:
    """
    Sends one email and logs it.

    Returns a SendResult that is truthy only on real delivery, so callers can
    tell 'skipped as duplicate' apart from 'delivery failed'. Existing
    `if ok:` checks keep working unchanged.
    """
    capture = _preview.get()
    if capture is not None:
        # Preview: build the real message, keep it, send and log nothing.
        to = [e.strip() for e in (to_emails or []) if e and e.strip()] or ["(no address set)"]
        cc = [e.strip() for e in (cc_emails or []) if e and e.strip()]
        capture.append({
            "subject": plain_subject(subject), "to": to, "cc": cc, "html": html_body,
        })
        return SendResult("sent", to)

    to_emails = [e.strip() for e in (to_emails or []) if e and e.strip()]
    cc_emails = [e.strip() for e in (cc_emails or []) if e and e.strip()]
    cc_emails = [e for e in cc_emails if e.lower() not in {t.lower() for t in to_emails}]

    if not to_emails:
        return SendResult("no_recipients", [])

    subject = plain_subject(subject)

    if dedupe_key and await _already_sent(dedupe_key):
        return SendResult("duplicate", to_emails)

    log = EmailLog(
        email_type=str(getattr(email_type, "value", email_type)),
        to_emails=to_emails,
        cc_emails=cc_emails,
        subject=subject,
        order_no=order_no,
        stage_code=stage_code,
        dedupe_key=dedupe_key,
    )

    if not settings.EMAIL_ENABLED:
        log.status = "skipped"
        log.error = "EMAIL_ENABLED is false - logged only, not delivered"
        await _record(log)
        return SendResult("skipped", to_emails)

    msg = _build_message(to_emails, cc_emails, subject, html_body)

    error: str | None = None
    try:
        await asyncio.to_thread(_deliver, msg)
        log.status = "sent"
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        log.status = "failed"
        log.error = error

    await _record(log)

    if log.status == "sent":
        return SendResult("sent", to_emails)
    return SendResult("failed", to_emails, error)