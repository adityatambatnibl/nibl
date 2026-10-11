from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, update

from database import repo
from database.connection import after_commit, db
from models.apqp import ApqpProject
from models.order import Order, OrderItem, OrderStage
from models.user import User
from schemas.order import CreateOrderRequest, UpdateOrderRequest
from services import schedule_service, status_service, template_service
from services import fast_rows


async def create(data: CreateOrderRequest, user: User) -> Order:
    tpl = await template_service.get_stages()
    stage_by_code = {s.code: s for s in tpl.stages}

    # The product name is the identity people see. The order number is
    # optional on the form; when it is blank the product name takes its
    # place as the internal key - both are unique, so the key stays valid
    # and nothing invented ever appears on screen.
    product_name = data.product_name.strip()
    if data.order_no and data.order_no.strip():
        order_no = data.order_no.strip().upper()
    else:
        # "/" cannot sit inside a URL segment, so it is swapped in the key.
        order_no = product_name.replace("/", "-").replace("\\", "-")

    await ensure_product_name_free(product_name)

    existing = await repo.find_one(select(Order).where(Order.order_no == order_no))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Order '{order_no}' already exists.")

    order = Order(
        order_no=order_no,
        product_name=product_name,
        order_date=data.order_date,
        customer_name=data.customer_name.strip(),
        planned_delivery_sample=data.planned_delivery_sample,
        planned_delivery_batch=data.planned_delivery_batch,
        rpd_status=data.rpd_status,
        notes=data.notes,
        created_by=str(user.id),
    )

    try:
        async with repo.savepoint():
            await repo.add(order)
    except repo.IntegrityError:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"An order for '{product_name}' already exists.",
        )

    items: list[OrderItem] = []
    stages: list[OrderStage] = []

    for idx, group in enumerate(data.groups, start=1):
        group_id = f"{order_no}-G{idx}"

        bearing_types = {i.bearing_type for i in group.items}
        conditions = sorted(bearing_types)

        a0, a, plan_dates = await schedule_service.build_schedule(
            group.anchor_a0, group.anchor_a, conditions, data.order_date
        )

        for item in group.items:
            items.append(OrderItem(
                order_no=order_no,
                item_description=item.item_description.strip(),
                bearing_type=item.bearing_type,
                po_qty=item.po_qty,
                value=item.value,
                schedule_group=group_id,
                anchor_a0=a0,
                anchor_a=a,
            ))

        for code, plan_date in plan_dates.items():
            tpl_stage = stage_by_code.get(code)
            if not tpl_stage:
                continue
            stages.append(OrderStage(
                order_no=order_no,
                schedule_group=group_id,
                stage_code=code,
                stage_name=tpl_stage.name,
                sequence=tpl_stage.sequence,
                plan_date=plan_date,
            ))

    # The Mongo version deleted the order by hand when the items clashed,
    # because it had no transaction to undo the insert. Here the whole
    # request is one transaction: raising is enough, and the order goes with
    # it. Only the expected unique violation needs its own savepoint.
    try:
        async with repo.savepoint():
            await repo.add_all(items)
    except repo.IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Duplicate item description within this order.")

    await repo.add_all(stages)
    return order


async def ensure_product_name_free(
    product_name: str, *, except_order_no: str | None = None, except_project_id: str | None = None,
) -> None:
    """
    409 if the name is already taken by another record (case-insensitive).

    Links find a record by product name OR order no. OR APQP id, so a new
    name must not equal any of those on another record - otherwise renaming
    product B to "A-001" would make A-001's links open product B.
    """
    name = product_name.strip().lower()
    clash = (
        func.lower(Order.product_name) == name
    ) | (func.lower(Order.order_no) == name)
    stmt = select(Order).where(clash)
    if except_order_no:
        stmt = stmt.where(Order.order_no != except_order_no)

    project_stmt = select(ApqpProject).where(
        (func.lower(ApqpProject.project_id) == name)
        | (func.lower(ApqpProject.product_name) == name)
    )
    if except_order_no:
        project_stmt = project_stmt.where(
            (ApqpProject.order_no.is_(None)) | (ApqpProject.order_no != except_order_no)
        )
    if except_project_id:
        # A project never clashes with itself (e.g. a project with no order).
        project_stmt = project_stmt.where(ApqpProject.project_id != except_project_id)

    if await repo.exists(stmt) or await repo.exists(project_stmt):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"'{product_name.strip()}' is already used by another product or order number.",
        )


async def get_or_404(order_no: str) -> Order:
    order = await repo.find_one(select(Order).where(Order.order_no == order_no))
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    return order


async def get_items(order_no: str) -> list[OrderItem]:
    return list(await repo.find_all(select(OrderItem).where(OrderItem.order_no == order_no)))


async def get_stages(order_no: str) -> list[OrderStage]:
    return list(
        await repo.find_all(
            select(OrderStage)
            .where(OrderStage.order_no == order_no)
            .order_by(OrderStage.schedule_group.asc(), OrderStage.sequence.asc())
        )
    )


async def list_orders(search: str | None = None, rpd_status: str | None = None) -> list[dict]:
    stmt = select(Order).order_by(Order.created_at.desc())
    if rpd_status:
        stmt = stmt.where(Order.rpd_status == rpd_status)
    if search:
        # ilike with escaped wildcards. The Mongo version interpolated the
        # search box straight into a $regex, so a user typing "(" produced a
        # bad-pattern error and "a{9999}" was a cheap way to pin the server.
        needle = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(
            or_(
                Order.order_no.ilike(needle, escape="\\"),
                Order.product_name.ilike(needle, escape="\\"),
                Order.customer_name.ilike(needle, escape="\\"),
            )
        )

    orders = list(await repo.find_all(stmt))
    if not orders:
        return []

    order_nos = [o.order_no for o in orders]

    # Counted in the database rather than by loading every item row.
    item_counts = dict(
        (
            await db().execute(
                select(OrderItem.order_no, func.count())
                .where(fast_rows.one_of(OrderItem.order_no, order_nos))
                .group_by(OrderItem.order_no)
            )
        ).all()
    )

    all_stages = await fast_rows.stages(fast_rows.one_of(OrderStage.order_no, order_nos))
    stages_by_order: dict[str, list[OrderStage]] = {}
    for s in all_stages:
        stages_by_order.setdefault(s.order_no, []).append(s)

    result = []
    for o in orders:
        summary = status_service.summarise(stages_by_order.get(o.order_no, []))
        result.append({
            "order_no": o.order_no,
            "product_name": o.product_name,
            "customer_name": o.customer_name,
            "order_date": o.order_date,
            "planned_delivery_sample": o.planned_delivery_sample,
            "planned_delivery_batch": o.planned_delivery_batch,
            "rpd_status": o.rpd_status,
            "item_count": item_counts.get(o.order_no, 0),
            "status": summary["status"],
            "progress_percent": summary["progress"]["percent"],
            "overdue_count": summary["overdue_count"],
        })
    return result


async def update_header(order_no: str, data: UpdateOrderRequest, user: User) -> Order:
    order = await get_or_404(order_no)
    payload = data.model_dump(exclude_unset=True)

    # These columns can never be empty - a clear 422 instead of a crash.
    for required, label in (("order_date", "Order date"), ("customer_name", "Customer"),
                            ("rpd_status", "RPD status")):
        if required in payload and payload[required] in (None, ""):
            raise HTTPException(422, f"{label} cannot be empty.")

    # Product name is the identity, so it may change but never go blank or
    # clash with another order.
    if "product_name" in payload:
        name = (payload["product_name"] or "").strip()
        if not name:
            payload.pop("product_name")
        else:
            await ensure_product_name_free(name, except_order_no=order_no)
            payload["product_name"] = name

    for field, value in payload.items():
        setattr(order, field, value)
    order.updated_at = datetime.now(timezone.utc)
    order.updated_by = str(user.id)

    # The linked APQP project shows the same product name and order date.
    # Assigning is the write - the request commits once, so both rows move
    # together or neither does.
    if "order_date" in payload or "product_name" in payload:
        project = await repo.find_one(
            select(ApqpProject).where(ApqpProject.order_no == order_no)
        )
        if project:
            if "product_name" in payload:
                project.product_name = order.product_name
            if "order_date" in payload and project.order_date != order.order_date:
                project.order_date = order.order_date
                # 0.3 b is anchored to this date, and everything after it
                # follows, so the timeline is rebuilt here too.
                from services import apqp_service
                await apqp_service.apply_plan_chain(project, overwrite=True)
            project.updated_at = order.updated_at
            project.updated_by = str(user.id)

    return order


async def update_stages(order_no: str, updates: list, user: User) -> list[OrderStage]:
    await get_or_404(order_no)
    now = datetime.now(timezone.utc)
    newly_completed: list[OrderStage] = []
    plan_moved: list[tuple[str, int, int]] = []
    changes: list[str] = []

    # One query for every stage being edited, instead of one per row.
    ids = [repo.as_uuid(u.stage_id) for u in updates]
    loaded = {
        str(st.id): st
        for st in await repo.find_all(
            select(OrderStage).where(OrderStage.id.in_([i for i in ids if i]))
        )
    }

    for u in updates:
        stage = loaded.get(str(repo.as_uuid(u.stage_id)))
        if not stage or stage.order_no != order_no:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Stage {u.stage_id} not found in this order.")

        was_empty = stage.actual_date is None
        old_plan = stage.plan_date

        payload = u.model_dump(exclude_unset=True, exclude={"stage_id"})

        # The plan IS the schedule, so only an admin moves it. Everyone else
        # keeps their actual dates, delay reasons and remarks.
        if not user.is_admin:
            payload.pop("plan_date", None)

        for field, value in payload.items():
            if getattr(stage, field) != value:
                changes.append(_stage_change(stage.stage_name, field, value))
            setattr(stage, field, value)

        stage.updated_at = now
        stage.updated_by = str(user.id)

        if was_empty and stage.actual_date is not None:
            newly_completed.append(stage)

        if stage.plan_date != old_plan and old_plan and stage.plan_date:
            plan_moved.append(
                (stage.schedule_group, stage.sequence,
                 (stage.plan_date - old_plan).days)
            )

    # Cascade once per group, from the EARLIEST stage edited in it.
    # One shift per group, from the earliest stage edited in it.
    firsts: dict[str, tuple[int, int]] = {}
    for group, seq, delta in plan_moved:
        if group not in firsts or seq < firsts[group][0]:
            firsts[group] = (seq, delta)
    for group, (seq, delta) in firsts.items():
        await cascade_stage_plan(order_no, group, seq, delta)
    if plan_moved:
        await _sync_item_anchors(order_no, {g for g, _, _ in plan_moved})

    await repo.touch()

    if changes:
        from services import audit_service
        order = await get_or_404(order_no)
        await audit_service.log(
            "stages_updated", user, "order", order_no, order.product_name,
            note=audit_service.summarise(changes),
        )

    # Handoff emails go out AFTER the save has committed, in the background,
    # so the user never waits for SMTP and a rolled-back save sends nothing.
    for stage in newly_completed:
        after_commit(_handoff_job(order_no, str(stage.id)))

    return await get_stages(order_no)


async def _sync_item_anchors(order_no: str, groups: set[str]) -> None:
    """Items show the A0 / A dates of their group - copy them from the stages."""
    rows = await repo.find_all(select(OrderStage).where(
        OrderStage.order_no == order_no, OrderStage.schedule_group.in_(list(groups)),
        OrderStage.stage_code.in_(["A0", "A"]),
    ))
    by_group: dict[str, dict[str, object]] = {}
    for st in rows:
        by_group.setdefault(st.schedule_group, {})[st.stage_code] = st.plan_date
    for group, codes in by_group.items():
        values = {}
        if codes.get("A0") is not None:
            values["anchor_a0"] = codes["A0"]
        if codes.get("A") is not None:
            values["anchor_a"] = codes["A"]
        if values:
            await db().execute(update(OrderItem).where(
                OrderItem.order_no == order_no, OrderItem.schedule_group == group
            ).values(**values))


async def update_item(order_no: str, item_id: str, data, user: User) -> OrderItem:
    """
    Admin: edit description / bearing type / PO qty / value of one item, and
    optionally move it to another schedule group of the same order (it then
    follows that group's A0 / A dates and stages). The last item of a group
    cannot be moved out - its stages would be left with no item.
    """
    order = await get_or_404(order_no)
    item = await repo.get(OrderItem, item_id)
    if not item or item.order_no != order_no:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found in this order.")

    before = {"item_description": item.item_description, "bearing_type": item.bearing_type,
              "po_qty": item.po_qty, "value": item.value, "schedule_group": item.schedule_group}
    desc = data.item_description.strip()
    if desc.lower() != item.item_description.lower() and await repo.exists(select(OrderItem.id).where(
        OrderItem.order_no == order_no, func.lower(OrderItem.item_description) == desc.lower(), OrderItem.id != item.id,
    )):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Another item in this order is already called '{desc}'.")

    target = (data.schedule_group or item.schedule_group).strip()
    if target != item.schedule_group:
        peer = await repo.find_one(select(OrderItem).where(
            OrderItem.order_no == order_no, OrderItem.schedule_group == target))
        if peer is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Group {target.split('-')[-1]} does not exist in this order.")
        left = await repo.count(select(OrderItem.id).where(
            OrderItem.order_no == order_no, OrderItem.schedule_group == item.schedule_group))
        if left <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "This is the only item in its group, so it cannot be moved to another group.")
        item.schedule_group = target
        item.anchor_a0 = peer.anchor_a0
        item.anchor_a = peer.anchor_a

    item.item_description = desc
    item.bearing_type = data.bearing_type.strip()
    item.po_qty = (data.po_qty or "").strip() or None
    item.value = data.value
    item.updated_at = datetime.now(timezone.utc)
    await repo.touch()

    after = {"item_description": item.item_description, "bearing_type": item.bearing_type,
             "po_qty": item.po_qty, "value": item.value, "schedule_group": item.schedule_group}
    changed = [k for k in after if after[k] != before[k]]
    if changed:
        from services import audit_service
        await audit_service.log("item_updated", user, "order", order_no, order.product_name,
                                before={k: before[k] for k in changed}, after={k: after[k] for k in changed},
                                note=f"{before['item_description']}: " + ", ".join(changed))
    return item


async def update_anchors(order_no: str, schedule_group: str, anchor_a0, anchor_a, user: User) -> None:
    """
    Change the Sample study (A0) and/or Proposal drawing (A) date of one group.

    The matching stage gets the new plan date and every stage AFTER it moves by
    the same number of days (same rule as editing a plan date in Tracking);
    stages before it, and all actual dates, stay as they are.
    """
    order = await get_or_404(order_no)
    if not await repo.exists(select(OrderItem.id).where(
        OrderItem.order_no == order_no, OrderItem.schedule_group == schedule_group
    )):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item group not found in this order.")
    if anchor_a0 is None and anchor_a is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Give the new A0 or A date.")

    changes: list[str] = []
    # A0 first: its shift also moves A, then A is set to the exact date asked for.
    for code, new in (("A0", anchor_a0), ("A", anchor_a)):
        if new is None:
            continue
        stage = await repo.find_one(select(OrderStage).where(
            OrderStage.order_no == order_no, OrderStage.schedule_group == schedule_group,
            OrderStage.stage_code == code,
        ))
        if stage is None:
            continue
        old = stage.plan_date
        if old == new:
            continue
        stage.plan_date = new
        stage.updated_at = datetime.now(timezone.utc)
        stage.updated_by = str(user.id)
        if old:
            await cascade_stage_plan(order_no, schedule_group, stage.sequence, (new - old).days)
        changes.append(f"{stage.stage_name}: {old} -> {new}")

    await _sync_item_anchors(order_no, {schedule_group})
    # A group without an A0 stage still keeps the date on its items.
    if anchor_a0 is not None:
        await db().execute(update(OrderItem).where(
            OrderItem.order_no == order_no, OrderItem.schedule_group == schedule_group
        ).values(anchor_a0=anchor_a0))
    await repo.touch()

    if changes:
        from services import audit_service
        await audit_service.log("anchors_updated", user, "order", order_no, order.product_name,
                                note=f"{schedule_group}: " + "; ".join(changes))


def _handoff_job(order_no: str, stage_id: str):
    async def job():
        from services import order_notification_service
        stage = await repo.get(OrderStage, stage_id)
        if stage is not None:
            await order_notification_service.notify_handoff(order_no, stage)
    return job


async def delete(order_no: str) -> dict:
    from services import attachment_service

    order = await get_or_404(order_no)

    files = await attachment_service.delete_for_order(order_no)
    items = await repo.count(select(OrderItem).where(OrderItem.order_no == order_no))
    stages = await repo.count(select(OrderStage).where(OrderStage.order_no == order_no))

    # Unlink any APQP project pointing at this order, in one statement.
    unlinked = (
        await db().execute(
            update(ApqpProject)
            .where(ApqpProject.order_no == order_no)
            .values(order_no=None)
        )
    ).rowcount or 0

    # Items and stages go with the order: both carry ON DELETE CASCADE on
    # order_no, so the database removes them and cannot leave an orphan
    # behind the way the three separate Mongo deletes could.
    await repo.remove(order)

    return {"items": items, "stages": stages, "attachments": files, "unlinked_apqp": unlinked}


async def cascade_stage_plan(
    order_no: str, schedule_group: str, from_seq: int, delta_days: int
) -> int:
    """
    Shifts every stage BELOW the edited one by the same number of days.

    A straight shift rather than a recompute from the template offsets,
    because it preserves whatever the schedule already looked like - gaps,
    parallel branches, and any date somebody adjusted by hand all move
    together. Recomputing would quietly discard those, and it did nothing
    at all when a stage's parent could not be resolved.

    Stages above the edit are untouched.
    """
    from datetime import timedelta

    if not delta_days:
        return 0

    stages = list(
        await repo.find_all(
            select(OrderStage)
            .where(
                OrderStage.order_no == order_no,
                OrderStage.schedule_group == schedule_group,
                OrderStage.sequence > from_seq,
            )
            .order_by(OrderStage.sequence)
        )
    )

    moved = 0
    for rec in stages:
        if rec.plan_date is None:
            continue
        rec.plan_date = rec.plan_date + timedelta(days=delta_days)
        moved += 1

    return moved


async def resolve(key: str) -> Order:
    """
    Finds an order by product name or by order number.

    URLs use the product name because that is what people recognise, but
    order_no is still the key the database, the APQP pairing and every
    email already sent are built on. Accepting both means new links read
    well and old ones keep working.
    """
    key = key.strip()
    found = await repo.find_one(select(Order).where(Order.product_name == key))
    if found:
        return found
    return await get_or_404(key)


_STAGE_FIELDS = {
    "actual_date": "actual", "plan_date": "plan", "remark": "remark",
    "delay_reason": "delay reason",
}


def _stage_change(stage_name: str, field: str, value) -> str:
    """'RM receipt for component: actual 26-May-2026' / '...: remark updated'."""
    from services.audit_service import fmt
    code = stage_name if len(stage_name) <= 32 else stage_name[:30].rstrip() + "…"
    label = _STAGE_FIELDS.get(field, field)
    if field in ("remark", "delay_reason"):
        return f"{code}: {label} {'cleared' if not value else 'updated'}"
    return f"{code}: {label} {fmt(value)}"
