"""
APQP email notifications, keyed by responsibility.

Mirrors order_notification_service, but the audience is a DEPARTMENT rather
than a stage code. An activity carries a `responsibility` ("TOOL ROOM",
"QA", ...) and that maps to one or more addresses configured on the Email
Settings screen.

Two events:

  handoff  - an activity's actual_end is filled, so the work is finished.
             The owners of the next activity AND of the next phase are told
             they can begin. actual_end (not actual_start) is the trigger,
             because "you can start" is only true once the predecessor has
             actually finished.

  overdue  - daily digest. plan_end has passed and actual_end is still
             empty. Each department gets one email listing its own late
             activities across every project.
"""

from datetime import date, datetime, timezone
from urllib.parse import quote

from sqlalchemy import select

from database import repo
from config.settings import settings
from models.apqp import ApqpActivityRecord, ApqpProject
from models.notification_config import EmailType, NotificationConfig
from services import email_service
from utils.text import plural

PHASE_NAMES = {
    "PHASE0": "Enquiry & Feasibility",
    "PHASE1": "Plan and Define",
    "PHASE2": "Product Design",
    "PHASE3": "Process Design",
    "PHASE4": "Validation",
    "PHASE5": "Feedback & Corrective Action",
}

import re


def _button(label: str, path: str) -> str:
    """Brand-red action button. Every email should let the reader act."""
    url = f"{settings.APP_BASE_URL.rstrip('/')}{path}"
    return (
        f'<div style="margin-top:22px;">'
        f'<a href="{url}" style="display:inline-block;padding:11px 20px;'
        f'background:#942F23;color:#ffffff;text-decoration:none;border-radius:6px;'
        f'font-size:14px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">'
        f'{label}</a></div>'
    )


def _heading(prefix: str, tag: str, name: str) -> str:
    """
    Big name, small grey tag beside it. Kept local so this module does not
    depend on a helper that may not exist in email_service.
    """
    return (
        f"{name}"
        f"<span style=\"font-size:12px;font-weight:normal;color:#64748B;"
        f"letter-spacing:0.5px;white-space:nowrap;\">&nbsp;&nbsp;&middot;&nbsp;&nbsp;"
        f"{prefix} {tag}</span>"
    )


async def get_config() -> NotificationConfig:
    cfg = await repo.find_one(
        select(NotificationConfig).where(NotificationConfig.key == "order_stage_owners")
    )
    if not cfg:
        cfg = NotificationConfig()
        await repo.add(cfg)
    return cfg


def owners_for(cfg: NotificationConfig, responsibility: str | None) -> list[str]:
    """Addresses configured for a department. Empty when unset or unassigned."""
    if not responsibility:
        return []
    wanted = responsibility.strip().upper()
    for o in cfg.apqp_owners:
        if o.responsibility.strip().upper() == wanted:
            return [e for e in o.emails if e]
    return []


def _label(cfg: NotificationConfig, responsibility: str) -> str:
    for o in cfg.apqp_owners:
        if o.responsibility.strip().upper() == responsibility.strip().upper():
            return o.label or o.responsibility
    return responsibility


def _phase_name(code: str | None) -> str:
    return PHASE_NAMES.get(code or "", code or "-")


def _digest_body(cfg, dept: str, items: list, customer: dict, today: date,
                 product: dict | None = None) -> str:
    """Table of overdue activities. Shared by the daily digest and the
    on-demand Send button so both emails look identical."""
    product = product or {}
    rows = "".join(
        f"<tr>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;'>"
        f"{email_service.esc(product.get(a.project_id, a.project_id))}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;'>"
        f"{customer.get(a.project_id, '-')}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;'>"
        f"{a.no_label} {a.activity_name}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;'>{email_service.fmt_date(a.plan_end)}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;"
        f"color:#c52c2c;font-weight:bold;'>{plural((today - a.plan_end).days, 'day')}</td>"
        f"</tr>"
        for a in items[:40]
    )

    head = "".join(
        f"<th align='left' style='padding:8px 10px;font-size:11px;"
        f"text-transform:uppercase;color:#64748B;'>{h}</th>"
        for h in ("Product", "Customer", "Activity", "Planned end", "Late by")
    )

    return (
        f"<p><b>{_label(cfg, dept)}</b> has <b>{plural(len(items), 'APQP activity', 'APQP activities')}</b> "
        f"past {'its' if len(items) == 1 else 'their'} planned end date.</p>"
        f"<table role='presentation' width='100%' cellpadding='0' cellspacing='0' "
        f"style=\"font-family:Arial,Helvetica,sans-serif;font-size:13px;margin:16px 0;\">"
        f"<tr style='background:#FFF7F6;'>{head}</tr>{rows}</table>"
        + ("<p style='font-size:12px;color:#64748b;'>Only the 40 oldest are listed.</p>"
           if len(items) > 40 else "")
        + _button("OPEN NPD", "http://nibl/")
    )


# â”€â”€ Handoff â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def notify_handoff(project_id: str, finished: ApqpActivityRecord) -> None:
    """
    Called after an activity's actual_end is filled for the first time.

    Tells two audiences:
      1. the owner of the very next activity in sequence
      2. the owners of the next phase, but only once that phase's
         predecessor is entirely finished - otherwise every activity in
         a phase would trigger the same announcement.
    """
    cfg = await get_config()
    if not cfg.apqp_handoff_enabled:
        return

    project = await repo.find_one(
        select(ApqpProject).where(ApqpProject.project_id == project_id)
    )
    if not project:
        return

    acts = list(
        await repo.find_all(
            select(ApqpActivityRecord)
            .where(ApqpActivityRecord.project_id == project_id)
            .order_by(ApqpActivityRecord.sequence.asc())
        )
    )

    real = [a for a in acts if not a.is_heading]
    from services.recipient_service import load_resolver
    resolver = await load_resolver(cfg)   # this project's own list, else the global one

    # â”€â”€ 1. the next activity in sequence â”€â”€
    nxt = None
    for i, a in enumerate(real):
        if str(a.id) == str(finished.id):
            nxt = real[i + 1] if i + 1 < len(real) else None
            break

    if nxt is not None and nxt.actual_end is None:
        to = resolver.dept(project_id, nxt.responsibility)
        if to:
            await _send_activity_handoff(cfg, project, finished, nxt, to)

    # â”€â”€ 2. the next phase, only if the current one is now complete â”€â”€
    phase_order = []
    for a in real:
        if a.phase_code not in phase_order:
            phase_order.append(a.phase_code)

    cur = finished.phase_code
    same_phase = [a for a in real if a.phase_code == cur]
    if not all(a.actual_end is not None for a in same_phase):
        return                      # phase not finished yet

    idx = phase_order.index(cur) if cur in phase_order else -1
    if idx < 0 or idx + 1 >= len(phase_order):
        return                      # last phase
    next_code = phase_order[idx + 1]
    next_acts = [a for a in real if a.phase_code == next_code]
    if not next_acts:
        return

    depts = sorted({a.responsibility for a in next_acts if a.responsibility})
    to: list[str] = []
    for d in depts:
        to.extend(resolver.dept(project_id, d))
    to = sorted(set(to))
    if not to:
        return

    rows = [
        (
            f"{a.no_label} {a.activity_name}"[:70],
            f"{_label(cfg, a.responsibility or '-')} &middot; plan "
            f"{email_service.fmt_date(a.plan_start)} to {email_service.fmt_date(a.plan_end)}",
        )
        for a in next_acts[:12]
    ]

    body = (
        f"<p><b>{_phase_name(cur)}</b> is complete for "
        f"<b>{email_service.esc(project.product_name or project.project_id)}</b>. The next phase can begin.</p>"
        + email_service.table([
            ("Product", project.product_name or project.project_id),
            ("Customer", project.customer),
            ("Completed phase", _phase_name(cur)),
            ("Next phase", _phase_name(next_code)),
            ("Activities to start", str(len(next_acts))),
        ])
        + "<p style='margin-top:16px;'><b>What is now open:</b></p>"
        + email_service.table(rows)
        + _button("OPEN NPD", "http://nibl/")
    )

    await email_service.send(
        to_emails=to,
        cc_emails=list(cfg.cc_emails),
        subject=f"{project.product_name or project.project_id}: {_phase_name(cur)} complete "
                f"&mdash; {_phase_name(next_code)} can start",
        html_body=email_service.wrap(
            _heading("Phase complete", next_code.replace("PHASE", "P"),
                     _phase_name(next_code)),
            body,
        ),
        email_type=EmailType.APQP_PHASE_HANDOFF,
        dedupe_key=f"apqp-phase:{project_id}:{cur}",
    )


async def _send_activity_handoff(
    cfg: NotificationConfig,
    project: ApqpProject,
    finished: ApqpActivityRecord,
    nxt: ApqpActivityRecord,
    to: list[str] | None = None,
) -> None:
    to = to if to is not None else owners_for(cfg, nxt.responsibility)
    if not to:
        return

    slip = ""
    if finished.plan_end and finished.actual_end:
        days = (finished.actual_end - finished.plan_end).days
        if days > 0:
            slip = (f"<p style='margin-top:16px;'>The previous activity finished "
                    f"<span style='color:#b45309;'>{plural(days, 'day')} later than planned</span>.</p>")
        elif days < 0:
            slip = (f"<p style='margin-top:16px;'>The previous activity finished "
                    f"<span style='color:#318044;'>{plural(-days, 'day')} early</span>.</p>")

    early = ""
    if (finished.plan_end and finished.actual_end and finished.actual_end < finished.plan_end
            and nxt.plan_start and finished.actual_end < nxt.plan_start):
        early = (
            "<p style='margin-top:8px;padding:8px 12px;background:#f0fdf4;"
            "border:1px solid #bbf7d0;border-radius:6px;color:#166534;'>"
            f"It finished early, so you can start now - you do not need to wait for your "
            f"plan start of {email_service.fmt_date(nxt.plan_start)}.</p>"
        )

    body = (
        f"<p>The previous activity, <b>{email_service.esc(finished.activity_name)}</b>, has been "
        f"completed for <b>{email_service.esc(project.product_name or project.project_id)}</b> "
        f"({email_service.esc(project.customer)}). You can begin your activity.</p>"
        + early
        + email_service.table([
            ("Product", project.product_name or project.project_id),
            ("Customer", project.customer),
            ("Phase", _phase_name(nxt.phase_code)),
            ("Completed", f"{finished.no_label} {finished.activity_name}"),
            ("Completed on", email_service.fmt_date(finished.actual_end)),
            ("Your activity", f"{nxt.no_label} {nxt.activity_name}"),
            ("Your plan dates", f"{email_service.fmt_date(nxt.plan_start)} to {email_service.fmt_date(nxt.plan_end)}"),
            ("Check point", nxt.check_point or "-"),
        ])
        + ("" if early else slip)
        + _button("OPEN NPD", "http://nibl/")
    )

    await email_service.send(
        to_emails=to,
        cc_emails=list(cfg.cc_emails),
        subject=f"{project.product_name or project.project_id}: {finished.activity_name} complete "
                f"&mdash; {nxt.activity_name} can start",
        html_body=email_service.wrap(
            _heading("Ready to start", _label(cfg, nxt.responsibility or "-"),
                     nxt.activity_name),
            body,
        ),
        email_type=EmailType.APQP_HANDOFF,
        dedupe_key=f"apqp-act:{project.project_id}:{nxt.id}",
    )


# â”€â”€ Daily overdue digest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def send_overdue_digests(force: bool = False) -> dict:
    """
    One email per department listing its own overdue activities across every
    project. Overdue = plan_end has passed and actual_end is still empty.
    """
    cfg = await get_config()
    if not cfg.apqp_overdue_enabled:
        return {"sent": 0, "reason": "apqp overdue digests are switched off"}

    today = date.today()
    midnight = datetime(today.year, today.month, today.day)

    late = list(
        await repo.find_all(
            select(ApqpActivityRecord).where(
                ApqpActivityRecord.is_heading.is_(False),
                ApqpActivityRecord.actual_end.is_(None),
                ApqpActivityRecord.plan_end.isnot(None),
                ApqpActivityRecord.plan_end < today,
            )
        )
    )

    if not late:
        return {"sent": 0, "departments": 0, "breakdown": {}, "reason": "nothing overdue"}

    projects = await repo.find_all(
        select(ApqpProject).where(ApqpProject.project_id.in_({a.project_id for a in late}))
    )
    customer = {p.project_id: p.customer for p in projects}
    product = {p.project_id: p.product_name or p.project_id for p in projects}

    by_dept: dict[str, list[ApqpActivityRecord]] = {}
    unassigned: list[ApqpActivityRecord] = []
    for a in late:
        key = (a.responsibility or "").strip().upper()
        if key:
            by_dept.setdefault(key, []).append(a)
        else:
            unassigned.append(a)

    from services.recipient_service import load_resolver
    resolver = await load_resolver(cfg)

    sent = 0
    failed = 0
    last_error = None
    breakdown: dict[str, dict] = {}
    for dept, all_items in by_dept.items():
        # Projects can name different people for the same department, so one
        # email goes to each distinct set of people with just their activities.
        groups: dict[tuple, list] = {}
        for a in all_items:
            groups.setdefault(tuple(sorted(resolver.dept(a.project_id, dept))), []).append(a)
        nobody = groups.pop((), [])
        if not groups:
            breakdown[dept] = {"overdue": len(all_items), "sent": False,
                               "reason": "no address configured"}
            continue
        dept_sent = 0
        for to_t, items in groups.items():
            ok = await _send_dept_digest(cfg, dept, list(to_t), items, customer, product, today, midnight, force)
            if ok:
                sent += 1
                dept_sent += 1
            elif ok.status in ("failed", "skipped"):
                failed += 1
                last_error = ok.reason
        breakdown[dept] = {
            "overdue": len(all_items),
            "sent": dept_sent > 0,
            "recipients": len({e for t in groups for e in t}),
            "without_address": len(nobody),
            "reason": None if dept_sent else last_error,
        }

    # One combined email for the CC list: every overdue activity, grouped by
    # department, so it reads as a management summary rather than ten
    # forwarded reminders.
    if cfg.cc_emails and late:
        blocks = ""
        groups = sorted(by_dept.items())
        if unassigned:
            # Late work with no department set would otherwise vanish from
            # every email - the summary is the one place it must show up.
            groups.append(("No department set", unassigned))
        for dept, items in groups:
            items.sort(key=lambda a: a.plan_end or midnight.date())
            blocks += (
                f'<p style="margin:18px 0 6px;font-weight:bold;">{_label(cfg, dept)} '
                f'<span style="font-weight:normal;color:#64748b;">'
                f"&middot; {plural(len(items), 'activity', 'activities')}</span></p>"
                + _digest_body(cfg, dept, items, customer, today, product)
            )

        await email_service.send(
            to_emails=list(cfg.cc_emails),
            cc_emails=[],
            subject=f"APQP overdue summary: {len(late)} "
                    f"{'activity' if len(late) == 1 else 'activities'} overdue",
            html_body=email_service.wrap("APQP overdue summary", blocks),
            email_type=EmailType.APQP_OVERDUE_DIGEST,
            dedupe_key=None if force else f"apqp-overdue-summary:{today.isoformat()}",
        )


    return {
        "sent": sent,
        "failed": failed,
        "error": last_error,
        "departments": len(by_dept),
        "departments_without_address": sum(
            1 for b in breakdown.values() if b.get("reason") == "no address configured"),
        "total_overdue": len(late),
        "breakdown": breakdown,
    }


async def _send_dept_digest(cfg, dept, to, items, customer, product, today, midnight, force):
    items.sort(key=lambda a: a.plan_end or midnight.date())
    body = _digest_body(cfg, dept, items, customer, today, product)
    key = None if force else f"apqp-digest:{dept}:{','.join(to)}:{today.isoformat()}"
    return await email_service.send(
        to_emails=to,
        cc_emails=[],
        subject=f"{_label(cfg, dept)}: {plural(len(items), 'APQP activity', 'APQP activities')} overdue",
        html_body=email_service.wrap(f"Overdue APQP activities &middot; {_label(cfg, dept)}", body),
        email_type=EmailType.APQP_OVERDUE_DIGEST,
        dedupe_key=key,
    )


async def send_overdue_for_department(responsibility: str) -> dict:
    """
    Sends the overdue digest for ONE department, on demand. Used by the
    Send button on the Email Settings screen. No dedupe key, so it can be
    triggered repeatedly.
    """
    cfg = await get_config()
    to = owners_for(cfg, responsibility)
    if not to:
        return {"sent": False, "reason": "No email address configured for this department."}

    today = date.today()
    midnight = datetime(today.year, today.month, today.day)
    wanted = responsibility.strip().upper()

    late = list(
        await repo.find_all(
            select(ApqpActivityRecord).where(
                ApqpActivityRecord.is_heading.is_(False),
                ApqpActivityRecord.actual_end.is_(None),
                ApqpActivityRecord.plan_end.isnot(None),
                ApqpActivityRecord.plan_end < today,
            )
        )
    )
    items = [a for a in late if (a.responsibility or "").strip().upper() == wanted]

    if not items:
        return {"sent": False, "overdue": 0,
                "reason": "Nothing overdue for this department."}

    items.sort(key=lambda a: a.plan_end or midnight.date())

    projects = await repo.find_all(
        select(ApqpProject).where(ApqpProject.project_id.in_({a.project_id for a in items}))
    )
    customer = {p.project_id: p.customer for p in projects}
    product = {p.project_id: p.product_name or p.project_id for p in projects}

    ok = await email_service.send(
        to_emails=to,
        cc_emails=list(cfg.cc_emails),
        subject=f"{_label(cfg, responsibility)}: {plural(len(items), 'APQP activity', 'APQP activities')} overdue",
        html_body=email_service.wrap(
            f"Overdue APQP activities &middot; {_label(cfg, responsibility)}",
            _digest_body(cfg, responsibility, items, customer, today, product),
        ),
        email_type=EmailType.APQP_OVERDUE_DIGEST,
    )

    return {
        "sent": ok,
        "overdue": len(items),
        "recipients": to,
        "worst_days": (today - items[0].plan_end).days if items[0].plan_end else 0,
        "reason": None if ok else "Sending failed - check the email log.",
    }


# â”€â”€ Manual test, from the Email Settings screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def send_test_email(responsibility: str) -> dict:
    cfg = await get_config()
    to = owners_for(cfg, responsibility)
    if not to:
        return {"sent": False, "reason": "No email address configured for this department."}

    body = (
        f"<p>This is a test message confirming the address configured for "
        f"<b>{_label(cfg, responsibility)}</b> is working.</p>"
        "<p>You will receive real notifications when:</p>"
        "<ul>"
        "<li>the activity before one of yours is completed</li>"
        "<li>a phase you own becomes open</li>"
        "<li>one of your activities passes its planned end date</li>"
        "</ul>"
        + _button("OPEN NPD", "http://nibl/")
    )

    ok = await email_service.send(
        to_emails=to,
        cc_emails=[],
        subject=f"Test message &mdash; {_label(cfg, responsibility)} APQP notifications",
        html_body=email_service.wrap(
            f"Test message &middot; {_label(cfg, responsibility)}", body
        ),
        email_type="apqp_test",
    )
    return {"sent": ok, "recipients": to}



