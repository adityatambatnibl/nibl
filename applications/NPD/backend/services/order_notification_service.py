from datetime import date
import re
from urllib.parse import quote

from sqlalchemy import select

from config.settings import settings
from database import repo
from models.notification_config import NotificationConfig, EmailLog, EmailType
from models.order import Order, OrderItem, OrderStage
from models.template import StageOffset
from services import email_service, template_service, schedule_service
from utils.date_utils import days_between
from utils.text import plural

clean_stage_name = email_service.clean_stage_name

async def get_config() -> NotificationConfig:
    cfg = await repo.find_one(
        select(NotificationConfig).where(NotificationConfig.key == "order_stage_owners")
    )
    if not cfg:
        cfg = NotificationConfig()
        await repo.add(cfg)
    return cfg


def owners_for(cfg: NotificationConfig, stage_code: str) -> list[str]:
    for o in cfg.owners:
        if o.stage_code == stage_code:
            return o.emails
    return []

async def stage_name_for(stage_code: str) -> str:
    """Full stage name from the template. Falls back to the code if not found."""
    try:
        tpl = await template_service.get_stages()
        for s in tpl.stages:
            if s.code == stage_code:
                return s.name
    except Exception:
        pass
    return stage_code

async def _conditions_for_group(order_no: str, schedule_group: str) -> list[str]:
    items = await repo.find_all(
        select(OrderItem).where(
            OrderItem.order_no == order_no,
            OrderItem.schedule_group == schedule_group,
        )
    )
    return sorted({i.bearing_type for i in items})


def _direct_successors(
    stages: list[StageOffset], completed_code: str, conditions: list[str]
) -> list[StageOffset]:
    return [
        s for s in stages
        if schedule_service.resolve_parent(s, conditions) == completed_code
    ]


async def _resolve_next_stages(
    order_no: str, schedule_group: str, completed_code: str
) -> list[OrderStage]:
    """
    Successors of the completed stage. If a successor has no plan date
    (not applicable for this bearing type), we walk past it to its own
    successors - so J -> S works when J1 doesn't apply.
    """
    tpl = await template_service.get_stages()
    conditions = await _conditions_for_group(order_no, schedule_group)

    records = await repo.find_all(
        select(OrderStage).where(
            OrderStage.order_no == order_no,
            OrderStage.schedule_group == schedule_group,
        )
    )
    by_code = {r.stage_code: r for r in records}

    resolved: list[OrderStage] = []
    seen: set[str] = {completed_code}
    queue = _direct_successors(tpl.stages, completed_code, conditions)

    while queue:
        candidate = queue.pop(0)
        if candidate.code in seen:
            continue
        seen.add(candidate.code)

        record = by_code.get(candidate.code)
        if record and record.plan_date:
            resolved.append(record)
        else:
            # Not applicable for this order - continue down the chain
            queue.extend(_direct_successors(tpl.stages, candidate.code, conditions))

    return resolved


async def notify_handoff(order_no: str, completed: OrderStage) -> int:
    """Called when a stage gets an actual date. Emails the owners of the next stages."""
    cfg = await get_config()
    if not cfg.handoff_enabled or completed.actual_date is None:
        return 0

    order = await repo.find_one(select(Order).where(Order.order_no == order_no))
    if not order:
        return 0

    next_stages = await _resolve_next_stages(order_no, completed.schedule_group, completed.stage_code)
    sent = 0
    from services.recipient_service import load_resolver
    resolver = await load_resolver(cfg)   # this project's own list, else the global one

    for nxt in next_stages:
        recipients = resolver.stage(order_no, nxt.stage_code)
        if not recipients:
            continue

        delta = days_between(completed.plan_date, completed.actual_date)
        if delta is None:
            timing = ""
        elif delta > 0:
            timing = f'<span style="color:#b45309;">{plural(delta, "day")} later than planned</span>'
        elif delta < 0:
            timing = f'<span style="color:#15803d;">{plural(abs(delta), "day")} earlier than planned</span>'
        else:
            timing = '<span style="color:#15803d;">on plan</span>'

        # Finished early: say plainly that the next stage need not wait for
        # its own plan date.
        early_note = ""
        if (delta is not None and delta < 0 and nxt.plan_date
                and completed.actual_date < nxt.plan_date):
            early_note = (
                '<p style="margin-top:8px;padding:8px 12px;background:#f0fdf4;'
                'border:1px solid #bbf7d0;border-radius:6px;color:#166534;">'
                f"It finished {plural(abs(delta), 'day')} early, so you can start now - "
                f"you do not need to wait for your plan date of "
                f"{nxt.plan_date.strftime('%d-%b-%Y')}.</p>"
            )

        body = f"""
<p>The previous stage, <strong>{email_service.esc(email_service.clean_stage_name(completed.stage_name))}</strong>,
has been completed for <strong>{email_service.esc(order.product_name or order.order_no)}</strong>
({email_service.esc(order.customer_name)}). You can begin your stage.</p>
{early_note}
{email_service.table([
    ("Product", order.product_name or order.order_no),
    ("Customer", order.customer_name),
    ("Completed stage", email_service.stage_label(completed.stage_code, completed.stage_name)),
    ("Completed on", completed.actual_date.strftime("%d-%b-%Y")),
    ("Your stage", email_service.stage_label(nxt.stage_code, nxt.stage_name)),
    ("Your plan date", nxt.plan_date.strftime("%d-%b-%Y") if nxt.plan_date else "-"),
])}
{"" if early_note or not timing else f'<p style="margin-top:16px;">Previous stage finished {timing}.</p>'}
<p style="margin-top:20px;">
  <a href="http://nibl/"
     style="background:#0f172a;color:#ffffff;padding:10px 18px;border-radius:4px;text-decoration:none;font-size:13px;">OPEN NPD</a>
</p>"""

        ok = await email_service.send(
            to_emails=recipients,
            cc_emails=cfg.cc_emails,
            subject=f"{order.product_name or order.order_no}: {clean_stage_name(completed.stage_name)} complete - {clean_stage_name(nxt.stage_name)} can start",
            html_body=email_service.wrap(
                email_service.stage_title("Ready to start", nxt.stage_code, nxt.stage_name), body
            ),
            email_type=EmailType.HANDOFF,
            order_no=order.order_no,
            stage_code=nxt.stage_code,
            dedupe_key=f"handoff:{order.order_no}:{completed.schedule_group}:{completed.stage_code}:{nxt.stage_code}",
        )
        if ok:
            sent += 1

    return sent


async def send_overdue_for_stage(stage_code: str, today: date | None = None) -> dict:
    """Immediate send for one stage - used by the per-row Send button."""
    today = today or date.today()
    cfg = await get_config()
    recipients = owners_for(cfg, stage_code)

    if not recipients:
        return {"sent": False, "reason": "No email address configured for this stage."}

    overdue = list(
        await repo.find_all(
            select(OrderStage).where(
                OrderStage.stage_code == stage_code,
                OrderStage.actual_date.is_(None),
                OrderStage.plan_date.isnot(None),
                OrderStage.plan_date < today,
            )
        )
    )

    if not overdue:
        return {"sent": False, "reason": "No overdue records for this stage."}

    orders = await repo.find_all(
        select(Order).where(Order.order_no.in_({s.order_no for s in overdue}))
    )
    customer_by_no = {o.order_no: o.customer_name for o in orders}
    product_by_no = {o.order_no: o.product_name or o.order_no for o in orders}
    overdue.sort(key=lambda s: s.plan_date or today)

    rows = "".join(
        f"""<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">{email_service.esc(product_by_no.get(s.order_no, s.order_no))}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">{customer_by_no.get(s.order_no, "")}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">{s.plan_date.strftime("%d-%b-%Y")}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#b91c1c;font-weight:bold;">
    {plural((today - s.plan_date).days, "day")}
  </td>
</tr>"""
        for s in overdue if s.plan_date
    )

    stage_name = await stage_name_for(stage_code)
    body = f"""
<p>These orders are waiting for your update on <strong>{clean_stage_name(stage_name)}</strong>.</p>
<table role="presentation" width="100%" style="font-size:13px;border-collapse:collapse;margin-top:12px;">
  <tr style="background:#f8fafc;">
    <th align="left" style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Product</th>
    <th align="left" style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Customer</th>
    <th align="left" style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Plan date</th>
    <th align="left" style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Overdue</th>
  </tr>
  {rows}
</table>
<p style="margin-top:20px;">
  <a href="http://nibl/"
     style="background:#0f172a;color:#ffffff;padding:10px 18px;border-radius:4px;text-decoration:none;font-size:13px;">OPEN NPD</a>
</p>"""

    ok = await email_service.send(
        to_emails=recipients,
        cc_emails=cfg.cc_emails,
        subject=f"{clean_stage_name(stage_name)}: {plural(len(overdue), 'order')} overdue - awaiting your update",
        html_body=email_service.wrap(
            email_service.stage_title("Overdue", stage_code, stage_name), body
        ),
        email_type="manual_stage_reminder",
        stage_code=stage_code,
    )

    return {
        "sent": ok,
        "recipients": recipients,
        "stages": len(overdue),
        "reason": None if ok else "Sending failed - check the email log.",
    }


async def send_test_email(stage_code: str) -> dict:
    """Verifies an address works, without needing overdue data."""
    cfg = await get_config()
    recipients = owners_for(cfg, stage_code)

    if not recipients:
        return {"sent": False, "reason": "No email address configured for this stage."}

    stage_name = await stage_name_for(stage_code)

    body = f"""
<p>This is a test message confirming the address configured for
<strong>{clean_stage_name(stage_name)}</strong> is working.</p>
<p>You will receive real notifications when:</p>
<ul>
  <li>The previous stage is completed and yours can begin</li>
  <li>Your stage passes its planned date without an actual date</li>
</ul>"""

    ok = await email_service.send(
        to_emails=recipients,
        cc_emails=[],
        subject=f"Test message - {clean_stage_name(stage_name)} notifications",
        html_body=email_service.wrap(
            email_service.stage_title("Test message", stage_code, stage_name), body
        ),
        email_type="test",
        stage_code=stage_code,
    )

    return {
        "sent": ok,
        "recipients": recipients,
        "reason": None if ok else "Sending failed - check the email log.",
    }

async def send_overdue_digests(today: date | None = None, force: bool = False) -> dict:
    """
    One combined email per recipient listing all their overdue stages.

    The 9 AM job sends each person at most once a day (dedupe key).
    force=True is the "Send now" button: it always sends again.
    """
    today = today or date.today()
    cfg = await get_config()
    if not cfg.overdue_enabled:
        return {"recipients": 0, "stages": 0, "skipped": "overdue reminders are switched off"}

    overdue = list(
        await repo.find_all(
            select(OrderStage).where(
                OrderStage.actual_date.is_(None),
                OrderStage.plan_date.isnot(None),
                OrderStage.plan_date < today,
            )
        )
    )

    if not overdue:
        return {"recipients": 0, "stages": 0, "breakdown": {}}

    orders = await repo.find_all(
        select(Order).where(Order.order_no.in_({s.order_no for s in overdue}))
    )
    customer_by_no = {o.order_no: o.customer_name for o in orders}
    product_by_no = {o.order_no: o.product_name or o.order_no for o in orders}

    from services.recipient_service import load_resolver
    resolver = await load_resolver(cfg)
    by_recipient: dict[str, list[OrderStage]] = {}
    for stage in overdue:
        for email in resolver.stage(stage.order_no, stage.stage_code):
            by_recipient.setdefault(email, []).append(stage)

    breakdown: dict[str, int] = {}
    for s in overdue:
        breakdown[s.stage_code] = breakdown.get(s.stage_code, 0) + 1

    total = 0
    mails_sent = 0
    mails_failed = 0
    last_error = None
    for email, stages in by_recipient.items():
        stages.sort(key=lambda s: s.plan_date or today)

        rows = "".join(
            f"""<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">{email_service.esc(product_by_no.get(s.order_no, s.order_no))}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">{customer_by_no.get(s.order_no, "")}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">{email_service.stage_label(s.stage_code, s.stage_name)}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">{s.plan_date.strftime("%d-%b-%Y")}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#b91c1c;font-weight:bold;">
    {plural((today - s.plan_date).days, "day")}
  </td>
</tr>"""
            for s in stages if s.plan_date
        )

        body = f"""
<p>The following stages assigned to you have passed their planned date with no actual date recorded.</p>
<table role="presentation" width="100%" style="font-size:13px;border-collapse:collapse;margin-top:12px;">
  <tr style="background:#f8fafc;">
    <th align="left" style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Product</th>
    <th align="left" style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Customer</th>
    <th align="left" style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Stage</th>
    <th align="left" style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Plan date</th>
    <th align="left" style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Overdue</th>
  </tr>
  {rows}
</table>
<p style="margin-top:20px;">
  <a href="http://nibl/"
     style="background:#0f172a;color:#ffffff;padding:10px 18px;border-radius:4px;text-decoration:none;font-size:13px;">OPEN NPD</a>
</p>"""

        ok = await email_service.send(
            to_emails=[email],
            # No CC here - one copy per owner would mean the CC list gets
            # nine near-identical emails. They get a single summary below.
            cc_emails=[],
            subject=f"Overdue: {len(stages)} {'stage' if len(stages) == 1 else 'stages'} awaiting your update",
            html_body=email_service.wrap("Overdue stages", body),
            email_type=EmailType.OVERDUE_DIGEST,
            dedupe_key=None if force else f"overdue:{email}:{today.isoformat()}",
        )
        if ok:
            total += len(stages)
            mails_sent += 1
        elif ok.status == "failed" or ok.status == "skipped":
            mails_failed += 1
            last_error = ok.reason

    # One combined email for the CC list: everything overdue, in one place,
    # grouped by owner so it reads as a management summary rather than a
    # pile of forwarded reminders.
    if cfg.cc_emails and overdue:
        blocks = ""
        for email, stages in sorted(by_recipient.items()):
            stages.sort(key=lambda s: s.plan_date or today)
            rows = "".join(
                f"<tr>"
                f'<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">{email_service.esc(product_by_no.get(s.order_no, s.order_no))}</td>'
                f'<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">{customer_by_no.get(s.order_no, "")}</td>'
                f'<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">'
                f'{email_service.stage_label(s.stage_code, s.stage_name)}</td>'
                f'<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">'
                f'{s.plan_date.strftime("%d-%b-%Y")}</td>'
                f'<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;'
                f'color:#b91c1c;font-weight:bold;">{plural((today - s.plan_date).days, "day")}</td>'
                f"</tr>"
                for s in stages if s.plan_date
            )
            blocks += (
                f'<p style="margin:18px 0 6px;font-weight:bold;">{email} '
                f'<span style="font-weight:normal;color:#64748b;">'
                f"&middot; {plural(len(stages), 'stage')}</span></p>"
                f'<table role="presentation" width="100%" '
                f'style="font-size:13px;border-collapse:collapse;">'
                f'<tr style="background:#f8fafc;">'
                f'<th align="left" style="padding:6px 10px;">Product</th>'
                f'<th align="left" style="padding:6px 10px;">Customer</th>'
                f'<th align="left" style="padding:6px 10px;">Stage</th>'
                f'<th align="left" style="padding:6px 10px;">Planned</th>'
                f'<th align="left" style="padding:6px 10px;">Late by</th>'
                f"</tr>{rows}</table>"
            )

        await email_service.send(
            to_emails=list(cfg.cc_emails),
            cc_emails=[],
            subject=f"Overdue summary: {plural(len(overdue), 'stage')} across {plural(len(by_recipient), 'owner')}",
            html_body=email_service.wrap(
                "Overdue summary",
                f"<p><b>{plural(len(overdue), 'stage')}</b> {'is' if len(overdue) == 1 else 'are'} past the planned date, "
                f"grouped by the person responsible.</p>{blocks}",
            ),
            email_type=EmailType.OVERDUE_DIGEST,
            dedupe_key=None if force else f"overdue-summary:{today.isoformat()}",
        )

    return {
        "recipients": len(by_recipient),
        "stages": total,
        "total_overdue": len(overdue),
        "emails_sent": mails_sent,
        "emails_failed": mails_failed,
        "error": last_error,
        "breakdown": breakdown,
    }


