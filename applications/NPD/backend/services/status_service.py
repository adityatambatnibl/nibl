from datetime import date

from models.order import OrderStage


class StageStatus:
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    OVERDUE = "overdue"
    COMPLETED = "completed"
    COMPLETED_LATE = "completed_late"


class OrderStatus:
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    DELAYED = "delayed"
    COMPLETED = "completed"


def stage_status(plan_date: date | None, actual_date: date | None, today: date | None = None) -> str:
    today = today or date.today()

    if actual_date is not None:
        if plan_date is not None and actual_date > plan_date:
            return StageStatus.COMPLETED_LATE
        return StageStatus.COMPLETED

    if plan_date is None:
        return StageStatus.NOT_STARTED

    if plan_date < today:
        return StageStatus.OVERDUE

    return StageStatus.IN_PROGRESS


def delay_days(plan_date: date | None, actual_date: date | None, today: date | None = None) -> int | None:
    """Positive = late. Negative = early. None = not measurable yet."""
    if plan_date is None:
        return None
    if actual_date is not None:
        return (actual_date - plan_date).days
    today = today or date.today()
    if plan_date < today:
        return (today - plan_date).days
    return None


def describe(stage: OrderStage, today: date | None = None) -> dict:
    status = stage_status(stage.plan_date, stage.actual_date, today)
    return {
        "status": status,
        "delay_days": delay_days(stage.plan_date, stage.actual_date, today),
        "is_late": status in (StageStatus.OVERDUE, StageStatus.COMPLETED_LATE),
    }


def progress(stages: list[OrderStage]) -> dict:
    total = len(stages)
    if total == 0:
        return {"completed": 0, "total": 0, "percent": 0}
    completed = sum(1 for s in stages if s.actual_date is not None)
    return {
        "completed": completed,
        "total": total,
        "percent": int(completed / total * 100),
    }


def rollup(stages: list[OrderStage], today: date | None = None) -> str:
    """Derives an order-level status from its stages."""
    if not stages:
        return OrderStatus.NOT_STARTED

    statuses = [stage_status(s.plan_date, s.actual_date, today) for s in stages]

    if all(s in (StageStatus.COMPLETED, StageStatus.COMPLETED_LATE) for s in statuses):
        return OrderStatus.COMPLETED

    if StageStatus.OVERDUE in statuses:
        return OrderStatus.DELAYED

    if any(s in (StageStatus.COMPLETED, StageStatus.COMPLETED_LATE) for s in statuses):
        return OrderStatus.IN_PROGRESS

    return OrderStatus.NOT_STARTED


def summarise(stages: list[OrderStage], today: date | None = None) -> dict:
    today = today or date.today()

    # A stage with neither a plan nor an actual date has been cleared by an
    # admin, meaning it does not apply to this order. It is excluded from
    # every count so the progress reflects the work that is actually needed.
    stages = [
        s for s in stages
        if s.plan_date is not None or s.actual_date is not None
    ]
    counts = {
        StageStatus.NOT_STARTED: 0,
        StageStatus.IN_PROGRESS: 0,
        StageStatus.OVERDUE: 0,
        StageStatus.COMPLETED: 0,
        StageStatus.COMPLETED_LATE: 0,
    }
    for s in stages:
        counts[stage_status(s.plan_date, s.actual_date, today)] += 1

    return {
        "status": rollup(stages, today),
        "progress": progress(stages),
        "stage_counts": counts,
        "overdue_count": counts[StageStatus.OVERDUE],
        "late_count": counts[StageStatus.COMPLETED_LATE],
    }
