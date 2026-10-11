import calendar
import logging
from datetime import date, datetime, timezone, timedelta

from fastapi import HTTPException, status
from sqlalchemy import or_, select

from database import repo
from database.connection import after_commit
from models.apqp import ApqpActivityRecord, ApqpProject, ApqpSignOff
from models.order import Order
from models.template import Template, TemplateKind
from models.user import User
from schemas.apqp import CreateApqpRequest, CreateCombinedRequest, UpdateApqpRequest
from schemas.order import CreateOrderRequest
from services import status_service
from services.status_service import StageStatus
from services import fast_rows

MONTHS_IN_PLAN = 5
WEEKS_PER_MONTH = 4


def month_labels(start_month: str) -> list[str]:
    """'2026-09' -> ['2026-09', '2026-10', ... 5 total]"""
    year, month = (int(p) for p in start_month.split("-"))
    out = []
    for _ in range(MONTHS_IN_PLAN):
        out.append(f"{year:04d}-{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return out


def weeks_for_range(
    months: list[str], start: date | None, end: date | None
) -> dict[str, bool]:
    """
    Week columns a date range covers, e.g. {"2026-09-W2": True}.

    Derived from the dates rather than stored, so the grid can never
    disagree with the plan or actual dates beside it. A single date
    colours just its own week.
    """
    if not start and not end:
        return {}

    lo = start or end
    hi = end or start
    if hi < lo:
        lo, hi = hi, lo

    out: dict[str, bool] = {}
    for ym in months:
        year, month = (int(p) for p in ym.split("-"))
        last = calendar.monthrange(year, month)[1]
        for w in range(1, WEEKS_PER_MONTH + 1):
            w_lo = date(year, month, 1 + (w - 1) * 7)
            # the final column absorbs whatever is left of the month
            w_hi = date(year, month, last if w == WEEKS_PER_MONTH
                        else min(w * 7, last))
            if lo <= w_hi and hi >= w_lo:
                out[f"{ym}-W{w}"] = True
    return out


async def get_template() -> Template:
    tpl = await repo.find_one(
        select(Template).where(
            Template.kind == TemplateKind.APQP_PHASES, Template.is_active.is_(True)
        )
    )
    if not tpl:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "No active APQP template found. Run 'python -m database.seed_apqp'.",
        )
    return tpl


def activity_status(a: ApqpActivityRecord, today: date | None = None) -> dict:
    """End dates drive status - an activity is done when actual_end is set."""
    st = status_service.stage_status(a.plan_end, a.actual_end, today)
    return {"status": st, "delay_days": status_service.delay_days(a.plan_end, a.actual_end, today)}


async def create(data: CreateApqpRequest, user: User) -> ApqpProject:
    tpl = await get_template()
    project_id = data.project_id.strip().upper()

    if await repo.exists(select(ApqpProject).where(ApqpProject.project_id == project_id)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"APQP project '{project_id}' already exists.")

    linked_order = None
    if data.order_no:
        linked_order = await repo.find_one(select(Order).where(Order.order_no == data.order_no))
        if not linked_order:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Order '{data.order_no}' not found.")
        await _ensure_order_free(data.order_no, except_project_id=None)

    project = ApqpProject(
        project_id=project_id,
        order_no=data.order_no,
        customer=data.customer.strip(),
        product_name=data.product_name,
        customer_part_no=data.customer_part_no,
        program_name=data.program_name,
        application=data.application,
        supply_condition=data.supply_condition,
        enquiry_date=data.enquiry_date,
        order_date=data.order_date,
        original_date=data.original_date,
        ppap_date=data.ppap_date,
        sample_submission_date=data.sample_submission_date,
        months=month_labels(data.start_month),
        template_version=tpl.version,
        created_by=str(user.id),
    )

    try:
        async with repo.savepoint():
            await repo.add(project)
    except repo.IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, f"APQP project '{project_id}' already exists.")

    # Two dates come from the order paperwork, not the timing plan.
    # Matched on activity NAME, never on no_label - labels shift whenever
    # an activity is inserted into a phase.
    #
    # Both values are known before the rows are built, so they are applied
    # as the records are created. The Mongo version inserted all 65 rows,
    # read them back, then saved two of them again.
    seeds = {
        "receipt of enquiry": data.enquiry_date,
        "p.o from customer": linked_order.order_date if linked_order else None,
    }

    records = []
    for phase in sorted(tpl.phases, key=lambda p: p.sequence):
        for a in sorted(phase.activities, key=lambda x: x.sequence):
            seeded = seeds.get(a.name.strip().lower())
            records.append(
                ApqpActivityRecord(
                    project_id=project_id,
                    activity_id=a.activity_id,
                    phase_code=a.phase_code,
                    no_label=a.no_label,
                    activity_name=a.name,
                    sequence=a.sequence,
                    is_heading=getattr(a, "is_heading", False),
                    check_point=a.default_check_point,
                    responsibility=a.default_responsibility,
                    plan_start=seeded,
                    plan_end=seeded,
                )
            )

    # No hand-written cleanup on failure any more: the request is one
    # transaction, so if any of this raises, the project row goes with it.
    await repo.add_all(records)
    await repo.add(ApqpSignOff(project_id=project_id))

    # Fill the plan dates from the chain. Only blanks are written, so the
    # two seeded dates set just above are left alone.
    try:
        await apply_plan_chain(project)
    except Exception as exc:
        # Never lose the project over a date problem - but say so, rather
        # than failing silently the way this did before.
        logging.getLogger("apqp").warning(
            "Plan chain skipped for %s: %s", project_id, exc
        )

    return project


async def get_or_404(project_id: str) -> ApqpProject:
    project = await repo.find_one(select(ApqpProject).where(ApqpProject.project_id == project_id))
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "APQP project not found.")
    return project


async def get_activities(project_id: str) -> list[ApqpActivityRecord]:
    return list(
        await repo.find_all(
            select(ApqpActivityRecord)
            .where(ApqpActivityRecord.project_id == project_id)
            .order_by(ApqpActivityRecord.sequence.asc())
        )
    )


async def get_sign_off(project_id: str) -> ApqpSignOff:
    so = await repo.find_one(select(ApqpSignOff).where(ApqpSignOff.project_id == project_id))
    if not so:
        so = ApqpSignOff(project_id=project_id)
        await repo.add(so)
    return so


def summarise(activities: list[ApqpActivityRecord], today: date | None = None) -> dict:
    # An activity with no plan date and no actual date is one an admin has
    # cleared - it is not part of this programme. Counting it would hold the
    # percentage below 100 for work nobody intends to do. A cleared plan
    # date WITH an actual date still counts: the work happened.
    activities = [
        a for a in activities
        if a.plan_end is not None or a.actual_end is not None
    ]
    total = len(activities)
    if total == 0:
        return {"percent": 0, "completed": 0, "overdue": 0, "status": StageStatus.NOT_STARTED}

    completed = overdue = 0
    # Same rule as activity_status(), with today looked up once (this runs
    # for every activity of every project on the big screens).
    today = today or date.today()
    stage_status = status_service.stage_status
    for a in activities:
        st = stage_status(a.plan_end, a.actual_end, today)
        if st in (StageStatus.COMPLETED, StageStatus.COMPLETED_LATE):
            completed += 1
        elif st == StageStatus.OVERDUE:
            overdue += 1

    if completed == total:
        overall = "completed"
    elif overdue:
        overall = "delayed"
    elif completed:
        overall = "in_progress"
    else:
        overall = "not_started"

    return {
        "percent": int(completed / total * 100),
        "completed": completed,
        "overdue": overdue,
        "status": overall,
    }


def phase_rollup(tpl: Template, activities: list[ApqpActivityRecord], today: date | None = None) -> list[dict]:
    """Phase dates derived from their activities - no duplicate data entry."""
    by_phase: dict[str, list[ApqpActivityRecord]] = {}
    for a in activities:
        by_phase.setdefault(a.phase_code, []).append(a)

    today = today or date.today()
    out = []
    for phase in sorted(tpl.phases, key=lambda p: p.sequence):
        acts = by_phase.get(phase.phase_code, [])
        s = summarise(acts, today)

        plan_starts = [a.plan_start for a in acts if a.plan_start]
        plan_ends = [a.plan_end for a in acts if a.plan_end]
        actual_starts = [a.actual_start for a in acts if a.actual_start]
        actual_ends = [a.actual_end for a in acts if a.actual_end]
        all_done = bool(acts) and len(actual_ends) == len(acts)

        out.append({
            "phase_code": phase.phase_code,
            "phase_name": phase.phase_name,
            "sequence": phase.sequence,
            "plan_start": min(plan_starts) if plan_starts else None,
            "plan_end": max(plan_ends) if plan_ends else None,
            "actual_start": min(actual_starts) if actual_starts else None,
            "actual_end": max(actual_ends) if all_done else None,
            "total": len(acts),
            "completed": s["completed"],
            "overdue": s["overdue"],
            "percent": s["percent"],
            "status": s["status"],
        })
    return out


def summary_from_counts(
    tpl: Template, phases: dict[str, tuple[int, int, int, int]], phase_names: dict[str, str],
) -> tuple[dict, str | None, int]:
    """
    summarise() + "current phase" from per-phase counts (see
    fast_rows.phase_counts) instead of every activity row. Same rules, same
    results - used by the big list screens.

    Returns (summary, current phase name, number of activities).
    """
    n_all = sum(v[0] for v in phases.values())
    total = sum(v[1] for v in phases.values())
    completed = sum(v[2] for v in phases.values())
    overdue = sum(v[3] for v in phases.values())

    if total == 0:
        s = {"percent": 0, "completed": 0, "overdue": 0, "status": StageStatus.NOT_STARTED}
    else:
        if completed == total:
            overall = "completed"
        elif overdue:
            overall = "delayed"
        elif completed:
            overall = "in_progress"
        else:
            overall = "not_started"
        s = {
            "percent": int(completed / total * 100),
            "completed": completed,
            "overdue": overdue,
            "status": overall,
        }

    # First phase (template order) that has activities and is not 100 %.
    current = None
    for phase in sorted(tpl.phases, key=lambda p: p.sequence):
        ph_all, ph_counted, ph_done, _ = phases.get(phase.phase_code, (0, 0, 0, 0))
        ph_percent = int(ph_done / ph_counted * 100) if ph_counted else 0
        if ph_all and ph_percent < 100:
            current = phase_names.get(phase.phase_code)
            break
    return s, current, n_all


async def list_projects(search: str | None = None) -> list[dict]:
    stmt = select(ApqpProject).order_by(ApqpProject.created_at.desc())
    if search:
        # Escaped ilike, not a regex built from the search box - the Mongo
        # version passed the raw text to $regex, where "(" was an error and
        # a crafted pattern could hang the query.
        needle = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(
            or_(
                ApqpProject.project_id.ilike(needle, escape="\\"),
                ApqpProject.product_name.ilike(needle, escape="\\"),
                ApqpProject.customer.ilike(needle, escape="\\"),
                ApqpProject.customer_part_no.ilike(needle, escape="\\"),
            )
        )

    projects = list(await repo.find_all(stmt))
    if not projects:
        return []

    # Counted in the database per project and phase - the activity rows
    # themselves are not needed for a list (see fast_rows.phase_counts).
    ids = [p.project_id for p in projects]
    today = date.today()
    counts = await fast_rows.phase_counts(
        today, *([fast_rows.one_of(ApqpActivityRecord.project_id, ids)] if search else [])
    )

    tpl = await get_template()
    phase_names = {p.phase_code: p.phase_name for p in tpl.phases}

    result = []
    for p in projects:
        s, current, n_acts = summary_from_counts(tpl, counts.get(p.project_id, {}), phase_names)

        result.append({
            "project_id": p.project_id,
            "order_no": p.order_no,
            "customer": p.customer,
            "product_name": p.product_name,
            "customer_part_no": p.customer_part_no,
            "current_phase": current,
            "total_activities": n_acts,
            "completed": s["completed"],
            "overdue": s["overdue"],
            "percent": s["percent"],
            "status": s["status"],
        })
    return result


async def _ensure_order_free(order_no: str, *, except_project_id: str | None) -> None:
    """
    An order belongs to one APQP project. Linking a second project to it
    is refused - otherwise deleting either project would take the shared
    order (and all its stages) with it.
    """
    stmt = select(ApqpProject).where(ApqpProject.order_no == order_no)
    if except_project_id:
        stmt = stmt.where(ApqpProject.project_id != except_project_id)
    other = await repo.find_one(stmt)
    if other:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Order '{order_no}' already belongs to "
            f"'{other.product_name or other.project_id}'. One order can only be linked to one project.",
        )


async def update_header(project_id: str, data: UpdateApqpRequest, user: User) -> ApqpProject:
    project = await get_or_404(project_id)

    payload = data.model_dump(exclude_unset=True)

    if "customer" in payload and not payload["customer"]:
        raise HTTPException(422, "Customer cannot be empty.")

    # Re-linking to a different order: that order must exist and must not
    # already belong to another project. A blank value is not a link.
    if "order_no" in payload:
        new_no = payload["order_no"] or None
        if new_no is None or new_no == project.order_no:
            payload.pop("order_no")
        else:
            if not await repo.exists(select(Order).where(Order.order_no == new_no)):
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Order '{new_no}' not found.")
            await _ensure_order_free(new_no, except_project_id=project.project_id)

    # The product name is the identity of the paired order too, so it is
    # checked against other orders and mirrored onto the linked one -
    # otherwise the links (which use the product name) would break.
    if "product_name" in payload:
        name = (payload["product_name"] or "").strip()
        if not name:
            # The product name is the shared identity with Tracking; a blank
            # one would split the pair. Keep the current name.
            payload.pop("product_name")
        else:
            payload["product_name"] = name
            linked_no = payload.get("order_no") or project.order_no
            from services import order_service
            await order_service.ensure_product_name_free(
                name, except_order_no=linked_no, except_project_id=project.project_id,
            )

    for field, value in payload.items():
        setattr(project, field, value)
    project.updated_at = datetime.now(timezone.utc)
    project.updated_by = str(user.id)

    # The order date and product name are one fact each, shown in two
    # places. Editing them here writes them to the linked order too, so
    # Tracking and the timeline can never disagree. Only when they were
    # actually part of this request - otherwise an unrelated edit would
    # blank the order's values.
    if project.order_no and ("order_date" in payload or payload.get("product_name")):
        linked = await repo.find_one(
            select(Order).where(Order.order_no == project.order_no)
        )
        if linked:
            if "order_date" in payload and project.order_date and linked.order_date != project.order_date:
                linked.order_date = project.order_date
            if payload.get("product_name"):
                linked.product_name = project.product_name
            linked.updated_at = project.updated_at
            linked.updated_by = str(user.id)

    # Those two dates anchor the whole chain, so changing either has to move
    # every plan date after it. Actual dates are left alone.
    if "enquiry_date" in payload or "order_date" in payload:
        await apply_plan_chain(project, overwrite=True)

    return project

    
async def update_activities(project_id: str, updates: list, user: User) -> list[ApqpActivityRecord]:
    await get_or_404(project_id)
    now = datetime.now(timezone.utc)

    newly_done: list[ApqpActivityRecord] = []
    plan_moved: list[str] = []
    changes: list[str] = []

    # One query for every row being edited, instead of one round trip each.
    ids = [repo.as_uuid(u.id) for u in updates]
    loaded = {
        str(r.id): r
        for r in await repo.find_all(
            select(ApqpActivityRecord).where(ApqpActivityRecord.id.in_([i for i in ids if i]))
        )
    }

    for u in updates:
        rec = loaded.get(str(repo.as_uuid(u.id)))
        if not rec or rec.project_id != project_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Activity {u.id} not found in this project.")

        was_open = rec.actual_end is None          # remember the state first
        old_plan_start = rec.plan_start
        old_plan_end = rec.plan_end

        payload = u.model_dump(exclude_unset=True, exclude={"id"})

        # The plan IS the schedule (dates, plan weeks, who is responsible), so
        # only an admin changes it. Users with APQP edit keep actual dates,
        # actual weeks, remarks and check points.
        if not user.is_admin:
            for k in ("plan_start", "plan_end", "week_flags", "responsibility"):
                payload.pop(k, None)

        for field, value in payload.items():
            if field in _ACTIVITY_FIELDS and getattr(rec, field) != value:
                changes.append(_activity_change(rec, field, value))
            setattr(rec, field, value)

        # Moving the START alone would change the activity's duration and
        # leave the chain untouched, because everything downstream hangs off
        # plan_end. So the end is carried along by the same number of days -
        # unless the admin set both, in which case they meant both.
        if (
            rec.plan_start is not None
            and old_plan_start is not None
            and old_plan_end is not None
            and rec.plan_start != old_plan_start
            and rec.plan_end == old_plan_end
        ):
            rec.plan_end = old_plan_end + (rec.plan_start - old_plan_start)

        rec.updated_at = now
        rec.updated_by = str(user.id)

        if was_open and rec.actual_end is not None and not rec.is_heading:
            newly_done.append(rec)

        if rec.plan_end != old_plan_end or rec.plan_start != old_plan_start:
            plan_moved.append(str(rec.id))

    # A moved plan end drags everything after it. Cascade from the EARLIEST
    # edited row, so one pass covers however many were changed at once.
    if plan_moved:
        ordered = list(
            await repo.find_all(
                select(ApqpActivityRecord)
                .where(ApqpActivityRecord.project_id == project_id)
                .order_by(ApqpActivityRecord.sequence)
            )
        )
        rows = {str(a.id): i for i, a in enumerate(ordered, start=1)}
        candidates = [rows[i] for i in plan_moved if i in rows]
        if candidates:
            await cascade_plan_from(project_id, min(candidates))

    await repo.touch()

    if changes:
        from services import audit_service
        project = await get_or_404(project_id)
        await audit_service.log(
            "activities_updated", user, "apqp", project_id,
            project.product_name or project_id,
            note=audit_service.summarise(changes),
        )

    # Handoff emails go out AFTER the save commits, in the background, so the
    # user never waits for SMTP and a rolled-back save sends nothing.
    for rec in newly_done:
        after_commit(_handoff_job(project_id, str(rec.id)))

    return await get_activities(project_id)


def _handoff_job(project_id: str, activity_id: str):
    async def job():
        from services import apqp_notification_service
        rec = await repo.get(ApqpActivityRecord, activity_id)
        if rec is not None:
            await apqp_notification_service.notify_handoff(project_id, rec)
    return job


async def update_sign_off(project_id: str, data) -> ApqpSignOff:
    await get_or_404(project_id)
    so = await get_sign_off(project_id)
    so.team = data.team
    so.prepared_by = data.prepared_by
    so.reviewed_by = data.reviewed_by
    so.approved_by = data.approved_by
    so.updated_at = datetime.now(timezone.utc)
    return so


async def delete(project_id: str) -> dict:
    from services import attachment_service, order_service

    project = await get_or_404(project_id)
    order_no = project.order_no

    files = await attachment_service.delete_for_project(project_id)
    activities = await repo.count(
        select(ApqpActivityRecord).where(ApqpActivityRecord.project_id == project_id)
    )

    # Activities and the sign-off both carry ON DELETE CASCADE from
    # apqp_projects.project_id, so removing the project takes them with it.
    await repo.remove(project)

    # A paired record shares one reference, so remove the order too.
    # order_service.delete() unlinks APQP projects first, but this one is
    # already gone, so that step simply finds nothing.
    order_result = None
    if order_no:
        # Only remove the order if it really is this project's pair - never
        # one that another project is also linked to.
        shared = await repo.exists(
            select(ApqpProject).where(
                ApqpProject.order_no == order_no,
                ApqpProject.project_id != project_id,
            )
        )
        if not shared:
            try:
                order_result = await order_service.delete(order_no)
            except HTTPException:
                pass          # order already gone - nothing to do

    return {
        "activities": activities,
        "attachments": files,
        "order_deleted": order_no if order_result else None,
        "order_items": (order_result or {}).get("items", 0),
        "order_stages": (order_result or {}).get("stages", 0),
    }


async def create_with_order(data: CreateCombinedRequest, user: User) -> tuple[str, str]:
    """
    Creates the production order and its APQP project as one action.

    The order goes first because the APQP project stores order_no and
    apqp_service.create() checks that the order exists.

    The APQP project reuses the order number as its own id, so an order and
    its quality plan always share one reference.

    Returns (order_no, project_id) - both the same string.
    """
    from services import order_service

    order_req = CreateOrderRequest(
        product_name=data.product_name,
        order_no=data.order_no,
        order_date=data.order_date,
        customer_name=data.customer,
        planned_delivery_sample=data.planned_delivery_sample,
        planned_delivery_batch=data.planned_delivery_batch,
        rpd_status=data.rpd_status,
        notes=data.notes,
        groups=data.groups,
    )
    order = await order_service.create(order_req, user)

    # If the APQP half fails, the exception unwinds the request's
    # transaction and the order goes with it. The Mongo version had to
    # delete the order by hand here, and that cleanup could itself fail -
    # leaving exactly the half-made record it was trying to prevent.
    apqp_req = CreateApqpRequest(
        project_id=order.order_no,          # same id for both records
        order_no=order.order_no,
        customer=data.customer,
        product_name=order.product_name,
        customer_part_no=data.customer_part_no,
        program_name=data.program_name,
        application=data.application,
        supply_condition=data.supply_condition,
        enquiry_date=data.enquiry_date,
        order_date=data.order_date,
        original_date=data.original_date,
        ppap_date=data.ppap_date,
        sample_submission_date=data.sample_submission_date,
        start_month=data.start_month,
    )
    project = await create(apqp_req, user)

    # Point the order back at the project, so the link works both ways.
    order.apqp_project_id = project.project_id

    if data.stage_owners is not None or data.dept_owners is not None:
        from services import recipient_service
        await recipient_service.save(order.order_no, project.project_id,
                                     data.stage_owners or {}, data.dept_owners or {}, user)
    return order.order_no, project.project_id


def week_columns(months: list[str]) -> list[str]:
    """The 20 week labels for a project: 2026-09-W1 ... 2027-01-W4."""
    return [f"{ym}-W{w}" for ym in months for w in range(1, WEEKS_PER_MONTH + 1)]




def effective_months(
    project: ApqpProject, activities: list[ApqpActivityRecord]
) -> list[str]:
    """
    The month list stretched to cover every date on the project.

    project.months is the 5-month window chosen at creation. Plan dates are
    calculated from the enquiry / order date, so they often fall BEFORE that
    window (and actual dates can run past it). If the grid only showed the
    original window, those weeks would have no colour at all - so the window
    grows in both directions to fit every plan and actual date. It never
    shrinks below the original 5 months.
    """
    months = list(project.months)
    if not months:
        return months

    dates = [
        d
        for a in activities
        for d in (a.plan_start, a.plan_end, a.actual_start, a.actual_end)
        if d
    ]
    if not dates:
        return months

    def ym_index(y: int, m: int) -> int:
        return y * 12 + (m - 1)

    first_y, first_m = (int(p) for p in months[0].split("-"))
    last_y, last_m = (int(p) for p in months[-1].split("-"))
    earliest, latest = min(dates), max(dates)

    lo = min(ym_index(first_y, first_m), ym_index(earliest.year, earliest.month))
    hi = max(ym_index(last_y, last_m), ym_index(latest.year, latest.month))

    return [f"{i // 12:04d}-{i % 12 + 1:02d}" for i in range(lo, hi + 1)]


# ═══════════════════════════════════════════════════════════════════════
# APQP PLAN DATE CHAIN
# ═══════════════════════════════════════════════════════════════════════

# Row -> (what it waits for, how many days it takes).
#
#   plan_start = the predecessor's plan_end
#   plan_end   = plan_start + days
#
# Rows are the activities in display order, 1 to 65. Two anchors:
# "ENQUIRY" is the enquiry date typed on the create form, "ORDER" is the
# order date. Rows not listed (3.7 onwards) get no plan dates.
PLAN_CHAIN: dict[int, tuple[int | str, int]] = {
    # ── Phase 0 ──────────────────────────────────────────────
    1:  ("ENQUIRY", 1),   # 0.1    Receipt of Enquiry
    2:  (1, 1),           # 0.1 a  Customer Data Sheet
    3:  (2, 1),           # 0.1 b  Quality System Review Check List
    4:  (3, 1),           # 0.1 c  Customer Drawing / Specification
    5:  (4, 2),           # 0.1 d  Customer samples
    6:  (5, 7),           # 0.1 e  Customer specific requirement
    7:  (6, 2),           # 0.2    Project feasibility assessment
    8:  (7, 5),           # 0.2 a  Sample study report
    9:  (8, 4),           # 0.3    Proposal to customer
    10: (9, 2),           # 0.3 a  NPD Project approval / P.O.
    11: ("ORDER", 3),     # 0.3 b  P.O from customer
    12: (11, 1),          # 0.3 c  Project risk assessment

    # ── Phase 1 ──────────────────────────────────────────────
    13: (12, 2),          # 1.1    Team Feasibility Commitment
    14: (13, 2),          # 1.1 a  Review Feasibility sheet
    15: (14, 1),          # 1.1 b  Technical Feasibility
    16: (15, 1),          # 1.1 c  Check list for training need
    17: (16, 1),          # 1.2    Receipt information / Review Check Sheet
    18: (17, 2),          # 1.3    Timing Plan / Gantt chart

    # ── Phase 2 ──────────────────────────────────────────────
    19: (18, 1),          # 2.1    Quality Data
    20: (19, 3),          # 2.2    Bench Marking
    21: (20, 3),          # 2.3    Product drawing, Part list
    22: (21, 3),          # 2.4    Special product characteristics
    23: (22, 3),          # 2.5    Design Goal
    24: (23, 3),          # 2.6    Reliability & Quality Goal
    25: (24, 3),          # 2.7    Conduct DFMEA
    26: (25, 1),          # 2.8    Process Assumption
    27: (26, 2),          # 2.9    ERP activity
    28: (27, 3),          # 2.9 a  Component Drawings
    29: (28, 1),          # 2.10   Statutory & regulatory review
    30: (29, 8),          # 2.11   Tool drawings
    31: (30, 2),          # 2.12   Facility Planning
    32: (31, 2),          # 2.13   Design Review
    33: (32, 2),          # 2.14   Management Support
    34: (33, 2),          # 2.15   Indenting Process
    35: (34, 3),          # 2.15 a Indenting for RM / boughtout

    # ── Phase 3 ──────────────────────────────────────────────
    36: (35, 1),          # 3.1    Gauge Plan
    37: (36, 1),          # 3.2    Test Timing Plan
    38: (37, 1),          # 3.3    Review of open issues
    39: (38, 1),          # 3.4    MSA plan
    40: (39, 1),          # 3.5    SPC plan
    41: (40, 45),         # 3.6    Manufacturing of Tools and Gauges
    42: (40, 2),          # 3.7
    43: (42, 2),          # 3.8   
    44: (43, 2),          # 3.9 
    45: (44, 2),          # 3.10   
    46: (45, 2),          # 3.11 
    47: (46, 2),          # 3.12  
    48: (47, 3),          # 3.13   
    49: (48, 3),          # 3.13 a   
    50: (49, 3),          # 3.13 b   
    51: (34, 45),          # 3.13 c   
    52: (34, 45),          # 3.13 d   
    53: (51, 45),          # 3.14    
    54: (53, 2),      # 3.15    
    55: (54, 8),      # 4.1    
    56: (54, 1),      # 4.1 a 
    57: (54, 20),      # 4.1 b    
    58: (55, 1),      # 4.1 c    
    59: (55, 3),      # 4.1 d    
    60: (59, 2),      # 4.1 e    
    61: (60, 5),      # 4.2     
    62: (61, 2),      # 4.3     
    63: (62, 2),      # 4.4     
    64: (63, 15),      # 5.1     
    65: (64, 15),      # 5.2     



}


def compute_plan_chain(
    count: int, enquiry_date: date | None, order_date: date | None
) -> dict[int, tuple[date, date]]:
    """
    Walks PLAN_CHAIN and returns {row: (plan_start, plan_end)}.

    A row is skipped when its anchor is missing or its predecessor
    produced nothing - a broken link stops that branch rather than
    inventing a date.
    """
    out: dict[int, tuple[date, date]] = {}

    for row in sorted(PLAN_CHAIN):
        if row > count:
            break                      # template shorter than the chain

        after, days = PLAN_CHAIN[row]

        if after == "ENQUIRY":
            start = enquiry_date
        elif after == "ORDER":
            start = order_date
        else:
            prev = out.get(after)
            start = prev[1] if prev else None      # predecessor's END

        if start is None:
            continue                   # no anchor - leave this one blank

        out[row] = (start, start + timedelta(days=days))

    return out


async def apply_plan_chain(project: ApqpProject, *, overwrite: bool = False) -> int:
    """
    Fills plan_start / plan_end from the chain.

    By default only blank dates are written, so a re-run never disturbs a
    project that is already planned. With overwrite=True every chain row is
    recalculated - used when the enquiry or order date changes, because
    those two anchor the whole chain and everything after them must move.

    Actual dates are never touched either way.
    """
    # The project's own date wins. It is seeded from the order, so they
    # normally agree - but once someone edits it here, the quality plan
    # follows the edit rather than silently reverting.
    order_date = project.order_date
    if order_date is None and project.order_no:
        linked = await repo.find_one(
            select(Order).where(Order.order_no == project.order_no)
        )
        order_date = linked.order_date if linked else None   

    acts = list(
        await repo.find_all(
            select(ApqpActivityRecord)
            .where(ApqpActivityRecord.project_id == project.project_id)
            .order_by(ApqpActivityRecord.sequence)
        )
    )

    dates = compute_plan_chain(len(acts), project.enquiry_date, order_date)

    written = 0
    for idx, a in enumerate(acts, start=1):      # rows are 1-based
        pair = dates.get(idx)
        if not pair:
            continue
        if overwrite or (a.plan_start is None and a.plan_end is None):
            # The session already tracks these rows, so assigning IS the
            # write. There is no .save() and no commit here - the request
            # commits once, in the middleware.
            a.plan_start, a.plan_end = pair
            written += 1

    return written

async def cascade_plan_from(project_id: str, from_row: int) -> int:
    """
    Re-walks the plan chain AFTER a manually edited row.

    The edited row becomes a new anchor: whatever date an admin typed stays,
    and every row that follows it in PLAN_CHAIN is recalculated from there
    using the same offsets. Rows BEFORE it are untouched, because the admin
    was correcting from that point forward, not rewriting the history.

    Returns how many rows moved.
    """
    acts = list(
        await repo.find_all(
            select(ApqpActivityRecord)
            .where(ApqpActivityRecord.project_id == project_id)
            .order_by(ApqpActivityRecord.sequence)
        )
    )
    by_row = {i: a for i, a in enumerate(acts, start=1)}

    moved = 0
    for row in sorted(PLAN_CHAIN):
        if row <= from_row:
            continue                    # at or before the edit - leave alone

        rec = by_row.get(row)
        if rec is None:
            continue

        after, days = PLAN_CHAIN[row]

        # A row anchored to ENQUIRY or ORDER has its own start date, so the
        # chain restarts there rather than following the edit.
        if not isinstance(after, int):
            continue

        prev = by_row.get(after)
        if prev is None or prev.plan_end is None:
            continue

        start = prev.plan_end
        end = start + timedelta(days=days)
        if rec.plan_start != start or rec.plan_end != end:
            rec.plan_start, rec.plan_end = start, end
            moved += 1

    return moved



async def resolve_project(key: str) -> ApqpProject:
    """
    Finds a project by product name (its own, or its order's) or by
    project_id. Links use the product name; old links use the id.
    """
    key = key.strip()

    found = await repo.find_one(select(ApqpProject).where(ApqpProject.project_id == key))
    if found:
        return found

    found = await repo.find_one(select(ApqpProject).where(ApqpProject.product_name == key))
    if found:
        return found

    linked = await repo.find_one(select(Order).where(Order.product_name == key))
    if linked:
        found = await repo.find_one(
            select(ApqpProject).where(ApqpProject.order_no == linked.order_no)
        )
        if found:
            return found

    # project ids are stored upper-case
    return await get_or_404(key.upper())


_ACTIVITY_FIELDS = {
    "plan_start": "plan start", "plan_end": "plan end",
    "actual_start": "actual start", "actual_end": "actual end",
    "responsibility": "responsibility", "check_point": "check point", "remark": "remark",
}


def _activity_change(rec: ApqpActivityRecord, field: str, value) -> str:
    """'1.1 Team Feasibility: actual end 03-May-2026' - short activity name."""
    from services.audit_service import fmt
    name = rec.activity_name.strip()
    if len(name) > 32:
        name = name[:30].rstrip() + "…"
    label = _ACTIVITY_FIELDS[field]
    if field in ("remark", "check_point"):
        return f"{name}: {label} {'cleared' if not value else 'updated'}"
    return f"{name}: {label} {fmt(value)}"
