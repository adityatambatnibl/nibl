

import  {
    useEffect,
    useState,
} from "react";

import {
    CheckCircle2,
    ClipboardList,
    Clock3,
    Eye,
    FileX2,
    LayoutDashboard,
    LogOut,
    Menu,
    Plus,
    UserCircle,
    X,
    RotateCcw,
    CircleAlert,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { goToPortal } from "../../utils/portal";

import {
    getAccountsSummary,
    getAccountsImprovements,
    getAccountsApprovals,
    getAccountsHistory,
    approveAccountsImprovement,
    rejectAccountsImprovement,
    requestAccountsResubmission,
    getBenefitLabel,
} from "../../api/accounts";


/*
 * IMPORTANT
 *
 * Accounts uses the COMMON improvement API for:
 *
 * 1. Viewing a complete improvement
 * 2. Loading signed/viewable images
 * 3. Editing a resubmitted improvement
 * 4. Saving & resubmitting the improvement
 *
 * This is the same API used by Employee Dashboard.
 */
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


import "./AccountsDashboard.css";

import "../employee/EmployeeDashboard.css";
import "../../DashboardEnhancements.css";
import Profile from "../profile/Profile.jsx";
import logo from "../../../assest/logo.jpg";


import Lists from "../../components/List.jsx";

// ============================================================
// STATUS CONFIGURATION
// ============================================================

const STATUS_CONFIG = {

    pending_plant_head: {
        label: "Pending",
        stage: "Plant Head Approval",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_hod: {
        label: "Pending",
        stage: "HOD Approval",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_plant_head_2: {
        label: "Pending",
        stage: "Plant Head Approval",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_plant_head_final: {

    label: "Pending",

    stage: "Plant Head Final Approval",

    className:
      "status-pending",

    icon:
      <Clock3 size={13} />,

  },


  pending_accounts: {
        label: "Pending",
        stage: "Accounts Approval",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_plant_head_3: {
        label: "Pending",
        stage: "Final Plant Head Closure",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    in_progress: {
        label: "In Progress",
        stage: "Approved to Start",
        className: "status-progress",
        icon: <Clock3 size={13} />,
    },

    rejected: {
        label: "Rejected",
        stage: "Rejected",
        className: "status-rejected",
        icon: <FileX2 size={13} />,
    },

    /*
     * All supported resubmission statuses.
     *
     * Keeping all three makes the dashboard tolerant
     * of the status value returned by the backend.
     */

    resubmission_required: {
        label: "Resubmission",
        stage: "Action Required",
        className: "status-resubmission",
        icon: <RotateCcw size={13} />,
    },

    resubmit: {
        label: "Resubmission",
        stage: "Action Required",
        className: "status-resubmission",
        icon: <RotateCcw size={13} />,
    },

    resubmission: {
        label: "Resubmission",
        stage: "Action Required",
        className: "status-resubmission",
        icon: <RotateCcw size={13} />,
    },

    done: {
        label: "Completed",
        stage: "Completed",
        className: "status-done",
        icon: <CheckCircle2 size={13} />,
    },

    closed: {
        label: "Completed",
        stage: "Closed",
        className: "status-done",
        icon: <CheckCircle2 size={13} />,
    },

};


// ============================================================
// DATE
// ============================================================

function formatDate(
    dateValue
) {

    if (!dateValue) {
        return "-";
    }

    const date =
        new Date(
            dateValue
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return dateValue;

    }

    return date.toLocaleDateString(
        "en-GB",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
        }
    );

}


// ============================================================
// RESUBMISSION STATUS
// ============================================================

function isResubmissionStatus(
    status
) {

    return [

        "resubmission_required",

        "resubmit",

        "resubmission",

    ].includes(

        String(
            status || ""
        )
            .trim()
            .toLowerCase()

    );

}


// ============================================================
// STAGE
// ============================================================

function getStage(
    item
) {

    if (
        item?.status ===
        "rejected"
    ) {

        return (
            item.rejected_at_stage ||
            "Unknown Stage"
        );

    }

    if (
        isResubmissionStatus(
            item?.status
        )
    ) {

        return (
            item.resubmission_stage ||
            "Action Required"
        );

    }

    const config =
        STATUS_CONFIG[
            item?.status
        ];

    return (
        config?.stage ||
        item?.current_stage ||
        "Processing"
    );

}


// ============================================================
// FORMAT STAGE LABEL
// ============================================================

function formatStage(
    stage
) {

    if (!stage) {
        return "-";
    }

    const labels = {

        plant_head_1:
            "Plant Head Approval",

        plant_head_2:
            "Plant Head Approval",

        plant_head_3:
            "Final Plant Head Closure",

        hod:
            "HOD Approval",

        accounts:
            "Accounts Approval",

        pending_plant_head:
            "Plant Head Approval",

        pending_hod:
            "HOD Approval",

        pending_plant_head_2:
            "Plant Head Approval",

        pending_accounts:
            "Accounts Approval",

        pending_plant_head_3:
            "Final Plant Head Closure",

    };

    return (

        labels[stage] ||

        String(stage)
            .replaceAll(
                "_",
                " "
            )
            .replace(
                /\b\w/g,
                (letter) =>
                    letter.toUpperCase()
            )

    );

}


// ============================================================
// BENEFIT
// ============================================================

function displayBenefit(
    benefitType
) {

    if (Array.isArray(benefitType)) {
        return displayBenefit(benefitType[0]);
    }

    if (
        benefitType === null ||
        benefitType === undefined ||
        benefitType === ""
    ) {

        return "-";

    }

    try {

        const label =
            getBenefitLabel(
                benefitType
            );

        if (
            label &&
            label !== benefitType
        ) {

            return label;

        }

        return label || benefitType;

    }

    catch {

        const fallbackMap = {

            P: "P - Productivity",
            Q: "Q - Quality",
            C: "C - Cost",
            D: "D - Delivery",
            S: "S - Safety",
            M: "M - Morale",

            "P - Productivity":
                "P - Productivity",

            "Q - Quality":
                "Q - Quality",

            "C - Cost":
                "C - Cost",

            "D - Delivery":
                "D - Delivery",

            "S - Safety":
                "S - Safety",

            "M - Morale":
                "M - Morale",

        };

        return (
            fallbackMap[
                benefitType
            ] ||
            String(
                benefitType
            )
        );

    }

}


// ============================================================
// OWNER NAME
//
// The Accounts APIs may return the owner name directly or through
// a nested user/employee object. Prefer the database full_name.
// ============================================================

function getOwnerName(item) {

    return (
        item?.owner_name ||
        item?.full_name ||
        item?.employee_name ||
        item?.owner?.full_name ||
        item?.user?.full_name ||
        item?.employee?.full_name ||
        item?.created_by?.full_name ||
        "-"
    );

}


// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({
    icon,
    value,
    title,
    description,
    type,
}) {

    return (

        <div
            className={
                `employee-summary-card summary-${type}`
            }
        >

            <div className="summary-icon">

                {icon}

            </div>


            <div className="summary-content">

                <strong>
                    {value}
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


// ============================================================
// TABLE STATUS
// ============================================================

function StatusBadge({
    item,
}) {

    const config =
        STATUS_CONFIG[
            item?.status
        ] || {

            label:
                item?.status ||
                "Pending",

            className:
                "status-pending",

            icon:
                <Clock3
                    size={13}
                />,

        };


    return (

        <span
            className={
                `employee-status-badge ${config.className}`
            }
        >

            {config.icon}

            {config.label}

        </span>

    );

}


// ============================================================
// ACCOUNTS DASHBOARD
// ============================================================

export default function AccountsDashboard() {

    const {
        user,
        logout,
    } = useAuth();


    // ========================================================
    // UI STATE
    // ========================================================

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
        historyCollapsed,
        setHistoryCollapsed,
    ] = useState(false);


    // ========================================================
    // DATA
    // ========================================================

    const [
        summary,
        setSummary,
    ] = useState({

        total: 0,
        pending: 0,
        in_progress: 0,
        rejected: 0,
        done: 0,
        approval_pending: 0,

    });


    const [
        myImprovements,
        setMyImprovements,
    ] = useState([]);


    const [
        approvals,
        setApprovals,
    ] = useState([]);


    const [
        history,
        setHistory,
    ] = useState([]);


    // ========================================================
    // LOADING
    // ========================================================

    const [
        loading,
        setLoading,
    ] = useState(true);


    const [
        error,
        setError,
    ] = useState("");


    // ========================================================
    // DETAIL
    // ========================================================

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


    // ========================================================
    // ACTION MODAL
    // ========================================================

    const [
        showActionModal,
        setShowActionModal,
    ] = useState(false);


    const [
        actionType,
        setActionType,
    ] = useState(null);


    const [
        actionImprovement,
        setActionImprovement,
    ] = useState(null);


    const [
        actionDescription,
        setActionDescription,
    ] = useState("");


    const [
        actionDesignation,
        setActionDesignation,
    ] = useState("");


    const [
        actionLoading,
        setActionLoading,
    ] = useState(false);


    // ========================================================
    // LOAD DASHBOARD
    // ========================================================

    async function loadDashboard() {

        try {

            setLoading(true);

            setError("");


            const [
                summaryData,
                myData,
                approvalData,
                historyData,
            ] = await Promise.all([

                getAccountsSummary(),

                getAccountsImprovements(),

                getAccountsApprovals(),

                getAccountsHistory(),

            ]);


            const myList =
                Array.isArray(
                    myData
                )
                    ? myData
                    : (
                        myData?.items ||
                        myData?.data ||
                        []
                    );


            const approvalList =
                Array.isArray(
                    approvalData
                )
                    ? approvalData
                    : (
                        approvalData?.items ||
                        approvalData?.data ||
                        []
                    );


            const historyList =
                Array.isArray(
                    historyData
                )
                    ? historyData
                    : (
                        historyData?.items ||
                        historyData?.data ||
                        []
                    );


            setSummary({

                total:
                    summaryData?.total ??
                    0,

                pending:
                    summaryData?.pending ??
                    0,

                in_progress:
                    summaryData?.in_progress ??
                    0,

                rejected:
                    summaryData?.rejected ??
                    0,

                done:
                    summaryData?.done ??
                    0,

                approval_pending:
                    summaryData?.approval_pending ??
                    approvalList.length,

            });


            setMyImprovements(
                myList
            );


            setApprovals(
                approvalList
            );


            setHistory(
                historyList
            );

        }

        catch (err) {

            console.error(
                "Accounts Dashboard:",
                err
            );

            setError(
                err?.message ||
                "Unable to load Accounts Dashboard."
            );

        }

        finally {

            setLoading(false);

        }

    }


    // ========================================================
    // INITIAL LOAD
    // ========================================================

    useEffect(() => {
        const timerId = setTimeout(() => {
             void loadDashboard();
        }, 0);

        return () => {

            clearTimeout(timerId);

        };

    }, []);


    function scrollToMyImprovements() {

        document.getElementById("my-improvements-list")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });

    }


    // ========================================================
    // ACCOUNTS USER'S OWN CARD COUNTS
    //
    // These five cards must represent improvements created by
    // the currently logged-in Accounts user.
    // The separate Accounts Approval card below continues to
    // represent improvements waiting for Accounts review.
    // ========================================================

    const myTotalCount =
        myImprovements.length;

    const myPendingCount =
        myImprovements.filter(
            (item) => {

                const status =
                    String(
                        item?.status ||
                        ""
                    )
                        .trim()
                        .toLowerCase();

                return [
                    "pending_plant_head",
                    "pending_hod",
                    "pending_plant_head_2",
                    "pending_accounts",
                    "pending_plant_head_3",
                ].includes(status);
            }
        ).length;

    const myInProgressCount =
        myImprovements.filter(
            (item) =>
                String(
                    item?.status ||
                    ""
                )
                    .trim()
                    .toLowerCase() ===
                "in_progress"
        ).length;

    const myRejectedCount =
        myImprovements.filter(
            (item) =>
                String(
                    item?.status ||
                    ""
                )
                    .trim()
                    .toLowerCase() ===
                "rejected"
        ).length;

    const myDoneCount =
        myImprovements.filter(
            (item) => {

                const status =
                    String(
                        item?.status ||
                        ""
                    )
                        .trim()
                        .toLowerCase();

                return (
                    status === "done" ||
                    status === "closed"
                );
            }
        ).length;


    // ========================================================
    // FIRST NAME
    // ========================================================

    const firstName =
        user?.full_name
            ?.split(" ")
            ?. [0] ||

        user?.name
            ?.split(" ")
            ?. [0] ||

        "there";


    // ========================================================
    // IMPROVEMENT CREATED
    // ========================================================

    async function handleImprovementCreated() {

        setShowAddImprovement(
            false
        );

        setListRefreshKey((value) => value + 1);

        await loadDashboard();

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


    // ========================================================
    // ACCOUNTS USER'S OWN IMPROVEMENT EDIT
    //
    // Accounts users are also improvement owners. They should
    // get the same owner Edit Improvement action as Employee,
    // HOD and Plant Head when viewing their own record.
    // ========================================================

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


    // ========================================================
    // VIEW IMPROVEMENT
    //
    // IMPORTANT:
    //
    // Always use the COMMON improvement endpoint.
    //
    // This gives Accounts the same complete improvement
    // response as Employee Dashboard, including image URLs.
    // ========================================================

    async function handleViewImprovement(
        improvementId
    ) {

        if (!improvementId) {
            return;
        }


        try {

            setDetailLoading(true);

            setDetailError("");

            setSelectedImprovement(
                null
            );


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
                "Accounts View:",
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


    // ========================================================
    // VIEW HISTORY RECORD
    //
    // Instead of directly displaying the history list object,
    // fetch the complete improvement through the common View API.
    //
    // This makes history View consistent with:
    //
    // Employee View
    // Accounts View
    //
    // and ensures images are available.
    // ========================================================

    async function handleViewHistory(
        item
    ) {

        if (!item?.id) {
            return;
        }


        await handleViewImprovement(
            item.id
        );

    }


    // ========================================================
    // CLOSE DETAIL
    // ========================================================

    function closeImprovementDetail() {

        if (detailLoading) {
            return;
        }


        setSelectedImprovement(
            null
        );

        setDetailError("");

    }


    // ========================================================
    // SAVE & RESUBMIT
    //
    // This is NOT the Accounts "Request Resubmission" action.
    //
    // This is used when an Accounts-owned improvement has
    // been returned to the Accounts user for correction.
    //
    // ViewImprovement handles the editing UI.
    // This function only sends the edited payload to the API.
    // ========================================================

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


            /*
             * Keep the returned improvement open
             * so the user can immediately see the
             * updated record.
             */

            setSelectedImprovement(
                updated
            );


            /*
             * Refresh dashboard counts,
             * status and lists.
             */

            await loadDashboard();

        }

        catch (err) {

            console.error(
                "Accounts Save & Resubmit:",
                err
            );

            /*
             * ViewImprovement catches this error
             * and displays it inside the edit area.
             */

            throw err;

        }

    }


    // ========================================================
    // SAVE ACCOUNTS FINANCIAL EDIT
    //
    // This is separate from employee/owner resubmission.
    // Accounts stays at pending_accounts after saving.
    // ========================================================

    // ========================================================
    // OPEN ACTION
    // ========================================================

    function openAction(
        type,
        improvement
    ) {

        setActionType(
            type
        );

        setActionImprovement(
            improvement
        );

        setActionDescription("");

        setActionDesignation("");

        setError("");

        setShowActionModal(
            true
        );

    }


    // ========================================================
    // CLOSE ACTION
    // ========================================================

    function closeAction() {

        if (actionLoading) {
            return;
        }

        setShowActionModal(
            false
        );

        setActionType(
            null
        );

        setActionImprovement(
            null
        );

        setActionDescription("");

        setActionDesignation("");

    }


    // ========================================================
    // APPROVE
    // ========================================================

    async function handleApprove() {

        if (!actionImprovement) {
            return;
        }


        if (
            !actionDesignation.trim()
        ) {

            setError(
                "Please enter the Accounts designation."
            );

            return;

        }


        if (
            !actionDescription.trim()
        ) {

            setError(
                "Please enter the verification remarks."
            );

            return;

        }


        try {

            setActionLoading(true);

            setError("");


            await approveAccountsImprovement(

                actionImprovement.id,

                actionDesignation.trim(),

                actionDescription.trim()

            );


            closeAction();

            setSelectedImprovement(
                null
            );

            await loadDashboard();

        }

        catch (err) {

            console.error(
                "Accounts Approve:",
                err
            );

            setError(
                err?.message ||
                "Failed to approve improvement."
            );

        }

        finally {

            setActionLoading(false);

        }

    }


    // ========================================================
    // REJECT
    // ========================================================

    async function handleReject() {

        if (!actionImprovement) {
            return;
        }


        if (
            !actionDescription.trim()
        ) {

            setError(
                "Please enter a rejection description."
            );

            return;

        }


        try {

            setActionLoading(true);

            setError("");


            await rejectAccountsImprovement(

                actionImprovement.id,

                actionDescription.trim()

            );


            closeAction();

            setSelectedImprovement(
                null
            );

            await loadDashboard();

        }

        catch (err) {

            console.error(
                "Accounts Reject:",
                err
            );

            setError(
                err?.message ||
                "Failed to reject improvement."
            );

        }

        finally {

            setActionLoading(false);

        }

    }


    // ========================================================
    // ACCOUNTS REQUESTS RESUBMISSION
    //
    // IMPORTANT:
    //
    // This is different from handleSaveEdit().
    //
    // This action means Accounts is telling the owner:
    //
    // "Please correct these things."
    //
    // The owner will later use View -> Edit ->
    // Save & Resubmit.
    // ========================================================

    async function handleResubmit() {

        if (!actionImprovement) {
            return;
        }


        if (
            !actionDescription.trim()
        ) {

            setError(
                "Please enter a resubmission description."
            );

            return;

        }


        try {

            setActionLoading(true);

            setError("");


            await requestAccountsResubmission(

                actionImprovement.id,

                actionDescription.trim()

            );


            closeAction();

            setSelectedImprovement(
                null
            );

            await loadDashboard();

        }

        catch (err) {

            console.error(
                "Accounts Request Resubmission:",
                err
            );

            setError(
                err?.message ||
                "Failed to request resubmission."
            );

        }

        finally {

            setActionLoading(false);

        }

    }


    // ========================================================
    // PROFILE SCREEN
    // ========================================================

    if (showProfile) {

        return (

            <Profile
                onBack={() => setShowProfile(false)}
            />

        );

    }


    // ========================================================
    // ADD IMPROVEMENT SCREEN
    //
    // UNCHANGED
    // ========================================================

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


    // ========================================================
    // LOADING
    // ========================================================

    if (loading) {

        return (

            <div className="employee-app-shell">
                

                <main className="employee-main">
                  
                    <div className="employee-content">

                        <div className="table-empty-state">

                            <div className="loading-spinner-small" />

                            <span>
                                Loading Accounts Dashboard...
                            </span>

                        </div>

                    </div>

                </main>

            </div>

        );

    }


    // ========================================================
    // UI
    // ========================================================

    return (

        <div className="employee-app-shell">
          


            {/* ==================================================
                MOBILE SIDEBAR OVERLAY
            ================================================== */}

            {sidebarOpen && (

                <div
                    className="mobile-sidebar-overlay"
                    onClick={() =>
                        setSidebarOpen(false)
                    }
                />

            )}


            {/* ==================================================
                SIDEBAR
            ================================================== */}

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

                    <button
                        className="employee-nav-item active"
                    >

                        <LayoutDashboard
                            size={18}
                        />

                        <span>
                            Dashboard
                        </span>

                    </button>


                    <button
                        className="employee-nav-item"
                        type="button"
                        onClick={scrollToMyImprovements}
                    >

                        <ClipboardList
                            size={18}
                        />

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

                        <UserCircle
                            size={18}
                        />

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


            {/* ==================================================
                MAIN
            ================================================== */}

            <main className="employee-main">


                {/* ==================================================
                    HEADER
                ================================================== */}

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
                                    "Accounts"
                                }

                            </strong>

                            <span>
                                Accounts
                            </span>

                        </div>

                    </div>

                    </button>

                </header>


                {/* ==================================================
                    CONTENT
                ================================================== */}

                <section className="employee-content">


                    {/* ==================================================
                        PAGE HEADING
                    ================================================== */}

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


                    {/* ==================================================
                        ERROR
                    ================================================== */}

                    {error && (

                        <div className="dashboard-error">

                            <div className="dashboard-error-content">

                                <CircleAlert
                                    size={17}
                                />

                                <span>
                                    {error}
                                </span>

                            </div>

                        </div>

                    )}


                    {/* ==================================================
                        SUMMARY CARDS
                    ================================================== */}

                    <div className="employee-summary-grid">


                        <SummaryCard

                            icon={
                                <ClipboardList
                                    size={21}
                                />
                            }

                            value={
                                myTotalCount
                            }

                            title="Total Improvements"

                            description="All improvements"

                            type="total"

                        />


                        <SummaryCard

                            icon={
                                <Clock3
                                    size={21}
                                />
                            }

                            value={
                                myPendingCount
                            }

                            title="Pending Approval"

                            description="Waiting for approval"

                            type="pending"

                        />


                        <SummaryCard

                            icon={
                                <Clock3
                                    size={21}
                                />
                            }

                            value={
                                myInProgressCount
                            }

                            title="In Progress"

                            description="Approved improvements"

                            type="progress"

                        />


                        <SummaryCard

                            icon={
                                <FileX2
                                    size={21}
                                />
                            }

                            value={
                                myRejectedCount
                            }

                            title="Rejected"

                            description="Needs attention"

                            type="rejected"

                        />


                        <SummaryCard

                            icon={
                                <CheckCircle2
                                    size={21}
                                />
                            }

                            value={
                                myDoneCount
                            }

                            title="Done"

                            description="Successfully completed"

                            type="done"

                        />


                        <div className="employee-summary-card accounts-approval-card">

                            <div className="summary-icon">

                                <Clock3
                                    size={21}
                                />

                            </div>


                            <div className="summary-content">

                                <strong>
                                    {
                                        summary.approval_pending
                                    }
                                </strong>

                                <span>
                                    Accounts Approval
                                </span>

                                <small>
                                    Waiting for your review
                                </small>

                            </div>


                            <div className="summary-card-arrow">
                                →
                            </div>

                        </div>

                    </div>


                    {/* ==================================================
                        MY IMPROVEMENTS
                    ================================================== */}

                    <section className="employee-panel accounts-panel-spacing" id="my-improvements-list">

                        <div className="employee-panel-header">

                            <div>

                                <h2>
                                    My Improvements
                                </h2>

                              
                            </div>


                            <div className="dashboard-panel-header-actions">
                                <div className="panel-header-count">

                                    <ClipboardList
                                        size={14}
                                    />

                                    <span>
                                        {
                                            myImprovements.length
                                        }
                                    </span>

                                </div>

                                <button
                                    type="button"
                                    className="dashboard-list-toggle"
                                    onClick={() => setMyImprovementsCollapsed((value) => !value)}
                                    aria-expanded={!myImprovementsCollapsed}
                                    aria-label={myImprovementsCollapsed ? "Expand My Improvements" : "Collapse My Improvements"}
                                >
                                    {myImprovementsCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                                    {myImprovementsCollapsed ? "Expand" : "Collapse"}
                                </button>
                            </div>

                        </div>


                        {myImprovementsCollapsed ? (

                            <div className="dashboard-list-collapsed">
                                 Click Expand to view it.
                            </div>

                        ) : (

                        <div className="employee-table-wrapper">

                            {myImprovements.length === 0 ? (

                                <div className="empty-improvement-state">

                                    <div className="empty-improvement-icon">

                                        <ClipboardList
                                            size={25}
                                        />

                                    </div>


                                    <h3>
                                        No improvements yet
                                    </h3>


                                    <p>
                                        Start your first improvement
                                        initiative and make an impact.
                                    </p>


                                    <button

                                        className="secondary-action-button"

                                        onClick={() =>
                                            setShowAddImprovement(
                                                true
                                            )
                                        }

                                    >

                                        <Plus size={17} />

                                        Create Improvement

                                    </button>

                                </div>

                            ) : (

                                <table className="employee-improvements-table">

                                    <thead>

                                        <tr>

                                            <th>
                                                Improvement ID
                                            </th>

                                            <th>
                                                Benefit
                                            </th>

                                            <th>
                                                Current Stage
                                            </th>

                                            <th>
                                                Status
                                            </th>

                                            <th>
                                                Submitted
                                            </th>

                                            <th>
                                                Action
                                            </th>

                                        </tr>

                                    </thead>


                                    <tbody>

                                        {myImprovements
                                            .slice(
                                                0,
                                                8
                                            )
                                            .map(
                                                (
                                                    item
                                                ) => {

                                                    const isRejected =
                                                        item.status ===
                                                        "rejected";


                                                    const isResubmission =
                                                        isResubmissionStatus(
                                                            item.status
                                                        );


                                                    const stage =
                                                        getStage(
                                                            item
                                                        );


                                                    return (

                                                        <tr

                                                            key={
                                                                item.id
                                                            }

                                                            className={

                                                                isRejected
                                                                    ? "improvement-row-rejected"
                                                                    : isResubmission
                                                                        ? "improvement-row-attention"
                                                                        : ""

                                                            }

                                                        >

                                                            <td>

                                                                <div className="project-idea-cell">

                                                                    <strong>

                                                                        {
                                                                            item.project_id ||
                                                                            item.improvement_id ||
                                                                            item.id ||
                                                                            "-"
                                                                        }

                                                                    </strong>

                                                                </div>

                                                            </td>


                                                            <td>

                                                                <div className="project-idea-cell">

                                                                    <span>

                                                                        {
                                                                            displayBenefit(
                                                                                item.benefit_type
                                                                            )
                                                                        }

                                                                    </span>

                                                                </div>

                                                            </td>


                                                            <td>

                                                                <div className="stage-cell">

                                                                    <span className="stage-line" />


                                                                    <div>

                                                                        <strong>

                                                                            {
                                                                                formatStage(
                                                                                    stage
                                                                                )
                                                                            }

                                                                        </strong>


                                                                        {isRejected && (

                                                                            <small className="stage-subtext rejected-stage-text">

                                                                                Rejected at this stage

                                                                            </small>

                                                                        )}


                                                                        {isResubmission && (

                                                                            <small className="stage-subtext resubmission-stage-text">

                                                                                Resubmission required

                                                                            </small>

                                                                        )}

                                                                    </div>

                                                                </div>

                                                            </td>


                                                            <td>

                                                                <div className="status-cell">

                                                                    <StatusBadge
                                                                        item={
                                                                            item
                                                                        }
                                                                    />


                                                                    {isRejected &&
                                                                        item.rejection_description && (

                                                                            <span className="status-description">

                                                                                {
                                                                                    item.rejection_description
                                                                                }

                                                                            </span>

                                                                        )}


                                                                    {isResubmission &&
                                                                        item.resubmission_description && (

                                                                            <span className="status-description">

                                                                                {
                                                                                    item.resubmission_description
                                                                                }

                                                                            </span>

                                                                        )}

                                                                </div>

                                                            </td>


                                                            <td>

                                                                <span className="date-cell">

                                                                    {
                                                                        formatDate(
                                                                            item.created_at ||
                                                                            item.submitted_at
                                                                        )
                                                                    }

                                                                </span>

                                                            </td>


                                                            <td>

                                                                <button

                                                                    className="view-improvement-button"

                                                                    title={
                                                                        isResubmission
                                                                            ? "View and edit improvement"
                                                                            : "View improvement"
                                                                    }

                                                                    onClick={() =>
                                                                        handleViewImprovement(
                                                                            item.id
                                                                        )
                                                                    }

                                                                >

                                                                    <Eye
                                                                        size={16}
                                                                    />

                                                                </button>

                                                            </td>

                                                        </tr>

                                                    );

                                                }
                                            )}

                                    </tbody>

                                </table>

                            )}

                        </div>

                        )}

                    </section>


                    {/* ==================================================
                        FOR APPROVAL
                    ================================================== */}

                    <section className="employee-panel accounts-panel-spacing">

                        <div className="employee-panel-header">

                            <div>

                                <h2>
                                    Improvements Waiting For Your Approval
                                </h2>

                                

                            </div>


                            <div className="dashboard-panel-header-actions">
                                <div className="panel-header-count">

                                    <Clock3
                                        size={14}
                                    />

                                    <span>
                                        {
                                            approvals.length
                                        }
                                    </span>

                                </div>

                                <button
                                    type="button"
                                    className="dashboard-list-toggle"
                                    onClick={() => setApprovalsCollapsed((value) => !value)}
                                    aria-expanded={!approvalsCollapsed}
                                    aria-label={approvalsCollapsed ? "Expand For Approval" : "Collapse For Approval"}
                                >
                                    {approvalsCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                                    {approvalsCollapsed ? "Expand" : "Collapse"}
                                </button>
                            </div>

                        </div>


                        {approvalsCollapsed ? (

                            <div className="dashboard-list-collapsed">
                                Click Expand to view it.
                            </div>

                        ) : (

                        <div className="employee-table-wrapper">

                            {approvals.length === 0 ? (

                                <div className="empty-improvement-state">

                                    <div className="empty-improvement-icon">

                                        <CheckCircle2
                                            size={25}
                                        />

                                    </div>


                                    <h3>
                                        No approvals pending
                                    </h3>


                                    <p>
                                        There are currently no
                                        improvements waiting for
                                        Accounts review.
                                    </p>

                                </div>

                            ) : (

                                <table className="employee-improvements-table">

                                    <thead>

                                        <tr>

                                            <th>
                                                Improvement ID
                                            </th>

                                            <th>
                                                Owner Name
                                            </th>

                                            <th>
                                                Department
                                            </th>

                                            <th>
                                                Plant
                                            </th>

                                            <th>
                                                Submitted
                                            </th>

                                            <th>
                                                Action
                                            </th>

                                        </tr>

                                    </thead>


                                    <tbody>

                                        {approvals.map(
                                            (
                                                item
                                            ) => (

                                                <tr
                                                    key={
                                                        item.id
                                                    }
                                                >

                                                    <td>

                                                        <div className="project-idea-cell">

                                                            <strong>

                                                                {
                                                                    item.project_id ||
                                                                    item.improvement_id ||
                                                                    item.id ||
                                                                    "-"
                                                                }

                                                            </strong>

                                                        </div>

                                                    </td>


                                                    <td>

                                                        <span className="date-cell">

                                                            {
                                                                getOwnerName(
                                                                    item
                                                                )
                                                            }

                                                        </span>

                                                    </td>


                                                    <td>

                                                        <span className="date-cell">

                                                            {
                                                                item.department ||
                                                                "-"
                                                            }

                                                        </span>

                                                    </td>


                                                    <td>

                                                        <span className="date-cell">

                                                            {
                                                                item.plant ||
                                                                "-"
                                                            }

                                                        </span>

                                                    </td>


                                                    <td>

                                                        <span className="date-cell">

                                                            {
                                                                formatDate(
                                                                    item.created_at ||
                                                                    item.submitted_at
                                                                )
                                                            }

                                                        </span>

                                                    </td>


                                                    <td>

                                                        <div className="accounts-review-actions">

                                                            <button

                                                                className="view-improvement-button"

                                                                title="View improvement"

                                                                onClick={() =>
                                                                    handleViewImprovement(
                                                                        item.id
                                                                    )
                                                                }

                                                            >

                                                                <Eye
                                                                    size={16}
                                                                />

                                                            </button>


                                                            <button

                                                                className="accounts-inline-button accounts-inline-approve"

                                                                onClick={() =>
                                                                    openAction(
                                                                        "approve",
                                                                        item
                                                                    )
                                                                }

                                                            >

                                                                Approve

                                                            </button>


                                                            <button

                                                                className="accounts-inline-button accounts-inline-reject"

                                                                onClick={() =>
                                                                    openAction(
                                                                        "reject",
                                                                        item
                                                                    )
                                                                }

                                                            >

                                                                Reject

                                                            </button>


                                                            <button

                                                                className="accounts-inline-button accounts-inline-resubmit"

                                                                onClick={() =>
                                                                    openAction(
                                                                        "resubmit",
                                                                        item
                                                                    )
                                                                }

                                                            >

                                                                Resubmit

                                                            </button>

                                                        </div>

                                                    </td>

                                                </tr>

                                            )
                                        )}

                                    </tbody>

                                </table>

                            )}

                        </div>

                        )}

                    </section>


                    {/* ==================================================
                        ACCOUNTS HISTORY
                    ================================================== */}

                    <section className="employee-panel accounts-panel-spacing">

                        <div className="employee-panel-header">

                            <div>

                                <h2>
                                    Accounts History
                                </h2>

                               

                            </div>


                            <div className="dashboard-panel-header-actions">
                                <div className="panel-header-count">

                                    <ClipboardList
                                        size={14}
                                    />

                                    <span>
                                        {
                                            history.length
                                        }
                                    </span>

                                </div>

                                <button
                                    type="button"
                                    className="dashboard-list-toggle"
                                    onClick={() => setHistoryCollapsed((value) => !value)}
                                    aria-expanded={!historyCollapsed}
                                    aria-label={historyCollapsed ? "Expand Accounts History" : "Collapse Accounts History"}
                                >
                                    {historyCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                                    {historyCollapsed ? "Expand" : "Collapse"}
                                </button>
                            </div>

                        </div>


                        {historyCollapsed ? (

                            <div className="dashboard-list-collapsed">
                                 Click Expand to view it.
                            </div>

                        ) : (

                        <div className="employee-table-wrapper">

                            {history.length === 0 ? (

                                <div className="empty-improvement-state">

                                    <div className="empty-improvement-icon">

                                        <ClipboardList
                                            size={25}
                                        />

                                    </div>


                                    <h3>
                                        No Accounts history
                                    </h3>


                                    <p>
                                        Approved and rejected
                                        improvements will appear here.
                                    </p>

                                </div>

                            ) : (

                                <table className="employee-improvements-table">

                                    <thead>

                                        <tr>

                                            <th>
                                                Improvement ID
                                            </th>

                                            <th>
                                                Owner Name
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
                                                Updated
                                            </th>

                                            <th>
                                                Action
                                            </th>

                                        </tr>

                                    </thead>


                                    <tbody>

                                        {history.map(
                                            (
                                                item
                                            ) => {

                                                const historyStatus =
                                                    item.accounts_status ||
                                                    item.status;


                                                const isApproved =
                                                    historyStatus ===
                                                    "approved";


                                                const isRejected =
                                                    historyStatus ===
                                                    "rejected";


                                                return (

                                                    <tr
                                                        key={
                                                            item.id
                                                        }
                                                    >

                                                        <td>

                                                            <div className="project-idea-cell">

                                                                <strong>

                                                                    {
                                                                        item.project_id ||
                                                                        item.improvement_id ||
                                                                        item.id ||
                                                                        "-"
                                                                    }

                                                                </strong>

                                                            </div>

                                                        </td>


                                                        <td>

                                                            <span className="date-cell">

                                                                {
                                                                    getOwnerName(
                                                                        item
                                                                    )
                                                                }

                                                            </span>

                                                        </td>


                                                        <td>

                                                            <span className="date-cell">

                                                                {
                                                                    item.department ||
                                                                    "-"
                                                                }

                                                            </span>

                                                        </td>


                                                        <td>

                                                            <span className="date-cell">

                                                                {
                                                                    item.plant ||
                                                                    "-"
                                                                }

                                                            </span>

                                                        </td>


                                                        <td>

                                                            <span

                                                                className={

                                                                    `employee-status-badge ${
                                                                        isApproved
                                                                            ? "status-done"
                                                                            : isRejected
                                                                                ? "status-rejected"
                                                                                : isResubmissionStatus(
                                                                                    historyStatus
                                                                                )
                                                                                    ? "status-resubmission"
                                                                                    : "status-pending"
                                                                    }`

                                                                }

                                                            >

                                                                {
                                                                    isApproved
                                                                        ? (
                                                                            <CheckCircle2
                                                                                size={13}
                                                                            />
                                                                        )
                                                                        : isRejected
                                                                            ? (
                                                                                <FileX2
                                                                                    size={13}
                                                                                />
                                                                            )
                                                                            : isResubmissionStatus(
                                                                                historyStatus
                                                                            )
                                                                                ? (
                                                                                    <RotateCcw
                                                                                        size={13}
                                                                                    />
                                                                                )
                                                                                : (
                                                                                    <Clock3
                                                                                        size={13}
                                                                                    />
                                                                                )
                                                                }


                                                                {
                                                                    isApproved
                                                                        ? "Approved"
                                                                        : isRejected
                                                                            ? "Rejected"
                                                                            : isResubmissionStatus(
                                                                                historyStatus
                                                                            )
                                                                                ? "Resubmission"
                                                                                : (
                                                                                    historyStatus ||
                                                                                    "-"
                                                                                )
                                                                }

                                                            </span>

                                                        </td>


                                                        <td>

                                                            <span className="date-cell">

                                                                {
                                                                    formatDate(
                                                                        item.updated_at ||
                                                                        item.accounts_verified_at ||
                                                                        item.created_at
                                                                    )
                                                                }

                                                            </span>

                                                        </td>


                                                        <td>

                                                            <button

                                                                className="view-improvement-button"

                                                                title="View improvement"

                                                                onClick={() =>
                                                                    handleViewHistory(
                                                                        item
                                                                    )
                                                                }

                                                            >

                                                                <Eye
                                                                    size={16}
                                                                />

                                                            </button>

                                                        </td>

                                                    </tr>

                                                );

                                            }
                                        )}

                                    </tbody>

                                </table>

                            )}

                        </div>

                        )}

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
                IMPROVEMENT DETAIL
                REUSABLE VIEW COMPONENT
            ==================================================== */}

            {(detailLoading ||
                detailError ||
                selectedImprovement) && (

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

                                <X size={20} />

                            </button>

                        </div>


                        {detailLoading && (

                            <div className="improvement-detail-loading">

                                <div className="loading-spinner-small" />

                                <span>
                                    Loading improvement details...
                                </span>

                            </div>

                        )}


                        {detailError &&
                            !detailLoading && (

                                <div className="improvement-detail-error">

                                    <CircleAlert
                                        size={18}
                                    />

                                    <span>
                                        {detailError}
                                    </span>

                                </div>

                            )}


                        {selectedImprovement &&
                            !detailLoading && (

                                <ViewImprovement

                                    improvement={
                                        selectedImprovement
                                    }

                                    onClose={
                                        closeImprovementDetail
                                    }

                                    /*
                                     * ViewImprovement itself checks
                                     * the status before displaying
                                     * the Edit button.
                                     *
                                     * Therefore normal improvements
                                     * remain view-only.
                                     */

                                    editableOnResubmission={
                                        true
                                    }

                                    reviewerEditEnabled={
                                        selectedImprovement?.status === "pending_accounts"
                                    }

                                    onSaveReviewerEdit={
                                        handleSaveReviewerEdit
                                    }

                                    ownerEditEnabled={
                                        String(selectedImprovement?.employee_id || "") ===
                                        String(user?.id || "")
                                    }

                                    onSaveOwnerEdit={
                                        handleSaveOwnerEdit
                                    }

                                    /*
                                     * This is the missing connection
                                     * that allows Accounts users to
                                     * edit their own returned
                                     * improvement and Save & Resubmit.
                                     */

                                    onSaveEdit={
                                        handleSaveEdit
                                    }

                                />

                            )}

                    </div>

                </div>

            )}


            {/* ====================================================
                ACTION MODAL
                KEEPING EXISTING ACCOUNTS WORKFLOW
            ==================================================== */}

            {showActionModal &&
                actionImprovement && (

                    <div

                        className="accounts-action-overlay"

                        onClick={
                            closeAction
                        }

                    >

                        <div

                            className="accounts-action-modal"

                            onClick={
                                (event) =>
                                    event.stopPropagation()
                            }

                        >

                            <div className="improvement-detail-header">

                                <div>

                                    <span className="improvement-detail-eyebrow">
                                        ACCOUNTS REVIEW
                                    </span>

                                    <h2>

                                        {
                                            actionType ===
                                            "approve"
                                                ? "Approve Improvement"
                                                : actionType ===
                                                  "reject"
                                                    ? "Reject Improvement"
                                                    : "Request Resubmission"
                                        }

                                    </h2>

                                </div>


                                <button

                                    className="improvement-detail-close"

                                    onClick={
                                        closeAction
                                    }

                                >

                                    <X size={20} />

                                </button>

                            </div>


                            <div className="accounts-action-content">

                                <div className="accounts-action-project">

                                    <span>
                                        Project
                                    </span>

                                    <strong>
                                        {
                                            actionImprovement.project_id ||
                                            "-"
                                        }
                                    </strong>

                                </div>


                                {/* ==================================
                                    APPROVE
                                ================================== */}

                                {actionType ===
                                "approve" ? (

                                    <>

                                        <div className="accounts-approval-field">

                                            <label>
                                                Verified By
                                            </label>

                                            <input

                                                type="text"

                                                value={
                                                    user?.full_name ||
                                                    user?.name ||
                                                    ""
                                                }

                                                readOnly

                                            />

                                            <small>
                                                Automatically taken from your Accounts login.
                                            </small>

                                        </div>


                                        <div className="accounts-approval-field">

                                            <label>
                                                Designation
                                            </label>

                                            <input

                                                type="text"

                                                value={
                                                    actionDesignation
                                                }

                                                onChange={(
                                                    event
                                                ) =>
                                                    setActionDesignation(
                                                        event.target.value
                                                    )
                                                }

                                                placeholder="Enter your designation"

                                            />

                                        </div>


                                        <div className="accounts-approval-field">

                                            <label>
                                                Date
                                            </label>

                                            <input

                                                type="text"

                                                value={
                                                    new Date()
                                                        .toLocaleDateString(
                                                            "en-GB",
                                                            {
                                                                day:
                                                                    "2-digit",
                                                                month:
                                                                    "short",
                                                                year:
                                                                    "numeric",
                                                            }
                                                        )
                                                }

                                                readOnly

                                            />

                                            <small>
                                                Automatically recorded when approval is submitted.
                                            </small>

                                        </div>


                                        <div className="accounts-approval-field">

                                            <label>
                                                Verification Remarks
                                            </label>

                                            <textarea

                                                value={
                                                    actionDescription
                                                }

                                                onChange={
                                                    (
                                                        event
                                                    ) =>
                                                        setActionDescription(
                                                            event.target.value
                                                        )
                                                }

                                                placeholder="Enter verification remarks..."

                                                rows="5"

                                            />

                                        </div>

                                    </>

                                ) : (

                                    /* ==================================
                                       REJECT / RESUBMIT
                                    ================================== */

                                    <div className="accounts-approval-field">

                                        <label>

                                            {
                                                actionType ===
                                                "reject"
                                                    ? "Rejection Description"
                                                    : "Resubmission Description"
                                            }

                                        </label>


                                        <textarea

                                            value={
                                                actionDescription
                                            }

                                            onChange={
                                                (
                                                    event
                                                ) =>
                                                    setActionDescription(
                                                        event.target.value
                                                    )
                                                }

                                            placeholder={

                                                actionType ===
                                                "reject"

                                                    ? "Enter the reason for rejection..."

                                                    : "Enter what needs to be corrected before resubmission..."

                                            }

                                            rows="6"

                                        />

                                    </div>

                                )}

                            </div>


                            <div className="accounts-action-buttons">

                                <button

                                    className="secondary-action-button accounts-cancel-button"

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

                                    className={

                                        actionType ===
                                        "approve"

                                            ? "accounts-confirm-button accounts-confirm-approve"

                                            : actionType ===
                                              "reject"

                                                ? "accounts-confirm-button accounts-confirm-reject"

                                                : "accounts-confirm-button accounts-confirm-resubmit"

                                    }

                                    onClick={

                                        actionType ===
                                        "approve"

                                            ? handleApprove

                                            : actionType ===
                                              "reject"

                                                ? handleReject

                                                : handleResubmit

                                    }

                                    disabled={
                                        actionLoading
                                    }

                                >

                                    {
                                        actionLoading

                                            ? "Processing..."

                                            : actionType ===
                                              "approve"

                                                ? "Confirm Approve"

                                                : actionType ===
                                                  "reject"

                                                    ? "Confirm Reject"

                                                    : "Confirm Resubmit"
                                    }

                                </button>

                            </div>

                        </div>

                    </div>

                )}

        </div>

    );

}