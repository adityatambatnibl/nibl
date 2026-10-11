from __future__ import annotations

from datetime import date
from typing import Any


SAVING_TYPES = {
    "recurring": "Recurring Saving",
    "limited": "Limited Period Saving",
    "one_time": "One-Time Saving",
}


def normalize_saving_type(value: Any) -> str:
    value = str(value or "recurring").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "recurring_saving": "recurring",
        "monthly": "recurring",
        "limited_period": "limited",
        "limited_period_saving": "limited",
        "temporary": "limited",
        "one_time_saving": "one_time",
        "onetime": "one_time",
        "oneoff": "one_time",
    }
    value = aliases.get(value, value)
    if value not in SAVING_TYPES:
        raise ValueError("Saving Type must be Recurring Saving, Limited Period Saving, or One-Time Saving.")
    return value


def _number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Saving amount must be numeric.") from exc
    if number < 0:
        raise ValueError("Saving amount cannot be negative.")
    return number


def _duration_months(item: dict[str, Any]) -> int | None:
    raw = item.get("duration_months")
    if raw in (None, ""):
        # Backward-compatible support for duration entered as years/months.
        value = _number(item.get("duration_value"))
        unit = str(item.get("duration_unit") or "months").strip().lower()
        if value is None:
            return None
        if unit.startswith("year"):
            return int(round(value * 12))
        return int(round(value))
    try:
        months = int(float(raw))
    except (TypeError, ValueError) as exc:
        raise ValueError("Limited-period saving duration must be a whole number of months.") from exc
    return months


def normalize_cost_saving_items(items: Any) -> tuple[list[dict[str, Any]], float | None]:
    normalized: list[dict[str, Any]] = []
    for raw in items or []:
        if not isinstance(raw, dict):
            continue

        particular = str(raw.get("particular") or "").strip()
        saving_type = normalize_saving_type(raw.get("saving_type"))

        before = _number(raw.get("before"))
        after = _number(raw.get("after"))
        monthly_saving = 0.0
        one_time_saving = 0.0
        duration_months: int | None = None

        if saving_type in {"recurring", "limited"}:
            if before is None or after is None:
                if particular:
                    raise ValueError(f"Before and After are required for {SAVING_TYPES[saving_type]}.")
                continue
            monthly_saving = max(0.0, before - after)
            if saving_type == "limited":
                duration_months = _duration_months(raw)
                if not duration_months or duration_months <= 0:
                    raise ValueError("Limited Period Saving requires a duration greater than 0 months.")
        else:
            one_time_saving = _number(raw.get("one_time_saving")) or 0.0
            if not particular and one_time_saving == 0:
                continue
            if one_time_saving <= 0:
                raise ValueError("One-Time Saving requires a saving amount greater than 0.")
            # Before/After do not apply to one-time savings.
            before = None
            after = None

        if not particular:
            continue

        row = {
            "sl_no": len(normalized) + 1,
            "particular": particular,
            "saving_type": saving_type,
            "saving_type_label": SAVING_TYPES[saving_type],
            "before": before,
            "after": after,
            "monthly_saving": round(monthly_saving, 2),
            "one_time_saving": round(one_time_saving, 2),
        }
        if duration_months is not None:
            row["duration_months"] = duration_months
        normalized.append(row)

    total_monthly = sum(float(row.get("monthly_saving") or 0) for row in normalized)
    return normalized, (round(total_monthly, 2) if normalized else None)


def payback_period(investment_amount: Any, items: list[dict[str, Any]] | None) -> str | None:
    investment = _number(investment_amount)
    if not investment or investment <= 0:
        return None

    items = items or []
    monthly = sum(float(item.get("monthly_saving") or 0) for item in items if normalize_saving_type(item.get("saving_type")) != "one_time")
    one_time = sum(float(item.get("one_time_saving") or 0) for item in items if normalize_saving_type(item.get("saving_type")) == "one_time")
    saving = monthly if monthly > 0 else one_time
    if saving <= 0:
        return None

    total_days = round((investment / saving) * 30)
    months, days = divmod(total_days, 30)
    parts = []
    if months:
        parts.append(f"{months} {'month' if months == 1 else 'months'}")
    if days or not parts:
        parts.append(f"{days} {'day' if days == 1 else 'days'}")
    return " ".join(parts)


# Backward-compatible alias used by draft and Accounts approval APIs.
# The calculation returns a human-readable period such as "6 months 15 days".
calculate_payback_period = payback_period




def applicable_saving(items: list[dict[str, Any]] | None) -> float:
    """
    Return the saving amount applicable to the selected saving type.

    Recurring       -> monthly saving x 12
    Limited period  -> monthly saving x duration in months
    One-time        -> one-time saving

    This is intentionally separate from saving_for_fy(), which remains
    available for financial-year analytics.
    """
    total = 0.0

    for item in items or []:
        saving_type = normalize_saving_type(item.get("saving_type"))

        if saving_type == "one_time":
            total += float(item.get("one_time_saving") or 0)
            continue

        monthly = float(item.get("monthly_saving") or 0)

        if saving_type == "limited":
            duration = int(item.get("duration_months") or 0)
            if duration > 0:
                total += monthly * duration
            continue

        total += monthly * 12

    return round(total, 2)


def financial_year_start(year: int) -> date:
    return date(year, 4, 1)


def financial_year_for_date(value: date) -> int:
    return value.year if value.month >= 4 else value.year - 1


def saving_for_month(start_date: date, items: list[dict[str, Any]], year: int, month: int) -> float:
    month_start = date(year, month, 1)
    start_month = date(start_date.year, start_date.month, 1)
    if month_start < start_month:
        return 0.0
    months_since_start = (year - start_date.year) * 12 + month - start_date.month

    total = 0.0
    for item in items or []:
        saving_type = normalize_saving_type(item.get("saving_type"))
        if saving_type == "one_time":
            if months_since_start == 0:
                total += float(item.get("one_time_saving") or 0)
        elif saving_type == "recurring":
            total += float(item.get("monthly_saving") or 0)
        else:
            duration = int(item.get("duration_months") or 0)
            if 0 <= months_since_start < duration:
                total += float(item.get("monthly_saving") or 0)
    return round(total, 2)


def saving_for_fy(start_date: date, items: list[dict[str, Any]], fy_start_year: int) -> float:
    total = 0.0
    for month_offset in range(12):
        month_index = 4 + month_offset
        year = fy_start_year if month_index <= 12 else fy_start_year + 1
        month = month_index if month_index <= 12 else month_index - 12
        total += saving_for_month(start_date, items, year, month)
    return round(total, 2)
