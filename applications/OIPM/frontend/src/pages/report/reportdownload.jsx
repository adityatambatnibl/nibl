import { useEffect, useState } from "react";
import {
    X,
    FileText,
    FileSpreadsheet,
    Loader2,
    CircleAlert,
} from "lucide-react";

import { getImprovement } from "../../api/improvements";
import { getPlantHeadEmployees } from "../../api/plantHead";
import {
    formatDuration,
    getApplicableAnnualSaving,
    getMonthlySaving,
    getOneTimeSaving,
} from "../../utils/financial";
import "./ReportDownload.css";
import reportExportCss from "./report-export.css?raw";

const BENEFIT_LABELS = {
    P: "P - Productivity",
    Q: "Q - Quality",
    C: "C - Cost",
    D: "D - Delivery",
    S: "S - Safety",
    M: "M - Morale",
};

const ACTIVITY_LABELS = {
    JH: "JH - Autonomous Maintenance",
    PM: "PM - Planned Maintenance",
    KK: "KK - Focused Improvement",
    QM: "QM - Quality Maintenance",
    DM: "DM - Early Equipment Management",
    "E&T": "E&T - Training and Education",
    SHE: "SHE - Safety, Health & Environment",
    OTPM: "OTPM - Office TPM / Administration",
};

function safeString(value) {
    if (value === null || value === undefined || value === "") return "-";
    return String(value);
}

function escapeHtml(value) {
    return safeString(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return safeString(value);
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return safeString(value);
    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatNumber(value) {
    if (value === null || value === undefined || value === "") return "0.00";
    const number = Number(value);
    if (!Number.isFinite(number)) return safeString(value);
    return number.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === "") return "-";
    const number = Number(value);
    if (!Number.isFinite(number)) return safeString(value);
    return `₹ ${formatNumber(number)}`;
}

function getFirst(item, keys, fallback = "-") {
    for (const key of keys) {
        const value = item?.[key];
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return fallback;
}

function getProjectId(item) {
    return getFirst(item, ["project_id", "improvement_id"], item?.id ? `OIPM-${item.id}` : "OIPM Improvement");
}

function getUserName(item) {
    return getFirst(
        item,
        ["employee_name", "user_name", "creator_name", "created_by_name", "employee_full_name", "user_full_name"],
        getFirst(item?.employee, ["full_name", "name"], getFirst(item?.user, ["full_name", "name"], "-"))
    );
}

function normalizeMultiValue(value) {
    if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== "");
    if (value === null || value === undefined || value === "") return [];
    return [value];
}

function getLabeledValues(value, labels) {
    const values = normalizeMultiValue(value);
    return values.map((item) => {
        const key = String(item).trim();
        return labels[key] || labels[key.toUpperCase()] || String(item);
    });
}

function getBenefitLabel(value) {
    return getLabeledValues(value, BENEFIT_LABELS).join(", ") || "-";
}

function getActivityLabel(value) {
    return getLabeledValues(value, ACTIVITY_LABELS).join(", ") || "-";
}

function looksLikeUuid(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function findEmployeeName(employees, identifier) {
    if (!identifier || !Array.isArray(employees)) return null;
    const target = String(identifier).trim().toLowerCase();
    const person = employees.find((employee) => {
        const ids = [
            employee?.id,
            employee?.user_id,
            employee?.employee_id,
            employee?.uuid,
            employee?.user?.id,
            employee?.employee?.id,
        ]
            .filter((value) => value !== null && value !== undefined && value !== "")
            .map((value) => String(value).trim().toLowerCase());
        return ids.includes(target);
    });
    if (!person) return null;
    return getFirst(
        person,
        ["full_name", "name", "employee_name", "user_name", "display_name"],
        getFirst(person?.user, ["full_name", "name", "employee_name", "user_name", "display_name"], getFirst(person?.employee, ["full_name", "name", "employee_name", "user_name", "display_name"], null))
    );
}

function getApproverName(item, role) {
    const prefix = role === "accounts" ? "accounts" : "plant_head";
    const directName = getFirst(item, [
        `${prefix}_verified_by_name`,
        `${prefix}_verifier_name`,
        `${prefix}_approver_name`,
        `${prefix}_verified_user_name`,
    ], null);
    if (directName) return directName;

    const nested = [
        item?.[`${prefix}_verified_by_user`],
        item?.[`${prefix}_verified_user`],
        item?.[`${prefix}_verifier`],
        item?.[`${prefix}_approver`],
    ];

    for (const person of nested) {
        if (!person || typeof person !== "object") continue;
        const name = getFirst(person, ["full_name", "name", "employee_name", "user_name", "display_name"], null);
        if (name) return name;
    }

    const fallback = getFirst(item, [`${prefix}_verified_by`], "-");
    return looksLikeUuid(fallback) ? "Name not available" : fallback;
}

async function resolveApproverNames(item) {
    const result = { ...item };
    const accountVerifier = getFirst(item, ["accounts_verified_by"], null);
    const plantHeadVerifier = getFirst(item, ["plant_head_verified_by"], null);
    const needsAccountLookup = looksLikeUuid(accountVerifier);
    const needsPlantHeadLookup = looksLikeUuid(plantHeadVerifier);

    if (!needsAccountLookup && !needsPlantHeadLookup) return result;

    try {
        const response = await getPlantHeadEmployees();
        const employees = Array.isArray(response) ? response : (response?.items || response?.data || response?.results || []);
        if (needsAccountLookup) {
            const name = findEmployeeName(employees, accountVerifier);
            if (name) result.accounts_verified_by_name = name;
        }
        if (needsPlantHeadLookup) {
            const name = findEmployeeName(employees, plantHeadVerifier);
            if (name) result.plant_head_verified_by_name = name;
        }
    } catch (lookupError) {
        console.warn("Unable to resolve approver names:", lookupError);
    }
    return result;
}

function parseJsonValue(value) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function formatFieldName(key) {
    return String(key || "")
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    const parsed = parseJsonValue(value);
    if (parsed !== value) return formatValue(parsed);
    if (Array.isArray(value)) return value.length ? value.map((entry) => formatValue(entry)).join("\n") : "-";
    if (typeof value === "object") {
        return Object.entries(value)
            .filter(([key]) => !["sl_no", "id"].includes(String(key).toLowerCase()))
            .map(([key, entry]) => `${formatFieldName(key)}: ${formatValue(entry)}`)
            .join("\n");
    }
    return safeString(value);
}

function normalizeRows(value) {
    const parsed = parseJsonValue(value);
    if (parsed === null || parsed === undefined || parsed === "") return [];
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "object") return [parsed];
    return [parsed];
}

function cleanRow(row) {
    if (row === null || row === undefined) return { Details: "-" };
    if (typeof row !== "object" || Array.isArray(row)) return { Details: row };
    return Object.fromEntries(
        Object.entries(row).filter(([key]) => !["sl_no", "id"].includes(String(key).toLowerCase()))
    );
}

function getRowNumber(row, index) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
        const value = row.sl_no ?? row.slNo ?? row.serial_no;
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return index + 1;
}

function isInvestmentYes(item) {
    return String(item?.investment_required || "").trim().toLowerCase() === "yes";
}

function getPayback(item) {
    return isInvestmentYes(item) ? getFirst(item, ["payback_period"], "-") : "-";
}

function buildReport(item) {
    const primaryRows = [
        ["Improvement ID", getProjectId(item)],
        ["Employee Name", getUserName(item)],
        ["Department", getFirst(item, ["department"])],
        ["Plant", getFirst(item, ["plant"])],
        ["Activity", getActivityLabel(item?.activity)],
        ["Benefit", getBenefitLabel(item?.benefit_type)],
        ["Kaizen Theme", getFirst(item, ["kaizen_theme"])],
        ["Machine", getFirst(item, ["machine", "machine_name"])],
        ["Target", getFirst(item, ["target"])],
        ["Kaizen Start", formatDate(getFirst(item, ["kaizen_start", "kaizen_start_date"], null))],
        ["Kaizen End", formatDate(getFirst(item, ["kaizen_end", "kaizen_end_date"], null))],
        ["Current Status", getFirst(item, ["status"], "-")],
    ];

    return {
        primaryRows,
        improvementIdea: getFirst(item, ["improvement_idea", "idea", "project_idea"]),
        problemStatus: getFirst(item, ["problem_present_status", "problem_statement", "problem_status"], null),
        countermeasure: getFirst(item, ["countermeasure", "countermeasures"], null),
        results: getFirst(item, ["results", "result"], null),
        costSavingItems: getFirst(item, ["cost_saving_items", "cost_savings"], null),
        horizontalDeployment: getFirst(item, ["horizontal_deployment"], null),
        financial: (() => {
            const costItems = normalizeRows(
                getFirst(item, ["cost_saving_items", "cost_savings"], null)
            );
            const startDate = getFirst(item, ["kaizen_start", "kaizen_start_date"], null);
            const monthly = getMonthlySaving(costItems);
            const oneTime = getOneTimeSaving(costItems);
            const annual = costItems.length
                ? getApplicableAnnualSaving(startDate, costItems)
                : getFirst(item, ["annualized_saving", "annual_saving"], 0);

            return {
                monthly: monthly || 0,
                oneTime: oneTime || 0,
                annual,
                savingTypes: [...new Set(costItems.map((row) => {
                const type = String(row?.saving_type || "recurring").toLowerCase();
                return type === "limited" ? "Limited Period Saving" : type === "one_time" ? "One-Time Saving" : "Recurring Saving";
            }))].join(", ") || "-",
            investmentRequired: isInvestmentYes(item) ? "Yes" : "No",
            investmentAmount: isInvestmentYes(item) ? getFirst(item, ["investment_amount"]) : "-",
            payback: getPayback(item),
            details: isInvestmentYes(item) ? getFirst(item, ["investment_details"]) : "-",
            };
        })(),
        approvals: {
            accountsStatus: getFirst(item, ["accounts_status"]),
            accountsRemarks: getFirst(item, ["accounts_remarks"]),
            accountsVerifiedBy: getApproverName(item, "accounts"),
            accountsDesignation: getFirst(item, ["accounts_verified_designation"]),
            accountsVerifiedAt: item?.accounts_verified_at ? formatDateTime(item.accounts_verified_at) : "-",
            plantHeadStatus: getFirst(item, ["plant_head_status"]),
            plantHeadVerifiedBy: getApproverName(item, "plant_head"),
            plantHeadDesignation: getFirst(item, ["plant_head_verified_designation"]),
            plantHeadVerifiedAt: item?.plant_head_verified_at ? formatDateTime(item.plant_head_verified_at) : "-",
        },
    };
}

function renderText(value, emptyMessage = "No information added.") {
    const text = formatValue(value);
    if (text === "-") return `<div class="report-empty">${escapeHtml(emptyMessage)}</div>`;
    return `<div class="report-text">${escapeHtml(text).replaceAll("\n", "<br>")}</div>`;
}

function renderInfoGrid(rows) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += 3) {
        chunks.push(rows.slice(index, index + 3));
    }

    return `<table class="report-info-table" width="100%"><tbody>${chunks.map((chunk) => `
        <tr>
            ${chunk.map(([label, value]) => `
                <td class="report-info-card">
                    <div class="report-label">${escapeHtml(label)}</div>
                    <div class="report-info-value">${escapeHtml(formatValue(value)).replaceAll("\n", "<br>")}</div>
                </td>
            `).join("")}
            ${Array.from({ length: 3 - chunk.length }, () => '<td class="report-info-card report-info-empty-cell"></td>').join("")}
        </tr>
    `).join("")}</tbody></table>`;
}

function renderListCards(value, emptyMessage) {
    const rows = normalizeRows(value);
    if (!rows.length) return `<div class="report-empty">${escapeHtml(emptyMessage)}</div>`;

    return `<table class="report-list-table" width="100%" cellspacing="0" cellpadding="0"><tbody>${rows.map((row, index) => {
        const clean = cleanRow(row);
        const entries = Object.entries(clean);
        const number = getRowNumber(row, index);

        if (entries.length === 1 && entries[0][0] === "Details") {
            return `<tr class="report-list-row">
                <td class="report-list-number-cell" width="42"><div class="report-list-number">${escapeHtml(number)}</div></td>
                <td class="report-list-content-cell"><div class="report-list-content-text">${escapeHtml(formatValue(entries[0][1])).replaceAll("\n", "<br>")}</div></td>
            </tr>`;
        }

        return `<tr class="report-list-row">
            <td class="report-list-number-cell" width="42"><div class="report-list-number">${escapeHtml(number)}</div></td>
            <td class="report-list-content-cell">
                <table class="report-detail-table" width="100%" cellspacing="0" cellpadding="0"><tbody>
                    ${entries.map(([key, value]) => `
                        <tr>
                            <td class="report-detail-label" width="145">${escapeHtml(formatFieldName(key))}</td>
                            <td class="report-detail-separator" width="18">-</td>
                            <td class="report-detail-value">${escapeHtml(formatValue(value)).replaceAll("\n", "<br>")}</td>
                        </tr>
                    `).join("")}
                </tbody></table>
            </td>
        </tr>`;
    }).join("")}</tbody></table>`;
}

function renderCostSaving(value) {
    const rows = normalizeRows(value);
    if (!rows.length) return `<div class="report-empty">No individual cost-saving items added.</div>`;

    return `<table class="report-saving-table" width="100%"><tbody>${rows.map((row, index) => {
        const item = cleanRow(row);
        const number = getRowNumber(row, index);
        const particular = getFirst(item, ["particular"], `Saving Item ${number}`);
        const before = getFirst(item, ["before"]);
        const after = getFirst(item, ["after"]);
        const monthly = getFirst(item, ["monthly_saving"]);
        return `<tr><td class="report-saving-card">
            <table class="report-saving-head" width="100%"><tr>
                <td class="report-list-number-cell"><div class="report-list-number">${escapeHtml(number)}</div></td>
                <td><h4>${escapeHtml(particular)}</h4><span>Cost saving breakdown</span></td>
            </tr></table>
            <table class="report-saving-grid" width="100%"><tr>
                <td><span>Saving Type</span><strong>${escapeHtml(String(getFirst(item, ["saving_type_label"]) || (String(getFirst(item, ["saving_type"], "recurring")) === "limited" ? "Limited Period Saving" : String(getFirst(item, ["saving_type"], "recurring")) === "one_time" ? "One-Time Saving" : "Recurring Saving")))}</strong></td>
                <td><span>Before</span><strong>${escapeHtml(formatValue(before))}</strong></td>
                <td><span>After</span><strong>${escapeHtml(formatValue(after))}</strong></td>
                <td class="report-saving-highlight"><span>${String(getFirst(item, ["saving_type"], "recurring")) === "one_time" ? "One-Time Saving" : "Monthly Saving"}</span><strong>${escapeHtml(formatCurrency(String(getFirst(item, ["saving_type"], "recurring")) === "one_time" ? getFirst(item, ["one_time_saving"]) : monthly))}</strong></td>
                <td><span>Duration</span><strong>${escapeHtml(String(getFirst(item, ["saving_type"], "recurring")) === "limited" ? formatDuration(getFirst(item, ["duration_months"])) : String(getFirst(item, ["saving_type"], "recurring")) === "one_time" ? "One time" : "Ongoing" )}</strong></td>
            </tr></table>
        </td></tr>`;
    }).join("")}</tbody></table>`;
}

function renderSection(number, title, subtitle, content) {
    return `<table class="report-section" width="100%" cellspacing="0" cellpadding="0">
        <tr>
            <td class="report-section-heading-cell">
                <table class="report-section-heading" width="100%" cellspacing="0" cellpadding="0"><tr>
                    <td class="report-section-heading-copy">
                        <div class="report-section-number">${escapeHtml(number)}</div>
                        <h2>${escapeHtml(title)}</h2>
                        <p>${escapeHtml(subtitle)}</p>
                    </td>
                </tr></table>
            </td>
        </tr>
        <tr><td class="report-section-body">${content}</td></tr>
    </table>`;
}

function getExportStyles(extra = "") {
    return `${reportExportCss}\n${extra}`;
}

function buildReportHtml(item) {
    const report = buildReport(item);
    const projectId = getProjectId(item);
    const employeeName = getUserName(item);
    const financial = report.financial;
    const approval = report.approvals;

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(projectId)} - OIPM Report</title><style>${getExportStyles()}</style></head><body><div class="report-shell">
        <header class="report-top">
            <div class="report-top-band"><strong>NIBL</strong></div>
            <div class="report-top-body">
                <h1>One Person One Improvement</h1>
                <p>Structured Improvement Report</p>
                <table class="report-header-grid" width="100%"><tr>
                    <td class="report-header-cell"><div class="report-label">Improvement ID</div><strong>${escapeHtml(projectId)}</strong></td>
                    <td class="report-header-cell"><div class="report-label">Employee</div><strong>${escapeHtml(employeeName)}</strong></td>
                </tr></table>
            </div>
        </header>

        ${renderSection("01", "Improvement Information", "Core identification and improvement details.", renderInfoGrid(report.primaryRows))}
        ${renderSection("02", "Improvement Idea", "What the improvement is intended to achieve.", renderText(report.improvementIdea, "No improvement idea added."))}
        ${renderSection("03", "Problem / Present Status", "Problem identified before implementing the improvement.", renderListCards(report.problemStatus, "No problem present status information added."))}
        ${renderSection("04", "Countermeasure / Engineering Solution / Team Mates", "Action taken to address the problem and supporting team members.", renderListCards(report.countermeasure, "No countermeasure information added."))}
        ${renderSection("05", "Results", "Result achieved after implementation.", renderListCards(report.results, "No results information added."))}
        ${renderSection("06", "Cost Saving", "Financial saving generated by the improvement.", `<table class="report-financial-grid" width="100%"><tr><td class="report-financial-card"><span>Monthly Saving</span><strong>${escapeHtml(formatCurrency(financial.monthly))}</strong></td><td class="report-financial-card"><span>One-Time Saving</span><strong>${escapeHtml(formatCurrency(financial.oneTime))}</strong></td><td class="report-financial-card"><span>Annualized / Applicable FY Saving</span><strong>${escapeHtml(formatCurrency(financial.annual))}</strong></td><td class="report-financial-card"><span>Investment</span><strong>${escapeHtml(formatCurrency(financial.investmentAmount))}</strong></td><td class="report-financial-card"><span>Payback</span><strong>${escapeHtml(financial.payback)}</strong></td></tr></table>${renderCostSaving(report.costSavingItems)}`)}
        ${renderSection("07", "Investment & Payback", "Investment required to implement the improvement.", `<div class="report-info-grid"><div class="report-info-card"><span>Investment Required</span><strong>${escapeHtml(financial.investmentRequired)}</strong></div><div class="report-info-card"><span>Investment Amount</span><strong>${escapeHtml(formatCurrency(financial.investmentAmount))}</strong></div><div class="report-info-card"><span>Payback Period</span><strong>${escapeHtml(financial.payback)}</strong></div></div><div style="height:8px"></div><div class="report-text"><span class="report-label">Investment Details</span>${escapeHtml(financial.details).replaceAll("\n", "<br>")}</div>`)}
        ${renderSection("08", "Horizontal Deployment", "Other areas where the improvement can be implemented.", renderListCards(report.horizontalDeployment, "No horizontal deployment information added."))}
        ${renderSection("09", "Approval Status", "Approval record captured in the OIPM system.", `<table class="report-approval-grid" width="100%"><tr><td class="report-approval-card"><h3>Plant Head</h3><div class="report-detail-row"><span>Status</span><strong>${escapeHtml(formatValue(approval.plantHeadStatus))}</strong></div><div class="report-detail-row"><span>Verified By</span><strong>${escapeHtml(formatValue(approval.plantHeadVerifiedBy))}</strong></div><div class="report-detail-row"><span>Designation</span><strong>${escapeHtml(formatValue(approval.plantHeadDesignation))}</strong></div><div class="report-detail-row"><span>Verified At</span><strong>${escapeHtml(formatValue(approval.plantHeadVerifiedAt))}</strong></div></td><td class="report-approval-card"><h3>Accounts</h3><div class="report-detail-row"><span>Status</span><strong>${escapeHtml(formatValue(approval.accountsStatus))}</strong></div><div class="report-detail-row"><span>Verified By</span><strong>${escapeHtml(formatValue(approval.accountsVerifiedBy))}</strong></div><div class="report-detail-row"><span>Designation</span><strong>${escapeHtml(formatValue(approval.accountsDesignation))}</strong></div><div class="report-detail-row"><span>Verified At</span><strong>${escapeHtml(formatValue(approval.accountsVerifiedAt))}</strong></div><div class="report-detail-row"><span>Remarks</span><strong>${escapeHtml(formatValue(approval.accountsRemarks))}</strong></div></td></tr></table>`)}

        <section class="report-signatures">
            <div class="report-signatures-title">Final Approval Signatures</div>
            <table class="report-signature-table"><tr>
                <td class="report-signature-box"><strong>HOD</strong><div class="report-signature-line"></div><div class="report-signature-date">Signature / Date</div></td>
                <td class="report-signature-box"><strong>Accounts</strong><div class="report-signature-line"></div><div class="report-signature-date">Signature / Date</div></td>
                <td class="report-signature-box"><strong>Plant Head</strong><div class="report-signature-line"></div><div class="report-signature-date">Signature / Date</div></td>
            </tr></table>
        </section>
        <div class="report-footer">One Person One Improvement (OIPM) | NIBL Industrial</div>
    </div></body></html>`;
}

function buildExcelReportHtml(item) {
    const report = buildReport(item);
    const projectId = getProjectId(item);
    const employeeName = getUserName(item);
    const financial = report.financial;
    const approval = report.approvals;

    const cell = (content, style = "") => `<td style="${style}">${content}</td>`;
    const sectionTitle = (number, title, subtitle) => `
        <tr>
            <td colspan="6" style="background:#c91515;color:#ffffff;padding:10px 12px;font-family:Arial,sans-serif;">
                <span style="display:inline-block;min-width:34px;padding:5px 7px;background:#a80f0f;text-align:center;font-size:9px;font-weight:bold;">${escapeHtml(number)}</span>
                <strong style="margin-left:9px;font-size:13px;">${escapeHtml(title)}</strong>
                <span style="display:block;margin:5px 0 0 47px;color:#ffe5e5;font-size:9px;">${escapeHtml(subtitle)}</span>
            </td>
        </tr>`;
    const spacer = `<tr><td colspan="6" style="height:9px;font-size:2px;">&nbsp;</td></tr>`;
    const labelStyle = "width:17%;padding:7px 8px;background:#fff2f2;border:1px solid #eadede;color:#758196;font-size:8px;font-weight:bold;text-transform:uppercase;vertical-align:top;";
    const valueStyle = "width:16.33%;padding:7px 8px;background:#ffffff;border:1px solid #eadede;color:#202b3c;font-size:9px;font-weight:bold;vertical-align:top;";

    const infoRows = [];
    for (let index = 0; index < report.primaryRows.length; index += 3) {
        const chunk = report.primaryRows.slice(index, index + 3);
        const cells = [];
        chunk.forEach(([label, value]) => {
            cells.push(cell(escapeHtml(label), labelStyle));
            cells.push(cell(escapeHtml(formatValue(value)).replaceAll("\n", "<br>"), valueStyle));
        });
        while (cells.length < 6) cells.push(cell("", valueStyle));
        infoRows.push(`<tr>${cells.join("")}</tr>`);
    }

    function listRows(value, emptyMessage) {
        const rows = normalizeRows(value);
        if (!rows.length) return `<tr>${cell(`<span style="color:#8792a5;">${escapeHtml(emptyMessage)}</span>`, "padding:9px;border:1px dashed #d7dde6;background:#fafbfc;text-align:center;font-size:9px;")}</tr>`;

        return rows.map((row, index) => {
            const clean = cleanRow(row);
            const entries = Object.entries(clean);
            const number = escapeHtml(getRowNumber(row, index));
            if (entries.length === 1 && entries[0][0] === "Details") {
                return `<tr>${cell(`<strong style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:6px;background:#f1f4f8;text-align:center;color:#536174;">${number}</strong>`, "width:42px;padding:7px;border:1px solid #ebe1e1;text-align:center;vertical-align:top;")}${cell(escapeHtml(formatValue(entries[0][1])).replaceAll("\n", "<br>"), "padding:8px;border:1px solid #ebe1e1;color:#344054;font-size:9.5px;background:#fffafa;vertical-align:middle;", )}</tr>`;
            }
            const content = entries.map(([key, value]) => `${escapeHtml(formatFieldName(key))}: <strong>${escapeHtml(formatValue(value)).replaceAll("\n", "<br>")}</strong>`).join("<br>");
            return `<tr>${cell(`<strong style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:6px;background:#f1f4f8;text-align:center;color:#536174;">${number}</strong>`, "width:42px;padding:7px;border:1px solid #ebe1e1;text-align:center;vertical-align:top;")}${cell(content, "padding:8px;border:1px solid #ebe1e1;color:#344054;font-size:9px;background:#fffafa;line-height:1.5;vertical-align:middle;", )}</tr>`;
        }).join("").replaceAll('<td style="width:42px;', '<td colspan="1" style="width:42px;');
    }

    function costSavingRows(value) {
        const rows = normalizeRows(value);
        if (!rows.length) return `<tr>${cell(`<span style="color:#8792a5;">No individual cost-saving items added.</span>`, "padding:9px;border:1px dashed #d7dde6;background:#fafbfc;text-align:center;font-size:9px;")}</tr>`;
        return rows.map((row, index) => {
            const item = cleanRow(row);
            return `<tr>
                ${cell(`<strong style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:6px;background:#f1f4f8;text-align:center;color:#536174;">${escapeHtml(getRowNumber(row, index))}</strong>`, "width:42px;padding:7px;border:1px solid #ebe1e1;text-align:center;vertical-align:top;")}
                ${cell(escapeHtml(String(getFirst(item, ["saving_type_label"]) || getFirst(item, ["saving_type"], "recurring"))), "width:18%;padding:8px;border:1px solid #ebe1e1;background:#fffafa;color:#263246;font-size:9px;font-weight:bold;")}
                ${cell(escapeHtml(formatValue(getFirst(item, ["particular"], "-"))), "width:24%;padding:8px;border:1px solid #ebe1e1;background:#fffafa;color:#263246;font-size:9px;font-weight:bold;")}
                ${cell(escapeHtml(formatValue(getFirst(item, ["before"]))), "width:20%;padding:8px;border:1px solid #ebe1e1;color:#344054;font-size:9px;")}
                ${cell(escapeHtml(formatValue(getFirst(item, ["after"]))), "width:20%;padding:8px;border:1px solid #ebe1e1;color:#344054;font-size:9px;")}
                ${cell(escapeHtml(formatCurrency(String(getFirst(item, ["saving_type"], "recurring")) === "one_time" ? getFirst(item, ["one_time_saving"]) : getFirst(item, ["monthly_saving"]))), "width:20%;padding:8px;border:1px solid #cce9d8;background:#f4fbf7;color:#138a48;font-size:9px;font-weight:bold;")}
                ${cell(escapeHtml(String(getFirst(item, ["saving_type"], "recurring")) === "limited" ? formatDuration(getFirst(item, ["duration_months"])) : String(getFirst(item, ["saving_type"], "recurring")) === "one_time" ? "One time" : "Ongoing"), "width:18%;padding:8px;border:1px solid #ebe1e1;color:#344054;font-size:9px;")}
            </tr>`;
        }).join("");
    }

    function financialRow() {
        return `<tr>
            ${cell("Monthly Saving", labelStyle)}${cell(escapeHtml(formatCurrency(financial.monthly)), valueStyle)}
            ${cell("Annualized / Applicable FY Saving", labelStyle)}${cell(escapeHtml(formatCurrency(financial.annual)), valueStyle)}
            ${cell("Investment", labelStyle)}${cell(escapeHtml(formatCurrency(financial.investmentAmount)), valueStyle)}
        </tr><tr>
            ${cell("Investment Required", labelStyle)}${cell(escapeHtml(financial.investmentRequired), valueStyle)}
            ${cell("Payback Period", labelStyle)}${cell(escapeHtml(financial.payback), valueStyle)}
            ${cell("Investment Details", labelStyle)}${cell(escapeHtml(formatValue(financial.details)).replaceAll("\n", "<br>"), valueStyle)}
        </tr>`;
    }

    function approvalRows() {
        return `<tr>
            ${cell("Plant Head Status", labelStyle)}${cell(escapeHtml(formatValue(approval.plantHeadStatus)), valueStyle)}
            ${cell("Verified By", labelStyle)}${cell(escapeHtml(formatValue(approval.plantHeadVerifiedBy)), valueStyle)}
            ${cell("Verified At", labelStyle)}${cell(escapeHtml(formatValue(approval.plantHeadVerifiedAt)), valueStyle)}
        </tr><tr>
            ${cell("Accounts Status", labelStyle)}${cell(escapeHtml(formatValue(approval.accountsStatus)), valueStyle)}
            ${cell("Verified By", labelStyle)}${cell(escapeHtml(formatValue(approval.accountsVerifiedBy)), valueStyle)}
            ${cell("Remarks", labelStyle)}${cell(escapeHtml(formatValue(approval.accountsRemarks)), valueStyle)}
        </tr>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(projectId)} - OIPM Report</title></head><body style="margin:0;padding:14px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#344054;"><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr><td colspan="6" style="background:#c91515;color:#ffffff;padding:11px 14px;font-size:11px;font-weight:bold;letter-spacing:2px;">NIBL</td></tr>
        <tr><td colspan="6" style="padding:15px 14px 11px;border:1px solid #ead6d6;background:#fffafa;"><div style="font-size:20px;font-weight:bold;color:#172033;">One Person One Improvement</div><div style="margin-top:4px;color:#8792a5;font-size:9px;">Structured Improvement Report</div></td></tr>
        <tr>
            <td colspan="3" style="padding:8px 10px;border:1px solid #eadede;background:#ffffff;"><div style="color:#758196;font-size:8px;font-weight:bold;">IMPROVEMENT ID</div><strong style="font-size:10px;">${escapeHtml(projectId)}</strong></td>
            <td colspan="3" style="padding:8px 10px;border:1px solid #eadede;background:#ffffff;"><div style="color:#758196;font-size:8px;font-weight:bold;">EMPLOYEE</div><strong style="font-size:10px;">${escapeHtml(employeeName)}</strong></td>
        </tr>
        ${spacer}
        ${sectionTitle("01", "Improvement Information", "Core identification and improvement details.")}
        ${infoRows.join("")}
        ${spacer}
        ${sectionTitle("02", "Improvement Idea", "What the improvement is intended to achieve.")}
        <tr>${cell(escapeHtml(formatValue(report.improvementIdea)).replaceAll("\n", "<br>"), "padding:10px;border:1px solid #ebe1e1;background:#fffafa;color:#344054;font-size:9.5px;line-height:1.6;")}</tr>
        ${spacer}
        ${sectionTitle("03", "Problem / Present Status", "Problem identified before implementing the improvement.")}
        ${listRows(report.problemStatus, "No problem present status information added.")}
        ${spacer}
        ${sectionTitle("04", "Countermeasure / Engineering Solution / Team Mates", "Action taken to address the problem and supporting team members.")}
        ${listRows(report.countermeasure, "No countermeasure information added.")}
        ${spacer}
        ${sectionTitle("05", "Results", "Result achieved after implementation.")}
        ${listRows(report.results, "No results information added.")}
        ${spacer}
        ${sectionTitle("06", "Cost Saving", "Financial saving generated by the improvement.")}
        <tr>${cell("Saving Type", "padding:7px;background:#c91515;color:#ffffff;border:1px solid #c91515;font-size:8px;font-weight:bold;")}${cell("Particular", "padding:7px;background:#c91515;color:#ffffff;border:1px solid #c91515;font-size:8px;font-weight:bold;")}${cell("Before", "padding:7px;background:#c91515;color:#ffffff;border:1px solid #c91515;font-size:8px;font-weight:bold;")}${cell("After", "padding:7px;background:#c91515;color:#ffffff;border:1px solid #c91515;font-size:8px;font-weight:bold;")}${cell("Monthly / One-Time Saving", "padding:7px;background:#c91515;color:#ffffff;border:1px solid #c91515;font-size:8px;font-weight:bold;")}${cell("Duration", "padding:7px;background:#c91515;color:#ffffff;border:1px solid #c91515;font-size:8px;font-weight:bold;")}</tr>
        ${costSavingRows(report.costSavingItems)}
        ${spacer}
        ${sectionTitle("07", "Investment & Payback", "Investment required to implement the improvement.")}
        ${financialRow()}
        ${spacer}
        ${sectionTitle("08", "Horizontal Deployment", "Other areas where the improvement can be implemented.")}
        ${listRows(report.horizontalDeployment, "No horizontal deployment information added.")}
        ${spacer}
        ${sectionTitle("09", "Approval Status", "Approval record captured in the OIPM system.")}
        ${approvalRows()}
        ${spacer}
        <tr><td colspan="6" style="background:#fffafa;border:1px solid #eadede;padding:10px 12px;color:#263246;font-size:11px;font-weight:bold;">Final Approval Signatures</td></tr>
        <tr>
            <td colspan="2" style="height:95px;padding:10px;border:1px solid #eadede;vertical-align:top;"><strong style="color:#c91515;font-size:9px;">HOD</strong><div style="margin-top:50px;border-bottom:1px solid #697386;"></div><div style="margin-top:5px;color:#8792a5;font-size:7px;">Signature / Date</div></td>
            <td colspan="2" style="height:95px;padding:10px;border:1px solid #eadede;vertical-align:top;"><strong style="color:#c91515;font-size:9px;">Accounts</strong><div style="margin-top:50px;border-bottom:1px solid #697386;"></div><div style="margin-top:5px;color:#8792a5;font-size:7px;">Signature / Date</div></td>
            <td colspan="2" style="height:95px;padding:10px;border:1px solid #eadede;vertical-align:top;"><strong style="color:#c91515;font-size:9px;">Plant Head</strong><div style="margin-top:50px;border-bottom:1px solid #697386;"></div><div style="margin-top:5px;color:#8792a5;font-size:7px;">Signature / Date</div></td>
        </tr>
        <tr><td colspan="6" style="padding-top:7px;border-top:2px solid #c91515;text-align:center;color:#8792a5;font-size:7px;">One Person One Improvement (OIPM) | NIBL Industrial</td></tr>
    </table></body></html>`;
}

function downloadContent(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportDownload({ improvement, reportType = "word", onClose }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [downloaded, setDownloaded] = useState(false);

    useEffect(() => {
        let active = true;

        async function generateReport() {
            try {
                setLoading(true);
                setError("");
                setDownloaded(false);

                let completeImprovement = improvement;
                if (improvement?.id) {
                    try {
                        const complete = await getImprovement(improvement.id);
                        if (complete && typeof complete === "object") {
                            completeImprovement = { ...improvement, ...complete };
                        }
                    } catch (fetchError) {
                        console.warn("Complete improvement fetch failed. Using dashboard data.", fetchError);
                    }
                }

                if (!active) return;
                if (!completeImprovement) throw new Error("Improvement information is missing.");

                completeImprovement = await resolveApproverNames(completeImprovement);
                if (!active) return;

                const html = reportType === "excel"
                    ? buildExcelReportHtml(completeImprovement)
                    : buildReportHtml(completeImprovement);

                const projectId = safeString(getProjectId(completeImprovement))
                    .replaceAll("/", "-")
                    .replaceAll("\\", "-");

                if (reportType === "excel") {
                    downloadContent(html, `${projectId}-OIPM-Report.xls`, "application/vnd.ms-excel;charset=utf-8");
                } else {
                    downloadContent(html, `${projectId}-OIPM-Report.doc`, "application/msword;charset=utf-8");
                }

                if (active) {
                    setDownloaded(true);
                    setLoading(false);
                }
            } catch (generationError) {
                console.error("Report generation failed:", generationError);
                if (active) {
                    setError(generationError?.message || "Unable to generate the report.");
                    setLoading(false);
                }
            }
        }

        generateReport();
        return () => { active = false; };
    }, [improvement, reportType]);

    return (
        <div className="report-download-overlay" onClick={onClose}>
            <div className="report-download-modal" onClick={(event) => event.stopPropagation()}>
                <div className="report-download-header">
                    <div className="report-download-title">
                        {reportType === "excel" ? <FileSpreadsheet size={20} /> : <FileText size={20} />}
                        <strong>{reportType === "excel" ? "Excel Report" : "Word Report"}</strong>
                    </div>
                    {onClose && <button type="button" className="report-download-close" onClick={onClose}><X size={18} /></button>}
                </div>
                <div className="report-download-body">
                    {loading && <><Loader2 className="report-download-spinner" size={34} /><h3>Preparing report</h3><p>Please wait while the complete improvement report is prepared.</p></>}
                    {downloaded && <>{reportType === "excel" ? <FileSpreadsheet size={38} className="report-download-success" /> : <FileText size={38} className="report-download-success" />}<h3>Report downloaded</h3><p>The {reportType === "excel" ? "Excel" : "Word"} report has been downloaded successfully.</p>{onClose && <button type="button" className="report-download-action" onClick={onClose}>Close</button>}</>}
                    {error && <><CircleAlert size={38} className="report-download-error-icon" /><h3>Unable to generate report</h3><p className="report-download-error">{error}</p>{onClose && <button type="button" className="report-download-secondary" onClick={onClose}>Close</button>}</>}
                </div>
            </div>
        </div>
    );
}
