from datetime import date, timedelta


def add_days(d: date, days: int) -> date:
    """Calendar days, including weekends and holidays (matches the source Excel)."""
    return d + timedelta(days=days)


def days_between(start: date | None, end: date | None) -> int | None:
    if start is None or end is None:
        return None
    return (end - start).days