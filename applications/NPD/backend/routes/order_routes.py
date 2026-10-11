from fastapi import APIRouter, Depends, Query

from models.user import User
from schemas.order import (
    CreateOrderRequest, UpdateOrderRequest, UpdateStagesRequest, UpdateAnchorsRequest, UpdateItemRequest,
    OrderListItem, OrderDetail, OrderItemOut, StageOut,
)
from services import order_service, status_service, audit_service, read_cache
from utils.constants import Permission
from utils.deps import require_permission, require_admin

router = APIRouter(prefix="/orders", tags=["Orders"])


def _stage_out(s) -> StageOut:
    info = status_service.describe(s)
    return StageOut(
        id=str(s.id), schedule_group=s.schedule_group,
        stage_code=s.stage_code, stage_name=s.stage_name, sequence=s.sequence,
        plan_date=s.plan_date, actual_date=s.actual_date,
        remark=s.remark, delay_reason=s.delay_reason,
        status=info["status"], delay_days=info["delay_days"],
    )


def _item_out(i) -> OrderItemOut:
    return OrderItemOut(
        id=str(i.id), item_description=i.item_description, bearing_type=i.bearing_type,
        po_qty=i.po_qty, value=i.value, schedule_group=i.schedule_group,
        anchor_a0=i.anchor_a0, anchor_a=i.anchor_a,
    )


@router.get("", response_model=list[OrderListItem])
async def list_orders(
    search: str | None = Query(default=None),
    rpd_status: str | None = Query(default=None),
    _: User = Depends(require_permission(Permission.TRACKING_VIEW)),
):
    if search:
        return await order_service.list_orders(search, rpd_status)
    return await read_cache.get(
        "order-list", lambda: order_service.list_orders(None, rpd_status), rpd_status
    )


@router.post("", response_model=OrderDetail, status_code=201)
async def create_order(
    data: CreateOrderRequest,
    user: User = Depends(require_permission(Permission.TIMELINE_CREATE)),
):
    order = await order_service.create(data, user)
    await audit_service.log("order_created", user, "order", order.order_no, order.product_name)
    return await _detail(order)


@router.get("/{order_no}", response_model=OrderDetail)
async def get_order(
    order_no: str,
    _: User = Depends(require_permission(Permission.TRACKING_VIEW)),
):
    return await _detail(await order_service.resolve(order_no))


@router.put("/{order_no}", response_model=OrderDetail)
async def update_order(
    order_no: str,
    data: UpdateOrderRequest,
    admin: User = Depends(require_admin),
):
    order_no = (await order_service.resolve(order_no)).order_no
    order = await order_service.update_header(order_no, data, admin)
    payload = data.model_dump(mode="json", exclude_unset=True)
    await audit_service.log("order_updated", admin, "order", order_no, order.product_name,
                            after=payload, note=audit_service.changed_fields(payload))
    return await _detail(order)


@router.put("/{order_no}/stages", response_model=list[StageOut])
async def update_stages(
    order_no: str,
    data: UpdateStagesRequest,
    user: User = Depends(require_permission(Permission.TRACKING_EDIT)),
):
    order_no = (await order_service.resolve(order_no)).order_no
    stages = await order_service.update_stages(order_no, data.updates, user)
    return [_stage_out(s) for s in stages]

@router.put("/{order_no}/items/{item_id}", response_model=OrderDetail)
async def update_item(
    order_no: str,
    item_id: str,
    data: UpdateItemRequest,
    admin: User = Depends(require_admin),
):
    """Admin: edit one item row (description, bearing type, PO qty, value, group)."""
    order = await order_service.resolve(order_no)
    await order_service.update_item(order.order_no, item_id, data, admin)
    return await _detail(order)


@router.put("/{order_no}/groups/{schedule_group}/anchors", response_model=OrderDetail)
async def update_anchors(
    order_no: str,
    schedule_group: str,
    data: UpdateAnchorsRequest,
    admin: User = Depends(require_admin),
):
    """Admin: change A0 / A of one item group; later stages move with it."""
    order = await order_service.resolve(order_no)
    await order_service.update_anchors(order.order_no, schedule_group, data.anchor_a0, data.anchor_a, admin)
    return await _detail(order)


@router.delete("/{order_no}")
async def delete_order(order_no: str, admin: User = Depends(require_admin)):
    order = await order_service.resolve(order_no)
    order_no, label = order.order_no, order.product_name
    result = await order_service.delete(order_no)
    await audit_service.log("order_deleted", admin, "order", order_no, label, after=result,
                            note="Deleted with all its stages and files")
    return result

async def _detail(order) -> OrderDetail:
    # Everything below works from order.order_no, which is still what the
    # items, stages and APQP pairing are keyed on. The route has already
    # resolved the product name / order number from the URL.
    order_no = order.order_no
    items = await order_service.get_items(order_no)
    stages = await order_service.get_stages(order_no)
    summary = status_service.summarise(stages)

    return OrderDetail(
        order_no=order.order_no,
        product_name=order.product_name,
        order_date=order.order_date,
        customer_name=order.customer_name,
        planned_delivery_sample=order.planned_delivery_sample,
        planned_delivery_batch=order.planned_delivery_batch,
        rpd_status=order.rpd_status,
        notes=order.notes,
        apqp_project_id=order.apqp_project_id,
        created_at=order.created_at,
        items=[_item_out(i) for i in items],
        stages=[_stage_out(s) for s in stages],
        status=summary["status"],
        progress=summary["progress"],
        stage_counts=summary["stage_counts"],
        overdue_count=summary["overdue_count"],
    )