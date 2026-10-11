from datetime import date, timedelta

from sqlalchemy import select

from database import repo
from models.order import Order, OrderItem, OrderStage
from models.apqp import ApqpProject, ApqpActivityRecord
from models.notification_config import NotificationConfig
from schemas.dashboard import (
    DashboardSummary, OrderMetrics, AttentionItem, RecentOrder,
    ApqpMetrics, ApqpAttentionItem, RecentApqp,
    StageGroupCount, WeekLoad, WeekItem, CombinedAttentionItem, AttentionStats,
)
from services import status_service, apqp_service
from services.status_service import OrderStatus, StageStatus
from services import fast_rows

STAGE_GROUPS = [
    ("Design", {"ERP", "A0", "A", "B", "C"}),
    ("Material & tooling", {"D", "E", "F", "G", "H"}),
    ("Machining", {"J", "J1", "K", "L", "M", "N", "P", "P1", "P2", "P3", "P4"}),
    ("Assembly & inspection", {"S", "S1", "T", "U"}),
    ("Dispatch", {"V", "W", "X", "Y", "Z"}),
]


def _empty_apqp() -> ApqpMetrics:
    return ApqpMetrics(
        total=0, not_started=0, in_progress=0, delayed=0, completed=0,
        total_activities=0, overdue_activities=0,
    )


def _group_for(stage_code: str) -> str:
    for label, codes in STAGE_GROUPS:
        if stage_code in codes:
            return label
    return "Other"


def stage_group_counts(stages: list[OrderStage]) -> list[StageGroupCount]:
    """Each order counted once, in the group of its earliest incomplete stage."""
    by_order: dict[str, list[OrderStage]] = {}
    for s in stages:
        by_order.setdefault(s.order_no, []).append(s)

    counts = {label: 0 for label, _ in STAGE_GROUPS}

    for order_stages in by_order.values():
        pending = [s for s in order_stages if s.actual_date is None and s.plan_date]
        if not pending:
            continue
        current = min(pending, key=lambda s: (s.sequence, s.plan_date))
        label = _group_for(current.stage_code)
        if label in counts:
            counts[label] += 1

    return [StageGroupCount(label=label, count=counts[label]) for label, _ in STAGE_GROUPS]


WEEK_ITEMS = 6   # stages listed per week on the card; the count covers all


def week_load(stages: list[OrderStage], today: date, weeks: int = 4,
              orders: dict | None = None) -> list[WeekLoad]:
    """Open stages whose plan date falls in each of the next weeks (Mon-Sun)."""
    monday = today - timedelta(days=today.weekday())
    buckets: list[WeekLoad] = []
    orders = orders or {}

    for i in range(weeks):
        start = monday + timedelta(weeks=i)
        end = start + timedelta(days=7)
        due = sorted(
            (s for s in stages if s.actual_date is None and s.plan_date and start <= s.plan_date < end),
            key=lambda s: (s.plan_date, s.sequence),
        )
        label = "This week" if i == 0 else "Next week" if i == 1 else f"Week {i + 1}"
        items = []
        for st in due[:WEEK_ITEMS]:
            o = orders.get(st.order_no)
            items.append(WeekItem(
                order_no=st.order_no,
                product_name=getattr(o, "product_name", None),
                customer_name=getattr(o, "customer_name", "") or "",
                stage_name=st.stage_name,
                plan_date=st.plan_date,
            ))
        buckets.append(WeekLoad(label=label, starts=start, count=len(due), items=items))

    return buckets


ATTENTION_ROWS = 50   # rows sent to the page; the stats cover everything


async def combined_attention(
    stages: list[OrderStage],
    activities: list[ApqpActivityRecord],
    customer_by_order: dict[str, str],
    customer_by_project: dict[str, str],
    today: date,
    limit: int | None = ATTENTION_ROWS,
    product_by_order: dict[str, str | None] | None = None,
    product_by_project: dict[str, str | None] | None = None,
    late_keys: set[str] | None = None,
) -> tuple[list[CombinedAttentionItem], AttentionStats]:
    cfg = await repo.find_one(
        select(NotificationConfig).where(NotificationConfig.key == "order_stage_owners")
    )
    owners = {o.stage_code: ", ".join(o.emails) for o in (cfg.owners if cfg else []) if o.emails}

    # Plain tuples first (cheap even for 100,000+ rows); only the rows that
    # are actually sent become response objects.
    # (days_overdue, kind, record_id, code, name, owner, plan_date)
    items: list[tuple] = []
    seen: set[tuple[str, str]] = set()

    product_by_order = product_by_order or {}
    product_by_project = product_by_project or {}

    for s in stages:
        if s.actual_date is not None or s.plan_date is None or s.plan_date >= today:
            continue
        key = (s.order_no, s.stage_code)
        if key in seen:
            continue
        seen.add(key)
        items.append(((today - s.plan_date).days, "order", s.order_no, s.stage_code,
                      s.stage_name, owners.get(s.stage_code), s.plan_date))

    for a in activities:
        if a.actual_end is not None or a.plan_end is None or a.plan_end >= today:
            continue
        items.append(((today - a.plan_end).days, "apqp", a.project_id, a.no_label or "—",
                      a.activity_name, a.responsibility, a.plan_end))

    # Same order as before: worst first (stable, so ties keep their order).
    items.sort(key=lambda x: x[0], reverse=True)

    # ── Totals over everything (what the tiles and buckets show) ──
    stats = AttentionStats(total=len(items))
    buckets = [0, 0, 0, 0]
    n_orders = 0
    owner_counts: dict[str, int] = {}
    late_by: dict[str, dict] = {}
    wanted = {tuple(k.split(":", 1)) for k in late_keys} if late_keys else set()
    for days, kind, rid, _code, name, owner, _plan in items:
        if kind == "order":
            n_orders += 1
        buckets[0 if days <= 3 else 1 if days <= 7 else 2 if days <= 14 else 3] += 1
        if owner:
            owner_counts[owner] = owner_counts.get(owner, 0) + 1
        if wanted and (kind, rid) in wanted:
            k = f"{kind}:{rid}"
            cur = late_by.get(k)
            if cur is None:          # worst item comes first (sorted)
                late_by[k] = {"days": days, "count": 1, "what": name}
            else:
                cur["count"] += 1
    stats.orders = n_orders
    stats.apqp = len(items) - n_orders
    stats.buckets = buckets
    stats.max_days = items[0][0] if items else 0
    if owner_counts:
        # First owner reaching the highest count, as the page picked before.
        best = max(owner_counts.values())
        stats.top_owner = next(o for o, c in owner_counts.items() if c == best)
        stats.top_owner_count = best
    stats.late_by = late_by

    shown = items if limit is None else items[:limit]
    rows = [
        CombinedAttentionItem(
            kind=kind,
            record_id=rid,
            display_name=(product_by_order if kind == "order" else product_by_project).get(rid),
            customer=(customer_by_order if kind == "order" else customer_by_project).get(rid, ""),
            code=code,
            name=name,
            owner=owner,
            plan_date=plan,
            days_overdue=days,
        )
        for days, kind, rid, code, name, owner, plan in shown
    ]
    return rows, stats


def _attention_fields(result) -> dict:
    rows, stats = result
    return {"combined_attention": rows, "combined_attention_stats": stats}


async def apqp_section(
    today: date, attention_limit: int = 10, orders: list[Order] | None = None
):
    """Returns (metrics, attention, recent, activities, customer_by_project, product_by_project)."""
    projects = list(
        await repo.find_all(select(ApqpProject).order_by(ApqpProject.created_at.desc()))
    )
    if not projects:
        return _empty_apqp(), [], [], [], {}, {}

    # Progress per project and phase is counted in the database; only the
    # OVERDUE activity rows are fetched (for the attention lists).
    phase_counts = await fast_rows.phase_counts(today)
    activities = await fast_rows.activity_summaries(
        ApqpActivityRecord.actual_end.is_(None),
        ApqpActivityRecord.plan_end.isnot(None),
        ApqpActivityRecord.plan_end < today,
    )

    tpl = await apqp_service.get_template()
    phase_names = {p.phase_code: p.phase_name for p in tpl.phases}

    counts = {"not_started": 0, "in_progress": 0, "delayed": 0, "completed": 0}
    overdue_total = 0
    if orders is None:
        orders = list(await repo.find_all(select(Order)))
    product_by_order = {o.order_no: o.product_name for o in orders}
    # A project's own product name first, its order's as the fallback.
    product_by_project = {
        p.project_id: p.product_name or (product_by_order.get(p.order_no) if p.order_no else None)
        for p in projects
    }

    recent: list[RecentApqp] = []
    project_status: dict[str, str] = {}

    for p in projects:
        s, current, _n = apqp_service.summary_from_counts(
            tpl, phase_counts.get(p.project_id, {}), phase_names
        )
        project_status[p.project_id] = s["status"]
        counts[s["status"]] = counts.get(s["status"], 0) + 1
        overdue_total += s["overdue"]

        recent.append(RecentApqp(
            project_id=p.project_id,
            customer=p.customer,
            product_name=product_by_project.get(p.project_id),
            customer_part_no=p.customer_part_no,
            current_phase=current,
            percent=s["percent"],
            status=s["status"],
        ))

    customer_by_project = {p.project_id: p.customer for p in projects}

    # Sorted as plain rows; only the ones sent become response objects.
    late_acts = [
        a for a in activities
        if a.actual_end is None and a.plan_end is not None and a.plan_end < today
    ]
    late_acts.sort(key=lambda a: (today - a.plan_end).days, reverse=True)
    attention = [
        ApqpAttentionItem(
            project_id=a.project_id,
            customer=customer_by_project.get(a.project_id, ""),
            no_label=a.no_label or "—",
            activity_name=a.activity_name,
            responsibility=a.responsibility,
            plan_date=a.plan_end,
            days_overdue=(today - a.plan_end).days,
        )
        for a in late_acts[:attention_limit]
    ]

    active_pids = {
        p.project_id for p in projects
        if project_status.get(p.project_id) != "completed"
    }
    act_total = act_done = 0
    for pid in active_pids:
        for n_all, _counted, n_done, _late in phase_counts.get(pid, {}).values():
            act_total += n_all
            act_done += n_done

    metrics = ApqpMetrics(
        total=len(projects),
        not_started=counts["not_started"],
        in_progress=counts["in_progress"],
        delayed=counts["delayed"],
        completed=counts["completed"],
        total_activities=sum(
            n_all for pid in customer_by_project
            for n_all, *_ in phase_counts.get(pid, {}).values()
        ),
        overdue_activities=overdue_total,
        active_activities=act_total,
        active_activities_done=act_done,
    )

    return (metrics, attention, recent[:5], activities,
            customer_by_project, product_by_project)


async def summary(attention_limit: int = 10) -> DashboardSummary:
    today = date.today()
    horizon = today + timedelta(days=7)

    # Orders are read once and shared; this used to run the same query four
    # times per dashboard load.
    orders = list(await repo.find_all(select(Order)))

    (apqp_metrics, apqp_attention, apqp_recent, activities,
     customer_by_project, product_by_project) = await apqp_section(today, attention_limit, orders)

    if not orders:

        return DashboardSummary(
            orders=OrderMetrics(total=0, not_started=0, in_progress=0, delayed=0, completed=0, total_items=0),
            stage_counts={k: 0 for k in [
                StageStatus.NOT_STARTED, StageStatus.IN_PROGRESS, StageStatus.OVERDUE,
                StageStatus.COMPLETED, StageStatus.COMPLETED_LATE,
            ]},
            attention=[], recent=[], upcoming_deliveries=[],
            apqp=apqp_metrics,
            apqp_attention=apqp_attention,
            apqp_recent=apqp_recent,
            **_attention_fields(await combined_attention(
                [], activities, {}, customer_by_project, today,
                product_by_project=product_by_project,
                late_keys={f"apqp:{r.project_id}" for r in apqp_recent},
            )),
            stage_groups=stage_group_counts([]),
            week_load=week_load([], today),
            due_next_7_days=0,
        )

    order_nos = [o.order_no for o in orders]
    stages = await fast_rows.stages(fast_rows.one_of(OrderStage.order_no, order_nos))
    item_count = await repo.count(
        select(OrderItem).where(fast_rows.one_of(OrderItem.order_no, order_nos))
    )

    by_order: dict[str, list[OrderStage]] = {}
    for s in stages:
        by_order.setdefault(s.order_no, []).append(s)

    customer_by_no = {o.order_no: o.customer_name for o in orders}

    counts = {
        OrderStatus.NOT_STARTED: 0,
        OrderStatus.IN_PROGRESS: 0,
        OrderStatus.DELAYED: 0,
        OrderStatus.COMPLETED: 0,
    }
    stage_counts = {
        StageStatus.NOT_STARTED: 0,
        StageStatus.IN_PROGRESS: 0,
        StageStatus.OVERDUE: 0,
        StageStatus.COMPLETED: 0,
        StageStatus.COMPLETED_LATE: 0,
    }
    summaries: dict[str, dict] = {}

    for o in orders:
        s = status_service.summarise(by_order.get(o.order_no, []), today)
        summaries[o.order_no] = s
        counts[s["status"]] += 1
        for k, v in s["stage_counts"].items():
            stage_counts[k] += v

    # Overdue stages, worst first. Deduplicated per order+stage_code so one
    # late stage shared across schedule groups isn't listed twice.
    seen: set[tuple[str, str]] = set()
    late_stages = []
    for s in stages:
        if s.actual_date is not None or s.plan_date is None or s.plan_date >= today:
            continue
        key = (s.order_no, s.stage_code)
        if key in seen:
            continue
        seen.add(key)
        late_stages.append(s)
    late_stages.sort(key=lambda s: (today - s.plan_date).days, reverse=True)
    attention = [
        AttentionItem(
            order_no=s.order_no,
            customer_name=customer_by_no.get(s.order_no, ""),
            stage_code=s.stage_code,
            stage_name=s.stage_name,
            plan_date=s.plan_date,
            days_overdue=(today - s.plan_date).days,
        )
        for s in late_stages[:attention_limit]
    ]

    due_soon = sum(
        1 for s in stages
        if s.actual_date is None and s.plan_date and today <= s.plan_date <= horizon
    )

    product_by_order = {o.order_no: o.product_name for o in orders}

    def as_recent(o: Order) -> RecentOrder:
        s = summaries[o.order_no]
        return RecentOrder(
            product_name=product_by_order.get(o.order_no),
            order_no=o.order_no, customer_name=o.customer_name, order_date=o.order_date,
            delivery_date=o.planned_delivery_sample,
            status=s["status"], progress_percent=s["progress"]["percent"],
        )    

    recent = [as_recent(o) for o in sorted(orders, key=lambda o: o.created_at, reverse=True)[:5]]

    upcoming = [
        o for o in orders
        if o.planned_delivery_sample and o.planned_delivery_sample >= today
        and summaries[o.order_no]["status"] != OrderStatus.COMPLETED
    ]
    upcoming.sort(key=lambda o: o.planned_delivery_sample)

    # Stages belonging to orders that are NOT finished.
    active_nos = {
        o.order_no for o in orders
        if summaries[o.order_no]["status"] != OrderStatus.COMPLETED
    }
    active_stage_total = 0
    active_stage_done = 0
    for no in active_nos:
        for s in by_order.get(no, []):
            active_stage_total += 1
            if s.actual_date is not None:
                active_stage_done += 1

    return DashboardSummary(
        orders=OrderMetrics(
            total=len(orders),
            not_started=counts[OrderStatus.NOT_STARTED],
            in_progress=counts[OrderStatus.IN_PROGRESS],
            delayed=counts[OrderStatus.DELAYED],
            completed=counts[OrderStatus.COMPLETED],
            total_items=item_count,
            active_stages=active_stage_total,
            active_stages_done=active_stage_done,
        ),
        stage_counts=stage_counts,
        attention=attention[:attention_limit],
        recent=recent,
        upcoming_deliveries=[as_recent(o) for o in upcoming[:5]],
        apqp=apqp_metrics,
        apqp_attention=apqp_attention,
        apqp_recent=apqp_recent,
        **_attention_fields(await combined_attention(
            stages, activities, customer_by_no, customer_by_project, today,
            product_by_order=product_by_order, product_by_project=product_by_project,
            late_keys={f"order:{r.order_no}" for r in recent}
            | {f"apqp:{r.project_id}" for r in apqp_recent},
        )),
        stage_groups=stage_group_counts(stages),
        week_load=week_load(stages, today, orders={o.order_no: o for o in orders}),
        due_next_7_days=due_soon,
    )
