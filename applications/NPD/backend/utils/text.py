def plural(n: int, one: str, many: str | None = None) -> str:
    """
    "1 stage" / "4 stages" - never "4 stage(s)".

    Pass the plural when it is not just +s: plural(n, "activity", "activities").
    """
    return f"{n} {one if n == 1 else (many or one + 's')}"
