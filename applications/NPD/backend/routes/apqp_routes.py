from fastapi import APIRouter, Depends, Query
from models.user import User
from schemas.apqp import (
    CreateApqpRequest, UpdateApqpRequest, UpdateActivitiesRequest, UpdateSignOffRequest,
    ApqpListItem, ApqpDetail, ActivityOut, PhaseSummary, SignOffOut, CreateCombinedRequest, CombinedCreated
)
from services import apqp_service, audit_service, read_cache
from utils.constants import Permission
from utils.deps import require_permission, require_admin
from datetime import date as date_type
from schemas.timeline import TimelineResponse, TimelineBar
router = APIRouter(prefix="/apqp", tags=["APQP"])


def _activity_out(a, months: list[str] | None = None) -> ActivityOut:
    """`months` lets the week columns be derived from the dates. Without
    it the grid comes back empty, which is correct for callers that have
    no project context."""
    info = apqp_service.activity_status(a)
    months = months or []
    return ActivityOut(
        id=str(a.id), activity_id=a.activity_id, phase_code=a.phase_code,
        no_label=a.no_label, activity_name=a.activity_name, sequence=a.sequence,
        check_point=a.check_point, responsibility=a.responsibility,
        is_heading=a.is_heading,
        plan_start=a.plan_start, plan_end=a.plan_end,
        actual_start=a.actual_start, actual_end=a.actual_end,
        week_flags=apqp_service.weeks_for_range(months, a.plan_start, a.plan_end),
        remark=a.remark,
        actual_week_flags=apqp_service.weeks_for_range(
            months, a.actual_start, a.actual_end
        ),
        status=info["status"], delay_days=info["delay_days"],
    )


async def _detail(project_id: str) -> ApqpDetail:
    project = await apqp_service.resolve_project(project_id)
    project_id = project.project_id
    activities = await apqp_service.get_activities(project_id)
    sign_off = await apqp_service.get_sign_off(project_id)
    tpl = await apqp_service.get_template()

    s = apqp_service.summarise(activities)
    months = apqp_service.effective_months(project, activities)

    return ApqpDetail(
        project_id=project.project_id,
        order_no=project.order_no,
        customer=project.customer,
        product_name=project.product_name,
        customer_part_no=project.customer_part_no,
        program_name=project.program_name,
        application=project.application,
        supply_condition=project.supply_condition,
        enquiry_date=project.enquiry_date,
        order_date=project.order_date,
        original_date=project.original_date,
        ppap_date=project.ppap_date,
        sample_submission_date=project.sample_submission_date,
        months=project.months,
        week_columns=apqp_service.week_columns(months),
        created_at=project.created_at,
        phases=[PhaseSummary(**p) for p in apqp_service.phase_rollup(tpl, activities)],

        activities=[_activity_out(a, months) for a in activities],
        sign_off=SignOffOut(
            team=sign_off.team, prepared_by=sign_off.prepared_by,
            reviewed_by=sign_off.reviewed_by, approved_by=sign_off.approved_by,
        ),
        percent=s["percent"],
        overdue_count=s["overdue"],
        status=s["status"],
    )


@router.get("", response_model=list[ApqpListItem])
async def list_projects(
    search: str | None = Query(default=None),
    _: User = Depends(require_permission(Permission.APQP_VIEW)),
):
    if search:
        return await apqp_service.list_projects(search)
    return await read_cache.get("apqp-list", lambda: apqp_service.list_projects(None))


@router.post("", response_model=ApqpDetail, status_code=201)
async def create_project(
    data: CreateApqpRequest,
    user: User = Depends(require_permission(Permission.APQP_EDIT)),
):
    project = await apqp_service.create(data, user)
    await audit_service.log("apqp_created", user, "apqp", project.project_id,
                            project.product_name or project.project_id)
    return await _detail(project.project_id)

@router.post("/with-order", response_model=CombinedCreated, status_code=201)
async def create_with_order(
    data: CreateCombinedRequest,
    user: User = Depends(require_permission(Permission.APQP_EDIT, Permission.TIMELINE_CREATE)),
):
    order_no, project_id = await apqp_service.create_with_order(data, user)
    await audit_service.log("project_created", user, "apqp", project_id, data.product_name,
                            note=f"Tracking + APQP timeline for {data.customer}")
    return CombinedCreated(order_no=order_no, project_id=project_id)

# Re-fills blank plan dates from the APQP plan chain.
@router.post("/{project_id}/rebuild-plan")
async def rebuild_plan(
    project_id: str,
    user: User = Depends(require_admin),       # writes plan dates -> admin only
):
    project = await apqp_service.resolve_project(project_id)
    project_id = project.project_id
    written = await apqp_service.apply_plan_chain(project)
    await audit_service.log("plan_rebuilt", user, "apqp", project_id,
                            project.product_name or project_id,
                            note=f"{written} plan dates filled")
    return {"project_id": project_id, "dated": written}



@router.get("/{project_id}", response_model=ApqpDetail)
async def get_project(
    project_id: str,
    _: User = Depends(require_permission(Permission.APQP_VIEW)),
):
    project_id = (await apqp_service.resolve_project(project_id)).project_id
    return await _detail(project_id)


@router.put("/{project_id}", response_model=ApqpDetail)
async def update_project(
    project_id: str,
    data: UpdateApqpRequest,
    admin: User = Depends(require_admin),
):
    project_id = (await apqp_service.resolve_project(project_id)).project_id
    project = await apqp_service.update_header(project_id, data, admin)
    payload = data.model_dump(mode="json", exclude_unset=True)
    await audit_service.log("apqp_updated", admin, "apqp", project_id,
                            project.product_name or project_id,
                            after=payload, note=audit_service.changed_fields(payload))
    return await _detail(project_id)


@router.put("/{project_id}/activities", response_model=list[ActivityOut])
async def update_activities(
    project_id: str,
    data: UpdateActivitiesRequest,
    user: User = Depends(require_permission(Permission.APQP_EDIT)),
):
    project_id = (await apqp_service.resolve_project(project_id)).project_id
    records = await apqp_service.update_activities(project_id, data.updates, user)
    project = await apqp_service.get_or_404(project_id)
    # Same stretched month window the detail page uses, so the week grid
    # does not lose columns after a save.
    months = apqp_service.effective_months(project, records)
    return [_activity_out(a, months) for a in records]


@router.put("/{project_id}/signoff", response_model=SignOffOut)
async def update_sign_off(
    project_id: str,
    data: UpdateSignOffRequest,
    user: User = Depends(require_permission(Permission.APQP_EDIT)),
):
    project = await apqp_service.resolve_project(project_id)
    project_id = project.project_id
    so = await apqp_service.update_sign_off(project_id, data)
    await audit_service.log("signoff_updated", user, "apqp", project_id,
                            project.product_name or project_id, note="Team sign-off saved")
    return SignOffOut(
        team=so.team, prepared_by=so.prepared_by,
        reviewed_by=so.reviewed_by, approved_by=so.approved_by,
    )


@router.delete("/{project_id}")
async def delete_project(project_id: str, admin: User = Depends(require_admin)):
    project = await apqp_service.resolve_project(project_id)
    project_id, label = project.project_id, project.product_name or project.project_id
    result = await apqp_service.delete(project_id)
    await audit_service.log("apqp_deleted", admin, "apqp", project_id, label, after=result,
                            note="Deleted with its Tracking record and files")
    return result

@router.get("/{project_id}/timeline", response_model=TimelineResponse)
async def timeline(
    project_id: str,
    _: User = Depends(require_permission(Permission.APQP_VIEW)),
):
    project_id = (await apqp_service.resolve_project(project_id)).project_id
    project = await apqp_service.get_or_404(project_id)
    activities = await apqp_service.get_activities(project_id)
    tpl = await apqp_service.get_template()

    bars = []
    dates: list[date_type] = []

    for p in apqp_service.phase_rollup(tpl, activities):
        if not p["total"]:
            continue
        bars.append(TimelineBar(
            stage_code=p["phase_code"].replace("PHASE", "P"),
            stage_name=p["phase_name"],
            sequence=p["sequence"],
            schedule_group="phases",
            plan_date=p["plan_end"],
            actual_date=p["actual_end"],
            status=p["status"],
            delay_days=None,
        ))
        dates.extend(d for d in (p["plan_start"], p["plan_end"], p["actual_start"], p["actual_end"]) if d)

    for a in activities:
        if a.is_heading:
            continue
        info = apqp_service.activity_status(a)
        bars.append(TimelineBar(
            stage_code=a.no_label or "—",
            stage_name=a.activity_name,
            sequence=100 + a.sequence,
            schedule_group="activities",
            plan_date=a.plan_end,
            actual_date=a.actual_end,
            status=info["status"],
            delay_days=info["delay_days"],
        ))
        dates.extend(
            d for d in (a.plan_start, a.plan_end, a.actual_start, a.actual_end) if d
        )
    today = date_type.today()
    dates.append(today)

    return TimelineResponse(
        order_no=project.project_id,
        customer_name=project.customer,
        today=today,
        range_start=min(dates) if dates else None,
        range_end=max(dates) if dates else None,
        groups=["phases", "activities"],
        bars=bars,
    )