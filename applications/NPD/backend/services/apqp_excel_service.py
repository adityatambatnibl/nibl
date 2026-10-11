import io
import os
import re
import zipfile
from datetime import date, datetime
import xlrd
import xlsxwriter
from openpyxl import load_workbook

from models.apqp import ApqpActivityRecord
from models.template import Template
from services import apqp_service, attachment_service

FILL_BLUE = "#1F4E78"
WEEK_START_COL = 8
HDR_LAST = 28  # column AC — width of the header block


def _month_label(ym: str) -> datetime:
    y, m = (int(p) for p in ym.split("-"))
    return datetime(y, m, 1)


async def build_timing_plan(project_id: str) -> tuple[bytes, str]:
    project = await apqp_service.get_or_404(project_id)
    activities = await apqp_service.get_activities(project_id)
    sign_off = await apqp_service.get_sign_off(project_id)
    tpl: Template = await apqp_service.get_template()

    project_attachments = await attachment_service.list_for_project(project_id)
    attachments_by_entity: dict[str, list[str]] = {}

    for attachment in project_attachments:
        attachments_by_entity.setdefault(
            str(attachment.entity_id),
            [],
        ).append(attachment.original_filename)

    months = apqp_service.effective_months(project, activities)
    week_cols = apqp_service.week_columns(months)

    remarks_col = WEEK_START_COL + len(week_cols)

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True, "nan_inf_to_errors": True})
    ws = wb.add_worksheet("APQP TIMING PLAN")

    # ------------------------------------------------------------------ formats
    f_bold = wb.add_format({"bold": True, "valign": "vcenter"})
    f_head = wb.add_format({
        "bold": True, "border": 1, "align": "center", "valign": "vcenter",
        "fg_color": "#D9D9D9", "text_wrap": True,
    })
    f_cell = wb.add_format({"border": 1, "valign": "vcenter"})
    f_cell_wrap = wb.add_format({
        "border": 1,
        "valign": "vcenter",
        "text_wrap": True,
    })
    f_center = wb.add_format({"border": 1, "align": "center", "valign": "vcenter"})
    f_date = wb.add_format({
        "border": 1, "align": "center", "valign": "vcenter", "num_format": "dd/mm/yyyy",
    })
    f_phase = wb.add_format({
        "bold": True, "border": 1, "fg_color": "#F2F2F2", "valign": "vcenter",
    })
    f_fill = wb.add_format({"border": 1, "fg_color": "#FFC107"})
    f_fill_actual = wb.add_format({"border": 1, "fg_color": "#2E7D32"})
    f_section = wb.add_format({
        "bold": True, "font_size": 11, "fg_color": "#E7E6E6", "border": 1,
        "valign": "vcenter", "align": "center",
    })
    f_month = wb.add_format({
        "bold": True, "border": 1, "align": "center", "valign": "vcenter",
        "fg_color": "#D9D9D9", "num_format": "mmm-yy",
    })

    # header-block formats
    f_ftitle = wb.add_format({
        "bold": True, "font_size": 16, "align": "center", "valign": "vcenter",
        "border": 1, "fg_color": FILL_BLUE, "font_color": "white",
    })
    f_flabel = wb.add_format({
        "bold": True, "border": 1, "valign": "vcenter", "align": "left",
        "fg_color": "#D9D9D9", "font_size": 9, "indent": 1,
    })
    f_fvalue = wb.add_format({
        "border": 1, "valign": "vcenter", "align": "left", "indent": 1,
    })
    f_fdate = wb.add_format({
        "border": 1, "valign": "vcenter", "align": "left", "indent": 1,
        "num_format": "dd/mm/yyyy",
    })

    def d(v: date | None):
        return datetime.combine(v, datetime.min.time()) if v else None

    # ------------------------------------------------------- column widths
    ws.set_column(0, 0, 3)
    ws.set_column(1, 1, 8, f_cell)
    ws.set_column(2, 2, 45, f_cell)
    ws.set_column(3, 3, 22, f_cell)
    ws.set_column(4, 4, 15, f_cell)
    ws.set_column(5, 5, 12, f_center)
    ws.set_column(6, 7, 14, f_date)
    ws.set_column(WEEK_START_COL, remarks_col, 4, f_center)

    # ------------------------------------------- header block: 3 x 3 grid
    ws.set_row(0, 26)
    ws.merge_range(0, 1, 0, HDR_LAST, "APQP TIMING PLAN", f_ftitle)

    # (label_start, label_end, value_start, value_end) for the three columns
    blocks = [(1, 2, 3, 5), (6, 8, 9, 14), (15, 20, 21, HDR_LAST)]

    header_rows = [
        [("Name of Product", project.product_name, False),
         ("Program Name", project.program_name, False),
         ("Original Date", project.original_date, True)],

        [("Customer", project.customer, False),
         ("Supply Condition", project.supply_condition, False),
         ("PPAP Date", project.ppap_date, True)],

        [("Customer Part No.", project.customer_part_no, False),
         ("Sample Submission", project.sample_submission_date, True),
         ("Application", project.application, False)],

        [("Enquiry Date", project.enquiry_date, True),
         ("Order No.", project.order_no, False),
         ("Order Date", project.order_date, True)],
    ]

    for r, fields in enumerate(header_rows, start=1):
        ws.set_row(r, 20)
        for (ls, le, vs, ve), (label, value, is_date) in zip(blocks, fields):
            ws.merge_range(r, ls, r, le, label, f_flabel)
            if is_date and value:
                ws.merge_range(r, vs, r, ve, "", f_fdate)
                ws.write_datetime(r, vs, d(value), f_fdate)
            else:
                ws.merge_range(r, vs, r, ve, value or "—", f_fvalue)

    # The header block now has four rows, so the whole table band moves
    # down by one. HDR_ROWS keeps that in one place.
    HDR_ROWS = 4
    band_top = HDR_ROWS + 1          # 5
    band_bot = HDR_ROWS + 4          # 8

    for col, text in enumerate(
        ["NO.", "PHASE OR ACTIVITY", "Check Point", "Responsibility",
         "Status", "Start Date", "End Date"], start=1
    ):
        ws.merge_range(band_top, col, band_bot, col, text, f_head)

    # "Month / Year" caps the week block
    ws.merge_range(band_top, WEEK_START_COL, band_top, remarks_col - 1,
                   "Month / Year", f_head)

    ws.merge_range(band_top, remarks_col, band_bot, remarks_col, "Remarks", f_head)

    # month band
    col = WEEK_START_COL
    for ym in months:
        ws.merge_range(band_top + 1, col, band_top + 1, col + 3, "", f_month)
        ws.write_datetime(band_top + 1, col, _month_label(ym), f_month)
        col += 4

    ws.merge_range(band_top + 2, WEEK_START_COL, band_top + 2, remarks_col - 1,
                   "Week", f_head)

    for i in range(len(week_cols)):
        ws.write(band_bot, WEEK_START_COL + i, (i % 4) + 1, f_head)

    ws.merge_range(band_bot + 1, 1, band_bot + 1, remarks_col, "Tracker", f_head)

    # --------------------- data rows: one Plan row + one Actual row per activity
    by_phase: dict[str, list[ApqpActivityRecord]] = {}
    for a in activities:
        by_phase.setdefault(a.phase_code, []).append(a)

    row = band_bot + 2
    for phase in sorted(tpl.phases, key=lambda p: p.sequence):
        acts = by_phase.get(phase.phase_code, [])
        if not acts:
            continue

        ws.merge_range(row, 1, row, remarks_col, phase.phase_name, f_phase)
        row += 1

        for a in sorted(acts, key=lambda x: x.sequence):
            plan_row, actual_row = row, row + 1

            # merged vertically across the Plan/Actual pair
            activity_attachment_names = attachments_by_entity.get(str(a.id), [])
            attachment_text = ", ".join(activity_attachment_names)
            display_check_point = attachment_text or (a.check_point or "")

            for col, value in (
                (1, a.no_label),
                (2, a.activity_name),
                (3, display_check_point),
                (4, a.responsibility or ""),
            ):
                if value:
                    cell_format = f_cell_wrap if col == 3 else f_cell
                    ws.merge_range(
                        plan_row,
                        col,
                        actual_row,
                        col,
                        value,
                        cell_format,
                    )
                else:
                    ws.write_blank(plan_row, col, None, f_cell)
                    ws.write_blank(actual_row, col, None, f_cell)

            ws.write(plan_row, 5, "Plan", f_center)
            ws.write(actual_row, 5, "Actual", f_center)

            # Start Date in column 6, End Date in column 7
            for r, start, end in (
                (plan_row, a.plan_start, a.plan_end),
                (actual_row, a.actual_start, a.actual_end),
            ):
                for c, value in ((6, start), (7, end)):
                    if value:
                        ws.write_datetime(r, c, d(value), f_date)
                    else:
                        ws.write_blank(r, c, None, f_date)

            # for i, wc in enumerate(week_cols):
            #     col = WEEK_START_COL + i
            #     ws.write_blank(plan_row, col, None,
            #                    f_fill if a.week_flags.get(wc) else f_cell)
            #     ws.write_blank(actual_row, col, None,
            #                    f_fill_actual if a.actual_week_flags.get(wc) else f_cell)

            # Derived from the dates, so the sheet always agrees with the
            # Start/End columns to its left.
            plan_weeks = apqp_service.weeks_for_range(
                months, a.plan_start, a.plan_end
            )
            actual_weeks = apqp_service.weeks_for_range(
                months, a.actual_start, a.actual_end
            )

            for i, wc in enumerate(week_cols):
                col = WEEK_START_COL + i
                ws.write_blank(plan_row, col, None,
                               f_fill if plan_weeks.get(wc) else f_cell)
                ws.write_blank(actual_row, col, None,
                               f_fill_actual if actual_weeks.get(wc) else f_cell)

            if a.remark:
                ws.merge_range(plan_row, remarks_col, actual_row, remarks_col,
                               a.remark, f_cell)
            else:
                ws.write_blank(plan_row, remarks_col, None, f_cell)
                ws.write_blank(actual_row, remarks_col, None, f_cell)

            row += 2

    # ------------------------------------ Gantt acceptance & team sign-off
    LAST_COL = 27  # column AB

    row += 2
    ws.merge_range(row, 1, row, LAST_COL,
                   "GANTT CHART ACCEPTANCE & TEAM SIGN-OFF", f_section)
    row += 1

    team = sign_off.team or {}

    ws.merge_range(row, 1, row, 2, "No.", f_head)
    ws.merge_range(row, 3, row, 6, "Team Member Name & Sign", f_head)
    ws.merge_range(row, 7, row, 13, "No.", f_head)
    ws.merge_range(row, 14, row, LAST_COL, "Team Member Name & Sign", f_head)
    
    row += 1

    for i in range(6):
        left, right = str(i + 1), str(i + 7)
        ws.merge_range(row, 1, row, 2, left, f_center)
        ws.merge_range(row, 3, row, 6, team.get(left, ""), f_center)
        ws.merge_range(row, 7, row, 13, right, f_center)
        ws.merge_range(row, 14, row, LAST_COL, team.get(right, ""), f_center)
        
        row += 1

    row += 1
    ws.merge_range(row, 1, row, LAST_COL, "APPROVALS", f_head)
    row += 1

    approvals = (
        ("Prepared By", sign_off.prepared_by),
        ("Reviewed By", sign_off.reviewed_by),
        ("Approved By", sign_off.approved_by),
    )

    bounds = [(1, 4), (5, 14), (15, LAST_COL)]

    for (start, end), (label, _) in zip(bounds, approvals):
        ws.merge_range(row, start, row, end, label, f_head)

    row += 1
    for (start, end), (_, value) in zip(bounds, approvals):
        ws.merge_range(row, start, row + 1, end, value or "", f_center)

    row += 2

    # freeze the header band so it stays visible while scrolling
    ws.freeze_panes(band_bot + 2, 3)

    wb.close()
    buf.seek(0)
    # Named after the product. Slashes would break the download header.
    label = (project.product_name or project.project_id).strip().replace("/", "-")
    return buf.read(), f"APQP_Timing_Plan_{label}.xlsx"


def _sheet_name(filename: str, used: set[str]) -> str:
    """Excel sheet names: max 31 chars, no : \\ / ? * [ ]"""
    base = os.path.splitext(os.path.basename(filename))[0]
    base = re.sub(r"[:\\/?*\[\]]", "_", base)
    name = f"Attach_{base}"[:31]

    if name not in used:
        used.add(name)
        return name

    for i in range(1, 100):
        suffix = f"_{i}"
        candidate = name[: 31 - len(suffix)] + suffix
        if candidate not in used:
            used.add(candidate)
            return candidate

    raise ValueError("Too many attachments with similar names.")


def _read_legacy_xls(content: bytes) -> list[tuple[str, list[list]]]:
    """openpyxl cannot read .xls - read it with xlrd and return (sheet_name, rows)."""
    book = xlrd.open_workbook(file_contents=content)
    out = []
    for sheet in book.sheets():
        rows = [
            [sheet.cell_value(r, c) for c in range(sheet.ncols)]
            for r in range(sheet.nrows)
        ]
        out.append((sheet.name, rows))
    return out


def _merge_excel_sheets(
    workbook_bytes: bytes, excel_files: list[tuple[str, bytes]]
) -> tuple[bytes, list[str]]:
    """Copies each attached workbook's sheets into the timing plan. Values only."""
    if not excel_files:
        return workbook_bytes, []

    out_wb = load_workbook(io.BytesIO(workbook_bytes))
    used = set(out_wb.sheetnames)
    warnings: list[str] = []

    for filename, content in excel_files:
        is_legacy = os.path.splitext(filename)[1].lower() == ".xls"

        try:
            if is_legacy:
                sheets = _read_legacy_xls(content)
            else:
                src = load_workbook(io.BytesIO(content), data_only=True)
                sheets = [
                    (ws.title, [[c.value for c in row] for row in ws.iter_rows()])
                    for ws in src.worksheets
                ]
        except Exception as exc:
            warnings.append(
                f"{filename}: could not be read ({type(exc).__name__}: {exc})"
            )
            continue

        for sheet_name, rows in sheets:
            try:
                target = out_wb.create_sheet(_sheet_name(f"{filename}_{sheet_name}", used))
                for r_idx, row in enumerate(rows, start=1):
                    for c_idx, value in enumerate(row, start=1):
                        if value is not None and value != "":
                            target.cell(row=r_idx, column=c_idx, value=value)
            except Exception as exc:
                warnings.append(f"{filename} / {sheet_name}: {type(exc).__name__}")

    result = io.BytesIO()
    out_wb.save(result)
    result.seek(0)
    return result.read(), warnings


async def build_export(project_id: str) -> tuple[bytes, str, str]:
    """
    No attachments  -> single .xlsx
    Any attachment  -> .zip with the timing plan plus every original file, unmodified.
    Returns (content, filename, media_type).
    """
    workbook_bytes, xlsx_name = await build_timing_plan(project_id)
    attachments = await attachment_service.list_for_project(project_id)

    XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    if not attachments:
        return workbook_bytes, xlsx_name, XLSX_MIME

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(xlsx_name, workbook_bytes)

        used_names: set[str] = set()
        for a in attachments:
            content = await attachment_service.read_bytes(a)

            name = os.path.basename(a.original_filename)
            stem, ext = os.path.splitext(name)
            i = 1
            while name in used_names:
                name = f"{stem}_{i}{ext}"
                i += 1
            used_names.add(name)

            zf.writestr(f"Attachments/{name}", content)

    zip_buf.seek(0)
    project = await apqp_service.get_or_404(project_id)
    zip_label = (project.product_name or project_id).strip().replace("/", "-")
    return zip_buf.read(), f"APQP_Export_{zip_label}.zip", "application/zip"