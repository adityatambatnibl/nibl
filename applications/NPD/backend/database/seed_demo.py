"""
Full demo dataset - populates every page of the app.

    cd backend
    venv\\Scripts\\activate

    python -m database.seed_demo              # clear DEMO- data, then rebuild
    python -m database.seed_demo --wipe       # clear DEMO- data and stop
    python -m database.seed_demo --all        # clear EVERY order/project, rebuild
    python -m database.seed_demo --all --wipe # clear everything and stop

--all also removes orders you made by hand. Users, templates, stage offsets
and email settings are never touched by any of these.

What it fills, page by page:

    /dashboard          20 orders across 9 months. EVERY one is a pair -
                        DEMO-PRJ-007 appears in /orders AND in /apqp under
                        that same reference.
    /orders             mixed statuses, RPD values, multi-group orders
    /orders/:no         real plan dates, actual dates, remarks, delay reasons
    /apqp               20 projects - one per order, sharing its reference
    /apqp/:id           departments, week ticks, check points, sign-off filled
    /analytics          9 months of dispatch history for the trend chart,
                        every delay reason used, all bearing types represented
    /reports            everything above exports to Excel
    /admin/users        6 demo users, mixed roles and states
    /admin/approvals    3 pending requests waiting
    /admin/audit        ~40 audit entries
    /admin/email-settings  stage owners + 30 email log entries
    notification bell   5 unread notifications

Paired records go through apqp_service.create_with_order(), so the order,
its 30 stages, the APQP project and its 64 activities are all made by the
real code paths - and the two share one reference. Plain orders still use
order_service.create(). Only actual dates are written afterwards.

Everything is prefixed DEMO- (or @demo.nrb for users), so --wipe removes it
without touching your real records.
"""

import argparse
import asyncio
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from database import repo
from database.connection import init_db, close_db, session_scope
from models.apqp import ApqpProject, ApqpActivityRecord, ApqpSignOff
from models.audit import AuditLog
from models.notification import Notification
from models.notification_config import EmailLog, NotificationConfig, StageOwner
from models.order import Order, OrderItem, OrderStage
from models.user import User
from schemas.apqp import CreateApqpRequest, CreateCombinedRequest
from schemas.order import CreateOrderRequest, OrderItemIn, ScheduleGroupIn
from services import apqp_service, order_service
from utils.constants import (
    AccountStatus,
    AuditAction,
    DEFAULT_USER_PERMISSIONS,
    NotificationType,
    Permission,
    Role,
)
from utils.security import hash_password

PREFIX = "DEMO-"
USER_DOMAIN = "@demo.nrb"
TODAY = date.today()


def ago(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


# ─────────────────────────────────────────────────────────────
# Reference data
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# The 20 orders, written out explicitly so every number in the
# demo script is predictable and can be stated out loud.
#
#   (n, customer, bearing, months_ago, share_done, days_late, is_pair)
#
#   share_done 1.00 = finished        is_pair True = order + APQP together
#
# Customer totals:  Rollon 7 · Schaeffler 5 · Tata 5 · NBC 3
# Bearing totals:   AX-Thick 7 · RAX 5 · CP-Thick 5 · Rings 3
# ─────────────────────────────────────────────────────────────

ORDERS = [
    # Rollon Srl — AX-Thick — 7 orders, the biggest customer
    (1,  "Rollon Srl",       "AX-Thick", 9, 1.00, 0,  True),
    (2,  "Rollon Srl",       "AX-Thick", 8, 1.00, 4,  True),
    (3,  "Rollon Srl",       "AX-Thick", 7, 1.00, 0,  True),
    (4,  "Rollon Srl",       "AX-Thick", 5, 0.72, 0,  True),
    (5,  "Rollon Srl",       "AX-Thick", 4, 0.55, 11, True),
    (6,  "Rollon Srl",       "AX-Thick", 2, 0.28, 0,  True),
    (7,  "Rollon Srl",       "AX-Thick", 0, 0.05, 0,  True),

    # Schaeffler India — RAX — 5 orders
    (8,  "Schaeffler India", "RAX",      8, 1.00, 0,  True),
    (9,  "Schaeffler India", "RAX",      6, 1.00, 6,  True),
    (10, "Schaeffler India", "RAX",      5, 0.68, 0,  True),
    (11, "Schaeffler India", "RAX",      3, 0.40, 8,  True),
    (12, "Schaeffler India", "RAX",      1, 0.15, 0,  True),

    # Tata Motors — CP-Thick — 5 orders
    (13, "Tata Motors",      "CP-Thick", 7, 1.00, 0,  True),
    (14, "Tata Motors",      "CP-Thick", 6, 0.85, 0,  True),
    (15, "Tata Motors",      "CP-Thick", 4, 0.60, 15, True),
    (16, "Tata Motors",      "CP-Thick", 2, 0.32, 0,  True),
    (17, "Tata Motors",      "CP-Thick", 1, 0.10, 0,  True),

    # NBC Bearings — Rings — 3 orders, the smallest customer
    (18, "NBC Bearings",     "Rings",    5, 1.00, 3,  True),
    (19, "NBC Bearings",     "Rings",    3, 0.45, 0,  True),
    (20, "NBC Bearings",     "Rings",    1, 0.12, 5,  True),
]

PRODUCTS = [
    "Needle roller bearing",
    "Cam follower",
    "Thrust washer",
    "Drawn cup bearing",
    "Needle cage assembly",
    "Track roller",
]

DELAY_REASONS = [
    "Material delay",
    "Customer approval pending",
    "Machine breakdown",
    "Tooling not ready",
    "Manpower shortage",
    "Quality rejection",
]

PHASE_OWNER = {
    "PHASE0": "MKTG",
    "PHASE1": "CFT",
    "PHASE2": "R&D",
    "PHASE3": "R&D",
    "PHASE4": "QA",
    "PHASE5": "QA",
}

CHECK_POINTS = ["Drawing", "Checklist", "Report", "PPAP file", "Trial record", "MOM"]

DEMO_USERS = [
    # (name, local part, role, status, active)
    ("Priya Sharma", "priya", Role.USER, AccountStatus.APPROVED, True),
    ("Rahul Deshmukh", "rahul", Role.USER, AccountStatus.APPROVED, True),
    ("Anjali Kulkarni", "anjali", Role.ADMIN, AccountStatus.APPROVED, True),
    ("Vikram Singh", "vikram", Role.USER, AccountStatus.PENDING, True),
    ("Neha Patil", "neha", Role.USER, AccountStatus.PENDING, True),
    ("Arjun Rao", "arjun", Role.USER, AccountStatus.PENDING, True),
    ("Sunil Joshi", "sunil", Role.USER, AccountStatus.APPROVED, False),
    ("Kavita Menon", "kavita", Role.USER, AccountStatus.REJECTED, True),
]

STAGE_OWNERS = [
    ("C", "Design office", ["design@demo.nrb"]),
    ("D", "Tool room", ["toolroom@demo.nrb"]),
    ("H", "Sourcing", ["sourcing@demo.nrb"]),
    ("K", "Stores", ["stores@demo.nrb"]),
    ("L", "Turning shop", ["turning@demo.nrb"]),
    ("P", "Heat treatment", ["heattreat@demo.nrb"]),
    ("S", "Assembly", ["assembly@demo.nrb"]),
    ("U", "Quality", ["quality@demo.nrb"]),
    ("Z", "Dispatch", ["dispatch@demo.nrb"]),
]


# ─────────────────────────────────────────────────────────────
# Wipe
# ─────────────────────────────────────────────────────────────


async def _wipe_demo_side_records() -> None:
    """Demo users, audit entries, notifications and email logs."""
    await repo.remove_where(User, User.email.like(f"%{USER_DOMAIN}"))
    await repo.remove_where(AuditLog, AuditLog.actor_name.like("DEMO %"))
    await repo.remove_where(Notification, Notification.title.like("[demo]%"))
    await repo.remove_where(EmailLog, EmailLog.subject.like("[demo]%"))


async def wipe_everything():
    """Removes ALL orders and APQP projects, demo or not. Users and templates stay."""
    counts = {
        "orders": await repo.count(select(Order)),
        "apqp_projects": await repo.count(select(ApqpProject)),
    }
    # Items, stages, activities and sign-offs all cascade from their parent
    # row, so removing orders and projects takes them along. The Mongo
    # version had to delete each collection by hand and could leave orphans
    # behind if it stopped halfway.
    await repo.remove_where(Order)
    await repo.remove_where(ApqpProject)
    await _wipe_demo_side_records()
    print(f"removed ALL {counts['orders']} orders and {counts['apqp_projects']} projects")


async def wipe():
    orders = await repo.find_all(select(Order).where(Order.order_no.like(f"{PREFIX}%")))
    nos = [o.order_no for o in orders]
    projects = await repo.find_all(
        select(ApqpProject).where(ApqpProject.project_id.like(f"{PREFIX}%"))
    )
    pids = [p.project_id for p in projects]

    if nos:
        await repo.remove_where(Order, Order.order_no.in_(nos))
    if pids:
        await repo.remove_where(ApqpProject, ApqpProject.project_id.in_(pids))

    await _wipe_demo_side_records()

    print(f"removed {len(nos)} orders, {len(pids)} projects, demo users, logs")


# ─────────────────────────────────────────────────────────────
# Users -> /admin/users and /admin/approvals
# ─────────────────────────────────────────────────────────────

async def make_users(admin: User) -> list[User]:
    pwd = hash_password("Demo@12345")
    made = []

    for i, (name, local, role, status, active) in enumerate(DEMO_USERS):
        perms = (
            [] if role == Role.ADMIN
            else list(DEFAULT_USER_PERMISSIONS)
            + ([Permission.TIMELINE_CREATE, Permission.EXCEL_EXPORT] if i % 2 == 0 else [])
        )
        u = User(
            name=name,
            email=f"{local}{USER_DOMAIN}",
            password_hash=pwd,
            role=role,
            status=status,
            permissions=perms,
            is_active=active,
            created_at=ago(60 - i * 6),
            last_login=ago(i + 1) if status == AccountStatus.APPROVED else None,
            approved_by=str(admin.id) if status == AccountStatus.APPROVED else None,
            approved_at=ago(58 - i * 6) if status == AccountStatus.APPROVED else None,
        )
        await repo.add(u)
        made.append(u)

    pending = sum(1 for u in made if u.status == AccountStatus.PENDING)
    print(f"  {len(made)} users ({pending} awaiting approval) - password Demo@12345")
    return made


# ─────────────────────────────────────────────────────────────
# Orders -> /orders, /dashboard, /analytics, /reports
# ─────────────────────────────────────────────────────────────

async def make_orders(user: User) -> list[str]:
    created: list[str] = []

    for n, customer, bearing, months_ago, share, slip, is_pair in ORDERS:
        # order_date walks back month by month so the date filter has
        # something real to bite on.
        order_date = TODAY - timedelta(days=months_ago * 30)
        anchor_a0 = order_date + timedelta(days=7)

        order_no = f"{PREFIX}PRJ-{n:03d}"

        items = [
            OrderItemIn(
                item_description=f"{bearing[:2].upper()}Z{n},{2000 + n * 37}",
                bearing_type=bearing,
                po_qty=str([500, 1000, 2000, 5000][n % 4]),
                value=round(6.0 + (n % 7) * 3.4, 2),
            )
        ]
        # A couple of orders get a second item so the Items table is not
        # always one row.
        if n % 5 == 0:
            items.append(
                OrderItemIn(
                    item_description=f"{bearing[:2].upper()}Z{n}B,{2400 + n * 19}",
                    bearing_type=bearing,
                    po_qty="1000",
                    value=round(9.0 + (n % 5) * 2.1, 2),
                )
            )

        groups = [ScheduleGroupIn(anchor_a0=anchor_a0, items=items)]

        if is_pair:
            req = CreateCombinedRequest(
                order_no=order_no,
                order_date=order_date,
                customer=customer,
                planned_delivery_sample=anchor_a0 + timedelta(days=90),
                planned_delivery_batch=anchor_a0 + timedelta(days=140),
                rpd_status="Received" if n % 3 else "Not received",
                notes="Demo record - safe to delete.",
                groups=groups,
                # Unique per record - the product name is the identity.
                product_name=f"{PRODUCTS[n % len(PRODUCTS)]} {n:02d}",
                customer_part_no=f"PN-{1000 + n}",
                program_name=f"Program {chr(64 + (n % 6) + 1)}",
                application="Automotive transmission",
                supply_condition="As per drawing",
                original_date=anchor_a0,
                ppap_date=anchor_a0 + timedelta(days=150),
                sample_submission_date=anchor_a0 + timedelta(days=110),
                start_month=f"{anchor_a0.year}-{anchor_a0.month:02d}",
            )
            await apqp_service.create_with_order(req, user)
        else:
            req = CreateOrderRequest(
                product_name=f"{PRODUCTS[n % len(PRODUCTS)]} {n:02d}",
                order_no=order_no,
                order_date=order_date,
                customer_name=customer,
                planned_delivery_sample=anchor_a0 + timedelta(days=90),
                planned_delivery_batch=anchor_a0 + timedelta(days=140),
                rpd_status="Received" if n % 3 else "Not received",
                notes="Demo record - safe to delete.",
                groups=groups,
            )
            await order_service.create(req, user)

        # Fill actual dates so the order lands in the intended state.
        stages = list(
            await repo.find_all(
                select(OrderStage)
                .where(OrderStage.order_no == order_no)
                .order_by(OrderStage.sequence.asc())
            )
        )

        cut = int(len(stages) * share)
        for k, st in enumerate(stages):
            if k >= cut or st.plan_date is None:
                continue
            drift = slip if k >= cut - 3 else random.randint(-2, 2)
            actual = min(st.plan_date + timedelta(days=drift), TODAY)
            st.actual_date = actual
            if actual > st.plan_date:
                st.delay_reason = DELAY_REASONS[(n + k) % len(DELAY_REASONS)]
                st.remark = f"Held up - {st.delay_reason.lower()}."
            elif k % 7 == 0:
                st.remark = "Cleared ahead of plan."

        created.append(order_no)

    done = sum(1 for r in ORDERS if r[4] >= 1.0)
    late = sum(1 for r in ORDERS if r[5] > 0 and r[4] < 1.0)
    print(f"  {len(created)} orders - {done} complete, {late} running late")
    print(f"  every one has a matching APQP project under the same reference")
    return created


# ─────────────────────────────────────────────────────────────
# APQP -> /apqp, /apqp/:id, /dashboard, /analytics
# ─────────────────────────────────────────────────────────────

async def make_apqp(user: User, order_nos: list[str]):
    """
    Fills in the APQP side of the paired records.

    The projects already exist - create_with_order() made them alongside their
    orders - so this only sets departments, check points, week ticks, actual
    dates and the sign-off block.

    Timing comes from the SAME profile as the matching order, so an order that
    is 60% done has an APQP project that is roughly 60% done too.
    """
    project_ids = [n for n in order_nos if n.startswith(f"{PREFIX}PRJ-")]

    for project_id in project_ids:
        # DEMO-PRJ-009 -> profile index 9
        try:
            idx = int(project_id.rsplit("-", 1)[1])
        except ValueError:
            continue
        row = next((r for r in ORDERS if r[0] == idx), None)
        if row is None:
            continue
        _, _, _, months_ago, share, slip, _ = row
        start = TODAY - timedelta(days=months_ago * 30) + timedelta(days=7)

        project = await repo.find_one(
            select(ApqpProject).where(ApqpProject.project_id == project_id)
        )
        if not project:
            continue
        weeks = await _week_columns(project)

        acts = list(
            await repo.find_all(
                select(ApqpActivityRecord)
                .where(ApqpActivityRecord.project_id == project_id)
                .order_by(ApqpActivityRecord.sequence.asc())
            )
        )

        real = [a for a in acts if not a.is_heading]
        cut = int(len(real) * share)
        step = 4
        done_count = 0

        for n, a in enumerate(acts):
            a.responsibility = PHASE_OWNER.get(a.phase_code, "CFT")
            a.check_point = CHECK_POINTS[n % len(CHECK_POINTS)]
            a.plan_start = start + timedelta(days=n * step)
            a.plan_end = a.plan_start + timedelta(days=step - 1)
            a.week_flags = _ticks(weeks, a.plan_start, a.plan_end)

            if not a.is_heading and done_count < cut:
                drift = slip if done_count >= cut - 4 else random.randint(-1, 2)
                a.actual_start = a.plan_start + timedelta(days=drift)
                a.actual_end = min(a.plan_end + timedelta(days=drift), TODAY)
                a.actual_week_flags = _ticks(weeks, a.actual_start, a.actual_end)
                if drift > 0:
                    a.remark = "Ran past plan"
                done_count += 1

        # Sign-off is only filled on projects that are well advanced.
        if share >= 0.6:
            so = await repo.find_one(
                select(ApqpSignOff).where(ApqpSignOff.project_id == project_id)
            )
            if so:
                names = [
                    "R. Kulkarni", "S. Deshpande", "A. Nair", "P. Iyer",
                    "M. Bhosale", "V. Chavan", "K. Pillai", "D. Shetty",
                    "N. Gokhale", "T. Rane", "H. Kamat", "J. Salunkhe",
                ]
                so.team = {str(k + 1): names[k] for k in range(12)}
                so.prepared_by = "R. Kulkarni"
                so.reviewed_by = "A. Nair"
                so.approved_by = "M. Bhosale"

    print(f"  {len(project_ids)} paired projects filled in "
          f"(departments, week ticks, sign-off)")


async def _week_columns(project) -> list[str]:
    """Week labels for this project, e.g. 2026-09-W1 ... 2027-01-W4."""
    try:
        return apqp_service.week_columns(project.months)
    except Exception:
        return [f"{m}-W{w}" for m in project.months for w in (1, 2, 3, 4)]


def _ticks(weeks: list[str], start: date | None, end: date | None) -> dict[str, bool]:
    """Marks the week columns a date range falls into. Approximate is fine here."""
    if not start or not end or not weeks:
        return {}
    out: dict[str, bool] = {}
    for label in weeks:
        try:
            ym, wk = label.rsplit("-W", 1)
            year, month = (int(x) for x in ym.split("-"))
            w = int(wk)
        except ValueError:
            continue
        lo = date(year, month, min(1 + (w - 1) * 7, 28))
        hi = lo + timedelta(days=6)
        if start <= hi and end >= lo:
            out[label] = True
    return out


# ─────────────────────────────────────────────────────────────
# Audit, notifications, email logs, stage owners
# ─────────────────────────────────────────────────────────────

async def make_audit(admin: User, users: list[User], order_nos: list[str]):
    logs: list[AuditLog] = []

    for i, u in enumerate(users):
        if u.status == AccountStatus.APPROVED:
            logs.append(AuditLog(
                action=AuditAction.USER_APPROVED,
                actor_id=str(admin.id), actor_name=f"DEMO {admin.name}",
                target_type="user", target_id=str(u.id), target_label=u.email,
                created_at=ago(55 - i * 5),
            ))
        elif u.status == AccountStatus.REJECTED:
            logs.append(AuditLog(
                action=AuditAction.USER_REJECTED,
                actor_id=str(admin.id), actor_name=f"DEMO {admin.name}",
                target_type="user", target_id=str(u.id), target_label=u.email,
                note="Not a company address.",
                created_at=ago(50 - i * 4),
            ))

    for i, no in enumerate(order_nos):
        logs.append(AuditLog(
            action="order_created",   # not in AuditAction, but AUDIT_LABELS renders it
            actor_id=str(admin.id), actor_name=f"DEMO {admin.name}",
            target_type="order", target_id=no, target_label=no,
            created_at=ago(len(order_nos) - i + 2),
        ))

    logs.append(AuditLog(
        action="stage_offsets_changed",
        actor_id=str(admin.id), actor_name=f"DEMO {admin.name}",
        target_type="template", target_label="production_stages",
        before={"D": 10}, after={"D": 12},
        note="Tool design window widened after review.",
        created_at=ago(12),
    ))

    await repo.add_all(logs)
    print(f"  {len(logs)} audit entries")


async def make_notifications(users: list[User]):
    notes = []
    for u in users:
        if u.status == AccountStatus.PENDING:
            notes.append(Notification(
                type=NotificationType.SIGNUP_REQUEST,
                title=f"[demo] Access request from {u.name}",
                message=f"{u.name} ({u.email}) has asked for access.",
                link="/admin/approvals",
                ref_id=str(u.id),
                is_read=False,
                created_at=ago(2),
            ))

    notes += [
        Notification(
            type=NotificationType.PASSWORD_RESET,
            title="[demo] Password reset requested",
            message="Priya Sharma (priya@demo.nrb) has asked for a password reset.",
            link="/admin/users", is_read=False, created_at=ago(1),
        ),
        Notification(
            type=NotificationType.SIGNUP_REQUEST,
            title="[demo] Access request from Kavita Menon",
            message="Reviewed and rejected.",
            link="/admin/approvals", is_read=True,
            created_at=ago(30), read_at=ago(29),
        ),
    ]
    await repo.add_all(notes)
    unread = sum(1 for n in notes if not n.is_read)
    print(f"  {len(notes)} notifications ({unread} unread)")


async def make_email_setup(order_nos: list[str]):
    cfg = await repo.find_one(
        select(NotificationConfig).where(NotificationConfig.key == "order_stage_owners")
    )
    if not cfg:
        cfg = NotificationConfig()
        await repo.add(cfg)
    cfg.owners = [StageOwner(stage_code=c, label=lbl, emails=em) for c, lbl, em in STAGE_OWNERS]
    cfg.cc_emails = ["ppc@demo.nrb"]
    cfg.updated_at = datetime.now(timezone.utc)

    logs = []
    for i in range(30):
        code, label, emails = STAGE_OWNERS[i % len(STAGE_OWNERS)]
        no = order_nos[i % len(order_nos)]
        failed = i % 11 == 0
        logs.append(EmailLog(
            email_type="handoff" if i % 3 else "overdue_digest",
            to_emails=emails,
            cc_emails=["ppc@demo.nrb"],
            subject=f"[demo] {no} - {label} can start",
            order_no=no,
            stage_code=code,
            status="failed" if failed else "sent",
            error="SMTPAuthenticationError: demo entry" if failed else None,
            sent_at=ago(i),
        ))
    await repo.add_all(logs)
    print(f"  {len(STAGE_OWNERS)} stage owners, {len(logs)} email log entries")


# ─────────────────────────────────────────────────────────────

async def run(do_wipe: bool, do_all: bool):
    await init_db()
    random.seed(7)          # identical data every run, so screenshots stay stable

    # The wipe is its own unit of work, committed before anything is
    # written, so a failure while generating data cannot undo the clean-up
    # and leave the two halves interleaved.
    async with session_scope():
        if do_all:
            await wipe_everything()
        else:
            await wipe()

    if do_wipe:
        await close_db()
        return

    async with session_scope():
        await _generate()
    await close_db()


async def _generate() -> None:

    admin = await repo.find_one(select(User).where(User.role == Role.ADMIN))

    if not admin:
        # Diagnose rather than just give up.
        from config.settings import settings

        everyone = list(await repo.find_all(select(User)))
        print("\n--- no admin found ---")
        print(f"database   : {settings.SUPABASE_DB_URL.rsplit(chr(64), 1)[-1]}")
        print(f"users found: {len(everyone)}")
        for u in everyone[:20]:
            print(f"  {u.email:<32} role={u.role!r:<10} status={u.status!r}")

        if not everyone:
            raise SystemExit(
                "\nThat database is empty, so it is not the one your app uses.\n"
                "Check SUPABASE_DB_URL in backend/.env."
            )

        # Users exist but none is an admin - fall back to the oldest account.
        admin = sorted(everyone, key=lambda u: u.created_at)[0]
        print(
            f"\nNo user has role='admin'. Using the oldest account instead:"
            f" {admin.email}\n"
        )

    print("users:")
    users = await make_users(admin)
    print("orders:")
    order_nos = await make_orders(admin)
    print("apqp:")
    await make_apqp(admin, order_nos)
    print("admin data:")
    await make_audit(admin, users, order_nos)
    await make_notifications(users)
    await make_email_setup(order_nos)

    print("\nDone. Restart nothing - just refresh the browser.")
    print("Remove later with:  python -m database.seed_demo --wipe")
    await close_db()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wipe", action="store_true",
                    help="delete and exit, do not recreate")
    ap.add_argument("--all", action="store_true",
                    help="clear EVERY order and project, not just DEMO- ones")
    args = ap.parse_args()
    asyncio.run(run(args.wipe, args.all))
