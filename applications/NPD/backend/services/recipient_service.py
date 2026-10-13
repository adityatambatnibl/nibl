"""
Per-project email recipients (see models/project_recipients.py).

    resolver = await load_resolver(cfg)
    resolver.stage(order_no, "B")          -> Tracking owners of stage B for that order
    resolver.dept(project_id, "TOOL ROOM") -> APQP addresses of that department for that project

A project with a saved list uses it (an empty list = nobody); a project
without one falls back to the global lists in notification_config.
"""

from __future__ import annotations

import re
from contextvars import ContextVar
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import false, select

from database import repo
from models.apqp import ApqpProject
from models.notification_config import ApqpOwner, NotificationConfig, StageOwner
from models.project_recipients import ProjectRecipients
from models.user import User
from services import template_service
from utils.constants import AccountStatus

APQP_DEPARTMENTS = [
    "MKTG", "R&D", "MKTG & R&D", "CFT", "QA",
    "TOOL ROOM", "MFG GBD", "MFG NBD", "SOURCING", "TL",
]
_EMAIL = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")


def clean_emails(values) -> list[str]:
    out: list[str] = []
    for v in values or []:
        for part in re.split(r"[,;\s]+", str(v or "")):
            e = part.strip().strip("<>").lower()
            if not e:
                continue
            if not _EMAIL.match(e):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"'{part.strip()}' is not a valid email address.")
            if e not in out:
                out.append(e)
    return out


def _norm(dept: str | None) -> str:
    return (dept or "").strip().upper()


# Preview only: while set, exactly one project + stage/department gets the given
# addresses and everyone else gets none, so only that email is built.
#   ("stage", order_no, stage_code, emails)  or  ("dept", project_id, dept, emails)
_override: ContextVar[tuple | None] = ContextVar("recipient_override", default=None)


class Resolver:
    def __init__(self, cfg: NotificationConfig, rows: list[ProjectRecipients]):
        self.cfg = cfg
        self.by_order = {r.order_no: r for r in rows if r.order_no}
        self.by_project = {r.project_id: r for r in rows if r.project_id}
        self._g_stage = {o.stage_code: [e for e in o.emails if e] for o in cfg.owners}
        self._g_dept = {_norm(o.responsibility): [e for e in o.emails if e] for o in cfg.apqp_owners}

    def stage(self, order_no: str | None, stage_code: str) -> list[str]:
        ov = _override.get()
        if ov is not None:
            return list(ov[3]) if ov[0] == "stage" and ov[1] == order_no and ov[2] == stage_code else []
        row = self.by_order.get(order_no) if order_no else None
        if row is not None:
            for o in row.stage_owners:
                if o.stage_code == stage_code:
                    return [e for e in o.emails if e]
            return []
        return list(self._g_stage.get(stage_code, []))

    def dept(self, project_id: str | None, responsibility: str | None) -> list[str]:
        if not responsibility:
            return []
        want = _norm(responsibility)
        ov = _override.get()
        if ov is not None:
            return list(ov[3]) if ov[0] == "dept" and ov[1] == project_id and _norm(ov[2]) == want else []
        row = self.by_project.get(project_id) if project_id else None
        if row is not None:
            for o in row.dept_owners:
                if _norm(o.responsibility) == want:
                    return [e for e in o.emails if e]
            return []
        return list(self._g_dept.get(want, []))


async def load_resolver(cfg: NotificationConfig) -> Resolver:
    return Resolver(cfg, list(await repo.find_all(select(ProjectRecipients))))


async def _cfg() -> NotificationConfig:
    from services.order_notification_service import get_config
    return await get_config()


async def _stage_list() -> list[dict]:
    tpl = await template_service.get_stages()
    return [{"code": s.code, "name": s.name} for s in sorted(tpl.stages, key=lambda s: s.sequence)]


def _as_dict(stage_owners: list[StageOwner], dept_owners: list[ApqpOwner]) -> dict:
    return {
        "stage_owners": {o.stage_code: list(o.emails) for o in stage_owners},
        "dept_owners": {_norm(o.responsibility): list(o.emails) for o in dept_owners},
    }


async def options() -> dict:
    """Everything the 'Emails' step needs: stages, departments, people, and the suggested start values."""
    cfg = await _cfg()
    latest = await repo.find_one(select(ProjectRecipients).order_by(ProjectRecipients.updated_at.desc()))
    defaults = _as_dict(latest.stage_owners, latest.dept_owners) if latest else _as_dict(cfg.owners, cfg.apqp_owners)
    users = await repo.find_all(
        select(User).where(User.is_active.is_(True), User.status == AccountStatus.APPROVED).order_by(User.name)
    )
    return {
        "stages": await _stage_list(),
        "departments": APQP_DEPARTMENTS,
        "users": [{"name": u.name, "email": u.email.lower()} for u in users if u.email],
        "defaults": defaults,
        "defaults_from": "last project" if latest else "email settings",
    }


async def _project_or_404(key: str) -> ApqpProject:
    # Opened from APQP (project id / product name) or from Tracking (order no /
    # order product name) - both lead to the same timeline and the same list.
    p = await repo.find_one(select(ApqpProject).where(
        (ApqpProject.project_id == key) | (ApqpProject.product_name == key) | (ApqpProject.order_no == key)))
    if not p:
        from models.order import Order
        o = await repo.find_one(select(Order).where((Order.order_no == key) | (Order.product_name == key)))
        if o:
            p = await repo.find_one(select(ApqpProject).where(ApqpProject.order_no == o.order_no))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    return p


async def get_for_project(key: str) -> dict:
    """What this project uses now (its own list, or the global one it falls back to)."""
    p = await _project_or_404(key)
    row = await repo.find_one(select(ProjectRecipients).where(
        (ProjectRecipients.project_id == p.project_id)
        | ((ProjectRecipients.order_no == p.order_no) if p.order_no else false())))
    if row:
        data = _as_dict(row.stage_owners, row.dept_owners)
    else:
        cfg = await _cfg()
        data = _as_dict(cfg.owners, cfg.apqp_owners)
    return {"project_id": p.project_id, "order_no": p.order_no, "own_list": bool(row), **data}


async def save(order_no: str | None, project_id: str | None, stage_owners: dict, dept_owners: dict,
               user: User) -> ProjectRecipients:
    stages = {s["code"] for s in await _stage_list()}
    st = [StageOwner(stage_code=k, emails=clean_emails(v)) for k, v in (stage_owners or {}).items() if k in stages]
    dp = [ApqpOwner(responsibility=_norm(k), emails=clean_emails(v))
          for k, v in (dept_owners or {}).items() if _norm(k) in APQP_DEPARTMENTS]
    row = None
    if project_id:
        row = await repo.find_one(select(ProjectRecipients).where(ProjectRecipients.project_id == project_id))
    if row is None and order_no:
        row = await repo.find_one(select(ProjectRecipients).where(ProjectRecipients.order_no == order_no))
    if row is None:
        row = ProjectRecipients(order_no=order_no, project_id=project_id)
        await repo.add(row)
    row.order_no = order_no or row.order_no
    row.project_id = project_id or row.project_id
    row.stage_owners = st
    row.dept_owners = dp
    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = str(user.id)
    await repo.touch()
    return row


async def save_for_project(key: str, stage_owners: dict, dept_owners: dict, user: User) -> dict:
    p = await _project_or_404(key)
    await save(p.order_no, p.project_id, stage_owners, dept_owners, user)
    from services import audit_service
    n = sum(len(v or []) for v in (stage_owners or {}).values()) + sum(len(v or []) for v in (dept_owners or {}).values())
    await audit_service.log("project_recipients_changed", user, "apqp", p.project_id, p.product_name or p.project_id,
                            note=f"{n} address{'es' if n != 1 else ''} across stages and departments")
    return await get_for_project(p.project_id)


# ── Preview: the real emails these people would get ─────────────────────────

async def _example_project(key: str | None) -> ApqpProject | None:
    if key:
        return await _project_or_404(key)
    return await repo.find_one(
        select(ApqpProject).where(ApqpProject.order_no.isnot(None)).order_by(ApqpProject.created_at.desc()))


async def preview(key: str | None, kind: str, code: str, emails: list[str]) -> dict:
    """
    Builds - with the real email code, sending nothing - the two emails a
    stage owner (kind="stage") or a department (kind="dept") gets:
      1. "previous step complete - you can start"   2. the daily overdue reminder.
    Uses this project's data; on Create new timeline (no project yet) the most
    recent project is used as an example.
    """
    from sqlalchemy import select as _select
    from database.connection import db
    from models.apqp import ApqpActivityRecord
    from models.order import OrderStage
    from services import (apqp_notification_service as A, email_service,
                          order_notification_service as O)

    emails = clean_emails(emails) or ["(no address set)"]
    project = await _example_project(key)
    if project is None:
        return {"example": None, "mails": [], "notes": ["No project exists yet to build an example email from."]}
    out, notes = [], []
    today = date.today()

    async def capture(title: str, coro_fn, empty_note: str):
        box = email_service.start_preview()
        try:
            await coro_fn()
        finally:
            email_service._preview.set(None)
        mine = [m for m in box if set(m["to"]) & set(emails)]
        if mine:
            out.extend({"title": title, **m} for m in mine[:3])
        else:
            notes.append(empty_note)

    if kind == "stage":
        order_no = project.order_no
        if not order_no:
            return {"example": project.product_name or project.project_id, "mails": [], "notes": ["This project has no Tracking order."]}
        rows = list(await repo.find_all(_select(OrderStage).where(OrderStage.order_no == order_no)
                                        .order_by(OrderStage.schedule_group, OrderStage.sequence)))
        target = next((r for r in rows if r.stage_code == code), None)
        token = _override.set(("stage", order_no, code, emails))
        try:
            cfg = await O.get_config()
            cfg.handoff_enabled = True
            cfg.overdue_enabled = True
            if target is None:
                notes.append("This stage is not used for this project (not needed for its bearing type).")
            else:
                earlier = [r for r in rows if r.schedule_group == target.schedule_group and r.sequence < target.sequence]
                if not earlier:
                    notes.append("First stage - there is no 'previous stage complete' email for it.")
                else:
                    async def handoff():
                        # try the nearest earlier stages until one hands off to this stage
                        for prev in reversed(earlier[-4:]):
                            saved = prev.actual_date
                            prev.actual_date = today
                            n = await O.notify_handoff(order_no, prev)
                            prev.actual_date = saved
                            if n:
                                break
                    await capture("Previous stage complete - you can start", handoff,
                                  "No 'previous stage complete' email would reach this stage (it starts from a fixed date).")
                await capture("Daily overdue reminder (9:00)", lambda: O.send_overdue_digests(force=True),
                              "Daily reminder: nothing at this stage is overdue for this project today, so no reminder would go out. "
                              "When it is late, they get one email listing it.")
        finally:
            _override.reset(token)
    elif kind == "dept":
        dept = _norm(code)
        acts = [a for a in await repo.find_all(
            _select(ApqpActivityRecord).where(ApqpActivityRecord.project_id == project.project_id)
            .order_by(ApqpActivityRecord.sequence)) if not a.is_heading]
        token = _override.set(("dept", project.project_id, dept, emails))
        try:
            cfg = await O.get_config()
            cfg.apqp_handoff_enabled = True
            cfg.apqp_overdue_enabled = True
            idx = next((i for i, a in enumerate(acts) if _norm(a.responsibility) == dept), None)
            if idx is None:
                notes.append(f"No activity of this project is assigned to {dept}.")
            elif idx == 0:
                notes.append("The first activity belongs to this department - there is no 'previous activity complete' email for it.")
            else:
                prev, nxt = acts[idx - 1], acts[idx]
                async def handoff():
                    s1, s2 = prev.actual_end, nxt.actual_end
                    prev.actual_end, nxt.actual_end = today, None
                    await A.notify_handoff(project.project_id, prev)
                    prev.actual_end, nxt.actual_end = s1, s2
                await capture("Previous activity complete - you can start", handoff,
                              "No handoff email would be built for this department.")
            await capture("Daily overdue reminder (9:00)", lambda: A.send_overdue_digests(force=True),
                          "Daily reminder: nothing of this department is overdue for this project today, so no reminder would go out. "
                          "When something is late, they get one email listing it.")
        finally:
            _override.reset(token)
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "kind must be 'stage' or 'dept'.")

    db().info["failed"] = True     # a preview never keeps anything
    return {"example": project.product_name or project.project_id, "is_example": key is None,
            "mails": out, "notes": notes}
