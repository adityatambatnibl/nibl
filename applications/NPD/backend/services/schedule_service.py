from datetime import date

from fastapi import HTTPException, status

from models.template import StageOffset
from services import template_service
from utils.date_utils import add_days

A0 = "A0"
ANCHOR = "A"
A0_TO_A_FALLBACK_DAYS = 4


def _lookup(mapping: dict, conditions: list[str]):
    """
    The bearing-specific value for these conditions, or None.

    Case-insensitive: the seeded rules were written 'AX-THICK' while the
    bearing list says 'AX-Thick', and an exact match silently ignored them.
    """
    if not mapping:
        return None
    folded = {str(k).casefold(): v for k, v in mapping.items()}
    for c in conditions:
        if c and c.casefold() in folded:
            return folded[c.casefold()]
    return None


def resolve_offset(stage: StageOffset, conditions: list[str]) -> int:
    v = _lookup(stage.variants, conditions)
    return stage.offset_days if v is None else v


def resolve_parent(stage: StageOffset, conditions: list[str]) -> str | None:
    v = _lookup(stage.depends_on_variants, conditions)
    return stage.depends_on if v is None else v


def is_skipped(stage: StageOffset, conditions: list[str]) -> bool:
    """Not needed when EVERY bearing type in the group skips it."""
    if not conditions or not stage.skip_for:
        return False
    skip = {s.casefold() for s in stage.skip_for}
    return all(c.casefold() in skip for c in conditions)


def compute_plan_dates(
    stages: list[StageOffset],
    a_date: date,
    a0_date: date | None = None,
    conditions: list[str] | None = None,
    order_date:date | None = None,
) -> dict[str, date]:
    """Walk the dependency chain and return {stage_code: plan_date}."""
    conditions = conditions or []
    by_code = {s.code: s for s in stages}
    result: dict[str, date] = {ANCHOR: a_date}
    if a0_date:
        result[A0] = a0_date

    anchors = {"order_date": order_date}
    for s in stages:
        if s.anchor_field:
            base = anchors.get(s.anchor_field)
            if base is not None:
                result[s.code] = add_days(base, resolve_offset(s, conditions))

    skipped: set[str] = set()
    ordered = sorted(stages, key=lambda s: s.sequence)
    pending = [s for s in ordered if s.code not in result and s.code not in (A0, ANCHOR)]

    # Iterate until nothing new resolves - handles out-of-order dependencies.
    while pending:
        progressed = False
        still_pending = []

        for stage in pending:
            parent_code = resolve_parent(stage, conditions)
            if parent_code is None:
                #still_pending.append(stage)
                continue

            if parent_code not in by_code and parent_code != ANCHOR:
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    f"Stage '{stage.code}' depends on unknown stage '{parent_code}'.",
                )
            if parent_code not in result:
                still_pending.append(stage)
                continue

            if is_skipped(stage, conditions):
                # Not needed for this bearing: it takes no time, so the next
                # stage simply follows on from this one's parent.
                result[stage.code] = result[parent_code]
                skipped.add(stage.code)
            else:
                result[stage.code] = add_days(result[parent_code], resolve_offset(stage, conditions))
            progressed = True

        if still_pending and not progressed:
            unresolved = ", ".join(s.code for s in still_pending)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                f"Circular or unresolvable stage dependencies: {unresolved}",
            )
        pending = still_pending

    for code in skipped:
        result.pop(code, None)
    return result


def resolve_anchors(a0_date: date | None, a_date: date | None) -> tuple[date | None, date]:
    """Preserves the legacy rule: A = A0 + 4 when only A0 is supplied."""
    if a0_date is None and a_date is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "You must provide either the A0 date or the A date.",
        )
    if a_date is not None:
        return a0_date, a_date
    return a0_date, add_days(a0_date, A0_TO_A_FALLBACK_DAYS)


async def build_schedule(
    a0_date: date | None,
    a_date: date | None,
    conditions: list[str] | None = None,
    order_date: date | None = None,
) -> tuple[date | None, date, dict[str, date]]:
    tpl = await template_service.get_stages()
    final_a0, final_a = resolve_anchors(a0_date, a_date)
    return final_a0, final_a, compute_plan_dates(
        tpl.stages, final_a, final_a0, conditions, order_date
    )