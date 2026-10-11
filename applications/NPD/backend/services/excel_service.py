import io
from datetime import date, datetime

import xlsxwriter

from sqlalchemy import select

from database import repo
from models.order import Order, OrderItem, OrderStage
from services import template_service, status_service
from services.status_service import StageStatus
from services import fast_rows

HEADER_BG = "#1F4E78"
STATUS_FILL = {
    StageStatus.OVERDUE: "#FFC7CE",
    StageStatus.COMPLETED_LATE: "#FFEB9C",
    StageStatus.COMPLETED: "#C6EFCE",
}

BASE_COLUMNS = [
    ("Product Name", 24),
    ("Order Date", 12),
    ("Customer", 22),
    ("Item Description", 20),
    ("Bearing Type", 14),
    ("PO Qty", 12),
    ("Value", 10),
    ("RPD Status", 14),
    ("Planned Delivery Sample", 20),
    ("Planned Delivery Batch", 20),
    ("Days", 8),
    ("Progress %", 10),
    ("Status", 14),
]


def _fmt_date(v: date | None):
    return v if isinstance(v, date) else None


async def build_master_workbook(order_nos: list[str] | None = None) -> tuple[bytes, str]:
    """Master tracking sheet: one row per item, plan/actual pairs for all 29 stages."""
    stmt = select(Order).order_by(Order.order_no.asc())
    if order_nos:
        stmt = stmt.where(fast_rows.one_of(Order.order_no, order_nos))

    orders = list(await repo.find_all(stmt))
    nos = [o.order_no for o in orders]
    items = list(await repo.find_all(select(OrderItem).where(fast_rows.one_of(OrderItem.order_no, nos))))
    stages = await fast_rows.stages(fast_rows.one_of(OrderStage.order_no, nos))

    tpl = await template_service.get_stages()
    stage_defs = sorted(tpl.stages, key=lambda s: s.sequence)

    order_by_no = {o.order_no: o for o in orders}
    stages_by_group: dict[str, dict[str, OrderStage]] = {}
    stages_by_order: dict[str, list[OrderStage]] = {}
    for s in stages:
        stages_by_group.setdefault(s.schedule_group, {})[s.stage_code] = s
        stages_by_order.setdefault(s.order_no, []).append(s)

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True, "default_date_format": "dd/mmm/yyyy"})
    ws = wb.add_worksheet("Production Master Tracking")

    f_title = wb.add_format({"bold": True, "font_size": 14})
    f_head = wb.add_format({
        "bold": True, "text_wrap": True, "valign": "vcenter", "align": "center",
        "fg_color": HEADER_BG, "font_color": "white", "border": 1,
    })
    f_sub = wb.add_format({
        "bold": True, "align": "center", "valign": "vcenter",
        "fg_color": "#D9D9D9", "border": 1, "font_size": 9,
    })
    f_cell = wb.add_format({"border": 1, "valign": "vcenter"})
    f_num = wb.add_format({"border": 1, "valign": "vcenter", "num_format": "0.0000"})
    f_date = wb.add_format({"border": 1, "valign": "vcenter", "num_format": "dd/mm/yyyy", "align": "center"})
    f_pct = wb.add_format({"border": 1, "valign": "vcenter", "align": "center"})
    f_status = {
        k: wb.add_format({"border": 1, "align": "center", "num_format": "dd/mm/yyyy", "fg_color": v})
        for k, v in STATUS_FILL.items()
    }

    ws.write(0, 0, "PRODUCTION MASTER TRACKING", f_title)
    ws.write(0, 4, f"Generated {datetime.now():%d-%b-%Y %H:%M}")

    # Row 2 = grouped stage headers, row 3 = Plan/Actual sub-headers
    for col, (name, width) in enumerate(BASE_COLUMNS):
        ws.merge_range(2, col, 3, col, name, f_head)
        ws.set_column(col, col, width)

    col = len(BASE_COLUMNS)
    stage_col: dict[str, int] = {}
    for sd in stage_defs:
        label = f"{sd.code}\n{sd.name}"
        ws.merge_range(2, col, 2, col + 1, label, f_head)
        ws.write(3, col, "Plan date", f_sub)
        ws.write(3, col + 1, "Actual date", f_sub)
        ws.set_column(col, col + 1, 12)
        stage_col[sd.code] = col
        col += 2

    ws.set_row(2, 46)
    ws.freeze_panes(4, 4)

    row = 4
    def _sort_key(i):
        o = order_by_no.get(i.order_no)
        return ((o.product_name or o.order_no) if o else i.order_no, i.item_description)

    for item in sorted(items, key=_sort_key):
        order = order_by_no.get(item.order_no)
        if not order:
            continue

        summary = status_service.summarise(stages_by_order.get(item.order_no, []))
        group_stages = stages_by_group.get(item.schedule_group, {})

        x_stage = group_stages.get("X")
        days = (x_stage.plan_date - item.anchor_a).days if x_stage and x_stage.plan_date else None

        values = [
            (order.product_name or order.order_no, f_cell),
            (_fmt_date(order.order_date), f_date),
            (order.customer_name, f_cell),
            (item.item_description, f_cell),
            (item.bearing_type, f_cell),
            (item.po_qty or "", f_cell),
            (item.value, f_num),
            (order.rpd_status, f_cell),
            (_fmt_date(order.planned_delivery_sample), f_date),
            (_fmt_date(order.planned_delivery_batch), f_date),
            (days, f_pct),
            (summary["progress"]["percent"], f_pct),
            (summary["status"].replace("_", " ").title(), f_cell),
        ]

        for c, (val, fmt) in enumerate(values):
            if isinstance(val, date):
                ws.write_datetime(row, c, datetime.combine(val, datetime.min.time()), fmt)
            elif val is None or val == "":
                ws.write_blank(row, c, None, fmt)
            else:
                ws.write(row, c, val, fmt)

        for sd in stage_defs:
            c = stage_col[sd.code]
            st = group_stages.get(sd.code)

            if not st:
                ws.write_blank(row, c, None, f_date)
                ws.write_blank(row, c + 1, None, f_date)
                continue

            status = status_service.stage_status(st.plan_date, st.actual_date)
            fmt = f_status.get(status, f_date)

            if st.plan_date:
                ws.write_datetime(row, c, datetime.combine(st.plan_date, datetime.min.time()), f_date)
            else:
                ws.write_blank(row, c, None, f_date)

            if st.actual_date:
                ws.write_datetime(row, c + 1, datetime.combine(st.actual_date, datetime.min.time()), fmt)
            else:
                ws.write_blank(row, c + 1, None, fmt)

        row += 1

    if row > 4:
        ws.autofilter(3, 0, row - 1, len(BASE_COLUMNS) - 1)

    # Legend
    legend_row = row + 1
    ws.write(legend_row, 0, "Legend:", wb.add_format({"bold": True}))
    for i, (status, colour) in enumerate(STATUS_FILL.items()):
        ws.write(legend_row, 1 + i * 2, status.replace("_", " ").title(),
                 wb.add_format({"fg_color": colour, "border": 1}))

    wb.close()
    buf.seek(0)

    # Named after the order when there is exactly one, so a downloaded file
    # says what it holds. No timestamp: re-exporting the same order should
    # replace the old file rather than pile up copies in Downloads.
    # Named after the product, because that is what the file is about.
    # Falls back to the order number if the product name is missing.
    if order_nos and len(order_nos) == 1:
        first = next((o for o in orders if o.order_no == order_nos[0]), None)
        label = (first.product_name if first and first.product_name else order_nos[0])
        clean = str(label).strip().replace("/", "-").replace("\\", "-")
    else:
        clean = "All"

    filename = f"Production_Tracking_{clean}.xlsx"
    return buf.read(), filename
