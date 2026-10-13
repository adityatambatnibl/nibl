import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import ReportDownload from "../report/reportdownload.jsx";
import {
    CheckCircle2,
    ClipboardList,
    Clock3,
    Download,
    Eye,
    FileX2,
    Filter,
    LayoutDashboard,
    LogOut,
    Menu,
    Plus,
    RotateCcw,
    UserCircle,
    Users,
    X,
    CircleAlert,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { goToPortal } from "../../utils/portal";

import {
    getImprovement,
    resubmitImprovement,
    updateReviewerImprovement,
    updateOwnedImprovement,
} from "../../api/improvements";

import {
    useAuth,
} from "../../context/AuthContext";

import AddImprovement
    from "../improvements/AddImprovement.jsx";

import ViewImprovement
    from "../improvements/ViewImprovement.jsx";

import "./PlantHeadDashboard.css";

import "../employee/EmployeeDashboard.css";
import "../../DashboardEnhancements.css";
import Profile from "../profile/Profile.jsx";
import logo from "../../../assest/logo.jpg";


import Lists from "../../components/List.jsx";
import { getApplicableAnnualSaving } from "../../utils/financial";
/*
 * ============================================================
 * PLANT HEAD DASHBOARD
 * ============================================================
 *
 * Plant Head can:
 *
 * 1. Create an improvement.
 * 2. View improvements.
 * 3. Approve improvements waiting for Plant Head approval.
 * 4. Reject improvements waiting for Plant Head approval.
 *
 * Plant Head can edit pending approvals and request
 * resubmission before approval.
 *
 * The same AddImprovement and ViewImprovement components used
 * by Employee / Accounts are intentionally reused.
 */


/* ============================================================
   STATUS CONFIGURATION
============================================================ */

const STATUS_CONFIG = {

    pending_accounts: {
        label: "Pending",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_plant_head: {
        label: "Pending",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    in_progress: {
        label: "In Progress",
        className: "status-progress",
        icon: <Clock3 size={13} />,
    },

    rejected: {
        label: "Rejected",
        className: "status-rejected",
        icon: <FileX2 size={13} />,
    },

    resubmission_required: {
        label: "Resubmission",
        className: "status-resubmission",
        icon: <RotateCcw size={13} />,
    },

    resubmit: {
        label: "Resubmission",
        className: "status-resubmission",
        icon: <RotateCcw size={13} />,
    },

    resubmission: {
        label: "Resubmission",
        className: "status-resubmission",
        icon: <RotateCcw size={13} />,
    },

    closed: {
        label: "Done",
        className: "status-done",
        icon: <CheckCircle2 size={13} />,
    },

    done: {
        label: "Done",
        className: "status-done",
        icon: <CheckCircle2 size={13} />,
    },

    approved: {
        label: "Approved",
        className: "status-done",
        icon: <CheckCircle2 size={13} />,
    },

};


/* ============================================================
   HELPERS
============================================================ */



function formatDateInput(dateValue) {

    if (!dateValue) {
        return "";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const month =
        String(date.getMonth() + 1).padStart(2, "0");

    const day =
        String(date.getDate()).padStart(2, "0");

    return `${date.getFullYear()}-${month}-${day}`;

}


function getList(data) {

    if (Array.isArray(data)) {
        return data;
    }

    return (
        data?.items ||
        data?.data ||
        data?.results ||
        []
    );

}


function normalizeStatus(item) {

    return String(
        item?.status ||
        item?.plant_head_status ||
        item?.accounts_status ||
        ""
    )
        .trim()
        .toLowerCase();

}


function getStatusConfig(item) {

    const status =
        normalizeStatus(item);

    return (
        STATUS_CONFIG[status] ||
        {
            label:
                status
                    ? status
                        .replaceAll("_", " ")
                        .replace(
                            /\b\w/g,
                            (letter) =>
                                letter.toUpperCase()
                        )
                    : "Pending",

            className:
                "status-pending",

            icon:
                <Clock3 size={13} />,
        }
    );

}


function getUserName(item) {

    return (
        item?.employee_name ||
        item?.user_name ||
        item?.creator_name ||
        item?.employee?.full_name ||
        item?.employee?.name ||
        item?.user?.full_name ||
        item?.user?.name ||
        item?.created_by_name ||
        "-"
    );

}


function getProjectId(item) {

    return (
        item?.project_id ||
        item?.improvement_id ||
        `OIPM-${String(item?.id || "").slice(0, 8).toUpperCase()}`
    );

}



function formatCurrency(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount === 0) {
        return "—";
    }
    return `₹${amount.toLocaleString("en-IN", {
        maximumFractionDigits: 0,
    })}`;
}

function getFinancialYearLabel(dateValue) {
    if (!dateValue) {
        return "—";
    }
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    const startYear = date.getMonth() >= 3
        ? date.getFullYear()
        : date.getFullYear() - 1;
    return `FY${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

function getMonthLabel(dateValue) {
    if (!dateValue) {
        return "—";
    }
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    return date.toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
    });
}

function FySelect({ value, options, onChange, label = "FY" }) {
    return (
        <label className="plant-head-fy-select">
            <span>{label}</span>
            <select
                value={value || ""}
                onChange={(event) => onChange(event.target.value)}
                aria-label={`Select ${label}`}
            >
                {(options || []).map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
        </label>
    );
}

const ANALYTICS_MONTH_OPTIONS = [
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
];

function AnalyticsMonthSelect({ value, onChange }) {
    return (
        <label className="plant-head-fy-select plant-head-month-select">
            <span>Month</span>
            <select
                value={value || ""}
                onChange={(event) => onChange(Number(event.target.value))}
                aria-label="Select Month"
            >
                {ANALYTICS_MONTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
        </label>
    );
}

function SavingsKpiCard({
    icon,
    type,
    primaryTitle,
    primaryValue,
    secondaryTitle,
    secondaryValue,
    fy,
    fyOptions,
    onFyChange,
    month,
    onMonthChange,
    showMonth = false,
}) {
    return (
        <div className={`plant-head-analytics-kpi analytics-${type}`}>
            <div className="plant-head-analytics-kpi-top">
                <div className="plant-head-analytics-icon">
                    {icon}
                </div>

                <div className="plant-head-savings-selectors">
                    <FySelect
                        value={fy}
                        options={fyOptions}
                        onChange={onFyChange}
                        label=""
                    />
                    {showMonth && (
                        <AnalyticsMonthSelect
                            value={month}
                            onChange={onMonthChange}
                        />
                    )}
                </div>
            </div>

            <div className="plant-head-savings-kpi-row">
                <div>
                    <div className="plant-head-analytics-kpi-title">
                        {primaryTitle}
                    </div>
                    <div className="plant-head-analytics-kpi-value">
                        {primaryValue}
                    </div>
                </div>
            </div>

            <div className="plant-head-savings-divider" />

            <div className="plant-head-savings-kpi-row plant-head-savings-secondary">
                <div>
                    <div className="plant-head-analytics-kpi-title">
                        {secondaryTitle}
                    </div>
                    <div className="plant-head-analytics-kpi-value">
                        {secondaryValue}
                    </div>
                </div>
            </div>

            <div className="plant-head-analytics-kpi-caption">
                {showMonth
                    ? `${ANALYTICS_MONTH_OPTIONS.find((option) => option.value === month)?.label || "Selected Month"} · ${fy || "Current FY"}`
                    : (fy || "Current FY")}
            </div>
        </div>
    );
}



function MonthwiseSummaryTable({ rows }) {
    return (
        <div className="plant-head-table-wrapper plant-head-analytics-table-wrap">
            <table className="plant-head-table plant-head-analytics-table">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>No. of OIPMs Received</th>
                        <th>Monthly Saving Proposed</th>
                        <th>Monthly Saving Validated</th>
                        <th>FY Saving Proposed</th>
                        <th>FY Saving Validated</th>
                    </tr>
                </thead>
                <tbody>
                    {(rows || []).map((row) => (
                        <tr key={row.date || row.month}>
                            <td><strong>{row.month}</strong></td>
                            <td>{row.oipms_received || 0}</td>
                            <td>{formatCurrency(row.monthly_saving_proposed)}</td>
                            <td className="analytics-validated-value">{formatCurrency(row.monthly_saving_validated)}</td>
                            <td>{formatCurrency(row.annualized_saving_proposed)}</td>
                            <td className="analytics-validated-value">{formatCurrency(row.annualized_saving_validated)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TopProjectsTable({ rows }) {
    return (
        <div className="plant-head-table-wrapper plant-head-analytics-table-wrap">
            <table className="plant-head-table plant-head-top-projects-table">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>#1 OIPM ID</th>
                        <th>#1 Staff Name</th>
                        <th>#1 Proposed Saving</th>
                        <th>#1 Validated Saving</th>
                        <th>#2 OIPM ID</th>
                        <th>#2 Staff Name</th>
                        <th>#2 Proposed Saving</th>
                        <th>#2 Validated Saving</th>
                        <th>#3 OIPM ID</th>
                        <th>#3 Staff Name</th>
                        <th>#3 Proposed Saving</th>
                        <th>#3 Validated Saving</th>
                    </tr>
                </thead>
                <tbody>
                    {(rows || []).map((row) => {
                        const projects = row.projects || [];
                        return (
                            <tr key={row.month}>
                                <td><strong>{row.month}</strong></td>
                                {projects.slice(0, 3).map((project, index) => (
                                    <Fragment key={`${row.month}-${index}`}>
                                        <td className="top-project-id">
                                            {project.project_id || "—"}
                                        </td>
                                        <td>
                                            {project.staff_name || "—"}
                                        </td>
                                        <td>
                                            {formatCurrency(project.proposed_saving ?? project.saving)}
                                        </td>
                                        <td className="analytics-validated-value">
                                            {formatCurrency(project.validated_saving)}
                                        </td>
                                    </Fragment>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}


const BENEFIT_LABELS = {
    P: "Productivity",
    Q: "Quality",
    C: "Cost",
    D: "Delivery",
    S: "Safety",
    M: "Morale",
};

function normalizeBenefitCode(value) {
    if (value === null || value === undefined) {
        return "";
    }

    if (typeof value === "object") {
        return normalizeBenefitCode(
            value.code ||
            value.key ||
            value.value ||
            value.label ||
            value.name ||
            ""
        );
    }

    const text = String(value).trim();

    if (!text) {
        return "";
    }

    const code = text
        .split(/[-–—:]/)[0]
        .trim()
        .toUpperCase();

    if (BENEFIT_LABELS[code]) {
        return code;
    }

    const matchedCode = Object.entries(BENEFIT_LABELS).find(
        ([, label]) =>
            label.toLowerCase() === text.toLowerCase()
    );

    return matchedCode?.[0] || "";
}

function getBenefitCodes(item) {
    let value =
        item?.benefit_type ??
        item?.benefit ??
        item?.benefits ??
        [];

    if (typeof value === "string") {
        const trimmed = value.trim();

        if (!trimmed) {
            return [];
        }

        try {
            value = JSON.parse(trimmed);
        } catch {
            value = trimmed.split(/[,;|]/).map((part) => part.trim());
        }
    }

    if (!Array.isArray(value)) {
        value = [value];
    }

    return [...new Set(
        value
            .flatMap((entry) => {
                if (typeof entry === "string") {
                    return entry
                        .split(/[,;|]/)
                        .map((part) => part.trim());
                }

                return [entry];
            })
            .map(normalizeBenefitCode)
            .filter(Boolean)
    )];
}

function BenefitPieChart({ items, selectedFy }) {
    const benefitCounts = useMemo(() => {
        const counts = Object.keys(BENEFIT_LABELS).reduce(
            (result, code) => {
                result[code] = 0;
                return result;
            },
            {}
        );

        (items || []).forEach((item) => {
            getBenefitCodes(item).forEach((code) => {
                counts[code] += 1;
            });
        });

        return Object.entries(counts)
            .filter(([, count]) => count > 0)
            .map(([code, count]) => ({
                code,
                label: BENEFIT_LABELS[code],
                count,
            }))
            .sort((a, b) => b.count - a.count);
    }, [items]);

    const total = benefitCounts.reduce(
        (sum, item) => sum + item.count,
        0
    );

    const gradientStops = benefitCounts.map((item, index) => {
        const accumulatedBefore = benefitCounts
            .slice(0, index)
            .reduce((sum, entry) => sum + entry.count, 0);
        const accumulatedAfter = accumulatedBefore + item.count;

        const start = total
            ? (accumulatedBefore / total) * 100
            : 0;

        const end = total
            ? (accumulatedAfter / total) * 100
            : 0;

        return `${`var(--benefit-${index})`} ${start}% ${end}%`;
    });

    return (
        <section className="plant-head-chart-card plant-head-benefit-chart-card">
            <div className="plant-head-chart-heading">
                <div>
                    <h3>Benefit Distribution</h3>
                    <p>
                        Benefit categories selected in OIPMs for {selectedFy || "the selected financial year"}.
                    </p>
                </div>
            </div>

            {total === 0 ? (
                <div className="plant-head-chart-empty">
                    No benefit data available for this financial year.
                </div>
            ) : (
                <div className="plant-head-benefit-chart-content">
                    <div
                        className="plant-head-benefit-pie"
                        style={{
                            background: `conic-gradient(${gradientStops.join(", ")})`,
                        }}
                        role="img"
                        aria-label={`Benefit distribution for ${selectedFy || "selected financial year"}`}
                    >
                        <div className="plant-head-benefit-pie-center">
                            <strong>{total}</strong>
                            <span>Selections</span>
                        </div>
                    </div>

                    <div className="plant-head-benefit-legend">
                        {benefitCounts.map((item, index) => {
                            const percentage = (item.count / total) * 100;

                            return (
                                <div
                                    className="plant-head-benefit-legend-item"
                                    key={item.code}
                                >
                                    <span
                                        className="plant-head-benefit-legend-dot"
                                        style={{
                                            "--benefit-dot": `var(--benefit-${index})`,
                                        }}
                                    />
                                    <span className="plant-head-benefit-legend-name">
                                        {item.label}
                                    </span>
                                    <strong>
                                        {item.count}
                                    </strong>
                                    <small>
                                        {percentage.toFixed(1)}%
                                    </small>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}

function getChartAxis(maxValue) {
    const safeMax = Math.max(1, Number(maxValue) || 0);
    const roughStep = safeMax / 5;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;

    let niceNormalized;

    if (normalized <= 1) {
        niceNormalized = 1;
    } else if (normalized <= 2) {
        niceNormalized = 2;
    } else if (normalized <= 5) {
        niceNormalized = 5;
    } else {
        niceNormalized = 10;
    }

    const step = niceNormalized * magnitude;

    return {
        step,
        axisMax: step * 5,
    };
}


function AnalyticsBarChart({
    title,
    description,
    rows,
    series,
    valueFormatter = formatCurrency,
}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeSeries = Array.isArray(series) ? series : [];

    const maxValue = Math.max(
        1,
        ...safeRows.flatMap((row) =>
            safeSeries.map((item) =>
                Number(row?.[item.key] || 0)
            )
        )
    );

    const {
        step: chartStep,
        axisMax,
    } = getChartAxis(maxValue);

    const chartTicks = [
        axisMax,
        chartStep * 4,
        chartStep * 3,
        chartStep * 2,
        chartStep,
        0,
    ];

    return (
        <section className="plant-head-chart-card">
            <div className="plant-head-chart-heading">
                <div>
                    <h3>{title}</h3>
                    {description && <p>{description}</p>}
                </div>

                <div className="plant-head-chart-legend">
                    {safeSeries.map((item) => (
                        <span key={item.key}>
                            <i
                                className={`chart-legend-dot ${item.className}`}
                                aria-hidden="true"
                            />
                            {item.label}
                        </span>
                    ))}
                </div>
            </div>

            {safeRows.length === 0 ? (
                <div className="plant-head-chart-empty">
                    No data available for this financial year.
                </div>
            ) : (
                <div
                    className="plant-head-chart-plot"
                    role="img"
                    aria-label={title}
                >
                    {chartTicks.map((tick, index) => (
                        <Fragment key={`chart-tick-${index}`}>
                            <div
                                className={`plant-head-chart-y-label chart-tick-${index}`}
                            >
                                {valueFormatter(tick)}
                            </div>

                            <div
                                className={`plant-head-chart-gridline chart-tick-${index}`}
                            />
                        </Fragment>
                    ))}

                    <div className="plant-head-chart-bars">
                        {safeRows.map((row) => (
                            <div
                                className="plant-head-chart-column"
                                key={row.date || row.month}
                            >
                                <div className="plant-head-chart-values">
                                    {safeSeries.map((item) => {
                                        const numeric = Number(
                                            row?.[item.key] || 0
                                        );

                                        const height =
                                            numeric > 0
                                                ? Math.max(
                                                    4,
                                                    Math.min(
                                                        100,
                                                        (numeric / axisMax) * 100
                                                    )
                                                )
                                                : 0;

                                        return (
                                            <div
                                                className="plant-head-chart-bar-wrap"
                                                key={item.key}
                                                title={`${item.label}: ${valueFormatter(numeric)}`}
                                            >
                                                {height > 0 && (
                                                    <span
                                                        className={`plant-head-chart-bar ${item.className}`}
                                                        style={{
                                                            height: `${height}%`,
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <span className="plant-head-chart-label">
                                    {row.month}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}


/* ============================================================
   SUMMARY CARD
============================================================ */

function SummaryCard({
    icon,
    value,
    title,
    description,
    type,
}) {

    return (
        <div
            className={`employee-summary-card plant-head-summary-card summary-${type}`}
        >

            <div className="summary-icon">
                {icon}
            </div>

            <div className="summary-content">

                <strong>
                    {value ?? 0}
                </strong>

                <span>
                    {title}
                </span>

                <small>
                    {description}
                </small>

            </div>

            <div className="summary-card-arrow">
                →
            </div>

        </div>
    );

}


/* ============================================================
   STATUS BADGE
============================================================ */

function StatusBadge({ item }) {

    const config =
        getStatusConfig(item);

    return (
        <span
            className={`employee-status-badge ${config.className}`}
        >
            {config.icon}
            {config.label}
        </span>
    );

}


/* ============================================================
   MAIN DASHBOARD
============================================================ */

export default function PlantHeadDashboard() {

    const {
        user,
        logout,
    } = useAuth();


    const [
        sidebarOpen,
        setSidebarOpen,
    ] = useState(false);


    const [
        showAddImprovement,
        setShowAddImprovement,
    ] = useState(false);

    const [
        showProfile,
        setShowProfile,
    ] = useState(false);

    const [draftToEdit, setDraftToEdit] = useState(null);
    const [listRefreshKey, setListRefreshKey] = useState(0);

    const [
        myImprovementsCollapsed,
        setMyImprovementsCollapsed,
    ] = useState(false);

    const [
        approvalsCollapsed,
        setApprovalsCollapsed,
    ] = useState(false);

    const [
        allImprovementsCollapsed,
        setAllImprovementsCollapsed,
    ] = useState(false);

    const [
        employeesCollapsed,
        setEmployeesCollapsed,
    ] = useState(false);

    const [
        monthwiseSummaryCollapsed,
        setMonthwiseSummaryCollapsed,
    ] = useState(false);

    const [
        topProjectsCollapsed,
        setTopProjectsCollapsed,
    ] = useState(false);


    const [
        myImprovements,
        setMyImprovements,
    ] = useState([]);


    const [
        approvals,
        setApprovals,
    ] = useState([]);


    const [
        allImprovements,
        setAllImprovements,
    ] = useState([]);


    const [
        employeeList,
        setEmployeeList,
    ] = useState([]);


    const [
        summary,
        setSummary,
    ] = useState({});


    const [
        analytics,
        setAnalytics,
    ] = useState(null);

    const [
        analyticsFy,
        setAnalyticsFy,
    ] = useState("");

    const [
        analyticsMonth,
        setAnalyticsMonth,
    ] = useState(() => new Date().getMonth() + 1);

    const [
        analyticsLoading,
        setAnalyticsLoading,
    ] = useState(false);


    const [
        loading,
        setLoading,
    ] = useState(true);


    const [
        error,
        setError,
    ] = useState("");


    const [
        selectedImprovement,
        setSelectedImprovement,
    ] = useState(null);


    const [
        detailLoading,
        setDetailLoading,
    ] = useState(false);


    const [
        detailError,
        setDetailError,
    ] = useState("");


    const [
        actionModal,
        setActionModal,
    ] = useState(null);


    const [
        actionLoading,
        setActionLoading,
    ] = useState(false);


    const [
        actionError,
        setActionError,
    ] = useState("");


    const [
        allStatusFilter,
        setAllStatusFilter,
    ] = useState("all");


    const [
        allFromDate,
        setAllFromDate,
    ] = useState("");


    const [
        allToDate,
        setAllToDate,
    ] = useState("");


    const [
        allSearch,
        setAllSearch,
    ] = useState("");


    const [
        plantHeadApi,
        setPlantHeadApi,
    ] = useState(null);


    const [
        reportDownload,
        setReportDownload,
    ] = useState(null);


    useEffect(() => {

        let active = true;

        import("../../api/plantHead")
            .then((module) => {

                if (active) {
                    setPlantHeadApi(module);
                }

            })
            .catch((err) => {

                console.error(
                    "Unable to load Plant Head API:",
                    err
                );

                if (active) {

                    setError(
                        "Plant Head API module could not be loaded."
                    );

                }

            });


        return () => {
            active = false;
        };

    }, []);


    /* ========================================================
       LOAD DASHBOARD
    ======================================================== */

    const loadDashboard = useCallback(
        async () => {

        if (!plantHeadApi) {
            return;
        }


        try {

            setLoading(true);
            setError("");


            const [
                summaryData,
                myData,
                approvalData,
                allData,
                employeesData,
            ] = await Promise.all([

                plantHeadApi.getPlantHeadSummary(),

                plantHeadApi.getPlantHeadImprovements(),

                plantHeadApi.getPlantHeadApprovals(),

                plantHeadApi.getPlantHeadAllImprovements(),

                plantHeadApi.getPlantHeadEmployees(),

            ]);


            setSummary(
                summaryData || {}
            );


            setMyImprovements(
                getList(myData)
            );


            setApprovals(
                getList(approvalData)
            );


            setAllImprovements(
                getList(allData)
            );


            setEmployeeList(
                getList(employeesData)
            );

        }

        catch (err) {

            console.error(
                "Plant Head Dashboard:",
                err
            );


            setError(
                err?.message ||
                "Unable to load Plant Head dashboard."
            );

        }

        finally {

            setLoading(false);

        }

    },
    [plantHeadApi]
);


    useEffect(() => {

        if (!plantHeadApi) {
            return;
        }

        const timerId = setTimeout(() => {
            void loadDashboard();
        }, 0);

        return () => {
            clearTimeout(timerId);
        };

    }, [plantHeadApi, loadDashboard]);


    useEffect(() => {
        if (!plantHeadApi) {
            return;
        }

        let active = true;

        const loadAnalytics = async () => {
            try {
                setAnalyticsLoading(true);
                const data = await plantHeadApi.getPlantHeadAnalytics(analyticsFy);
                if (!active) {
                    return;
                }
                setAnalytics(data || null);
                if (!analyticsFy && data?.selected_fy) {
                    setAnalyticsFy(data.selected_fy);
                }
            } catch (err) {
                console.error("Plant Head Analytics:", err);
                if (active) {
                    setError(err?.message || "Unable to load Plant Head analytics.");
                }
            } finally {
                if (active) {
                    setAnalyticsLoading(false);
                }
            }
        };

        void loadAnalytics();

        return () => {
            active = false;
        };
    }, [plantHeadApi, analyticsFy]);


    const selectedAnalyticsMonth = useMemo(
        () =>
            (analytics?.monthly_summary || []).find((row) => {
                if (!row?.date) {
                    return false;
                }
                const rowDate = new Date(row.date);
                return !Number.isNaN(rowDate.getTime())
                    && rowDate.getMonth() + 1 === analyticsMonth;
            }) || null,
        [analytics, analyticsMonth]
    );

    function scrollToMyImprovements() {

        document.getElementById("my-improvements-list")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });

    }


    /* ========================================================
       FIRST NAME
    ======================================================== */

    const firstName =
        user?.full_name
            ?.split(" ")
            ?. [0] ||

        user?.name
            ?.split(" ")
            ?. [0] ||

        "there";


    /* ========================================================
       CARD VALUES
    ======================================================== */

    const myTotal =
        summary?.my_total ??
        myImprovements.length;


    const myPending =
        summary?.my_pending ??
        myImprovements.filter(
            (item) =>
                [
                    "pending_accounts",
                    "pending_plant_head",
                    "resubmission_required",
                    "resubmit",
                    "resubmission",
                ].includes(
                    normalizeStatus(item)
                )
        ).length;


    const myInProgress =
        summary?.my_in_progress ??
        myImprovements.filter(
            (item) =>
                normalizeStatus(item) ===
                "in_progress"
        ).length;


    const myRejected =
        summary?.my_rejected ??
        myImprovements.filter(
            (item) =>
                normalizeStatus(item) ===
                "rejected"
        ).length;


    const myDone =
        summary?.my_done ??
        myImprovements.filter(
            (item) =>
                ["done", "closed"].includes(
                    normalizeStatus(item)
                )
        ).length;




    const totalAll =
        summary?.total_improvements ??
        allImprovements.length;


    const totalApproved =
        summary?.approved ??
        summary?.accepted ??
        allImprovements.filter(
            (item) =>
                [
                    "approved",
                    "pending_plant_head",
                ].includes(
                    normalizeStatus(item)
                ) ||
                item?.accounts_status ===
                "approved"
        ).length;


    const totalResubmission =
        summary?.resubmission_required ??
        summary?.resubmission ??
        allImprovements.filter(
            (item) =>
                [
                    "resubmission_required",
                    "resubmit",
                    "resubmission",
                ].includes(
                    normalizeStatus(item)
                )
        ).length;


    const totalPending =
        summary?.pending ??
        allImprovements.filter(
            (item) =>
                [
                    "pending_accounts",
                    "pending_plant_head",
                ].includes(
                    normalizeStatus(item)
                )
        ).length;


    const totalProgress =
        summary?.in_progress ??
        allImprovements.filter(
            (item) =>
                normalizeStatus(item) ===
                "in_progress"
        ).length;


    const totalRejected =
        summary?.rejected ??
        allImprovements.filter(
            (item) =>
                normalizeStatus(item) ===
                "rejected"
        ).length;


    const totalDone =
        summary?.done ??
        summary?.closed ??
        allImprovements.filter(
            (item) =>
                [
                    "done",
                    "closed",
                ].includes(
                    normalizeStatus(item)
                )
        ).length;


    /* ========================================================
       FILTER ALL IMPROVEMENTS
    ======================================================== */

    const filteredAllImprovements =
        useMemo(() => {

            const search =
                allSearch
                    .trim()
                    .toLowerCase();


            return allImprovements.filter(
                (item) => {

                    const status =
                        normalizeStatus(item);


                    if (
                        allStatusFilter !== "all" &&
                        status !== allStatusFilter
                    ) {

                        return false;

                    }


                    const itemDate =
                        formatDateInput(
                            item?.created_at ||
                            item?.submitted_at ||
                            item?.updated_at
                        );


                    if (
                        allFromDate &&
                        itemDate &&
                        itemDate < allFromDate
                    ) {

                        return false;

                    }


                    if (
                        allToDate &&
                        itemDate &&
                        itemDate > allToDate
                    ) {

                        return false;

                    }


                    if (search) {

                        const haystack =
                            [
                                getProjectId(item),
                                getUserName(item),
                                item?.department,
                                item?.plant,
                                item?.idea,
                                item?.kaizen_theme,
                            ]
                                .filter(Boolean)
                                .join(" ")
                                .toLowerCase();


                        if (
                            !haystack.includes(
                                search
                            )
                        ) {

                            return false;

                        }

                    }


                    return true;

                }
            );

        }, [
            allImprovements,
            allStatusFilter,
            allFromDate,
            allToDate,
            allSearch,
        ]);


    const benefitChartItems = useMemo(() => {
        const selectedFy =
            analytics?.selected_fy ||
            analyticsFy;

        if (!selectedFy) {
            return [];
        }

        return allImprovements.filter((item) =>
            getFinancialYearLabel(
                item?.kaizen_start ||
                item?.created_at
            ) === selectedFy
        );
    }, [
        allImprovements,
        analytics?.selected_fy,
        analyticsFy,
    ]);


    /* ========================================================
       CREATED
    ======================================================== */

    async function handleImprovementCreated() {

        setShowAddImprovement(false);

        setListRefreshKey((value) => value + 1);

        await loadDashboard();

    }


    /* ========================================================
       VIEW
    ======================================================== */

    async function handleViewImprovement(
        improvementId
    ) {

        if (!improvementId) {
            return;
        }


        try {

            setDetailLoading(true);
            setDetailError("");
            setSelectedImprovement(null);


            const data =
                await getImprovement(
                    improvementId
                );


            setSelectedImprovement(
                data
            );

        }

        catch (err) {

            console.error(
                "Plant Head View:",
                err
            );


            setDetailError(
                err?.message ||
                "Unable to load improvement details."
            );

        }

        finally {

            setDetailLoading(false);

        }

    }


    function closeImprovementDetail() {

        if (detailLoading) {
            return;
        }


        setSelectedImprovement(null);

        setDetailError("");

    }


    /* ========================================================
       SAVE & RESUBMIT IMPROVEMENT
    ======================================================== */

    async function handleSaveEdit(
        payload
    ) {

        if (
            !selectedImprovement?.id
        ) {

            throw new Error(
                "Improvement ID is missing."
            );

        }


        try {

            const updated =
                await resubmitImprovement(
                    selectedImprovement.id,
                    payload
                );


            setSelectedImprovement(
                updated
            );


            await loadDashboard();

        }

        catch (error) {

            console.error(
                "Plant Head Save & Resubmit:",
                error
            );


            throw error;

        }

    }


    async function handleSaveReviewerEdit(payload) {
        if (!selectedImprovement?.id) {
            throw new Error("Improvement ID is missing.");
        }

        await updateReviewerImprovement(
            selectedImprovement.id,
            payload
        );

        const refreshed = await getImprovement(selectedImprovement.id);
        setSelectedImprovement(refreshed);
        await loadDashboard();
    }


    async function handleSaveOwnerEdit(payload) {
        if (!selectedImprovement?.id) {
            throw new Error("Improvement ID is missing.");
        }

        const updated = await updateOwnedImprovement(
            selectedImprovement.id,
            payload
        );

        setSelectedImprovement(updated);
        await loadDashboard();
    }


    /* ========================================================
       ACTION MODAL
    ======================================================== */

    function openAction(
        type,
        item
    ) {

        setActionError("");


        setActionModal({
            type,
            item,
            description: "",
        });

    }


    function closeAction() {

        if (actionLoading) {
            return;
        }


        setActionModal(null);

        setActionError("");

    }


    async function submitAction() {

        if (
            !actionModal?.item?.id
        ) {

            return;

        }


        const {
            type,
            item,
            description,
        } = actionModal;


        if (
            ["reject", "resubmit"].includes(type) &&
            !description.trim()
        ) {

            setActionError(
                "Please enter a rejection reason."
            );

            return;

        }


        try {

            setActionLoading(true);

            setActionError("");


            if (type === "resubmit") {
                await plantHeadApi.requestPlantHeadResubmission(
                    item.id,
                    description.trim()
                );
            }

            else if (
                type === "approve"
            ) {

                await plantHeadApi
                    .approvePlantHeadImprovement(
                        item.id,
                        description.trim() ||
                        null
                    );

            }

            else {

                await plantHeadApi
                    .rejectPlantHeadImprovement(
                        item.id,
                        description.trim()
                    );

            }


            setActionModal(null);


            await loadDashboard();

        }

        catch (err) {

            console.error(
                "Plant Head action:",
                err
            );


            setActionError(
                err?.message ||
                "Unable to complete Plant Head action."
            );

        }

        finally {

            setActionLoading(false);

        }

    }


    /* ========================================================
       PROFILE SCREEN
    ======================================================== */

    if (showProfile) {

        return (
            <Profile
                onBack={() => setShowProfile(false)}
            />
        );

    }


    /* ========================================================
       ADD IMPROVEMENT
    ======================================================== */

    if (showAddImprovement) {

        return (

            <AddImprovement

                draft={draftToEdit}

                onBack={() => {
                    setDraftToEdit(null);
                    setShowAddImprovement(false);
                }}

                onCreated={async () => {
                    setDraftToEdit(null);
                    await handleImprovementCreated();
                }}

            />

        );

    }


    /* ========================================================
       LOADING
    ======================================================== */

    if (
        loading &&
        !myImprovements.length &&
        !allImprovements.length
    ) {

        return (

            <div className="employee-app-shell">
               

                <main className="employee-main">

                    <div className="employee-content">

                        <div className="table-empty-state">

                            <div className="loading-spinner-small" />

                            <span>
                                Loading Plant Head Dashboard...
                            </span>

                        </div>

                    </div>

                </main>

            </div>

        );

    }


    /* ========================================================
       UI
    ======================================================== */

    return (

        <div className="employee-app-shell plant-head-dashboard">
            


            {sidebarOpen && (

                <div
                    className="mobile-sidebar-overlay"
                    onClick={() =>
                        setSidebarOpen(false)
                    }
                />

            )}


            <aside
                className={
                    `employee-sidebar ${
                        sidebarOpen
                            ? "employee-sidebar-open"
                            : ""
                    }`
                }
            >

                <div className="employee-brand dashboard-logo-wrap">
                    <div className="logo-panel nrb-logo-panel">
                        <img src={logo} alt="NRB Industrial Bearings" className="dashboard-logo" />
                    </div>
                </div>


                <button
                    className="sidebar-close-mobile"
                    onClick={() =>
                        setSidebarOpen(false)
                    }
                >
                    <X size={20} />
                </button>


                <nav className="employee-sidebar-nav">

                    <button className="employee-nav-item active">

                        <LayoutDashboard size={18} />

                        <span>
                            Dashboard
                        </span>

                    </button>


                    <button
                        className="employee-nav-item"
                        type="button"
                        onClick={scrollToMyImprovements}
                    >

                        <ClipboardList size={18} />

                        <span>
                            My Improvements
                        </span>

                    </button>


                    <button
                        className="employee-nav-item"
                        onClick={() =>
                            setShowAddImprovement(
                                true
                            )
                        }
                    >

                        <Plus size={19} />

                        <span>
                            Add Improvement
                        </span>

                    </button>


                    <button
                        className="employee-nav-item"
                        type="button"
                        onClick={() => setShowProfile(true)}
                    >

                        <UserCircle size={18} />

                        <span>
                            My Profile
                        </span>

                    </button>

                </nav>


                <div className="employee-sidebar-bottom">

                    <button
                        className="employee-nav-item workspace-item"
                        onClick={() => goToPortal("/")}
                        type="button"
                    >
                        <LayoutGrid size={18} />
                        <span>Workspace</span>
                    </button>

                    <button
                        className="employee-nav-item logout-item"
                        onClick={logout}
                    >

                        <LogOut size={18} />

                        <span>
                            Logout
                        </span>

                    </button>

                </div>

            </aside>


            <main className="employee-main">

                <header className="employee-header">

                    <button
                        className="mobile-menu-button"
                        onClick={() =>
                            setSidebarOpen(true)
                        }
                    >
                        <Menu size={22} />
                    </button>


                    <div className="employee-header-spacer" />


                    <button
                        type="button"
                        className="dashboard-profile-trigger"
                        onClick={() => setShowProfile(true)}
                        aria-label="Open my profile"
                    >

                    <div className="employee-user-area">

                        <div className="employee-avatar">
                            {
                                firstName
                                    ?.charAt(0)
                                    ?.toUpperCase()
                            }
                        </div>


                        <div className="employee-user-info">

                            <strong>
                                {
                                    user?.full_name ||
                                    user?.name ||
                                    "Plant Head"
                                }
                            </strong>

                            <span>
                                Plant Head
                            </span>

                        </div>

                    </div>

                    </button>

                </header>


                <section className="employee-content">


                    <div className="employee-page-heading">

                        <div>

                            <div className="dashboard-heading-eyebrow">

                                <span className="heading-dot" />

                                OIPM DASHBOARD

                            </div>


                            <h1>
                                {firstName}
                            </h1>


                           
                        </div>


                        <button
                            className="primary-action-button"
                            onClick={() =>
                                setShowAddImprovement(
                                    true
                                )
                            }
                        >

                            <Plus size={18} />

                            Add Improvement

                        </button>

                    </div>


                    {error && (

                        <div className="dashboard-error">

                            <div className="dashboard-error-content">

                                <CircleAlert size={17} />

                                <span>
                                    {error}
                                </span>

                            </div>

                        </div>

                    )}


                    {/* ==================================================
                        MY SUMMARY
                    ================================================== */}

                    <div className="plant-head-summary-label">
                        My Improvements
                    </div>


                    <div className="employee-summary-grid plant-head-my-summary-grid">

                        <SummaryCard
                            icon={
                                <ClipboardList
                                    size={21}
                                />
                            }
                            value={myTotal}
                            title="My Total"
                            description="Improvements created by you"
                            type="total"
                        />


                        <SummaryCard
                            icon={
                                <Clock3
                                    size={21}
                                />
                            }
                            value={myPending}
                            title="My Pending"
                            description="Waiting for approval"
                            type="pending"
                        />


                        <SummaryCard
                            icon={
                                <Clock3
                                    size={21}
                                />
                            }
                            value={myInProgress}
                            title="My In Progress"
                            description="Currently active"
                            type="progress"
                        />


                        <SummaryCard
                            icon={
                                <FileX2
                                    size={21}
                                />
                            }
                            value={myRejected}
                            title="My Rejected"
                            description="Needs attention"
                            type="rejected"
                        />


                        <SummaryCard
                            icon={
                                <CheckCircle2
                                    size={21}
                                />
                            }
                            value={myDone}
                            title="My Done"
                            description="Successfully completed"
                            type="done"
                        />

                    </div>


                    {/* ==================================================
                        SYSTEM SUMMARY
                    ================================================== */}

                    <div className="plant-head-summary-label">
                        Overall OIPM
                    </div>


                    <div className="plant-head-overall-grid">

                        


                        <SummaryCard
                            icon={
                                <ClipboardList
                                    size={21}
                                />
                            }
                            value={totalAll}
                            title="All Improvements"
                            description="Every improvement record"
                            type="total"
                        />


                        <SummaryCard
                            icon={
                                <CheckCircle2
                                    size={21}
                                />
                            }
                            value={totalApproved}
                            title="Approved"
                            description="Accepted improvements"
                            type="done"
                        />


                        <SummaryCard
                            icon={
                                <RotateCcw
                                    size={21}
                                />
                            }
                            value={totalResubmission}
                            title="Resubmission"
                            description="Returned for correction"
                            type="pending"
                        />


                        <SummaryCard
                            icon={
                                <Clock3
                                    size={21}
                                />
                            }
                            value={totalPending}
                            title="Pending"
                            description="Awaiting the next approval"
                            type="pending"
                        />


                        <SummaryCard
                            icon={
                                <Clock3
                                    size={21}
                                />
                            }
                            value={totalProgress}
                            title="In Progress"
                            description="Currently active"
                            type="progress"
                        />


                        <SummaryCard
                            icon={
                                <FileX2
                                    size={21}
                                />
                            }
                            value={totalRejected}
                            title="Rejected"
                            description="Rejected improvements"
                            type="rejected"
                        />


                        <SummaryCard
                            icon={
                                <CheckCircle2
                                    size={21}
                                />
                            }
                            value={totalDone}
                            title="Done"
                            description="Successfully closed"
                            type="done"
                        />

                    </div>



                    {/* ==================================================
                        PLANT HEAD PERFORMANCE ANALYTICS
                    ================================================== */}

                    <section className="plant-head-analytics-section">
                        <div className="plant-head-summary-label">
                            OIPM Performance
                        </div>

                        <div className="plant-head-analytics-kpi-grid">
                            <SavingsKpiCard
                                icon={<ClipboardList size={22} />}
                                type="monthly"
                                primaryTitle="Monthly Saving Proposed"
                                primaryValue={selectedAnalyticsMonth ? formatCurrency(selectedAnalyticsMonth.monthly_saving_proposed) : "—"}
                                secondaryTitle="Monthly Saving Validated by Accounts"
                                secondaryValue={selectedAnalyticsMonth ? formatCurrency(selectedAnalyticsMonth.monthly_saving_validated) : "—"}
                                fy={analyticsFy}
                                fyOptions={analytics?.fy_options || []}
                                onFyChange={setAnalyticsFy}
                                month={analyticsMonth}
                                onMonthChange={setAnalyticsMonth}
                                showMonth
                            />

                            <SavingsKpiCard
                                icon={<CheckCircle2 size={22} />}
                                type="annual"
                                primaryTitle="Annualized Saving Proposed"
                                primaryValue={analytics?.kpis ? formatCurrency(analytics.kpis.annual_saving_proposed) : "—"}
                                secondaryTitle="Annualized Saving Validated by Accounts"
                                secondaryValue={analytics?.kpis ? formatCurrency(analytics.kpis.annual_saving_validated) : "—"}
                                fy={analyticsFy}
                                fyOptions={analytics?.fy_options || []}
                                onFyChange={setAnalyticsFy}
                            />
                        </div>

                        {analyticsLoading && !analytics ? (
                            <div className="plant-head-analytics-loading">
                                <div className="loading-spinner-small" />
                                <span>Loading FY analytics...</span>
                            </div>
                        ) : (
                            <>
                                <section className="plant-head-analytics-panel">
                                    <div className="plant-head-analytics-header">
                                        <div>
                                            <h2>
                                                {`Month-wise Summary — ${analytics?.selected_fy || analyticsFy || "Current FY"}`}
                                            </h2>
                                            <p>
                                                Monthly OIPM volume and savings. Finance validation is counted only after Accounts approval.
                                            </p>
                                        </div>

                                        <div className="dashboard-panel-header-actions">
                                            <FySelect
                                                value={analyticsFy}
                                                options={analytics?.fy_options || []}
                                                onChange={setAnalyticsFy}
                                                label="Financial Year"
                                            />

                                            <button
                                                type="button"
                                                className="dashboard-list-toggle"
                                                onClick={() => setMonthwiseSummaryCollapsed((value) => !value)}
                                                aria-expanded={!monthwiseSummaryCollapsed}
                                                aria-label={
                                                    monthwiseSummaryCollapsed
                                                        ? "Expand Month-wise Summary"
                                                        : "Collapse Month-wise Summary"
                                                }
                                            >
                                                {monthwiseSummaryCollapsed
                                                    ? <ChevronDown size={15} />
                                                    : <ChevronUp size={15} />}
                                                {monthwiseSummaryCollapsed ? "Expand" : "Collapse"}
                                            </button>
                                        </div>
                                    </div>

                                    {monthwiseSummaryCollapsed ? (
                                        <div className="dashboard-list-collapsed">
                                            Monthwise Summary is collapsed. Click Expand to view it.
                                        </div>
                                    ) : (
                                        <MonthwiseSummaryTable rows={analytics?.monthly_summary || []} />
                                    )}
                                </section>

                                <section className="plant-head-analytics-panel">
                                    <div className="plant-head-analytics-header">
                                        <div>
                                            <h2>
                                                {`Top 3 Cost-Saving OIPMs — ${analytics?.selected_fy || analyticsFy || "Current FY"}`}
                                            </h2>
                                            <p>
                                                Highest proposed monthly saving for each month.
                                            </p>
                                        </div>

                                        <div className="dashboard-panel-header-actions">
                                            <FySelect
                                                value={analyticsFy}
                                                options={analytics?.fy_options || []}
                                                onChange={setAnalyticsFy}
                                                label="Financial Year"
                                            />

                                            <button
                                                type="button"
                                                className="dashboard-list-toggle"
                                                onClick={() => setTopProjectsCollapsed((value) => !value)}
                                                aria-expanded={!topProjectsCollapsed}
                                                aria-label={
                                                    topProjectsCollapsed
                                                        ? "Expand Top 3 Cost-Saving OIPMs"
                                                        : "Collapse Top 3 Cost-Saving OIPMs"
                                                }
                                            >
                                                {topProjectsCollapsed
                                                    ? <ChevronDown size={15} />
                                                    : <ChevronUp size={15} />}
                                                {topProjectsCollapsed ? "Expand" : "Collapse"}
                                            </button>
                                        </div>
                                    </div>

                                    {topProjectsCollapsed ? (
                                        <div className="dashboard-list-collapsed">
                                            Top 3 Cost-Saving OIPMs is collapsed. Click Expand to view it.
                                        </div>
                                    ) : (
                                        <TopProjectsTable rows={analytics?.top_projects || []} />
                                    )}
                                </section>

                                <div className="plant-head-chart-grid">
                                    <AnalyticsBarChart
                                        title="OIPMs Received by Month"
                                        description="Number of OIPMs received in each month."
                                        rows={analytics?.monthly_summary || []}
                                        series={[{
                                            key: "oipms_received",
                                            label: "OIPMs Received",
                                            className: "chart-bar-received",
                                        }]}
                                        valueFormatter={(value) => `${Number(value || 0).toLocaleString("en-IN")} OIPMs`}
                                    />
                                    <AnalyticsBarChart
                                        title="Monthly Saving — Proposed vs Validated"
                                        description="Monthly savings compared side by side."
                                        rows={analytics?.monthly_summary || []}
                                        series={[
                                            {
                                                key: "monthly_saving_proposed",
                                                label: "Proposed",
                                                className: "chart-bar-proposed",
                                            },
                                            {
                                                key: "monthly_saving_validated",
                                                label: "Validated",
                                                className: "chart-bar-validated",
                                            },
                                        ]}
                                    />
                                    <AnalyticsBarChart
                                        title="FY Saving — Proposed vs Validated"
                                        description="Savings applicable within the selected April–March financial year."
                                        rows={analytics?.monthly_summary || []}
                                        series={[
                                            {
                                                key: "annualized_saving_proposed",
                                                label: "Proposed",
                                                className: "chart-bar-proposed",
                                            },
                                            {
                                                key: "annualized_saving_validated",
                                                label: "Validated",
                                                className: "chart-bar-validated",
                                            },
                                        ]}
                                    />
                                    <BenefitPieChart
                                        items={benefitChartItems}
                                        selectedFy={analytics?.selected_fy || analyticsFy}
                                    />
                                </div>
                            </>
                        )}
                    </section>

                    {/* ==================================================
                        ALL IMPROVEMENTS
                    ================================================== */}
                    {/* ==================================================
                        ALL IMPROVEMENTS
                    ================================================== */}

                    <section className="plant-head-panel">

                        <div className="plant-head-panel-header">

                            <div>

                                <h2>
                                    All Improvements
                                </h2>

                               
                            </div>


                            <div className="dashboard-panel-header-actions">
                                <div className="plant-head-count">

                                    <ClipboardList
                                        size={14}
                                    />

                                    <span>
                                        {
                                            filteredAllImprovements.length
                                        }
                                    </span>

                                </div>

                                <button
                                    type="button"
                                    className="dashboard-list-toggle"
                                    onClick={() => setAllImprovementsCollapsed((value) => !value)}
                                    aria-expanded={!allImprovementsCollapsed}
                                    aria-label={allImprovementsCollapsed ? "Expand All Improvements" : "Collapse All Improvements"}
                                >
                                    {allImprovementsCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                                    {allImprovementsCollapsed ? "Expand" : "Collapse"}
                                </button>
                            </div>

                        </div>


                        <div className="plant-head-filters">

                            <div className="plant-head-filter-search">

                                <label>
                                    Search
                                </label>

                                <input
                                    type="text"
                                    value={
                                        allSearch
                                    }
                                    onChange={
                                        (event) =>
                                            setAllSearch(
                                                event.target.value
                                            )
                                    }
                                    placeholder="ID, employee, department, plant..."
                                />

                            </div>


                            <div>

                                <label>
                                    Status
                                </label>

                                <select
                                    value={
                                        allStatusFilter
                                    }
                                    onChange={
                                        (event) =>
                                            setAllStatusFilter(
                                                event.target.value
                                            )
                                    }
                                >

                                    <option value="all">
                                        All Statuses
                                    </option>

                                    <option value="pending_accounts">
                                        Pending Accounts
                                    </option>

                                    <option value="pending_plant_head">
                                        Pending Plant Head
                                    </option>

                                    <option value="in_progress">
                                        In Progress
                                    </option>

                                    <option value="resubmission_required">
                                        Resubmission
                                    </option>

                                    <option value="rejected">
                                        Rejected
                                    </option>

                                    <option value="closed">
                                        Done / Closed
                                    </option>

                                    <option value="done">
                                        Done
                                    </option>

                                </select>

                            </div>


                            <div>

                                <label>
                                    From Date
                                </label>

                                <input
                                    type="date"
                                    value={
                                        allFromDate
                                    }
                                    onChange={
                                        (event) =>
                                            setAllFromDate(
                                                event.target.value
                                            )
                                    }
                                />

                            </div>


                            <div>

                                <label>
                                    To Date
                                </label>

                                <input
                                    type="date"
                                    value={
                                        allToDate
                                    }
                                    onChange={
                                        (event) =>
                                            setAllToDate(
                                                event.target.value
                                            )
                                    }
                                />

                            </div>


                            <button
                                type="button"
                                className="plant-head-clear-filter"
                                onClick={() => {

                                    setAllStatusFilter(
                                        "all"
                                    );

                                    setAllFromDate(
                                        ""
                                    );

                                    setAllToDate(
                                        ""
                                    );

                                    setAllSearch(
                                        ""
                                    );

                                }}
                            >

                                <Filter
                                    size={14}
                                />

                                Clear

                            </button>

                        </div>


                        {allImprovementsCollapsed ? (
                            <div className="dashboard-list-collapsed">
                                All Improvements list is collapsed. Click Expand to view it.
                            </div>
                        ) : (
                        <div className="plant-head-table-wrapper">

                            {
                                filteredAllImprovements.length ===
                                0
                                    ? (

                                        <div className="plant-head-empty-state">

                                            <ClipboardList
                                                size={27}
                                            />

                                            <h3>
                                                No improvements found
                                            </h3>

                                            <p>
                                                Try changing the filter or search criteria.
                                            </p>

                                        </div>

                                    )
                                    : (

                                        <table className="plant-head-table plant-head-all-improvements-table">

                                            <thead>

                                                <tr>

                                                    <th>Month</th>

                                                    <th>FY</th>

                                                    <th>Staff Name</th>

                                                    <th>Department</th>

                                                    <th>OIPM ID</th>

                                                    <th>Investment Required</th>

                                                    <th>Monthly Cost Saving Proposed</th>

                                                    <th>FY Saving Proposed</th>

                                                    <th>Payback Period</th>

                                                    <th>Verified By</th>

                                                    <th>Status</th>

                                                    <th>Action</th>

                                                </tr>

                                            </thead>


                                            <tbody>

                                                {
                                                    filteredAllImprovements.map(
                                                        (item) => (

                                                            <tr
                                                                key={
                                                                    item.id
                                                                }
                                                            >

                                                                <td>
                                                                    {getMonthLabel(item?.kaizen_start || item?.created_at)}
                                                                </td>

                                                                <td>
                                                                    {getFinancialYearLabel(item?.kaizen_start || item?.created_at)}
                                                                </td>

                                                                <td>
                                                                    <strong>{getUserName(item)}</strong>
                                                                </td>

                                                                <td>
                                                                    {item?.department || "—"}
                                                                </td>

                                                                <td>
                                                                    <strong>{getProjectId(item)}</strong>
                                                                </td>

                                                                <td>
                                                                    {String(item?.investment_required || "").toLowerCase() === "yes"
                                                                        ? formatCurrency(item?.investment_amount)
                                                                        : "—"}
                                                                </td>

                                                                <td>
                                                                    {formatCurrency(item?.total_monthly_saving)}
                                                                </td>

                                                                <td>
                                                                    {formatCurrency(
                                                                        getApplicableAnnualSaving(
                                                                            item?.kaizen_start,
                                                                            item?.cost_saving_items || []
                                                                        ) || item?.annualized_saving
                                                                    )}
                                                                </td>

                                                                <td>
                                                                    {item?.payback_period || "—"}
                                                                </td>

                                                                <td>
                                                                    {item?.accounts_verified_by
                                                                        ? (employeeList.find((employee) => String(employee.id) === String(item.accounts_verified_by))?.full_name || "Verified")
                                                                        : "Pending"}
                                                                </td>

                                                                <td>
                                                                    <StatusBadge item={item} />
                                                                </td>


                                                                <td>

                                                                    <div className="plant-head-actions">

                                                                        <button
                                                                            className="plant-head-icon-button"
                                                                            title="View improvement"
                                                                            onClick={() =>
                                                                                handleViewImprovement(
                                                                                    item.id
                                                                                )
                                                                            }
                                                                        >

                                                                            <Eye
                                                                                size={
                                                                                    15
                                                                                }
                                                                            />

                                                                        </button>


                                                                        <button
                                                                            className="plant-head-download-button plant-head-word-button"
                                                                            title="Download complete Word report"
                                                                            onClick={() =>
                                                                                setReportDownload({improvement: item,reportType: "word",}
                                                                                    
                                                                                )
                                                                            }
                                                                        >

                                                                            <Download
                                                                                size={
                                                                                    14
                                                                                }
                                                                            />

                                                                            Word

                                                                        </button>


                                                                        <button
                                                                            className="plant-head-download-button plant-head-excel-button"
                                                                            title="Download complete Excel report"
                                                                            onClick={() =>
                                                                                setReportDownload({improvement: item,reportType: "excel",}
                                                                                    
                                                                                )
                                                                            }
                                                                        >

                                                                            <Download
                                                                                size={
                                                                                    14
                                                                                }
                                                                            />

                                                                            Excel

                                                                        </button>

                                                                    </div>

                                                                </td>

                                                            </tr>

                                                        )
                                                    )
                                                }

                                            </tbody>

                                        </table>

                                    )
                            }

                        </div>
                        )}

                    </section>



                    {/* ==================================================
                        MY IMPROVEMENTS
                    ================================================== */}

                    <PlantHeadList
                        sectionId="my-improvements-list"
                        title="My Improvements"
                        
                        count={
                            myImprovements.length
                        }
                        items={
                            myImprovements
                        }
                        emptyTitle="No improvements created"
                        emptyDescription="Create your first improvement to see it here."
                        onView={
                            handleViewImprovement
                        }
                        allowActions={false}
                        collapsed={myImprovementsCollapsed}
                        onToggle={() => setMyImprovementsCollapsed((value) => !value)}
                    />


                    {/* ==================================================
                        FOR APPROVAL
                    ================================================== */}

                    <PlantHeadList
                        title="Improvements Waiting For Your Approval"
                        
                        count={
                            approvals.length
                        }
                        items={
                            approvals
                        }
                        emptyTitle="No approvals pending"
                        emptyDescription="There are no improvements waiting for your approval."
                        onView={
                            handleViewImprovement
                        }
                        allowActions
                        collapsed={approvalsCollapsed}
                        onToggle={() => setApprovalsCollapsed((value) => !value)}
                        onApprove={
                            (item) =>
                                openAction(
                                    "approve",
                                    item
                                )
                        }
                        onReject={
                            (item) =>
                                openAction(
                                    "reject",
                                    item
                                )
                        }
                        onResubmit={
                            (item) =>
                                openAction(
                                    "resubmit",
                                    item
                                )
                        }
                    />


                    {/* ==================================================
                        ALL EMPLOYEES
                    ================================================== */}

                    <section className="plant-head-panel">

                        <div className="plant-head-panel-header">

                            <div>

                                <h2>
                                    All Employees
                                </h2>

                             

                            </div>


                            <div className="dashboard-panel-header-actions">
                                <div className="plant-head-count">

                                    <Users size={14} />

                                    <span>
                                        {employeeList.length}
                                    </span>

                                </div>

                                <button
                                    type="button"
                                    className="dashboard-list-toggle"
                                    onClick={() => setEmployeesCollapsed((value) => !value)}
                                    aria-expanded={!employeesCollapsed}
                                    aria-label={employeesCollapsed ? "Expand All Employees" : "Collapse All Employees"}
                                >
                                    {employeesCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                                    {employeesCollapsed ? "Expand" : "Collapse"}
                                </button>
                            </div>

                        </div>


                        <div className="plant-head-table-wrapper">

                            {
                                employeeList.length === 0

                                    ? (

                                        <div className="plant-head-empty-state">

                                            <Users size={27} />

                                            <h3>
                                                No employees found
                                            </h3>

                                            <p>
                                                No active employees are currently available.
                                            </p>

                                        </div>

                                    )

                                    : (

                                        employeesCollapsed ? (
                                            <div className="dashboard-list-collapsed">
                                                All Employees list is collapsed. Click Expand to view it.
                                            </div>
                                        ) : (
                                        <table className="plant-head-table plant-head-employee-table">

                                            <thead>

                                                <tr>

                                                    <th>
                                                        Name
                                                    </th>

                                                    <th>
                                                        Employee Code
                                                    </th>

                                                    <th>
                                                        Email
                                                    </th>

                                                </tr>

                                            </thead>


                                            <tbody>

                                                {
                                                    employeeList.map(
                                                        (employee) => (

                                                            <tr
                                                                key={
                                                                    employee.id
                                                                }
                                                            >

                                                                <td>

                                                                    <strong>
                                                                        {
                                                                            employee.full_name ||
                                                                            employee.name ||
                                                                            "-"
                                                                        }
                                                                    </strong>

                                                                </td>


                                                                <td>
                                                                    {
                                                                        employee.employee_code ||
                                                                        "-"
                                                                    }
                                                                </td>


                                                                <td>
                                                                    {
                                                                        employee.email ||
                                                                        "-"
                                                                    }
                                                                </td>

                                                            </tr>

                                                        )
                                                    )
                                                }

                                            </tbody>

                                        </table>
                                        )
                                    )
                            }

                        </div>

                    </section>


                </section>

            <div className="employee-content dashboard-lists-container">
            <Lists
            showAll={false}
            refreshKey={listRefreshKey}
            onOpenDraft={(draft) => {
                setDraftToEdit(draft);
                setShowAddImprovement(true);
            }}
        />
            </div>

        </main>


            {/* ====================================================
                REPORT DOWNLOAD
            ==================================================== */}

            {reportDownload && (
                <ReportDownload
                    improvement={
                        reportDownload.improvement
                    }
                    reportType={
                        reportDownload.reportType
                    }
                    onClose={() =>
                        setReportDownload(null)
                    }
                />
            )}


            {/* ====================================================
                VIEW IMPROVEMENT
            ==================================================== */}

            {
                (
                    detailLoading ||
                    detailError ||
                    selectedImprovement
                ) && (

                    <div
                        className="improvement-detail-overlay"
                        onClick={
                            closeImprovementDetail
                        }
                    >

                        <div
                            className="improvement-detail-modal"
                            onClick={
                                (event) =>
                                    event.stopPropagation()
                            }
                        >

                            <div className="improvement-detail-header">

                                <div>

                                    <span className="improvement-detail-eyebrow">
                                        IMPROVEMENT RECORD
                                    </span>

                                    <h2>

                                        {
                                            selectedImprovement?.project_id ||
                                            "Improvement Details"
                                        }

                                    </h2>

                                </div>


                                <button
                                    className="improvement-detail-close"
                                    onClick={
                                        closeImprovementDetail
                                    }
                                >

                                    <X
                                        size={20}
                                    />

                                </button>

                            </div>


                            {
                                detailLoading && (

                                    <div className="improvement-detail-loading">

                                        <div className="loading-spinner-small" />

                                        <span>
                                            Loading improvement details...
                                        </span>

                                    </div>

                                )
                            }


                            {
                                detailError &&
                                !detailLoading && (

                                    <div className="improvement-detail-error">

                                        <CircleAlert
                                            size={18}
                                        />

                                        <span>
                                            {
                                                detailError
                                            }
                                        </span>

                                    </div>

                                )
                            }


                            {
                                selectedImprovement &&
                                !detailLoading && (

                                    <ViewImprovement
                                        improvement={
                                            selectedImprovement
                                        }
                                        onClose={
                                            closeImprovementDetail
                                        }
                                        editableOnResubmission={
                                            true
                                        }
                                        onSaveEdit={
                                            handleSaveEdit
                                        }
                                        ownerEditEnabled={
                                            String(
                                                selectedImprovement?.employee_id ||
                                                ""
                                            ) ===
                                            String(
                                                user?.id ||
                                                ""
                                            )
                                        }
                                        onSaveOwnerEdit={
                                            handleSaveOwnerEdit
                                        }
                                        reviewerEditEnabled={
                                            [
                                                "pending_plant_head",
                                                "pending_plant_head_final",
                                            ].includes(
                                                String(
                                                    selectedImprovement?.status ||
                                                    ""
                                                ).toLowerCase()
                                            )
                                        }
                                        onSaveReviewerEdit={
                                            handleSaveReviewerEdit
                                        }
                                    />

                                )
                            }

                        </div>

                    </div>

                )
            }


            {/* ====================================================
                APPROVE / REJECT MODAL
            ==================================================== */}

            {
                actionModal && (

                    <div
                        className="plant-head-action-overlay"
                        onClick={
                            closeAction
                        }
                    >

                        <div
                            className="plant-head-action-modal"
                            onClick={
                                (event) =>
                                    event.stopPropagation()
                            }
                        >

                            <div className="plant-head-action-header">

                                <div>

                                    <span>
                                        PLANT HEAD REVIEW
                                    </span>

                                    <h2>

                                        {
                                            actionModal.type === "approve"
                                                ? "Approve Improvement"
                                                : actionModal.type === "resubmit"
                                                    ? "Request Resubmission"
                                                    : "Reject Improvement"
                                        }

                                    </h2>

                                </div>


                                <button
                                    type="button"
                                    className="plant-head-close-button"
                                    onClick={
                                        closeAction
                                    }
                                >

                                    <X
                                        size={19}
                                    />

                                </button>

                            </div>


                            <div className="plant-head-action-content">

                                <div className="plant-head-project-card">

                                    <span>
                                        Improvement
                                    </span>

                                    <strong>
                                        {
                                            getProjectId(
                                                actionModal.item
                                            )
                                        }
                                    </strong>

                                </div>


                                {
                                    ["reject", "resubmit"].includes(actionModal.type) && (

                                        <div className="plant-head-action-field">

                                            <label>
                                                {actionModal.type === "resubmit" ? "Resubmission Remarks" : "Rejection Remarks"}
                                            </label>

                                            <textarea
                                                value={
                                                    actionModal.description
                                                }
                                                onChange={
                                                    (event) =>
                                                        setActionModal(
                                                            (previous) => ({
                                                                ...previous,
                                                                description:
                                                                    event.target.value,
                                                            })
                                                        )
                                                }
                                                placeholder={actionModal.type === "resubmit" ? "Enter the changes required..." : "Enter the reason for rejection..."}
                                                rows="5"
                                            />

                                        </div>

                                    )
                                }


                                {
                                    actionError && (

                                        <div className="plant-head-action-error">

                                            <CircleAlert
                                                size={16}
                                            />

                                            <span>
                                                {
                                                    actionError
                                                }
                                            </span>

                                        </div>

                                    )
                                }

                            </div>


                            <div className="plant-head-action-buttons">

                                <button
                                    type="button"
                                    className="plant-head-cancel-button"
                                    onClick={
                                        closeAction
                                    }
                                    disabled={
                                        actionLoading
                                    }
                                >
                                    Cancel
                                </button>


                                <button
                                    type="button"
                                    className={
                                        actionModal.type === "approve"
                                            ? "plant-head-confirm-button plant-head-confirm-approve"
                                            : actionModal.type === "resubmit"
                                                ? "plant-head-confirm-button plant-head-confirm-reject"
                                                : "plant-head-confirm-button plant-head-confirm-reject"
                                    }
                                    onClick={
                                        submitAction
                                    }
                                    disabled={
                                        actionLoading
                                    }
                                >

                                    {
                                        actionLoading

                                            ? "Processing..."

                                            : actionModal.type === "approve"
                                                ? "Confirm Approve"
                                                : actionModal.type === "resubmit"
                                                    ? "Confirm Resubmit"
                                                    : "Confirm Reject"
                                    }

                                </button>

                            </div>

                        </div>

                    </div>

                )
            }

        </div>

    );

}


/* ============================================================
   REUSABLE LIST
============================================================ */

function PlantHeadList({
    sectionId,
    title,
    description,
    count,
    items,
    emptyTitle,
    emptyDescription,
    onView,
    allowActions = false,
    collapsed = false,
    onToggle,
    onApprove,
    onReject,
    onResubmit,
}) {

    return (

        <section className="plant-head-panel" id={sectionId}>

            <div className="plant-head-panel-header">

                <div>

                    <h2>
                        {title}
                    </h2>

                    <p>
                        {description}
                    </p>

                </div>


                <div className="dashboard-panel-header-actions">
                    <div className="plant-head-count">

                        <ClipboardList
                            size={14}
                        />

                        <span>
                            {count}
                        </span>

                    </div>

                    {onToggle && (
                        <button
                            type="button"
                            className="dashboard-list-toggle"
                            onClick={onToggle}
                            aria-expanded={!collapsed}
                            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
                        >
                            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                            {collapsed ? "Expand" : "Collapse"}
                        </button>
                    )}
                </div>

            </div>


            {collapsed ? (
                <div className="dashboard-list-collapsed">
                    {title} list is collapsed. Click Expand to view it.
                </div>
            ) : (

            <div className="plant-head-table-wrapper">

                {
                    items.length === 0

                        ? (

                            <div className="plant-head-empty-state">

                                <ClipboardList
                                    size={27}
                                />

                                <h3>
                                    {emptyTitle}
                                </h3>

                                <p>
                                    {emptyDescription}
                                </p>

                            </div>

                        )

                        : (

                            <table className="plant-head-table">

                                <thead>

                                    <tr>

                                        <th>
                                            Improvement ID
                                        </th>

                                        <th>
                                            User Name
                                        </th>

                                        <th>
                                            Department
                                        </th>

                                        <th>
                                            Plant
                                        </th>

                                        <th>
                                            Status
                                        </th>

                                        <th>
                                            Action
                                        </th>

                                    </tr>

                                </thead>


                                <tbody>

                                    {
                                        items.map(
                                            (item) => (

                                                <tr
                                                    key={
                                                        item.id
                                                    }
                                                >

                                                    <td>

                                                        <strong>
                                                            {
                                                                getProjectId(
                                                                    item
                                                                )
                                                            }
                                                        </strong>

                                                    </td>


                                                    <td>
                                                        {
                                                            getUserName(
                                                                item
                                                            )
                                                        }
                                                    </td>


                                                    <td>
                                                        {
                                                            item.department ||
                                                            "-"
                                                        }
                                                    </td>


                                                    <td>
                                                        {
                                                            item.plant ||
                                                            "-"
                                                        }
                                                    </td>


                                                    <td>

                                                        <StatusBadge
                                                            item={
                                                                item
                                                            }
                                                        />

                                                    </td>


                                                    <td>

                                                        <div className="plant-head-actions">

                                                            <button
                                                                className="plant-head-icon-button"
                                                                title="View improvement"
                                                                onClick={() =>
                                                                    onView(
                                                                        item.id
                                                                    )
                                                                }
                                                            >

                                                                <Eye
                                                                    size={
                                                                        15
                                                                    }
                                                                />

                                                            </button>


                                                            {
                                                                allowActions && (

                                                                    <>

                                                                        <button
                                                                            className="plant-head-inline-button plant-head-approve-button"
                                                                            onClick={() =>
                                                                                onApprove(
                                                                                    item
                                                                                )
                                                                            }
                                                                        >
                                                                            {item?.status === "pending_plant_head_final" ? "Final Approval" : "Approve to Start"}
                                                                        </button>


                                                                        <button
                                                                            className="plant-head-inline-button plant-head-resubmit-button"
                                                                            onClick={() =>
                                                                                onResubmit(
                                                                                    item
                                                                                )
                                                                            }
                                                                        >
                                                                            Resubmit
                                                                        </button>


                                                                        <button
                                                                            className="plant-head-inline-button plant-head-reject-button"
                                                                            onClick={() =>
                                                                                onReject(
                                                                                    item
                                                                                )
                                                                            }
                                                                        >
                                                                            Reject
                                                                        </button>

                                                                    </>

                                                                )
                                                            }

                                                        </div>

                                                    </td>

                                                </tr>

                                            )
                                        )
                                    }

                                </tbody>

                            </table>

                        )
                }
                

            </div>

            )}

        </section>

    );

}