import { useEffect, useState } from "react";
import {
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Eye,
    RefreshCw,
    Trash2,
} from "lucide-react";

import {
    deleteDraft,
    getAllImprovementsReference,
    getDrafts,
    getImprovementReference,
} from "../api/improvements";

import ViewImprovement from "../pages/improvements/ViewImprovement.jsx";
import "./List.css";

const BENEFITS = {
    P: "P – Productivity",
    Q: "Q – Quality",
    C: "C – Cost",
    D: "D – Delivery",
    S: "S – Safety",
    M: "M – Morale",
};

const ACTIVITIES = {
    JH: "JH – Autonomous Maintenance",
    PM: "PM – Planned Maintenance",
    KK: "KK – Focused Improvement",
    QM: "QM – Quality Maintenance",
    DM: "DM – Early Equipment Management",
    "E&T": "E&T – Training and Education",
    SHE: "SHE – Safety, Health & Environment",
    OTPM: "OTPM – Office TPM / Administration",
};

function values(value) {
    if (Array.isArray(value)) return value;

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return [];
    }

    return [value];
}

function firstLabel(value, map) {
    const first = values(value)[0];

    return first
        ? map[first] || first
        : "-";
}

function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function getStatusType(status) {
    const normalized = String(status || "")
        .toLowerCase()
        .trim();

    if (
        normalized === "closed" ||
        normalized === "completed" ||
        normalized === "complete"
    ) {
        return "done";
    }

    if (normalized.includes("reject")) {
        return "rejected";
    }

    if (normalized.includes("resubmission")) {
        return "resubmission";
    }

    if (
        normalized === "pending" ||
        normalized.startsWith("pending_")
    ) {
        return "pending";
    }

    return "progress";
}

function getStatusLabel(status) {
    const normalized = String(status || "")
        .toLowerCase()
        .trim();

    if (
        normalized === "closed" ||
        normalized === "completed" ||
        normalized === "complete"
    ) {
        return "Completed";
    }

    if (normalized.includes("reject")) {
        return "Rejected";
    }

    if (normalized.includes("resubmission")) {
        return "Resubmission";
    }

    if (normalized.startsWith("pending_")) {
        return normalized
            .replace("pending_", "")
            .split("_")
            .map(
                (word) =>
                    word.charAt(0).toUpperCase() +
                    word.slice(1)
            )
            .join(" ");
    }

    if (normalized === "pending") {
        return "Pending";
    }

    return status || "-";
}

function ListHeader({
    eyebrow,
    title,
    description,
    count,
    collapsed,
    onToggle,
    onRefresh,
}) {
    return (
        <div className="employee-panel-header">
            <div>
                <span className="dashboard-list-eyebrow">
                    {eyebrow}
                </span>

                <h2>
                    <ClipboardList size={16} />
                    {title}
                </h2>

                <p>{description}</p>
            </div>

            <div className="dashboard-panel-header-actions">
                <div className="panel-header-count">
                    <ClipboardList size={14} />
                    <span>{count}</span>
                </div>

                <button
                    type="button"
                    className="dashboard-list-refresh"
                    onClick={onRefresh}
                    title={`Refresh ${title}`}
                    aria-label={`Refresh ${title}`}
                >
                    <RefreshCw size={15} />
                </button>

                <button
                    type="button"
                    className="dashboard-list-toggle"
                    onClick={onToggle}
                    aria-expanded={!collapsed}
                    aria-label={
                        collapsed
                            ? `Expand ${title}`
                            : `Collapse ${title}`
                    }
                >
                    {collapsed ? (
                        <ChevronDown size={15} />
                    ) : (
                        <ChevronUp size={15} />
                    )}

                    {collapsed ? "Expand" : "Collapse"}
                </button>
            </div>
        </div>
    );
}

export function DraftsList({
    onOpenDraft,
    refreshKey = 0,
}) {
    const [drafts, setDrafts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [collapsed, setCollapsed] = useState(false);

    const load = async () => {
        try {
            setLoading(true);
            setError("");

            const data = await getDrafts();

            setDrafts(
                Array.isArray(data)
                    ? data
                    : data?.items || []
            );
        } catch (err) {
            setError(
                err?.message ||
                    "Unable to load drafts."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timerId = setTimeout(() => {
            void load();
        }, 0);

        return () => clearTimeout(timerId);
    }, [refreshKey]);

    const remove = async (id) => {
        if (
            !window.confirm(
                "Delete this draft?"
            )
        ) {
            return;
        }

        try {
            await deleteDraft(id);
            await load();
        } catch (err) {
            setError(
                err?.message ||
                    "Unable to delete draft."
            );
        }
    };

    return (
        <section className="employee-panel dashboard-reference-list">
            <ListHeader
                
                title="Drafts"
                count={drafts.length}
                collapsed={collapsed}
                onToggle={() =>
                    setCollapsed(
                        (value) => !value
                    )
                }
                onRefresh={() => void load()}
            />

            {collapsed ? (
                <div className="dashboard-list-collapsed">
                    Click
                    Expand to view it.
                </div>
            ) : loading ? (
                <div className="table-empty-state">
                    Loading drafts...
                </div>
            ) : error ? (
                <div className="table-empty-state">
                    {error}
                </div>
            ) : drafts.length === 0 ? (
                <div className="table-empty-state">
                    No saved drafts.
                </div>
            ) : (
                <div className="employee-table-wrapper">
                    <table className="employee-improvements-table dashboard-reference-table">
                        <thead>
                            <tr>
                                <th>Saved</th>
                                <th>Machine Name</th>
                                <th>Activity</th>
                                <th>Benefit</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {drafts.map((draft) => {
                                const data =
                                    draft.payload || {};

                                return (
                                    <tr
                                        key={draft.id}
                                        className="draft-list-row"
                                    >
                                        <td>
                                            <div className="improvement-id-cell">
                                                <div className="improvement-id-icon">
                                                    <ClipboardList
                                                        size={15}
                                                    />
                                                </div>

                                                <div>
                                                    <strong>
                                                        Saved
                                                    </strong>

                                                    <small>
                                                        {formatDate(
                                                            draft.updated_at
                                                        )}
                                                    </small>
                                                </div>
                                            </div>
                                        </td>

                                        <td>
                                            <span className="list-primary-text">
                                                {data.machine ||
                                                    "-"}
                                            </span>
                                        </td>

                                        <td>
                                            <span className="list-activity-text">
                                                {firstLabel(
                                                    data.activity,
                                                    ACTIVITIES
                                                )}
                                            </span>
                                        </td>

                                        <td>
                                            <span className="list-benefit-text">
                                                {firstLabel(
                                                    data.benefit_type,
                                                    BENEFITS
                                                )}
                                            </span>
                                        </td>

                                        <td>
                                            <div className="improvement-actions-cell">
                                                <button
                                                    type="button"
                                                    className="view-improvement-button"
                                                    onClick={() =>
                                                        onOpenDraft?.(
                                                            draft
                                                        )
                                                    }
                                                    title="Open draft"
                                                    aria-label="Open draft"
                                                >
                                                    <Eye
                                                        size={15}
                                                    />
                                                </button>

                                                <button
                                                    type="button"
                                                    className="list-delete-button"
                                                    onClick={() =>
                                                        void remove(
                                                            draft.id
                                                        )
                                                    }
                                                    title="Delete draft"
                                                    aria-label="Delete draft"
                                                >
                                                    <Trash2
                                                        size={15}
                                                    />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

export function AllImprovementsList() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [collapsed, setCollapsed] = useState(false);
    const [viewImprovement, setViewImprovement] =
        useState(null);

    const load = async () => {
        try {
            setLoading(true);
            setError("");

            const data =
                await getAllImprovementsReference();

            setItems(
                Array.isArray(data)
                    ? data
                    : data?.items || []
            );
        } catch (err) {
            setError(
                err?.message ||
                    "Unable to load all improvements."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timerId = setTimeout(() => {
            void load();
        }, 0);

        return () => clearTimeout(timerId);
    }, []);

    const openImprovement = async (item) => {
        try {
            const full =
                await getImprovementReference(
                    item.id
                );

            setViewImprovement(full);
        } catch (err) {
            setError(
                err?.message ||
                    "Unable to open improvement."
            );
        }
    };

    return (
        <>
            <section className="employee-panel dashboard-reference-list">
                <ListHeader
                    
                    title="All Improvements"
                    count={items.length}
                    collapsed={collapsed}
                    onToggle={() =>
                        setCollapsed(
                            (value) => !value
                        )
                    }
                    onRefresh={() => void load()}
                />

                {collapsed ? (
                    <div className="dashboard-list-collapsed">
                        Click Expand to
                        view it.
                    </div>
                ) : loading ? (
                    <div className="table-empty-state">
                        Loading improvements...
                    </div>
                ) : error ? (
                    <div className="table-empty-state">
                        {error}
                    </div>
                ) : items.length === 0 ? (
                    <div className="table-empty-state">
                        No improvements found.
                    </div>
                ) : (
                    <div className="employee-table-wrapper">
                        <table className="employee-improvements-table dashboard-reference-table">
                            <thead>
                                <tr>
                                    <th>
                                        Improvement ID
                                    </th>
                                    <th>Owner</th>
                                    <th>Machine</th>
                                    <th>Activity</th>
                                    <th>Benefit</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                {items.map((item) => {
                                    const statusType =
                                        getStatusType(
                                            item.status
                                        );

                                    const statusLabel =
                                        getStatusLabel(
                                            item.status
                                        );

                                    const rowClass =
                                        statusType ===
                                        "rejected"
                                            ? "improvement-row-rejected"
                                            : statusType ===
                                              "resubmission"
                                            ? "improvement-row-attention"
                                            : "";

                                    return (
                                        <tr
                                            key={item.id}
                                            className={
                                                rowClass
                                            }
                                        >
                                            <td>
                                                <div className="improvement-id-cell">
                                                    <div className="improvement-id-icon">
                                                        <ClipboardList
                                                            size={15}
                                                        />
                                                    </div>

                                                    <div>
                                                        <strong>
                                                            {item.project_id ||
                                                                "-"}
                                                        </strong>

                                                        {item.created_at && (
                                                            <small>
                                                                {formatDate(
                                                                    item.created_at
                                                                )}
                                                            </small>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            <td>
                                                <span className="list-primary-text">
                                                    {item.employee_name ||
                                                        item.owner_name ||
                                                        "-"}
                                                </span>
                                            </td>

                                            <td>
                                                <span className="list-primary-text">
                                                    {item.machine ||
                                                        "-"}
                                                </span>
                                            </td>

                                            <td>
                                                <span className="list-activity-text">
                                                    {firstLabel(
                                                        item.activity,
                                                        ACTIVITIES
                                                    )}
                                                </span>
                                            </td>

                                            <td>
                                                <span className="list-benefit-text">
                                                    {firstLabel(
                                                        item.benefit_type,
                                                        BENEFITS
                                                    )}
                                                </span>
                                            </td>

                                            <td>
                                                <div className="status-cell">
                                                    <span
                                                        className={`employee-status-badge status-${statusType}`}
                                                    >
                                                        {statusLabel}
                                                    </span>

                                                    {statusType ===
                                                        "rejected" && (
                                                        <span className="status-description">
                                                            Rejected at
                                                            this stage
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td>
                                                <button
                                                    type="button"
                                                    className="view-improvement-button"
                                                    onClick={() =>
                                                        void openImprovement(
                                                            item
                                                        )
                                                    }
                                                    title="View improvement"
                                                    aria-label="View improvement"
                                                >
                                                    <Eye
                                                        size={15}
                                                    />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {viewImprovement && (
                <div
                    className="improvement-detail-overlay"
                    onClick={() =>
                        setViewImprovement(null)
                    }
                >
                    <div
                        className="improvement-detail-modal"
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                    >
                        <ViewImprovement
                            improvement={
                                viewImprovement
                            }
                            onClose={() =>
                                setViewImprovement(
                                    null
                                )
                            }
                            editableOnResubmission={
                                false
                            }
                            ownerEditEnabled={false}
                            reviewerEditEnabled={
                                false
                            }
                            accountsFinancialEditEnabled={
                                false
                            }
                        />
                    </div>
                </div>
            )}
        </>
    );
}

export default function Lists({
    showAll = false,
    onOpenDraft,
    refreshKey = 0,
}) {
    return (
        <div className="dashboard-lists-stack">
            <DraftsList
                onOpenDraft={onOpenDraft}
                refreshKey={refreshKey}
            />

            {showAll && (
                <AllImprovementsList />
            )}
        </div>
    );
}