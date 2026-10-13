from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from models.template import StageOffset
from models.user import User
from schemas.template import (
    StageOffsetOut, UpdateStagesRequest, LookupsOut,
    PreviewRequest, PreviewStage, PreviewResponse,
)
from services import template_service, schedule_service, audit_service, analytics_service
from utils.date_utils import days_between
from utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/templates", tags=["Templates"])


@router.get("/stages", response_model=list[StageOffsetOut])
async def get_stages(_: User = Depends(get_current_user)):
    tpl = await template_service.get_stages()
    lead_times = await analytics_service.lead_time_comparison(None)
    by_code = {l.stage_code: l for l in lead_times}

    out = []
    for s in sorted(tpl.stages, key=lambda x: x.sequence):
        lt = by_code.get(s.code)
        payload = s.model_dump()
        payload["actual_avg_offset"] = lt.actual_avg_offset if lt else None
        payload["variance"] = lt.variance if lt else None
        payload["sample_size"] = lt.sample_size if lt else 0
        payload["unconfirmed"] = bool(s.note and "CONFIRM" in s.note.upper())
        out.append(StageOffsetOut(**payload))

    return out
@router.put("/stages", response_model=list[StageOffsetOut])
async def update_stages(data: UpdateStagesRequest, admin: User = Depends(require_admin)):
    tpl = await template_service.get_stages()
    before = {s.code: s.offset_days for s in tpl.stages}

    tpl.stages = [StageOffset(**s.model_dump()) for s in data.stages]
    tpl.version += 1
    tpl.updated_at = datetime.now(timezone.utc)
    tpl.updated_by = str(admin.id)

    after = {s.code: s.offset_days for s in tpl.stages}
    changed = {k: v for k, v in after.items() if before.get(k) != v}
    if changed:
        await audit_service.log(
            "stage_offsets_changed", admin, "template", str(tpl.id), "Production stages",
            before={k: before.get(k) for k in changed}, after=changed,
        )

    return sorted(tpl.stages, key=lambda s: s.sequence)


@router.get("/lookups", response_model=LookupsOut)
async def get_lookups(_: User = Depends(get_current_user)):
    tpl = await template_service.get_lookups()
    return LookupsOut(
        bearing_types=tpl.bearing_types,
        rpd_statuses=tpl.rpd_statuses,
        delay_reasons=tpl.delay_reasons,
        responsibilities=tpl.responsibilities,
        check_point_options=tpl.check_point_options,
    )


@router.post("/preview-schedule", response_model=PreviewResponse)
async def preview_schedule(data: PreviewRequest, _: User = Depends(get_current_user)):
    tpl = await template_service.get_stages()
    a0, a, dates = await schedule_service.build_schedule(
        data.a0_date, data.a_date, data.conditions, data.order_date
    )

    stages = [
        PreviewStage(
            code=s.code, name=s.name, sequence=s.sequence,
            depends_on=s.depends_on,
            offset_days=schedule_service.resolve_offset(s, data.conditions),
            plan_date=dates[s.code],
            days_from_a=days_between(a, dates[s.code]) or 0,
        )
        for s in sorted(tpl.stages, key=lambda s: s.sequence)
        if s.code in dates
    ]

    return PreviewResponse(
        a0_date=a0, a_date=a,
        total_days=days_between(a, dates.get("X")),
        stages=stages,
    )


# ═══════════════════════════════════════════════════════════════════════
# BEARING PLANS - the simple, bearing-wise view of the stage offsets
#
# The stored template keeps one default rule per stage plus per-bearing
# exceptions (variants / depends_on_variants / skip_for). This screen shows
# ONE bearing type at a time as a plain table - "starts after", "days",
# "needed?" - and writes back only what differs from the default.
# ═══════════════════════════════════════════════════════════════════════

from datetime import date as _date
from fastapi import HTTPException, Query, status
from pydantic import BaseModel, Field


class PlanRow(BaseModel):
    code: str
    name: str
    sequence: int
    starts_after: str | None          # stage code, None for the anchors
    days: int
    needed: bool = True
    is_custom: bool = False           # differs from the default plan
    fixed: str | None = None          # read-only rows: "A", "A0", "order_date"
    plan_day: int | None = None       # days after A (Proposal Drawing) in a sample plan


class PlanOut(BaseModel):
    bearing_type: str | None
    bearing_types: list[str]
    lead_time_days: int | None        # A -> X (dispatch)
    stages: list[PlanRow]


class PlanRowIn(BaseModel):
    code: str
    starts_after: str | None = None
    days: int = Field(default=0, ge=0, le=365)
    needed: bool = True


class PlanIn(BaseModel):
    bearing_type: str | None = None   # None = the default plan
    stages: list[PlanRowIn]


class BearingTypeIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    copy_from: str | None = None      # another bearing type, or None for the default


class BearingTypeName(BaseModel):
    name: str


def _key(mapping: dict, bt: str):
    """The key in `mapping` that matches bearing type `bt`, ignoring case."""
    for k in mapping:
        if str(k).casefold() == bt.casefold():
            return k
    return None


def _fixed(s) -> str | None:
    if s.code in (schedule_service.A0, schedule_service.ANCHOR):
        return s.code
    if s.anchor_field:
        return s.anchor_field
    return None


def _rows(stages, bt: str | None) -> list[PlanRow]:
    cond = [bt] if bt else []
    # A sample plan from today, so the admin sees the effect of each change.
    try:
        dates = schedule_service.compute_plan_dates(stages, _date.today(), None, cond, _date.today())
    except HTTPException:
        dates = {}
    a = dates.get(schedule_service.ANCHOR)
    rows = []
    for s in sorted(stages, key=lambda x: x.sequence):
        days = schedule_service.resolve_offset(s, cond)
        after = schedule_service.resolve_parent(s, cond)
        needed = not schedule_service.is_skipped(s, cond)
        custom = bool(bt) and (
            _key(s.variants, bt) is not None
            or _key(s.depends_on_variants, bt) is not None
            or any(x.casefold() == bt.casefold() for x in s.skip_for)
        )
        d = dates.get(s.code)
        rows.append(PlanRow(
            code=s.code, name=s.name, sequence=s.sequence,
            starts_after=after, days=days, needed=needed, is_custom=custom,
            fixed=_fixed(s),
            plan_day=(d - a).days if (d and a) else None,
        ))
    return rows


def _lead_time(stages, bt: str | None) -> int | None:
    try:
        dates = schedule_service.compute_plan_dates(
            stages, _date.today(), None, [bt] if bt else [], _date.today())
    except HTTPException:
        return None
    x, a = dates.get("X"), dates.get(schedule_service.ANCHOR)
    return (x - a).days if (x and a) else None


@router.get("/bearing-plan", response_model=PlanOut)
async def get_bearing_plan(
    bearing_type: str | None = Query(default=None),
    _: User = Depends(get_current_user),
):
    tpl = await template_service.get_stages()
    lookups = await template_service.get_lookups()
    return PlanOut(
        bearing_type=bearing_type or None,
        bearing_types=list(lookups.bearing_types or []),
        lead_time_days=_lead_time(tpl.stages, bearing_type or None),
        stages=_rows(tpl.stages, bearing_type or None),
    )


@router.put("/bearing-plan", response_model=PlanOut)
async def save_bearing_plan(data: PlanIn, admin: User = Depends(require_admin)):
    tpl = await template_service.get_stages()
    lookups = await template_service.get_lookups()
    bt = (data.bearing_type or "").strip() or None
    by_code = {s.code: s for s in tpl.stages}
    changes: list[str] = []

    if bt and not any(b.casefold() == bt.casefold() for b in lookups.bearing_types or []):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Bearing type '{bt}' not found.")

    for row in data.stages:
        s = by_code.get(row.code)
        if s is None or _fixed(s) in (schedule_service.A0, schedule_service.ANCHOR):
            continue
        if row.starts_after and row.starts_after not in by_code:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown stage '{row.starts_after}'.")
        if row.starts_after == s.code:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{s.name}' cannot start after itself.")

        variants, parents, skip = dict(s.variants), dict(s.depends_on_variants), list(s.skip_for)

        if bt is None:
            # The default plan - applies to every bearing without its own rule.
            if s.offset_days != row.days:
                changes.append(f"{s.name}: {s.offset_days} -> {row.days} day{'s' if row.days != 1 else ''}")
            s.offset_days = row.days
            if not s.anchor_field:
                s.depends_on = row.starts_after
        else:
            old_days = schedule_service.resolve_offset(s, [bt])
            for k in [k for k in variants if k.casefold() == bt.casefold()]:
                variants.pop(k)
            if row.days != s.offset_days:
                variants[bt] = row.days
            if old_days != row.days:
                changes.append(f"{s.name}: {old_days} -> {row.days} day{'s' if row.days != 1 else ''}")

            for k in [k for k in parents if k.casefold() == bt.casefold()]:
                parents.pop(k)
            if not s.anchor_field and row.starts_after and row.starts_after != s.depends_on:
                parents[bt] = row.starts_after

            was_needed = not any(x.casefold() == bt.casefold() for x in skip)
            skip = [x for x in skip if x.casefold() != bt.casefold()]
            if not row.needed:
                skip.append(bt)
            if was_needed != row.needed:
                changes.append(f"{s.name}: {'needed' if row.needed else 'not needed'}")

        # jsonb columns only save when a NEW object is assigned
        by_code[s.code] = s.model_copy(update={
            "variants": variants, "depends_on_variants": parents, "skip_for": skip,
        })

    new_stages = [by_code[s.code] for s in tpl.stages]
    # Refuse a plan that can no longer be worked out (e.g. a loop).
    try:
        schedule_service.compute_plan_dates(new_stages, _date.today(), None, [bt] if bt else [], _date.today())
    except HTTPException as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"This plan cannot be used: {exc.detail}")

    tpl.stages = new_stages
    tpl.version += 1
    tpl.updated_at = datetime.now(timezone.utc)
    tpl.updated_by = str(admin.id)

    if changes:
        await audit_service.log(
            "stage_offsets_changed", admin, "template", str(tpl.id),
            f"Plan - {bt or 'Default (all bearings)'}",
            note=audit_service.summarise(changes),
        )

    return PlanOut(
        bearing_type=bt, bearing_types=list(lookups.bearing_types or []),
        lead_time_days=_lead_time(tpl.stages, bt), stages=_rows(tpl.stages, bt),
    )


@router.post("/bearing-types", response_model=LookupsOut, status_code=201)
async def add_bearing_type(data: BearingTypeIn, admin: User = Depends(require_admin)):
    name = data.name.strip()
    lookups = await template_service.get_lookups()
    types = list(lookups.bearing_types or [])
    if any(t.casefold() == name.casefold() for t in types):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Bearing type '{name}' already exists.")

    tpl = await template_service.get_stages()
    src = (data.copy_from or "").strip() or None
    if src:
        # Start the new type with a copy of another type's plan.
        new_stages = []
        for s in tpl.stages:
            v, p, k = dict(s.variants), dict(s.depends_on_variants), list(s.skip_for)
            kv, kp = _key(v, src), _key(p, src)
            if kv is not None:
                v[name] = v[kv]
            if kp is not None:
                p[name] = p[kp]
            if any(x.casefold() == src.casefold() for x in k):
                k.append(name)
            new_stages.append(s.model_copy(update={"variants": v, "depends_on_variants": p, "skip_for": k}))
        tpl.stages = new_stages
        tpl.version += 1
        tpl.updated_at = datetime.now(timezone.utc)

    lookups.bearing_types = types + [name]
    await audit_service.log(
        "bearing_type_added", admin, "template", str(lookups.id), name,
        note=f"Plan copied from {src}" if src else "Uses the default plan",
    )
    return LookupsOut(
        bearing_types=lookups.bearing_types, rpd_statuses=lookups.rpd_statuses,
        delay_reasons=lookups.delay_reasons, responsibilities=lookups.responsibilities,
        check_point_options=lookups.check_point_options,
    )


@router.post("/bearing-types/remove", response_model=LookupsOut)
async def remove_bearing_type(data: BearingTypeName, admin: User = Depends(require_admin)):
    """Takes a type off the list for new orders. Existing orders keep their dates."""
    lookups = await template_service.get_lookups()
    types = list(lookups.bearing_types or [])
    keep = [t for t in types if t.casefold() != data.name.strip().casefold()]
    if len(keep) == len(types):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Bearing type '{data.name}' not found.")

    tpl = await template_service.get_stages()
    bt = data.name.strip()
    tpl.stages = [
        s.model_copy(update={
            "variants": {k: v for k, v in s.variants.items() if k.casefold() != bt.casefold()},
            "depends_on_variants": {k: v for k, v in s.depends_on_variants.items() if k.casefold() != bt.casefold()},
            "skip_for": [x for x in s.skip_for if x.casefold() != bt.casefold()],
        })
        for s in tpl.stages
    ]
    tpl.version += 1
    tpl.updated_at = datetime.now(timezone.utc)

    lookups.bearing_types = keep
    await audit_service.log("bearing_type_removed", admin, "template", str(lookups.id), bt)
    return LookupsOut(
        bearing_types=lookups.bearing_types, rpd_statuses=lookups.rpd_statuses,
        delay_reasons=lookups.delay_reasons, responsibilities=lookups.responsibilities,
        check_point_options=lookups.check_point_options,
    )
