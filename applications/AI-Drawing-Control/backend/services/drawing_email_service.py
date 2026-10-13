"""
Drawing Control - emails and reminders.

Every function here runs OUTSIDE the request that triggered it: either via
after_commit() (which gives it its own session once the request has
committed) or from the scheduler inside session_scope(). So a rolled-back
upload never mails anyone, and a slow SMTP server never slows down the
person pressing Confirm.

Uses the shared email_service: same look, same email log, same dedupe guard,
same EMAIL_ENABLED switch as every other NPD email.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from config.settings import settings
from database import repo
from models.drawing import Decision, Drawing, DrawingReview, DrawingRevision, DrawingStatus
from models.user import User
from services import email_service as E

log = logging.getLogger("drawing_mail")

APP_NAME = "Drawing Control"


def _wrap(title: str, body: str, preheader: str = "") -> str:
    """The standard NPD email shell, labelled for Drawing Control."""
    html = E.wrap(title, body, preheader)
    return (
        html.replace("APQP NPD Order<br>Tracking System", "Drawing<br>Control")
            .replace(E.SYSTEM_NAME, APP_NAME)
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _load(revision_id: uuid.UUID) -> tuple[DrawingRevision, Drawing] | tuple[None, None]:
    rv = await repo.get(DrawingRevision, revision_id)
    if not rv:
        return None, None
    d = await repo.get(Drawing, rv.drawing_id)
    return rv, d


def _facts(d: Drawing, rv: DrawingRevision) -> str:
    return E.table([
        ("Drawing", E.esc(d.drawing_no)),
        ("Revision", E.esc(rv.rev_label)),
        ("What changed", E.esc(rv.change_note)),
        ("Uploaded by", f"{E.esc(rv.uploaded_by_name)} on {E.fmt_date(rv.uploaded_at)}"),
    ])


def _url(path: str) -> str:
    return str(getattr(settings, "APP_BASE_URL", "")).rstrip("/") + path


def _link(d: Drawing) -> str:
    return E.button("Open the drawing", f"/view/{d.id}")


# ── Review request (new drawing / new revision) ────────────────────────────

def review_mail(d, rv, user_name: str, revised: bool) -> tuple[str, str]:
    """Subject + HTML of the confirmation mail. Used for sending and for the admin's Preview."""
    title = f"Please confirm drawing {E.esc(d.drawing_no)} Rev {E.esc(rv.rev_label)}"
    body = (
        f"<p>A {'revised' if revised else 'new'} controlled drawing has been released. Please check it on "
        f"screen in {APP_NAME} and <b>Confirm</b> it, or <b>Deny</b> it with the reason - the reason goes "
        f"to the drawing admin, who decides whether a corrected revision is needed.</p>"
        f"{_facts(d, rv)}{_link(d)}"
        + E.note("You get a daily reminder until you confirm or deny.")
    )
    subject = f"{'Revised drawing' if revised else 'New drawing'} for confirmation: {d.drawing_no} Rev {rv.rev_label}"
    return subject, _wrap(title, body, f"{d.drawing_no} Rev {rv.rev_label} needs your confirmation")


async def send_review_requests(revision_id: uuid.UUID, revised: bool) -> None:
    rv, d = await _load(revision_id)
    if not rv or rv.locked:
        return
    reviews = await repo.find_all(select(DrawingReview).where(
        DrawingReview.revision_id == rv.id, DrawingReview.decision == Decision.PENDING
    ))
    kind = "revised" if revised else "new"
    for r in reviews:
        subject, html = review_mail(d, rv, r.user_name, revised)
        res = await E.send(
            [r.user_email], subject, html,
            email_type=f"drawing_review_{kind}", dedupe_key=f"dc-req-{r.id}",
        )
        if res.status in ("sent", "skipped", "duplicate"):
            r.notified_at = r.notified_at or _now()
    await repo.touch()


# ── Denied ─────────────────────────────────────────────────────────────────

async def send_denied(revision_id: uuid.UUID, denier_id: uuid.UUID) -> None:
    from services import drawing_service

    rv, d = await _load(revision_id)
    if not rv:
        return
    reviews = await repo.find_all(select(DrawingReview).where(DrawingReview.revision_id == rv.id))
    denial = next((r for r in reviews if r.user_id == denier_id and r.decision == Decision.DENIED), None)
    if not denial:
        return
    to = await drawing_service.admin_emails()
    cc = [r.user_email for r in reviews if r.user_email]
    title = f"Drawing {E.esc(d.drawing_no)} Rev {E.esc(rv.rev_label)} was denied"
    body = (
        f"<p><b>{E.esc(denial.user_name)}</b> denied this drawing on {E.fmt_date(denial.decided_at)}.</p>"
        + E.table([("Reason", E.esc(denial.reason))])
        + _facts(d, rv)
        + "<p>The drawing stays released for now. If the reason is valid, the drawing admin uploads a "
          "corrected revision with <b>Revise</b>; it then goes out for confirmation again.</p>"
        + _link(d)
    )
    await E.send(
        to or cc, f"Drawing denied: {d.drawing_no} Rev {rv.rev_label}",
        _wrap(title, body, f"Denied by {denial.user_name}: {denial.reason}"),
        cc_emails=cc if to else None, email_type="drawing_denied", dedupe_key=f"dc-deny-{rv.id}",
    )


# ── Approved ───────────────────────────────────────────────────────────────

async def send_approved(revision_id: uuid.UUID) -> None:
    from services import drawing_service

    rv, d = await _load(revision_id)
    if not rv or rv.status != DrawingStatus.APPROVED:
        return
    reviews = await repo.find_all(select(DrawingReview).where(
        DrawingReview.revision_id == rv.id, DrawingReview.decision == Decision.CONFIRMED
    ))
    uploader = await repo.get(User, rv.uploaded_by)
    to = list(dict.fromkeys(([uploader.email] if uploader and uploader.email else []) + await drawing_service.admin_emails()))
    rows = [[E.esc(r.user_name), E.fmt_date(r.decided_at)] for r in sorted(reviews, key=lambda r: r.decided_at or _now())]
    title = f"Drawing {E.esc(d.drawing_no)} Rev {E.esc(rv.rev_label)} - confirmed by everyone"
    body = (
        "<p>Every selected user has confirmed this drawing.</p>"
        + _facts(d, rv) + E.data_table(["Confirmed by", "Date"], rows) + _link(d)
    )
    await E.send(
        to, f"Drawing confirmed by everyone: {d.drawing_no} Rev {rv.rev_label}",
        _wrap(title, body, "All listed users confirmed"),
        email_type="drawing_approved", dedupe_key=f"dc-ok-{rv.id}",
    )


# ── Reminders ──────────────────────────────────────────────────────────────

async def send_reminders(revision_id: uuid.UUID | None = None, force: bool = False) -> int:
    """
    Daily 09:00 reminder (scheduler): ONE email per person listing every drawing
    still waiting for their Confirm / Deny - so 50 pending drawings means one
    email, not 50. Drawings sent to them in the last 6 hours are left for the
    next day. Repeats every day until they respond or the revision is closed.

    `force` + `revision_id` (the admin's "Send reminder now" button) reminds
    everyone pending on that one revision straight away.
    """
    stmt = (
        select(DrawingReview, DrawingRevision, Drawing)
        .join(DrawingRevision, DrawingRevision.id == DrawingReview.revision_id)
        .join(Drawing, Drawing.id == DrawingReview.drawing_id)
        .where(
            DrawingReview.decision == Decision.PENDING,
            DrawingRevision.locked.is_(False),
            Drawing.status != DrawingStatus.DELETED,
        )
        .order_by(DrawingRevision.uploaded_at.asc())
    )
    if revision_id is not None:
        stmt = stmt.where(DrawingRevision.id == revision_id)
    if not force:
        fresh = _now() - timedelta(hours=6)
        stmt = stmt.where(func.coalesce(DrawingReview.notified_at, DrawingRevision.uploaded_at) < fresh)

    rows = (await repo.db().execute(stmt)).all()
    by_person: dict[str, list] = {}
    for r, rv, d in rows:
        by_person.setdefault(r.user_email.lower(), []).append((r, rv, d))

    today = _now().strftime("%Y-%m-%d")
    sent = 0
    for email, items in by_person.items():
        lines = []
        for r, rv, d in items:
            waiting = (_now() - (r.notified_at or rv.uploaded_at)).days
            lines.append(
                f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee'><b>{E.esc(d.drawing_no)}</b></td>"
                f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>Rev {E.esc(rv.rev_label)}</td>"
                f"<td style='padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap'>"
                f"{'Today' if waiting < 1 else str(waiting) + ' day' + ('s' if waiting != 1 else '')}</td>"
                f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>"
                f"<a href='{_url(f'/view/{d.id}')}'>Open</a></td></tr>"
            )
        n = len(items)
        title = f"{n} drawing{'s are' if n != 1 else ' is'} waiting for your confirmation"
        body = (
            f"<p>The drawing{'s' if n != 1 else ''} below still need{'' if n != 1 else 's'} your "
            f"<b>Confirm</b> or <b>Deny</b> in {APP_NAME}.</p>"
            f"<table style='border-collapse:collapse;width:100%;font-size:13px'>"
            f"<tr style='text-align:left;color:#666'><th style='padding:6px 10px'>Drawing</th>"
            f"<th style='padding:6px 10px'>Rev</th>"
            f"<th style='padding:6px 10px'>Waiting</th><th></th></tr>{''.join(lines)}</table>"
            f"{E.button('Open My Reviews', '/reviews')}"
            + E.note(f"You get this reminder every day at {settings.DRAWING_REMINDER_TIME} until you respond.")
        )
        key = f"dc-rem-now-{revision_id}-{email}-{_now().timestamp():.0f}" if force else f"dc-rem-day-{email}-{today}"
        res = await E.send(
            [email], f"Reminder: {n} drawing{'s' if n != 1 else ''} waiting for your confirmation",
            _wrap(title, body, "Still waiting for your Confirm / Deny"),
            email_type="drawing_reminder", dedupe_key=key,
        )
        for r, _rv, _d in items:
            r.reminders_sent += 1
            r.last_reminded_at = _now()
            r.notified_at = r.notified_at or _now()
        sent += 1 if res.status == "sent" else 0
    await repo.touch()
    if sent:
        log.info("Drawing reminder emails sent: %s", sent)
    return sent


async def send_bulk_requests(revision_ids: list[uuid.UUID]) -> int:
    """
    ONE email per person listing all drawings of the batch,
    instead of one email per drawing.
    """
    if not revision_ids:
        return 0
    rows = (await repo.db().execute(
        select(DrawingReview, DrawingRevision, Drawing)
        .join(DrawingRevision, DrawingRevision.id == DrawingReview.revision_id)
        .join(Drawing, Drawing.id == DrawingReview.drawing_id)
        .where(DrawingReview.revision_id.in_(revision_ids), DrawingReview.decision == Decision.PENDING)
        .order_by(Drawing.drawing_no)
    )).all()
    by_person: dict[str, list] = {}
    for r, rv, d in rows:
        by_person.setdefault(r.user_email.lower(), []).append((r, rv, d))
    batch = uuid.uuid5(uuid.NAMESPACE_OID, ",".join(sorted(str(i) for i in revision_ids))).hex[:12]
    sent = 0
    for email, items in by_person.items():
        n = len(items)
        lines = "".join(
            f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee'><b>{E.esc(d.drawing_no)}</b></td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee'>Rev {E.esc(rv.rev_label)}</td>"
            "</tr>"
            for _r, rv, d in items[:200]
        )
        more = f"<p>... and {n - 200} more.</p>" if n > 200 else ""
        title = f"{n} new drawing{'s' if n != 1 else ''} uploaded for your confirmation"
        body = (
            f"<p>{n} controlled drawing{'s have' if n != 1 else ' has'} been uploaded to {APP_NAME} and "
            f"need{'' if n != 1 else 's'} your <b>Confirm</b> or <b>Deny</b>. Open each one on screen; if you deny, "
            f"give the reason.</p>"
            f"<table style='border-collapse:collapse;width:100%;font-size:13px'>"
            f"<tr style='text-align:left;color:#666'><th style='padding:6px 10px'>Drawing</th>"
            f"<th style='padding:6px 10px'>Rev</th></tr>{lines}</table>{more}"
            f"{E.button('Open My Reviews', '/reviews')}"
            + E.note(f"Until you respond you get one reminder a day at {settings.DRAWING_REMINDER_TIME}.")
        )
        res = await E.send(
            [email], f"{n} new drawing{'s' if n != 1 else ''} need your confirmation",
            _wrap(title, body, f"{n} drawings need your confirmation"),
            email_type="drawing_review_bulk", dedupe_key=f"dc-bulk-{batch}-{email}",
        )
        if res.status in ("sent", "skipped", "duplicate"):
            for r, _rv, _d in items:
                r.notified_at = r.notified_at or _now()
        sent += 1 if res.status == "sent" else 0
    await repo.touch()
    return sent
