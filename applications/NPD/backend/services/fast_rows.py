"""
Light, read-only rows for the big list/summary screens.

Loading ApqpActivityRecord / OrderStage as full ORM objects is the slow part
of the dashboard, the lists and analytics once there are thousands of
projects: every object is tracked by the session and every activity decodes
two JSON columns (week flags) that these screens never use.

These helpers select only the columns the summaries read and return plain
rows. A row has the same attribute names as the model (row.plan_end,
row.actual_date, ...), so summarise(), phase_rollup() and the other
existing functions work on them unchanged - the results are identical,
only faster. Never use these rows to edit data.
"""

from sqlalchemy import Text, any_, literal, select
from sqlalchemy.dialects.postgresql import ARRAY

from database.connection import db
from models.apqp import ApqpActivityRecord as A
from models.order import OrderStage as S

STAGE_COLUMNS = (
    S.id, S.order_no, S.schedule_group, S.stage_code, S.stage_name, S.sequence,
    S.plan_date, S.actual_date, S.remark, S.delay_reason, S.updated_at, S.updated_by,
)

# Everything except the two JSON week-flag columns (the expensive part).
ACTIVITY_COLUMNS = (
    A.id, A.project_id, A.activity_id, A.phase_code, A.no_label, A.activity_name,
    A.sequence, A.check_point, A.responsibility, A.is_heading,
    A.plan_start, A.plan_end, A.actual_start, A.actual_end,
    A.remark, A.updated_at, A.updated_by,
)


async def stages(*where) -> list:
    """OrderStage rows (read-only). `where` = normal SQLAlchemy conditions."""
    return list((await db().execute(select(*STAGE_COLUMNS).where(*where))).all())


async def activities(*where) -> list:
    """ApqpActivityRecord rows (read-only)."""
    return list((await db().execute(select(*ACTIVITY_COLUMNS).where(*where))).all())


# Only what the status summaries, phase roll-ups and overdue lists read.
SUMMARY_COLUMNS = (
    A.project_id, A.phase_code, A.no_label, A.activity_name, A.responsibility,
    A.plan_start, A.plan_end, A.actual_start, A.actual_end,
)


async def activity_summaries(*where) -> list:
    """Smallest ApqpActivityRecord rows - for dashboard and list summaries."""
    return list((await db().execute(select(*SUMMARY_COLUMNS).where(*where))).all())


def one_of(column, values):
    """
    `column IN (values)` sent as ONE array parameter.

    A plain .in_(list) sends one parameter per value, and PostgreSQL drivers
    stop at 32,767 parameters - with tens of thousands of orders the big
    screens would fail. `= ANY(array)` has no such limit and is just as fast.
    """
    return column == any_(literal(list(values), ARRAY(Text)))


async def phase_counts(today, *where) -> dict[str, dict[str, tuple[int, int, int, int]]]:
    """
    Per project and phase, counted in the database:
        (all activities, counted, completed, overdue)

    "counted" / "completed" / "overdue" follow exactly the rules of
    apqp_service.summarise(): an activity with neither a plan end nor an
    actual end is left out; completed = has an actual end; overdue = no
    actual end and the plan end is before today.
    """
    from sqlalchemy import func

    counted = (A.plan_end.isnot(None)) | (A.actual_end.isnot(None))
    stmt = (
        select(
            A.project_id,
            A.phase_code,
            func.count(),
            func.count().filter(counted),
            func.count().filter(A.actual_end.isnot(None)),
            func.count().filter(A.actual_end.is_(None), A.plan_end < today),
        )
        .where(*where)
        .group_by(A.project_id, A.phase_code)
    )
    out: dict[str, dict[str, tuple[int, int, int, int]]] = {}
    for pid, phase, n_all, n_counted, n_done, n_late in (await db().execute(stmt)).all():
        out.setdefault(pid, {})[phase] = (n_all, n_counted, n_done, n_late)
    return out
