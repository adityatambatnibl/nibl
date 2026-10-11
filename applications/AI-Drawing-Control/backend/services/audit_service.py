from datetime import date, datetime
from decimal import Decimal
from uuid import UUID


from sqlalchemy import select

from database import repo
from models.audit import AuditLog
from models.user import User


def _jsonable(value):
    """
    before/after are jsonb columns, so everything in them must survive
    json.dumps. Callers pass model_dump() straight through, which hands us
    real date, datetime, UUID and Decimal objects - none of which the JSON
    encoder knows. Converting here means no caller has to remember.
    """
    if value is None:
        return None
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    return value




async def log(
    action: str,
    actor: User,
    target_type: str | None = None,
    target_id: str | None = None,
    target_label: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    note: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        action=action,
        actor_id=str(actor.id),
        actor_name=actor.name,
        target_type=target_type,
        target_id=target_id,
        target_label=target_label,
        before=_jsonable(before),
        after=_jsonable(after),
        note=note,
    )
    await repo.add(entry)
    return entry


async def list_logs(
    target_type: str | None = None, limit: int = 100, actor_id: str | None = None,
) -> list[AuditLog]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if target_type:
        stmt = stmt.where(AuditLog.target_type == target_type)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    return list(await repo.find_all(stmt))


async def count_logs(include_sign_ins: bool = True) -> int:
    """How many entries exist in total - for 'Showing 100 of 2,345'."""
    stmt = select(AuditLog.id)
    if not include_sign_ins:
        stmt = stmt.where(AuditLog.action != "signed_in")
    return await repo.count(stmt)


async def log_sign_in(user: User) -> None:
    """One 'Signed in' entry per user per 8 hours - the app re-checks SSO on
    every page load, and logging each of those would drown everything else."""
    from datetime import timedelta, timezone
    since = datetime.now(timezone.utc) - timedelta(hours=8)
    recent = await repo.find_one(
        select(AuditLog).where(
            AuditLog.action == "signed_in",
            AuditLog.actor_id == str(user.id),
            AuditLog.created_at >= since,
        )
    )
    if not recent:
        await log("signed_in", user, "user", str(user.id), user.email)


# ── Short, readable descriptions for the Audit History screen ─────────────

FIELD_NAMES = {
    "product_name": "product name", "order_no": "order no.", "order_date": "order date",
    "customer": "customer", "customer_name": "customer", "customer_part_no": "part no.",
    "program_name": "program", "application": "application",
    "supply_condition": "supply condition", "enquiry_date": "enquiry date",
    "original_date": "original date", "ppap_date": "PPAP date",
    "sample_submission_date": "sample submission date",
    "planned_delivery_sample": "sample delivery date",
    "planned_delivery_batch": "batch delivery date", "rpd_status": "RPD status",
    "notes": "notes",
}


def fmt(value) -> str:
    """A value as it should read in the audit trail: dates as 26-May-2026."""
    if value is None or value == "":
        return "blank"
    if isinstance(value, (date, datetime)):
        return value.strftime("%d-%b-%Y")
    return str(value)


def changed_fields(payload: dict) -> str:
    """'Changed product name, order date' - which header fields were edited."""
    names = [FIELD_NAMES.get(k, k.replace("_", " ")) for k in payload]
    return ("Changed " + ", ".join(names)) if names else ""


def summarise(lines: list[str], limit: int = 3) -> str:
    """At most `limit` changes, then '+N more' - short enough for one table cell."""
    if not lines:
        return ""
    shown = "; ".join(lines[:limit])
    extra = len(lines) - limit
    return shown + (f"; +{extra} more" if extra > 0 else "")
