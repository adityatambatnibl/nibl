import  {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    ClipboardList,
    Clock3,
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
    CheckCircle2,
    CircleAlert,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { goToPortal } from "../../utils/portal";

import {
    getImprovement,
    resubmitImprovement,
    updateOwnedImprovement,
} from "../../api/improvements";

import {
    useAuth,
} from "../../context/AuthContext";

import AddImprovement
    from "../improvements/AddImprovement.jsx";

import ViewImprovement
    from "../improvements/ViewImprovement.jsx";

import {
    getHODSummary,
    getHODMyImprovements,
    getHODUnderMeImprovements,
    getHODEmployees,
} from "../../api/hod";

import "./HODDashboard.css";

import "../employee/EmployeeDashboard.css";
import "../../DashboardEnhancements.css";
import Profile from "../profile/Profile.jsx";
import logo from "../../../assest/logo.jpg";

import Lists from "../../components/List.jsx";

// ============================================================
// STATUS CONFIGURATION
// ============================================================

const STATUS_CONFIG = {

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
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_plant_head: {
        label: "Pending",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_hod: {
        label: "Pending",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_plant_head_2: {
        label: "Pending",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_accounts_2: {
        label: "Pending",
        className: "status-pending",
        icon: <Clock3 size={13} />,
    },

    pending_plant_head_3: {
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

};


// ============================================================
// STATUS GROUPS
// ============================================================

const PENDING_STATUSES = [

    "pending_accounts",

    "pending_plant_head",

    "pending_hod",

    "pending_plant_head_2",

    "pending_accounts_2",

    "pending_plant_head_3",

];

const RESUBMISSION_STATUSES = [

    "resubmission_required",

    "resubmit",

    "resubmission",

];


// ============================================================
// DATA HELPERS
// ============================================================

function getList(data) {

    if (
        Array.isArray(data)
    ) {

        return data;

    }


    return (
        data?.items ||
        data?.data ||
        data?.results ||
        []
    );

}


function getStatus(item) {

    return String(
        item?.status || ""
    )
        .trim()
        .toLowerCase();

}


function getProjectId(item) {

    return (
        item?.project_id ||
        item?.improvement_id ||
        (
            item?.id
                ? `OIPM-${String(
                    item.id
                )
                    .slice(0, 8)
                    .toUpperCase()}`
                : "-"
        )
    );

}


function getEmployeeName(item) {

    return (
        item?.employee_name ||
        item?.user_name ||
        item?.creator_name ||
        item?.employee?.full_name ||
        item?.user?.full_name ||
        "-"
    );

}


function getDepartment(item) {

    return (
        item?.department ||
        item?.department_line ||
        "-"
    );

}


function getPlant(item) {

    return (
        item?.plant ||
        "-"
    );

}


// ============================================================
// BENEFIT LABEL
// ============================================================

function getBenefitLabel(benefitType) {

    if (Array.isArray(benefitType)) {
        return getBenefitLabel(benefitType[0]);
    }

    const labels = {

        P: "P – Productivity",
        Q: "Q – Quality",
        C: "C – Cost",
        D: "D – Delivery",
        S: "S – Safety",
        M: "M – Morale",

    };


    if (!benefitType) {

        return "-";

    }


    if (labels[benefitType]) {

        return labels[benefitType];

    }


    const normalized =
        String(benefitType)
            .trim()
            .toUpperCase();


    if (normalized.startsWith("P")) {
        return "P – Productivity";
    }

    if (normalized.startsWith("Q")) {
        return "Q – Quality";
    }

    if (normalized.startsWith("C")) {
        return "C – Cost";
    }

    if (normalized.startsWith("D")) {
        return "D – Delivery";
    }

    if (normalized.startsWith("S")) {
        return "S – Safety";
    }

    if (normalized.startsWith("M")) {
        return "M – Morale";
    }


    return benefitType;

}


function formatDate(value) {

    if (!value) {

        return "-";

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return value;

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


function getDateInputValue(value) {

    if (!value) {

        return "";

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    return `${date.getFullYear()}-${String(
        date.getMonth() + 1
    ).padStart(2, "0")}-${String(
        date.getDate()
    ).padStart(2, "0")}`;

}


// ============================================================
// STATUS BADGE
// ============================================================

function StatusBadge({
    item,
}) {

    const status =
        getStatus(item);


    const config =
        STATUS_CONFIG[status] || {

            label:
                status
                    .replaceAll(
                        "_",
                        " "
                    ) ||
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
                `employee-summary-card hod-summary-card summary-${type}`
            }
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


// ============================================================
// HOD DASHBOARD
// ============================================================

export default function HODDashboard() {

    const {
        user,
        logout,
    } = useAuth();


    const [
        sidebarOpen,
        setSidebarOpen,
    ] = useState(false);


    const [
        showAdd,
        setShowAdd,
    ] = useState(false);

    const [
        showProfile,
        setShowProfile,
    ] = useState(false);

    const [
        myImprovementsCollapsed,
        setMyImprovementsCollapsed,
    ] = useState(false);

    const [
        underMeCollapsed,
        setUnderMeCollapsed,
    ] = useState(false);

    const [
        employeesCollapsed,
        setEmployeesCollapsed,
    ] = useState(false);


    const [
        summary,
        setSummary,
    ] = useState({});


    const [
        myImprovements,
        setMyImprovements,
    ] = useState([]);


    const [
        underMeImprovements,
        setUnderMeImprovements,
    ] = useState([]);


    const [
        employees,
        setEmployees,
    ] = useState([]);


    const [
        loading,
        setLoading,
    ] = useState(true);


    const [
        error,
        setError,
    ] = useState("");


    const [
        selected,
        setSelected,
    ] = useState(null);


    const [
        detailLoading,
        setDetailLoading,
    ] = useState(false);


    const [
        detailError,
        setDetailError,
    ] = useState("");

    const [draftToEdit, setDraftToEdit] = useState(null);
    const [listRefreshKey, setListRefreshKey] = useState(0);


    // --------------------------------------------------------
    // FILTERS
    // --------------------------------------------------------

    const [
        filterStatus,
        setFilterStatus,
    ] = useState("all");


    const [
        fromDate,
        setFromDate,
    ] = useState("");


    const [
        toDate,
        setToDate,
    ] = useState("");


    const [
        search,
        setSearch,
    ] = useState("");


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
                underMeData,
                employeesData,
            ] = await Promise.all([

                getHODSummary(),

                getHODMyImprovements(),

                getHODUnderMeImprovements(),

                getHODEmployees(),

            ]);


            setSummary(
                summaryData || {}
            );


            setMyImprovements(
                getList(
                    myData
                )
            );


            setUnderMeImprovements(
                getList(
                    underMeData
                )
            );


            setEmployees(
                getList(
                    employeesData
                )
            );


        } catch (err) {

            console.error(
                "HOD dashboard error:",
                err
            );


            setError(
                err?.message ||
                "Unable to load HOD dashboard."
            );

        } finally {

            setLoading(false);

        }

    }


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


    async function handleSaveOwnerEdit(payload) {
        if (!selected?.id) throw new Error("Improvement ID is missing.");
        const updated = await updateOwnedImprovement(selected.id, payload);
        setSelected(updated);
        await loadDashboard();
    }


    // ========================================================
    // FIRST NAME
    // ========================================================

    const firstName =
        user?.full_name
            ?.split(" ")
            ?.[0] ||
        user?.name
            ?.split(" ")
            ?.[0] ||
        "there";


    // ========================================================
    // MY IMPROVEMENT COUNTS
    // ========================================================

    const myTotal =
        summary?.my_total ??
        myImprovements.length;


    const myPending =
        summary?.my_pending ??
        myImprovements.filter(
            (item) =>
                PENDING_STATUSES.includes(
                    getStatus(item)
                )
        ).length;


    const myProgress =
        summary?.my_in_progress ??
        myImprovements.filter(
            (item) =>
                getStatus(item) ===
                "in_progress"
        ).length;


    const myRejected =
        summary?.my_rejected ??
        myImprovements.filter(
            (item) =>
                getStatus(item) ===
                "rejected"
        ).length;


    const myDone =
        summary?.my_done ??
        myImprovements.filter(
            (item) =>
                [
                    "done",
                    "closed",
                ].includes(
                    getStatus(item)
                )
        ).length;


    // ========================================================
    // UNDER ME COUNTS
    // ========================================================

    const totalEmployees =
        summary?.under_me_employees ??
        summary?.total_employees ??
        employees.length;


    const underMeTotal =
        summary?.under_me_total ??
        summary?.total_improvements ??
        underMeImprovements.length;


    const underMeApproved =
        summary?.under_me_approved ??
        summary?.approved ??
        underMeImprovements.filter(
            (item) =>
                getStatus(item) ===
                "approved"
        ).length;


    const underMeResubmission =
        summary?.under_me_resubmission ??
        summary?.resubmission_required ??
        underMeImprovements.filter(
            (item) =>
                RESUBMISSION_STATUSES.includes(
                    getStatus(item)
                )
        ).length;


    const underMePending =
        summary?.under_me_pending ??
        underMeImprovements.filter(
            (item) =>
                PENDING_STATUSES.includes(
                    getStatus(item)
                )
        ).length;


    const underMeProgress =
        summary?.under_me_in_progress ??
        summary?.in_progress ??
        underMeImprovements.filter(
            (item) =>
                getStatus(item) ===
                "in_progress"
        ).length;


    const underMeRejected =
        summary?.under_me_rejected ??
        summary?.rejected ??
        underMeImprovements.filter(
            (item) =>
                getStatus(item) ===
                "rejected"
        ).length;


    const underMeDone =
        summary?.under_me_done ??
        summary?.completed ??
        underMeImprovements.filter(
            (item) =>
                [
                    "done",
                    "closed",
                ].includes(
                    getStatus(item)
                )
        ).length;


    // ========================================================
    // FILTERED UNDER-ME IMPROVEMENTS
    // ========================================================

    const filteredUnderMe =
        useMemo(() => {

            const query =
                search
                    .trim()
                    .toLowerCase();


            return underMeImprovements.filter(
                (item) => {

                    const status =
                        getStatus(
                            item
                        );


                    // ------------------------------------------
                    // STATUS
                    // ------------------------------------------

                    if (
                        filterStatus !==
                        "all" &&
                        status !==
                        filterStatus
                    ) {

                        return false;

                    }


                    // ------------------------------------------
                    // DATE
                    // ------------------------------------------

                    const itemDate =
                        getDateInputValue(
                            item?.created_at ||
                            item?.date_opened ||
                            item?.updated_at
                        );


                    if (
                        fromDate &&
                        itemDate &&
                        itemDate <
                            fromDate
                    ) {

                        return false;

                    }


                    if (
                        toDate &&
                        itemDate &&
                        itemDate >
                            toDate
                    ) {

                        return false;

                    }


                    // ------------------------------------------
                    // SEARCH
                    // ------------------------------------------

                    if (query) {

                        const searchable = [

                            getProjectId(
                                item
                            ),

                            getEmployeeName(
                                item
                            ),

                            item?.employee_code,

                            item?.employee_email,

                            getDepartment(
                                item
                            ),

                            getPlant(
                                item
                            ),

                            item?.project_idea,

                            item?.idea,

                            item?.kaizen_theme,

                        ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();


                        if (
                            !searchable.includes(
                                query
                            )
                        ) {

                            return false;

                        }

                    }


                    return true;

                }
            );

        }, [
            underMeImprovements,
            filterStatus,
            fromDate,
            toDate,
            search,
        ]);


    // ========================================================
    // VIEW IMPROVEMENT
    // ========================================================

    async function handleView(
        improvementId
    ) {

        try {

            setDetailLoading(
                true
            );

            setDetailError("");

            setSelected(null);


            const data =
                await getImprovement(
                    improvementId
                );


            setSelected(
                data
            );


        } catch (err) {

            console.error(
                err
            );


            setDetailError(
                err?.message ||
                "Unable to load improvement details."
            );

        } finally {

            setDetailLoading(
                false
            );

        }

    }


    // ========================================================
    // SAVE & RESUBMIT HOD OWN IMPROVEMENT
    //
    // HOD can edit/resubmit only an improvement created
    // by the logged-in HOD. Employee improvements remain
    // view-only.
    // ========================================================

    async function handleSaveEdit(
        payload
    ) {

        if (
            !selected?.id
        ) {

            throw new Error(
                "Improvement ID is missing."
            );

        }


        try {

            const updated =
                await resubmitImprovement(
                    selected.id,
                    payload
                );


            setSelected(
                updated
            );


            await loadDashboard();

        } catch (err) {

            console.error(
                "HOD Save & Resubmit:",
                err
            );


            throw err;

        }

    }


    // ========================================================
    // CHECK WHETHER SELECTED IMPROVEMENT BELONGS TO HOD
    // ========================================================

    const selectedIsOwnImprovement =
        selected &&
        user &&
        String(
            selected?.employee_id ||
            selected?.user_id ||
            selected?.created_by ||
            ""
        ) ===
        String(
            user?.id ||
            ""
        );


    // ========================================================
    // CLEAR FILTERS
    // ========================================================

    function clearFilters() {

        setFilterStatus(
            "all"
        );

        setFromDate(
            ""
        );

        setToDate(
            ""
        );

        setSearch(
            ""
        );

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
    // ADD IMPROVEMENT
    // ========================================================

    if (showAdd) {

        return (

            <AddImprovement

                draft={draftToEdit}

                onBack={() => {
                    setDraftToEdit(null);
                    setShowAdd(false);
                }}

                onCreated={async () => {
                    setDraftToEdit(null);
                    setShowAdd(false);
                    await loadDashboard();
                    setListRefreshKey((value) => value + 1);
                }}

            />

        );

    }


    // ========================================================
    // LOADING
    // ========================================================

    if (
        loading &&
        !myImprovements.length &&
        !underMeImprovements.length
    ) {

        return (

            <div className="employee-app-shell">
                

                <main className="employee-main">

                    <div className="employee-content">

                        <div className="table-empty-state">

                            <div className="loading-spinner-small" />

                            <span>
                                Loading HOD Dashboard...
                            </span>

                        </div>

                    </div>

                </main>

            </div>

        );

    }


    // ========================================================
    // DASHBOARD
    // ========================================================

    return (

        <div className="employee-app-shell hod-dashboard">
           

            {/* =================================================
                MOBILE OVERLAY
            ================================================= */}

            {sidebarOpen && (

                <div
                    className="mobile-sidebar-overlay"
                    onClick={() =>
                        setSidebarOpen(
                            false
                        )
                    }
                />

            )}


            {/* =================================================
                SIDEBAR
            ================================================= */}

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
                        setSidebarOpen(
                            false
                        )
                    }
                >
                    <X size={20} />
                </button>


                <nav className="employee-sidebar-nav">

                    <button
                        className="employee-nav-item active"
                        type="button"
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
                        type="button"
                        onClick={() =>
                            setShowAdd(
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
                        onClick={
                            logout
                        }
                        type="button"
                    >

                        <LogOut
                            size={18}
                        />

                        <span>
                            Logout
                        </span>

                    </button>

                </div>

            </aside>


            {/* =================================================
                MAIN
            ================================================= */}

            <main className="employee-main">

                {/* =================================================
                    HEADER
                ================================================= */}

                <header className="employee-header">

                    <button
                        className="mobile-menu-button"
                        onClick={() =>
                            setSidebarOpen(
                                true
                            )
                        }
                        type="button"
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
                                    .charAt(
                                        0
                                    )
                                    .toUpperCase()
                            }

                        </div>


                        <div className="employee-user-info">

                            <strong>
                                {
                                    user?.full_name ||
                                    user?.name ||
                                    "HOD"
                                }
                            </strong>

                            <span>
                                HOD
                            </span>

                        </div>

                    </div>

                    </button>

                </header>


                {/* =================================================
                    CONTENT
                ================================================= */}

                <section className="employee-content">

                    {/* =================================================
                        PAGE HEADING
                    ================================================= */}

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
                                setShowAdd(
                                    true
                                )
                            }
                            type="button"
                        >

                            <Plus size={18} />

                            Add Improvement

                        </button>

                    </div>


                    {/* =================================================
                        ERROR
                    ================================================= */}

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


                    {/* =================================================
                        MY IMPROVEMENTS
                    ================================================= */}

                    <div className="hod-summary-label">
                        My Improvements
                    </div>


                    <div className="employee-summary-grid hod-my-summary-grid">

                        <SummaryCard
                            icon={
                                <ClipboardList
                                    size={21}
                                />
                            }
                            value={
                                myTotal
                            }
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
                            value={
                                myPending
                            }
                            title="My Pending"
                            description="Waiting for the next stage"
                            type="pending"
                        />


                        <SummaryCard
                            icon={
                                <Clock3
                                    size={21}
                                />
                            }
                            value={
                                myProgress
                            }
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
                            value={
                                myRejected
                            }
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
                            value={
                                myDone
                            }
                            title="My Done"
                            description="Successfully completed"
                            type="done"
                        />

                    </div>


                    {/* =================================================
                        UNDER ME
                    ================================================= */}

                    <div className="hod-summary-label">
                        Improvements Under Me
                    </div>


                    <div className="hod-overall-grid">

                        <SummaryCard
                            icon={
                                <Users
                                    size={21}
                                />
                            }
                            value={
                                totalEmployees
                            }
                            title="Total Employees"
                            description="Employees under you"
                            type="total"
                        />


                        <SummaryCard
                            icon={
                                <ClipboardList
                                    size={21}
                                />
                            }
                            value={
                                underMeTotal
                            }
                            title="All Improvements"
                            description="Every improvement under you"
                            type="total"
                        />


                        <SummaryCard
                            icon={
                                <CheckCircle2
                                    size={21}
                                />
                            }
                            value={
                                underMeApproved
                            }
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
                            value={
                                underMeResubmission
                            }
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
                            value={
                                underMePending
                            }
                            title="Pending"
                            description="Awaiting the next stage"
                            type="pending"
                        />


                        <SummaryCard
                            icon={
                                <Clock3
                                    size={21}
                                />
                            }
                            value={
                                underMeProgress
                            }
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
                            value={
                                underMeRejected
                            }
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
                            value={
                                underMeDone
                            }
                            title="Done"
                            description="Successfully closed"
                            type="done"
                        />

                    </div>


                    {/* =================================================
                        MY IMPROVEMENTS LIST
                    ================================================= */}

                    <ImprovementPanel
                        sectionId="my-improvements-list"

                        title="My Improvements"

                        

                        items={
                            myImprovements
                        }

                        collapsed={myImprovementsCollapsed}

                        onToggle={() => setMyImprovementsCollapsed((value) => !value)}

                        onView={
                            handleView
                        }

                    />


                    {/* =================================================
                        UNDER ME IMPROVEMENTS
                    ================================================= */}

                    <section className="hod-panel">

                        <PanelHeader

                            title="Improvements Under Me"

                            

                            count={
                                filteredUnderMe.length
                            }

                            collapsed={underMeCollapsed}

                            onToggle={() => setUnderMeCollapsed((value) => !value)}

                        />

                        {/* =================================================
                            FILTERS
                        ================================================= */}

                        <div className="hod-filters">

                            <div className="hod-filter-search">

                                <label>
                                    Search
                                </label>


                                <input

                                    value={
                                        search
                                    }

                                    onChange={
                                        (event) =>
                                            setSearch(
                                                event.target.value
                                            )
                                    }

                                    placeholder="ID, employee, code, department..."

                                />

                            </div>


                            <div>

                                <label>
                                    Status
                                </label>


                                <select

                                    value={
                                        filterStatus
                                    }

                                    onChange={
                                        (event) =>
                                            setFilterStatus(
                                                event.target.value
                                            )
                                    }

                                >

                                    <option value="all">
                                        All Statuses
                                    </option>

                                    <option value="pending_hod">
                                        Pending HOD
                                    </option>

                                    <option value="pending_plant_head">
                                        Pending Plant Head
                                    </option>

                                    <option value="pending_plant_head_2">
                                        Pending Plant Head
                                    </option>

                                    <option value="pending_accounts">
                                        Pending Accounts
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
                                        fromDate
                                    }
                                    onChange={
                                        (event) =>
                                            setFromDate(
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
                                        toDate
                                    }
                                    onChange={
                                        (event) =>
                                            setToDate(
                                                event.target.value
                                            )
                                    }
                                />

                            </div>


                            <button
                                className="hod-clear-filter"
                                onClick={
                                    clearFilters
                                }
                                type="button"
                            >

                                <Filter
                                    size={14}
                                />

                                Clear

                            </button>

                        </div>


                        {underMeCollapsed ? (
                            <div className="dashboard-list-collapsed">
                                 Click Expand to view it.
                            </div>
                        ) : (
                            <ImprovementTable

                            items={
                                filteredUnderMe
                            }

                            showEmployee

                            onView={
                                handleView
                            }

                        />
                        )}

                    </section>


                    {/* =================================================
                        UNDER ME EMPLOYEES
                    ================================================= */}

                    <section className="hod-panel">

                        <PanelHeader

                            title="Employees Under Me"

                            

                            count={
                                employees.length
                            }

                            collapsed={employeesCollapsed}

                            onToggle={() => setEmployeesCollapsed((value) => !value)}

                        />

                        <div className="hod-table-wrapper">

                            {employees.length === 0 ? (

                                <EmptyState

                                    icon={
                                        <Users
                                            size={27}
                                        />
                                    }

                                    title="No employees found"

                                    text="No active employees are currently assigned to you."

                                />

                            ) : (

                                employeesCollapsed ? (
                                    <div className="dashboard-list-collapsed">
                                         Click Expand to view it.
                                    </div>
                                ) : (
                                <table className="hod-table hod-employee-table">

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

                                        {employees.map(
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
                                        )}

                                    </tbody>

                                </table>
                                )
                            )}

                        </div>

                    </section>

                </section>

            <div className="employee-content dashboard-lists-container">
            <Lists
            showAll={true}
            refreshKey={listRefreshKey}
            onOpenDraft={(draft) => {
                setDraftToEdit(draft);
                setShowAdd(true);
            }}
        />
            </div>

        </main>


            {/* =================================================
                VIEW IMPROVEMENT MODAL
            ================================================= */}

            {(detailLoading ||
                detailError ||
                selected) && (

                <div
                    className="improvement-detail-overlay"
                    onClick={() => {

                        if (
                            !detailLoading
                        ) {

                            setSelected(
                                null
                            );

                            setDetailError(
                                ""
                            );

                        }

                    }}
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
                                        selected?.project_id ||
                                        "Improvement Details"
                                    }
                                </h2>

                            </div>


                            <button

                                className="improvement-detail-close"

                                onClick={() => {

                                    setSelected(
                                        null
                                    );

                                    setDetailError(
                                        ""
                                    );

                                }}

                                type="button"

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


                        {selected &&
                            !detailLoading && (

                                <ViewImprovement

                                    improvement={
                                        selected
                                    }

                                    onClose={() =>
                                        setSelected(
                                            null
                                        )
                                    }

                                    editableOnResubmission={
                                        Boolean(
                                            selectedIsOwnImprovement
                                        )
                                    }

                                    ownerEditEnabled={
                                        Boolean(
                                            selectedIsOwnImprovement
                                        )
                                    }

                                    onSaveEdit={
                                        selectedIsOwnImprovement
                                            ? handleSaveEdit
                                            : undefined
                                    }

                                    onSaveOwnerEdit={
                                        selectedIsOwnImprovement
                                            ? handleSaveOwnerEdit
                                            : undefined
                                    }

                                />

                            )}

                    </div>

                </div>

            )}

        </div>

    );

}


// ============================================================
// PANEL HEADER
// ============================================================

function PanelHeader({
    title,
    description,
    count,
    collapsed,
    onToggle,
}) {

    return (

        <div className="hod-panel-header">

            <div>

                <h2>
                    {title}
                </h2>

                <p>
                    {description}
                </p>

            </div>


            <div className="dashboard-panel-header-actions">
                <div className="hod-count">

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

    );

}


// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({
    icon,
    title,
    text,
}) {

    return (

        <div className="hod-empty-state">

            {icon}

            <h3>
                {title}
            </h3>

            <p>
                {text}
            </p>

        </div>

    );

}


// ============================================================
// MY IMPROVEMENT PANEL
// ============================================================

function ImprovementPanel({
    sectionId,
    title,
    description,
    items,
    onView,
    collapsed = false,
    onToggle,
}) {

    return (

        <section className="hod-panel" id={sectionId}>

            <PanelHeader

                title={
                    title
                }

                description={
                    description
                }

                count={
                    items.length
                }

                collapsed={collapsed}

                onToggle={onToggle}

            />

            {collapsed ? (
                <div className="dashboard-list-collapsed">
                    Click Expand to view it.
                </div>
            ) : (

            <ImprovementTable

                items={
                    items
                }

                onView={
                    onView
                }

                myList

            />

            )}

        </section>

    );

}


// ============================================================
// IMPROVEMENT TABLE
//
// IMPORTANT:
// HOD ONLY HAS VIEW ACTION.
// There is intentionally NO approve/reject/resubmit.
// ============================================================

function ImprovementTable({
    items,
    onView,
    showEmployee = false,
    myList = false,
}) {

    if (
        !items.length
    ) {

        return (

            <EmptyState

                icon={
                    <ClipboardList
                        size={27}
                    />
                }

                title="No improvements found"

                text="There are no improvement records to display."

            />

        );

    }


    return (

        <div className="hod-table-wrapper">

            <table className="hod-table">

                <thead>

                    <tr>

                        <th>
                            Improvement ID
                        </th>


                        {myList ? (

                            <>
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
                            </>

                        ) : (

                            <>
                                {showEmployee && (

                                    <th>
                                        Employee
                                    </th>

                                )}


                                {showEmployee && (

                                    <th>
                                        Employee Code
                                    </th>

                                )}


                                <th>

                                    {
                                        showEmployee
                                            ? "Department"
                                            : "Project Idea"
                                    }

                                </th>


                                {showEmployee && (

                                    <th>
                                        Plant
                                    </th>

                                )}


                                <th>
                                    Status
                                </th>
                            </>

                        )}


                        <th>
                            Action
                        </th>

                    </tr>

                </thead>


                <tbody>

                    {items.map(
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


                                {myList ? (

                                    <>
                                        <td>
                                            {
                                                getBenefitLabel(
                                                    item?.benefit_type
                                                )
                                            }
                                        </td>

                                        <td>
                                            {
                                                item?.current_stage ||
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
                                            {
                                                formatDate(
                                                    item?.created_at
                                                )
                                            }
                                        </td>
                                    </>

                                ) : (

                                    <>
                                        {showEmployee && (

                                            <td>
                                                {
                                                    getEmployeeName(
                                                        item
                                                    )
                                                }
                                            </td>

                                        )}


                                        {showEmployee && (

                                            <td>
                                                {
                                                    item.employee_code ||
                                                    "-"
                                                }
                                            </td>

                                        )}


                                        <td>

                                            {
                                                showEmployee
                                                    ? getDepartment(
                                                        item
                                                    )
                                                    : (
                                                        item.project_idea ||
                                                        item.idea ||
                                                        "-"
                                                    )
                                            }

                                        </td>


                                        {showEmployee && (

                                            <td>
                                                {
                                                    getPlant(
                                                        item
                                                    )
                                                }
                                            </td>

                                        )}


                                        <td>

                                            <StatusBadge
                                                item={
                                                    item
                                                }
                                            />

                                        </td>
                                    </>

                                )}


                                <td>

                                    <div className="hod-actions">

                                        <button

                                            className="hod-icon-button"

                                            title="View improvement"

                                            onClick={() =>
                                                onView(
                                                    item.id
                                                )
                                            }

                                            type="button"

                                        >

                                            <Eye
                                                size={15}
                                            />

                                        </button>

                                    </div>

                                </td>

                            </tr>

                        )
                    )}

                </tbody>

            </table>

        </div>

    );

}