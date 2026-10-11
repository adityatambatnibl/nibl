"""
Preview every email the app sends, using REAL data for one product.

    cd backend
    venv\\Scripts\\activate
    python -m database.email_preview CN90001

Writes EMAIL_PREVIEWS_<product>.html next to the project folder and opens it
in your browser. NOTHING is sent and NOTHING is saved:

  * delivery is replaced by "capture the HTML";
  * the email log is not written, and the "already sent" check is skipped;
  * where an email needs an event (a stage just completed, a phase just
    finished) the event is simulated in memory and the whole database
    session is rolled back at the end.

Daily digests and summaries always cover every record in the system -
that is what the real mail contains - so they will list other products too.
"""

import asyncio
import html
import re
import sys
import webbrowser
from datetime import date
from pathlib import Path

from sqlalchemy import func, select

from database import connection, repo
from models.apqp import ApqpActivityRecord, ApqpProject
from models.order import Order, OrderStage
from models.user import User
from services import email_service

NOT_SET = "NOT-CONFIGURED@preview"

captured: list[dict] = []
_current = {"label": ""}


def _capture(msg) -> None:
    body = ""
    for part in msg.walk():
        if part.get_content_type() == "text/html":
            body = part.get_content()
    captured.append({
        "label": _current["label"],
        "subject": str(msg["Subject"] or ""),
        "to": str(msg["To"] or ""),
        "cc": str(msg.get("Cc", "") or ""),
        "html": body,
    })


async def _no_log(_log) -> None:
    return None


async def _never_sent(_key) -> bool:
    return False


def _patch() -> None:
    """Swap delivery and logging for capture. Only affects this process."""
    email_service._deliver = _capture
    email_service._record = _no_log
    email_service._already_sent = _never_sent
    email_service.settings.EMAIL_ENABLED = True

    # Show the email even when no address is configured, so the layout can
    # still be checked - the To line then says NOT-CONFIGURED.
    from services import apqp_notification_service as ans, order_notification_service as ons
    orig_o, orig_a = ons.owners_for, ans.owners_for
    ons.owners_for = lambda cfg, code: orig_o(cfg, code) or [NOT_SET]
    ans.owners_for = lambda cfg, resp: orig_a(cfg, resp) or [NOT_SET]


async def _run(label: str, coro, notes: list[str]) -> None:
    _current["label"] = label
    before = len(captured)
    try:
        await coro
    except Exception as exc:          # show the failure in the preview, keep going
        notes.append(f"{label}: FAILED - {type(exc).__name__}: {exc}")
        return
    if len(captured) == before:
        notes.append(f"{label}: no email (nothing matched, or switched off in Email Settings)")


async def build(product: str) -> Path:
    from services import (
        admin_alert_service as aas,
        apqp_notification_service as ans,
        order_notification_service as ons,
        summary_service as ss,
    )

    _patch()
    await connection.init_db()
    session = connection._sessionmaker()
    connection._session.set(session)
    notes: list[str] = []

    try:
        order = await repo.find_one(
            select(Order).where(func.lower(Order.product_name) == product.lower())
        )
        project = await repo.find_one(
            select(ApqpProject).where(func.lower(ApqpProject.product_name) == product.lower())
        )
        if project is None and order is not None:
            project = await repo.find_one(
                select(ApqpProject).where(ApqpProject.order_no == order.order_no)
            )
        if order is None and project is None:
            raise SystemExit(f"No order or APQP project found with product name '{product}'.")

        # every switch on, for the preview only (rolled back)
        ocfg = await ons.get_config()
        for flag in ("handoff_enabled", "overdue_enabled", "apqp_handoff_enabled",
                     "apqp_overdue_enabled", "signup_alert_enabled",
                     "password_reset_alert_enabled", "password_email_enabled",
                     "approval_email_enabled"):
            setattr(ocfg, flag, True)
        today = date.today()

        # ── Tracking ────────────────────────────────────────────────
        if order is not None:
            stages = list(await repo.find_all(
                select(OrderStage).where(OrderStage.order_no == order.order_no)
                .order_by(OrderStage.schedule_group, OrderStage.sequence)
            ))
            done = [s for s in stages if s.actual_date]
            finished = done[-1] if done else next((s for s in stages if s.plan_date), None)
            if finished is not None:
                if finished.actual_date is None:            # simulate completion
                    finished.actual_date = finished.plan_date or today
                await _run("Tracking - stage complete, next stage can start",
                           ons.notify_handoff(order.order_no, finished), notes)

            late = [s for s in stages if s.actual_date is None and s.plan_date and s.plan_date < today]
            code = (late[0] if late else (stages[0] if stages else None))
            if code is not None:
                await _run("Tracking - overdue reminder for one stage (Send now button)",
                           ons.send_overdue_for_stage(code.stage_code), notes)
                await _run("Tracking - test email (Email Settings)",
                           ons.send_test_email(code.stage_code), notes)
        await _run("Tracking - daily overdue digest (one per owner + CC summary)",
                   ons.send_overdue_digests(), notes)

        # ── APQP ────────────────────────────────────────────────────
        if project is not None:
            acts = [a for a in await repo.find_all(
                select(ApqpActivityRecord)
                .where(ApqpActivityRecord.project_id == project.project_id)
                .order_by(ApqpActivityRecord.sequence)
            ) if not a.is_heading]

            # activity handoff: the last finished activity whose next one is open
            pick = None
            for i, a in enumerate(acts[:-1]):
                if a.actual_end and not acts[i + 1].actual_end:
                    pick = a
            if pick is None and acts:
                pick = acts[0]
                pick.actual_end = pick.actual_end or pick.plan_end or today
            if pick is not None:
                await _run("APQP - activity complete, next activity can start",
                           ans.notify_handoff(project.project_id, pick), notes)

            # phase handoff: finish the first open phase in memory
            phases: list[str] = []
            for a in acts:
                if a.phase_code not in phases:
                    phases.append(a.phase_code)
            open_phase = next((p for p in phases[:-1]
                               if any(a.actual_end is None for a in acts if a.phase_code == p)),
                              phases[0] if phases else None)
            if open_phase:
                in_phase = [a for a in acts if a.phase_code == open_phase]
                for a in in_phase:
                    a.actual_end = a.actual_end or a.plan_end or today
                await _run("APQP - last activity of a phase complete (activity mail + phase mail)",
                           ans.notify_handoff(project.project_id, in_phase[-1]), notes)

            dept = next((a.responsibility for a in acts
                         if a.responsibility and a.actual_end is None
                         and a.plan_end and a.plan_end < today), None)
            dept = dept or next((a.responsibility for a in acts if a.responsibility), None)
            if dept:
                await _run("APQP - overdue reminder for one department (Send now button)",
                           ans.send_overdue_for_department(dept), notes)
                await _run("APQP - test email (Email Settings)", ans.send_test_email(dept), notes)
        await _run("APQP - daily overdue digest (one per department + CC summary)",
                   ans.send_overdue_digests(), notes)

        # ── Summary and account emails ──────────────────────────────
        await _run("Daily summary (CC list)", ss.send_daily_summary(), notes)
        sample = User(name="Sample User", email="sample.user@nibl.in", role="user",
                      status="pending", permissions=[])
        await _run("Admin alert - new access request", aas.notify_signup_request(sample), notes)
        await _run("Admin alert - password reset request", aas.notify_password_reset_request(sample), notes)
        await _run("User - account approved", aas.notify_account_approved(sample), notes)
        await _run("User - account rejected", aas.notify_account_rejected(sample), notes)
    finally:
        await session.rollback()          # nothing from the preview is kept
        await session.close()
        await connection.close_db()

    return _write_page(product, notes)


def _trim_digests(product: str) -> list[dict]:
    """
    A daily digest goes to every owner - dozens of near-identical mails. Keep
    the ones that mention this product (at most 2) plus the CC summary, which
    is always the last one of its group.
    """
    out: list[dict] = []
    labels = list(dict.fromkeys(m["label"] for m in captured))
    for label in labels:
        group = [m for m in captured if m["label"] == label]
        if "digest" not in label or len(group) <= 3:
            out.extend(group)
            continue
        mine = [m for m in group[:-1] if product.lower() in m["html"].lower()][:2]
        out.extend((mine or group[:1]) + [group[-1]])
    return out


def _write_page(product: str, notes: list[str]) -> Path:
    items, nav = [], []
    for i, m in enumerate(_trim_digests(product)):
        nav.append(f'<a href="#m{i}"><b>{i + 1}.</b> {html.escape(m["label"])}</a>')
        items.append(f"""
<section class="mail" id="m{i}">
  <h2>{i + 1}. {html.escape(m['label'])}</h2>
  <table class="meta">
    <tr><th>Subject</th><td>{html.escape(m['subject'])}</td></tr>
    <tr><th>To</th><td>{html.escape(m['to'])}</td></tr>
    <tr><th>CC</th><td>{html.escape(m['cc'] or '-')}</td></tr>
  </table>
  <iframe srcdoc="{html.escape(m['html'], quote=True)}"
    onload="this.style.height=(this.contentWindow.document.documentElement.scrollHeight+20)+'px'"></iframe>
</section>""")
    note_html = "".join(f"<li>{html.escape(n)}</li>" for n in notes)
    page = f"""<!doctype html><html><head><meta charset="utf-8">
<title>Email previews - {html.escape(product)}</title>
<style>
body{{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f1f5f9;color:#0f172a;display:flex}}
nav{{position:sticky;top:0;height:100vh;overflow:auto;width:320px;flex:none;background:#fff;border-right:1px solid #e2e8f0;padding:16px;box-sizing:border-box}}
nav h1{{font-size:15px;margin:0 0 4px}} nav p{{font-size:12px;color:#64748b;margin:0 0 12px}}
nav a{{display:block;padding:7px 8px;border-radius:6px;font-size:13px;color:#334155;text-decoration:none}}
nav a:hover{{background:#fef2f2;color:#b91c1c}}
main{{flex:1;padding:24px;max-width:900px}}
.mail{{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-bottom:28px}}
.mail h2{{font-size:16px;margin:0 0 10px;color:#991b1b}}
.meta{{font-size:13px;border-collapse:collapse;margin-bottom:12px}}
.meta th{{text-align:left;color:#64748b;padding:2px 12px 2px 0;font-weight:600;vertical-align:top}}
iframe{{width:100%;border:1px solid #e2e8f0;border-radius:6px;min-height:400px;background:#fff}}
.notes{{font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 8px 8px 24px}}
</style></head><body>
<nav><h1>Emails for {html.escape(product)}</h1>
<p>Real data from your database, {date.today():%d %b %Y}. Nothing was sent or saved.
{len(items)} emails.</p>{''.join(nav)}
{f'<ul class="notes">{note_html}</ul>' if notes else ''}</nav>
<main>{''.join(items)}</main></body></html>"""
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", product)
    out = Path(__file__).resolve().parents[2] / f"EMAIL_PREVIEWS_{safe}.html"
    out.write_text(page, encoding="utf-8")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit('Usage: python -m database.email_preview "PRODUCT NAME"')
    path = asyncio.run(build(" ".join(sys.argv[1:])))
    print(f"Saved {path}")
    try:
        webbrowser.open(path.as_uri())
    except Exception:
        pass
