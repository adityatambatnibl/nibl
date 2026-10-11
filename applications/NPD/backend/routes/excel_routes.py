from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from models.user import User
from services import audit_service, excel_service, order_service
from utils.constants import Permission
from utils.deps import require_permission
from database.connection import session_scope
from services import apqp_excel_service, apqp_service

import io

router = APIRouter(prefix="/excel", tags=["Excel"])

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _stream(content: bytes, filename: str) -> StreamingResponse:
    import io
    return StreamingResponse(
        io.BytesIO(content),
        media_type=XLSX_MIME,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get("/orders/export")
async def export_all_orders(
    order_no: list[str] | None = Query(default=None, description="Repeat to export specific orders"),
    user: User = Depends(require_permission(Permission.EXCEL_EXPORT)),
):
    # The caller may send product names or order numbers. Resolve each so
    # the export always works from the real key.
    if order_no:
        order_no = [(await order_service.resolve(n)).order_no for n in order_no]

    content, filename = await excel_service.build_master_workbook(order_no)
    await audit_service.log("excel_exported", user, "excel", None, "Master tracking sheet",
                            note=filename)
    return _stream(content, filename)


@router.get("/orders/{order_no}/export")
async def export_one_order(
    order_no: str,
    user: User = Depends(require_permission(Permission.EXCEL_EXPORT)),
):
    # resolve() already 404s when nothing matches, so the old get_or_404
    # here was a second round trip for the same answer.
    order = await order_service.resolve(order_no)
    content, filename = await excel_service.build_master_workbook([order.order_no])
    await audit_service.log("excel_exported", user, "order", order.order_no, order.product_name,
                            note="Tracking sheet")
    return _stream(content, filename)




@router.get("/apqp/{project_id}/export")
async def export_apqp(
    project_id: str,
    user: User = Depends(require_permission(Permission.EXCEL_EXPORT)),
):
    async with session_scope():
        project = await apqp_service.resolve_project(project_id)
        project_id = project.project_id
        content, filename, media_type = await apqp_excel_service.build_export(project_id)

    await audit_service.log("excel_exported", user, "apqp", project_id,
                            project.product_name or project_id, note="APQP timing plan")
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )

