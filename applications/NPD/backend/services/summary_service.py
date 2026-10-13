"""
The daily management summary.

One email, once a day, for the people on the CC list. It answers four
questions in the order a manager asks them:

    where do we stand
    what is worst
    what is moving well
    what lands next week

Everything else - the per-owner reminders and the per-stage handoffs -
stays as it is. This is the only mail the CC list receives.
"""

from datetime import date, datetime, timedelta

from sqlalchemy import select

from database import repo
from models.apqp import ApqpActivityRecord, ApqpProject
from models.notification_config import EmailType
from models.order import Order, OrderStage
from services import email_service
from services import fast_rows

DISPATCH_STAGE = "X"


def plural(n: int, one: str, many: str | None = None) -> str:
    """
    "1 stage" / "4 stages" - never "4 stages".

    Written out because a summary that a manager forwards should read like
    a sentence, not like a template someone forgot to finish.
    """
    return f"{n} {one if n == 1 else (many or one + 's')}"


def _midnight(d: date) -> datetime:
    """plan_end is a BSON-style date column; comparisons need a datetime."""
    return datetime(d.year, d.month, d.day)


def _card(label: str, value: str, tone: str = "#242424") -> str:
    return (
        f'<td width="25%" align="center" style="padding:12px 6px;">'
        f'<div style="font-size:26px;font-weight:bold;color:{tone};'
        f'line-height:1;">{value}</div>'
        f'<div style="font-size:10px;text-transform:uppercase;'
        f'letter-spacing:1px;color:#64748b;margin-top:5px;">{label}</div></td>'
    )


def _line(text: str, tone: str = "#334155") -> str:
    return (
        f'<p style="margin:6px 0;font-size:13px;color:{tone};">'
        f'<span style="color:#942F23;">&#9679;</span>&nbsp;&nbsp;{text}</p>'
    )


async def send_daily_summary(today: date | None = None, force: bool = False) -> dict:
    """
    Builds and sends the summary. Returns what it found, so the caller can
    log it without re-querying.
    """
    today = today or date.today()

    from services import order_notification_service

    cfg = await order_notification_service.get_config()
    if not cfg.cc_emails:
        return {"sent": False, "reason": "no CC addresses configured"}

    # ── Tracking ────────────────────────────────────────────────────
    orders = list(await repo.find_all(select(Order)))
    stages = await fast_rows.stages()

    by_order: dict[str, list[OrderStage]] = {}
    for s in stages:
        by_order.setdefault(s.order_no, []).append(s)

    live_orders, done_orders = [], []
    for o in orders:
        st = by_order.get(o.order_no, [])
        if st and all(x.actual_date is not None for x in st):
            done_orders.append(o)
        else:
            live_orders.append(o)

    late_stages = [
        s for s in stages
        if s.actual_date is None and s.plan_date and s.plan_date < today
        and s.stage_code not in ("A0", "A")
    ]

    # Worst order, measured by its single most overdue stage.
    worst_order = None
    if late_stages:
        w = max(late_stages, key=lambda s: (today - s.plan_date).days)
        worst_order = (w, (today - w.plan_date).days)

    # Due in the next seven days, so nobody is surprised on Monday.
    soon = [
        s for s in stages
        if s.actual_date is None and s.plan_date
        and today <= s.plan_date <= today + timedelta(days=7)
    ]

    # Dispatched this month - the "moving well" half of the picture.
    month_start = date(today.year, today.month, 1)
    shipped = [
        s for s in stages
        if s.stage_code == DISPATCH_STAGE and s.actual_date
        and s.actual_date >= month_start
    ]
    shipped_on_time = [
        s for s in shipped if s.plan_date and s.actual_date <= s.plan_date
    ]

    # ── APQP ────────────────────────────────────────────────────────
    projects = list(await repo.find_all(select(ApqpProject)))
    product_by_order = {o.order_no: o.product_name or o.order_no for o in orders}
    product_by_project = {p.project_id: p.product_name or p.project_id for p in projects}
    acts = await fast_rows.activities(ApqpActivityRecord.is_heading.is_(False))

    by_project: dict[str, list[ApqpActivityRecord]] = {}
    for a in acts:
        by_project.setdefault(a.project_id, []).append(a)

    late_acts = [
        a for a in acts
        if a.actual_end is None and a.plan_end and a.plan_end < today
    ]

    worst_project = None
    if late_acts:
        w = max(late_acts, key=lambda a: (today - a.plan_end).days)
        worst_project = (w, (today - w.plan_end).days)

    # The project furthest along, so the summary is not only bad news.
    best_project = None
    for p in projects:
        mine = by_project.get(p.project_id, [])
        if not mine:
            continue
        pct = round(sum(1 for a in mine if a.actual_end) / len(mine) * 100)
        if best_project is None or pct > best_project[1]:
            best_project = (p, pct)

    # Which department is holding things up.
    by_dept: dict[str, int] = {}
    for a in late_acts:
        if a.responsibility:
            by_dept[a.responsibility] = by_dept.get(a.responsibility, 0) + 1
    worst_dept = max(by_dept.items(), key=lambda kv: kv[1]) if by_dept else None

    # ── Build the body ──────────────────────────────────────────────
    cards = (
        '<table role="presentation" width="100%" '
        'style="border-collapse:collapse;background:#FFF7F6;'
        'border-radius:6px;margin:4px 0 18px;"><tr>'
        + _card("Live orders", str(len(live_orders)))
        + _card("Overdue stages", str(len(late_stages)),
                "#c52c2c" if late_stages else "#318044")
        + _card("APQP projects", str(len(projects)))
        + _card("Overdue activities", str(len(late_acts)),
                "#c52c2c" if late_acts else "#318044")
        + "</tr></table>"
    )

    attention = ""
    if worst_order:
        s, days = worst_order
        attention += _line(
            f"<b>{email_service.esc(product_by_order.get(s.order_no, s.order_no))}</b> is furthest behind on tracking &mdash; "
            f"{email_service.stage_label(s.stage_code, s.stage_name)} is "
            f"{plural(days, 'day')} past plan.", "#8a1f1f")
    if worst_project:
        a, days = worst_project
        attention += _line(
            f"<b>{email_service.esc(product_by_project.get(a.project_id, a.project_id))}</b> is furthest behind on APQP &mdash; "
            f"{a.activity_name} is {plural(days, 'day')} past plan.", "#8a1f1f")
    if worst_dept:
        dept, n = worst_dept
        attention += _line(
            f"<b>{dept}</b> has the most outstanding work &mdash; "
            f"{plural(n, 'activity', 'activities')} overdue.", "#8a1f1f")
    if not attention:
        attention = _line("Nothing is past its planned date.", "#318044")

    moving = ""
    if shipped:
        moving += _line(
            f"{plural(len(shipped), 'order')} dispatched this month, "
            f"{len(shipped_on_time)} of them on or before plan.")
    if best_project:
        p, pct = best_project
        moving += _line(
            f"<b>{email_service.esc(p.product_name or p.project_id)}</b> is the most advanced APQP project at {pct}% complete.")
    if done_orders:
        moving += _line(
            f"{plural(len(done_orders), 'order')} fully complete to date.")
    if not moving:
        moving = _line("No orders have been dispatched yet this month.")

    ahead = _line(
        f"{plural(len(soon), 'stage')} fall due in the next seven days."
        if soon else "Nothing falls due in the next seven days."
    )

    heading = (
        '<p style="margin:22px 0 4px;font-size:11px;font-weight:bold;'
        'text-transform:uppercase;letter-spacing:1.2px;color:#64748b;">'
    )

    body = (
        f'<p style="color:#64748b;font-size:13px;margin:0 0 14px;">'
        f'{today.strftime("%A, %d %B %Y")}</p>'
        + cards
        + heading + "Needs attention</p>" + attention
        + heading + "Moving well</p>" + moving
        + heading + "Next seven days</p>" + ahead
        + '<p style="margin-top:22px;font-size:11px;color:#94a3b8;">'
        "Sent once a day. The people responsible receive their own reminders "
        "separately.</p>"
    )

    ok = await email_service.send(
        to_emails=list(cfg.cc_emails),
        cc_emails=[],
        subject=f"Daily summary &mdash; {plural(len(late_stages) + len(late_acts), 'item')} overdue",
        html_body=email_service.wrap("Daily summary", body),
        email_type=EmailType.OVERDUE_DIGEST,
        # "Send now" (force) always sends; the daily job sends once a day.
        dedupe_key=None if force else f"daily-summary:{today.isoformat()}",
    )

    return {
        "sent": bool(ok),
        "reason": ok.reason,
        "overdue_stages": len(late_stages),
        "overdue_activities": len(late_acts),
        "recipients": len(cfg.cc_emails),
    }