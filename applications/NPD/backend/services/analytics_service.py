"""
Reporting queries.

The MongoDB version ran seven hand-written aggregation pipelines through
`get_pymongo_collection().aggregate()`, bypassing the ODM entirely. Those are
now ordinary SQL GROUP BY queries: the same numbers, but expressed in the
language the database actually optimises, and type-checked against the model
columns rather than assembled from dictionaries of magic strings.

One class of bug disappears with them. Under Mongo, `plan_date` was compared
against `today.isoformat()` - a string - in some pipelines and against a
datetime in others. BSON orders dates before strings, so the string form made
`$lt` true for every row regardless of the date. Postgres compares a `date`
column to a `date` and would reject anything else outright.
"""

from datetime import date, datetime, timedelta

from sqlalchemy import Integer, and_, case, cast, distinct, func, select

from database import repo
from database.connection import db
from models.apqp import ApqpActivityRecord, ApqpProject
from models.order import Order, OrderItem, OrderStage
from schemas.analytics import (
    AnalyticsResponse, AnalyticsFilters, StageBottleneck, DelayReasonCount,
    OnTimeSummary, MonthlyTrend, LeadTimeComparison, DepartmentLoad,
    IntakeMonth, OrderBook, CustomerShare, CycleTime,
    PhaseProgress, ApqpProjectProgress,
)
from services import template_service
from services import fast_rows

DISPATCH_STAGE = "X"

# Postgres subtracts two dates into a plain integer number of days. Casting
# makes that explicit so the value arrives as an int rather than something
# the driver has to guess at.
STAGE_DELAY = case(
    (
        and_(OrderStage.actual_date.isnot(None), OrderStage.plan_date.isnot(None)),
        cast(OrderStage.actual_date - OrderStage.plan_date, Integer),
    ),
    else_=None,
)

ACT_DELAY = case(
    (
        and_(ApqpActivityRecord.actual_end.isnot(None), ApqpActivityRecord.plan_end.isnot(None)),
        cast(ApqpActivityRecord.actual_end - ApqpActivityRecord.plan_end, Integer),
    ),
    else_=None,
)


def _num(v) -> float | None:
    """Postgres returns avg() as numeric, which arrives as Decimal."""
    return None if v is None else float(v)


def _stage_scope(order_nos: list[str] | None) -> list:
    """WHERE clauses narrowing to the filtered orders. Empty list = no filter."""
    return [] if order_nos is None else [fast_rows.one_of(OrderStage.order_no, order_nos)]


def _proj_scope(project_ids: list[str] | None) -> list:
    return [] if project_ids is None else [fast_rows.one_of(ApqpActivityRecord.project_id, project_ids)]


async def _scoped_order_nos(filters: AnalyticsFilters) -> list[str] | None:
    """
    Narrows the analysis to a set of order numbers.
    Returns None when no filter is set, meaning "everything".
    """
    where = []

    if filters.customer:
        where.append(Order.customer_name == filters.customer)

    # Month filter, e.g. "2026-08". order_date is a real DATE column, so this
    # is a plain half-open range - no string comparison to go wrong.
    if filters.month:
        try:
            year, mon = (int(x) for x in filters.month.split("-"))
            start = date(year, mon, 1)
            end = date(year + (mon == 12), (mon % 12) + 1, 1)
            where.append(Order.order_date >= start)
            where.append(Order.order_date < end)
        except (ValueError, TypeError):
            pass          # unreadable month - ignore rather than crash

    if filters.bearing_type:
        rows = await db().execute(
            select(distinct(OrderItem.order_no)).where(
                OrderItem.bearing_type == filters.bearing_type
            )
        )
        nos = [r[0] for r in rows.all()]
        if not nos:
            return []
        where.append(fast_rows.one_of(Order.order_no, nos))

    if not where:
        return None

    rows = await db().execute(select(Order.order_no).where(*where))
    return [r[0] for r in rows.all()]


async def available_months() -> list[str]:
    """Distinct YYYY-MM values from order dates, newest first."""
    rows = await db().execute(
        select(distinct(func.to_char(Order.order_date, "YYYY-MM")))
        .where(Order.order_date.isnot(None))
    )
    return sorted((r[0] for r in rows.all() if r[0]), reverse=True)


async def bottlenecks(order_nos: list[str] | None, today: date) -> list[StageBottleneck]:
    """Average delay per stage - the headline metric."""
    is_overdue = and_(
        OrderStage.actual_date.is_(None),
        OrderStage.plan_date.isnot(None),
        OrderStage.plan_date < today,
    )

    stmt = (
        select(
            OrderStage.stage_code,
            OrderStage.stage_name,
            OrderStage.sequence,
            func.count().label("total_records"),
            func.count(OrderStage.actual_date).label("completed"),
            func.count().filter(STAGE_DELAY > 0).label("late"),
            func.count().filter(STAGE_DELAY <= 0).label("on_time"),
            func.count().filter(is_overdue).label("still_overdue"),
            # avg() skips NULLs, so restricting to positive delays here
            # reproduces the pipeline's $avg over a $cond that yielded null.
            func.avg(case((STAGE_DELAY > 0, STAGE_DELAY), else_=None)).label("avg_delay"),
            func.max(STAGE_DELAY).label("max_delay"),
        )
        .where(*_stage_scope(order_nos))
        .group_by(OrderStage.stage_code, OrderStage.stage_name, OrderStage.sequence)
        .order_by(OrderStage.sequence.asc())
    )

    rows = (await db().execute(stmt)).all()
    out = []
    for r in rows:
        out.append(StageBottleneck(
            stage_code=r.stage_code,
            stage_name=r.stage_name,
            sequence=r.sequence,
            total_records=r.total_records,
            completed=r.completed,
            on_time=r.on_time,
            late=r.late,
            still_overdue=r.still_overdue,
            avg_delay_days=round(_num(r.avg_delay), 1) if r.avg_delay is not None else None,
            max_delay_days=r.max_delay,
            late_rate=round(r.late / r.completed * 100, 1) if r.completed else 0.0,
        ))
    return out


async def delay_reasons(order_nos: list[str] | None) -> list[DelayReasonCount]:
    stmt = (
        select(
            OrderStage.delay_reason,
            func.count().label("count"),
            func.avg(STAGE_DELAY).label("avg_delay"),
        )
        .where(OrderStage.delay_reason.isnot(None), *_stage_scope(order_nos))
        .group_by(OrderStage.delay_reason)
        .order_by(func.count().desc())
    )

    rows = (await db().execute(stmt)).all()
    return [
        DelayReasonCount(
            reason=r.delay_reason,
            count=r.count,
            avg_delay_days=round(_num(r.avg_delay), 1) if r.avg_delay is not None else None,
        )
        for r in rows
    ]


async def on_time_delivery(order_nos: list[str] | None) -> OnTimeSummary | None:
    stmt = select(
        func.count().label("total"),
        func.count().filter(STAGE_DELAY <= 0).label("on_time"),
        func.count().filter(STAGE_DELAY > 0).label("late"),
        func.avg(case((STAGE_DELAY > 0, STAGE_DELAY), else_=None)).label("avg_delay"),
    ).where(
        OrderStage.stage_code == DISPATCH_STAGE,
        OrderStage.actual_date.isnot(None),
        OrderStage.plan_date.isnot(None),
        *_stage_scope(order_nos),
    )

    r = (await db().execute(stmt)).one()
    if not r.total:
        return None

    return OnTimeSummary(
        dispatch_stage=DISPATCH_STAGE,
        total_with_actual=r.total,
        on_time=r.on_time,
        late=r.late,
        on_time_rate=round(r.on_time / r.total * 100, 1) if r.total else 0.0,
        avg_delay_days=round(_num(r.avg_delay), 1) if r.avg_delay is not None else None,
    )


async def monthly_trend(order_nos: list[str] | None) -> list[MonthlyTrend]:
    month = func.to_char(OrderStage.actual_date, "YYYY-MM").label("month")

    stmt = (
        select(
            month,
            func.count().label("completed"),
            func.count().filter(STAGE_DELAY <= 0).label("on_time"),
        )
        .where(
            OrderStage.stage_code == DISPATCH_STAGE,
            OrderStage.actual_date.isnot(None),
            OrderStage.plan_date.isnot(None),
            *_stage_scope(order_nos),
        )
        .group_by(month)
        .order_by(month)
    )

    rows = (await db().execute(stmt)).all()
    return [
        MonthlyTrend(
            month=r.month,
            completed=r.completed,
            on_time=r.on_time,
            on_time_rate=round(r.on_time / r.completed * 100, 1) if r.completed else 0.0,
        )
        for r in rows
    ]


async def lead_time_comparison(order_nos: list[str] | None) -> list[LeadTimeComparison]:
    """Configured offset vs what the plant actually achieves."""
    tpl = await template_service.get_stages()
    by_code = {s.code: s for s in tpl.stages}

    stages = await fast_rows.stages(OrderStage.actual_date.isnot(None), *_stage_scope(order_nos))

    actuals: dict[tuple[str, str], dict[str, date]] = {}
    for s in stages:
        if s.actual_date:
            actuals.setdefault((s.order_no, s.schedule_group), {})[s.stage_code] = s.actual_date

    gaps: dict[str, list[int]] = {}
    for chain in actuals.values():
        for code, actual in chain.items():
            defn = by_code.get(code)
            if not defn or not defn.depends_on:
                continue
            parent_actual = chain.get(defn.depends_on)
            if parent_actual:
                gaps.setdefault(code, []).append((actual - parent_actual).days)

    out = []
    for defn in sorted(tpl.stages, key=lambda s: s.sequence):
        if not defn.depends_on:
            continue
        samples = gaps.get(defn.code, [])
        avg = sum(samples) / len(samples) if samples else None
        out.append(LeadTimeComparison(
            stage_code=defn.code,
            stage_name=defn.name,
            template_offset=defn.offset_days,
            actual_avg_offset=round(avg, 1) if avg is not None else None,
            variance=round(avg - defn.offset_days, 1) if avg is not None else None,
            sample_size=len(samples),
        ))
    return out


# ── Business analytics ────────────────────────────────────────────────────
#
# ONE SETTING TO CHECK. Open any order and look at a line item:
#
#     Item: AXZ5,5917   PO qty: 2000   Value: 8.61
#
# If 8.61 is the price of ONE bearing, leave this True  -> line = 8.61 x 2000
# If 8.61 is the whole line total,     set it to False  -> line = 8.61
#
VALUE_IS_UNIT_PRICE = True

# Shown next to money figures. "L" formatting (18.4 L) is applied in the UI.
CURRENCY_SYMBOL = "₹"


def _parse_qty(raw: str | None) -> int:
    """
    po_qty is free text: "500", "200+200", "1000 + 500".
    Returns the total, or 0 if it cannot be read.
    """
    if not raw:
        return 0
    total = 0
    for part in str(raw).replace(",", "").split("+"):
        digits = "".join(ch for ch in part if ch.isdigit())
        if digits:
            total += int(digits)
    return total


def _line_value(item) -> float:
    if item.value is None:
        return 0.0
    if not VALUE_IS_UNIT_PRICE:
        return float(item.value)
    qty = _parse_qty(item.po_qty)
    return float(item.value) * qty if qty else float(item.value)


async def _scoped_project_ids(order_nos: list[str] | None) -> list[str] | None:
    """APQP projects belonging to the filtered orders. None = no filter."""
    if order_nos is None:
        return None
    if not order_nos:
        return []
    rows = await db().execute(
        select(ApqpProject.project_id).where(fast_rows.one_of(ApqpProject.order_no, order_nos))
    )
    return [r[0] for r in rows.all()]


def _order_scope(order_nos: list[str] | None) -> list:
    return [] if order_nos is None else [fast_rows.one_of(Order.order_no, order_nos)]


async def intake_vs_delivery(order_nos: list[str] | None, months: int = 6, with_value: bool = False) -> list[IntakeMonth]:
    """Orders received per month against orders finished per month."""
    today = date.today()
    first = date(today.year, today.month, 1)
    for _ in range(months - 1):
        first = (first - timedelta(days=1)).replace(day=1)

    scope = _order_scope(order_nos)

    orders = await repo.find_all(select(Order).where(Order.order_date >= first, *scope))
    all_orders = await repo.find_all(select(Order).where(*scope))
    nos = [o.order_no for o in all_orders]

    dispatch = await fast_rows.stages(
        fast_rows.one_of(OrderStage.order_no, nos),
        OrderStage.stage_code == DISPATCH_STAGE,
        OrderStage.actual_date.isnot(None),
    )

    labels: list[str] = []
    cur = first
    while cur <= today:
        labels.append(f"{cur.year}-{cur.month:02d}")
        cur = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)

    received = {m: 0 for m in labels}
    completed = {m: 0 for m in labels}

    value = {m: 0.0 for m in labels}
    value_by_order: dict[str, float] = {}
    if with_value and orders:
        for it in await repo.find_all(select(OrderItem).where(
            fast_rows.one_of(OrderItem.order_no, [o.order_no for o in orders])
        )):
            value_by_order[it.order_no] = value_by_order.get(it.order_no, 0.0) + _line_value(it)

    for o in orders:
        if o.order_date:
            key = f"{o.order_date.year}-{o.order_date.month:02d}"
            if key in received:
                received[key] += 1
                value[key] += value_by_order.get(o.order_no, 0.0)

    for s in dispatch:
        d = s.actual_date
        key = f"{d.year}-{d.month:02d}"
        if key in completed:
            completed[key] += 1

    return [IntakeMonth(month=m, received=received[m], completed=completed[m], value=round(value[m], 2)) for m in labels]


async def order_book(order_nos: list[str] | None) -> OrderBook:
    """Committed value split by how far each order has progressed."""
    orders = list(await repo.find_all(select(Order).where(*_order_scope(order_nos))))
    if not orders:
        return OrderBook(total=0, delivered=0, in_progress=0, not_started=0, order_count=0)

    nos = [o.order_no for o in orders]
    items = await repo.find_all(select(OrderItem).where(fast_rows.one_of(OrderItem.order_no, nos)))
    stages = await fast_rows.stages(fast_rows.one_of(OrderStage.order_no, nos))

    value_by_order: dict[str, float] = {}
    for it in items:
        value_by_order[it.order_no] = value_by_order.get(it.order_no, 0.0) + _line_value(it)

    stages_by_order: dict[str, list] = {}
    for s in stages:
        stages_by_order.setdefault(s.order_no, []).append(s)

    delivered = in_progress = not_started = 0.0
    for o in orders:
        v = value_by_order.get(o.order_no, 0.0)
        st = stages_by_order.get(o.order_no, [])
        done = sum(1 for s in st if s.actual_date is not None)
        if st and done == len(st):
            delivered += v
        elif done:
            in_progress += v
        else:
            not_started += v

    return OrderBook(
        total=round(delivered + in_progress + not_started, 2),
        delivered=round(delivered, 2),
        in_progress=round(in_progress, 2),
        not_started=round(not_started, 2),
        order_count=len(orders),
    )


async def customer_share(order_nos: list[str] | None, top: int = 6) -> list[CustomerShare]:
    """Order-book value per customer, biggest first."""
    orders = list(await repo.find_all(select(Order).where(*_order_scope(order_nos))))
    if not orders:
        return []

    nos = [o.order_no for o in orders]
    items = await repo.find_all(select(OrderItem).where(fast_rows.one_of(OrderItem.order_no, nos)))

    value_by_order: dict[str, float] = {}
    for it in items:
        value_by_order[it.order_no] = value_by_order.get(it.order_no, 0.0) + _line_value(it)

    per_customer: dict[str, dict] = {}
    for o in orders:
        row = per_customer.setdefault(o.customer_name, {"value": 0.0, "orders": 0})
        row["value"] += value_by_order.get(o.order_no, 0.0)
        row["orders"] += 1

    total = sum(r["value"] for r in per_customer.values()) or 1.0
    ranked = sorted(per_customer.items(), key=lambda kv: kv[1]["value"], reverse=True)

    out = [
        CustomerShare(
            customer=name,
            value=round(r["value"], 2),
            orders=r["orders"],
            percent=round(r["value"] / total * 100, 1),
        )
        for name, r in ranked[:top]
    ]

    rest = ranked[top:]
    if rest:
        v = sum(r["value"] for _, r in rest)
        out.append(CustomerShare(
            customer=f"others ({len(rest)})",
            value=round(v, 2),
            orders=sum(r["orders"] for _, r in rest),
            percent=round(v / total * 100, 1),
        ))
    return out


async def cycle_times(order_nos: list[str] | None, months: int = 6) -> list[CycleTime]:
    """Average days from the A0 anchor to dispatch, by month completed."""
    orders = list(await repo.find_all(select(Order).where(*_order_scope(order_nos))))
    if not orders:
        return []

    nos = [o.order_no for o in orders]
    stages = await fast_rows.stages(
        fast_rows.one_of(OrderStage.order_no, nos),
        OrderStage.stage_code.in_(["A0", DISPATCH_STAGE]),
    )

    start: dict[str, date] = {}
    end: dict[str, date] = {}
    for s in stages:
        key = s.schedule_group
        if s.stage_code == "A0" and s.plan_date:
            start[key] = s.plan_date
        elif s.stage_code == DISPATCH_STAGE and s.actual_date:
            end[key] = s.actual_date

    buckets: dict[str, list[int]] = {}
    for key, finished in end.items():
        began = start.get(key)
        if not began:
            continue
        days = (finished - began).days
        if days <= 0:
            continue
        buckets.setdefault(f"{finished.year}-{finished.month:02d}", []).append(days)

    rows = [
        CycleTime(month=m, avg_days=round(sum(v) / len(v), 1), orders=len(v))
        for m, v in sorted(buckets.items())
    ]
    return rows[-months:]


def _act_overdue(today: date):
    return and_(
        ApqpActivityRecord.actual_end.is_(None),
        ApqpActivityRecord.plan_end.isnot(None),
        ApqpActivityRecord.plan_end < today,
    )


async def apqp_department_load(today: date, project_ids: list[str] | None = None) -> list[DepartmentLoad]:
    """Activities per responsibility, and how many are late."""
    resp = func.coalesce(ApqpActivityRecord.responsibility, "Unassigned").label("resp")

    stmt = (
        select(
            resp,
            func.count().label("total"),
            func.count(ApqpActivityRecord.actual_end).label("completed"),
            func.count().filter(_act_overdue(today)).label("overdue"),
        )
        .where(ApqpActivityRecord.is_heading.is_(False), *_proj_scope(project_ids))
        .group_by(resp)
        .order_by(func.count().filter(_act_overdue(today)).desc(), func.count().desc())
    )

    rows = (await db().execute(stmt)).all()
    return [
        DepartmentLoad(
            responsibility=r.resp,
            total=r.total,
            completed=r.completed,
            overdue=r.overdue,
            percent=int(r.completed / r.total * 100) if r.total else 0,
        )
        for r in rows
    ]


async def apqp_phase_progress(today: date, project_ids: list[str] | None = None) -> list[PhaseProgress]:
    """Completion and slippage for each of the 6 APQP phases."""
    stmt = (
        select(
            ApqpActivityRecord.phase_code,
            func.count().label("total"),
            func.count(ApqpActivityRecord.actual_end).label("completed"),
            func.count().filter(_act_overdue(today)).label("overdue"),
            func.avg(ACT_DELAY).label("avg_delay"),
        )
        .where(ApqpActivityRecord.is_heading.is_(False), *_proj_scope(project_ids))
        .group_by(ApqpActivityRecord.phase_code)
        .order_by(ApqpActivityRecord.phase_code.asc())
    )

    rows = (await db().execute(stmt)).all()

    names = {
        "PHASE0": "Enquiry & Feasibility",
        "PHASE1": "Plan and Define",
        "PHASE2": "Product Design",
        "PHASE3": "Process Design",
        "PHASE4": "Validation",
        "PHASE5": "Feedback & Corrective Action",
    }

    return [
        PhaseProgress(
            phase_code=r.phase_code,
            phase_name=names.get(r.phase_code, r.phase_code),
            total=r.total,
            completed=r.completed,
            overdue=r.overdue,
            percent=int(r.completed / r.total * 100) if r.total else 0,
            avg_delay_days=round(_num(r.avg_delay), 1) if r.avg_delay is not None else None,
        )
        for r in rows
    ]


async def apqp_project_progress(today: date, project_ids: list[str] | None = None) -> list[ApqpProjectProgress]:
    """One row per APQP project: how far along, what is late, which phase."""
    # Phase codes sort lexically (PHASE0 < PHASE1 < ...), so the smallest
    # phase_code among the unfinished activities is the phase the project is
    # currently working through.
    open_phase = func.min(
        case((ApqpActivityRecord.actual_end.is_(None), ApqpActivityRecord.phase_code), else_=None)
    ).label("open_phase")

    stmt = (
        select(
            ApqpActivityRecord.project_id,
            func.count().label("total"),
            func.count(ApqpActivityRecord.actual_end).label("completed"),
            func.count().filter(_act_overdue(today)).label("overdue"),
            open_phase,
        )
        .where(ApqpActivityRecord.is_heading.is_(False), *_proj_scope(project_ids))
        .group_by(ApqpActivityRecord.project_id)
    )

    rows = (await db().execute(stmt)).all()
    if not rows:
        return []

    projects = await repo.find_all(
        select(ApqpProject).where(fast_rows.one_of(ApqpProject.project_id, [r.project_id for r in rows]))
    )
    meta = {p.project_id: p for p in projects}
    short = {f"PHASE{i}": f"Phase {i}" for i in range(6)}

    out = [
        ApqpProjectProgress(
            project_id=r.project_id,
            customer=meta[r.project_id].customer if r.project_id in meta else "-",
            product_name=meta[r.project_id].product_name if r.project_id in meta else None,
            total=r.total,
            completed=r.completed,
            overdue=r.overdue,
            percent=int(r.completed / r.total * 100) if r.total else 0,
            current_phase=short.get(r.open_phase or "", "Complete"),
        )
        for r in rows
    ]
    out.sort(key=lambda p: (-p.overdue, -p.percent))
    return out


async def build(filters: AnalyticsFilters, is_admin: bool = False, months: int = 6) -> AnalyticsResponse:
    today = date.today()
    order_nos = await _scoped_order_nos(filters)
    project_ids = await _scoped_project_ids(order_nos)

    if order_nos is None:
        order_count = await repo.count(select(Order))
        item_count = await repo.count(select(OrderItem))
    else:
        order_count = len(order_nos)
        item_count = await repo.count(
            select(OrderItem).where(fast_rows.one_of(OrderItem.order_no, order_nos))
        )

    customer_rows = await db().execute(select(distinct(Order.customer_name)))
    customers = [r[0] for r in customer_rows.all()]

    return AnalyticsResponse(
        filters_applied=filters,
        order_count=order_count,
        item_count=item_count,
        bottlenecks=await bottlenecks(order_nos, today),
        delay_reasons=await delay_reasons(order_nos),
        on_time=await on_time_delivery(order_nos),
        trend=await monthly_trend(order_nos),
        lead_times=await lead_time_comparison(order_nos),
        apqp_departments=await apqp_department_load(today, project_ids),
        apqp_phases=await apqp_phase_progress(today, project_ids),
        apqp_projects=await apqp_project_progress(today, project_ids),
        apqp_project_count=await repo.count(select(ApqpProject)),
        apqp_activity_count=await repo.count(
            select(ApqpActivityRecord).where(ApqpActivityRecord.is_heading.is_(False))
        ),
        intake=await intake_vs_delivery(order_nos, months=max(3, min(months, 36)), with_value=is_admin),
        cycles=await cycle_times(order_nos),
        order_book=await order_book(order_nos) if is_admin else None,
        customers=await customer_share(order_nos) if is_admin else [],
        matched_orders=await _matched_names(order_nos),
        currency=CURRENCY_SYMBOL,
        available_customers=sorted(c for c in customers if c),
        available_months=await available_months(),
    )

async def _matched_names(order_nos: list[str] | None) -> list[str]:
    """
    Product names for the chip strip. People recognise CN90001, not
    NPO0227000196 - and the links accept either, so the chips can show
    the friendlier one.
    """
    if not order_nos:
        return []

    rows = list(
        await repo.find_all(select(Order).where(fast_rows.one_of(Order.order_no, order_nos)))
    )
    return sorted((o.product_name or o.order_no) for o in rows)