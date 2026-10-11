import {
    useEffect,
    useState,
} from "react";

import {
    getAllUsers,
    getAllImprovements,
    getImprovementSummary,
    changeUserPassword,
    approveUserRegistration,
    rejectUserRegistration,
} from "../../api/admin";

import {
    useAuth,
} from "../../context/AuthContext";

import { goToPortal } from "../../utils/portal";
import "./AdminDashboard.css";
import "../../DashboardEnhancements.css";
import Profile from "../profile/Profile.jsx";
import logo from "../../../assest/logo.jpg";
import ImprovementBackground from "../../components/ImprovementBackground";
import Lists from "../../components/List.jsx";


function AdminDashboard() {

    const {
        user,
        logout,
    } = useAuth();


    // ========================================================
    // STATE
    // ========================================================

    const [
        showProfile,
        setShowProfile,
    ] = useState(false);

    const [
        improvementsCollapsed,
        setImprovementsCollapsed,
    ] = useState(false);

    const [
        usersCollapsed,
        setUsersCollapsed,
    ] = useState(false);

    const [
        summary,
        setSummary,
    ] = useState({
        total_improvements: 0,
        pending_approval: 0,
        in_progress: 0,
        rejected: 0,
        done: 0,
    });


    const [
        users,
        setUsers,
    ] = useState([]);


    const [
        improvements,
        setImprovements,
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
        selectedUser,
        setSelectedUser,
    ] = useState(null);


    const [
        newPassword,
        setNewPassword,
    ] = useState("");


    const [
        passwordLoading,
        setPasswordLoading,
    ] = useState(false);


    const [
        passwordMessage,
        setPasswordMessage,
    ] = useState("");


    const [
        passwordError,
        setPasswordError,
    ] = useState("");


    const [
        approvalLoading,
        setApprovalLoading,
    ] = useState(null);


    // ========================================================
    // IMPROVEMENT FILTERS
    // ========================================================

    const [
        improvementStatusFilter,
        setImprovementStatusFilter,
    ] = useState("all");


    const [
        improvementFromDate,
        setImprovementFromDate,
    ] = useState("");


    const [
        improvementToDate,
        setImprovementToDate,
    ] = useState("");


    // ========================================================
    // USER FILTERS
    // ========================================================

    const [
        userRoleFilter,
        setUserRoleFilter,
    ] = useState("all");


    const [
        userStatusFilter,
        setUserStatusFilter,
    ] = useState("all");


    const [
        userApprovalFilter,
        setUserApprovalFilter,
    ] = useState("all");


    // ========================================================
    // LOAD ADMIN DATA
    // ========================================================

    const loadDashboard =
        async () => {

            setLoading(true);

            setError("");


            try {

                const [
                    summaryData,
                    usersData,
                    improvementsData,
                ] = await Promise.all([

                    getImprovementSummary(),

                    getAllUsers(),

                    getAllImprovements(),

                ]);


                setSummary(
                    summaryData || {}
                );


                setUsers(
                    Array.isArray(usersData)
                        ? usersData
                        : []
                );


                setImprovements(
                    Array.isArray(
                        improvementsData
                    )
                        ? improvementsData
                        : []
                );

            }

            catch (err) {

                console.error(
                    "Admin dashboard error:",
                    err
                );


                setError(
                    err?.message ||
                    "Unable to load admin dashboard."
                );

            }

            finally {

                setLoading(false);

            }

        };


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


    // ========================================================
    // APPROVE USER
    // ========================================================

    const handleApproveUser =
        async (selectedUserItem) => {

            if (!selectedUserItem) {

                return;

            }


            setApprovalLoading(
                selectedUserItem.id
            );


            try {

                await approveUserRegistration(
                    selectedUserItem.id
                );


                await loadDashboard();

            }

            catch (err) {

                setError(
                    err?.message ||
                    "Unable to approve user registration."
                );

            }

            finally {

                setApprovalLoading(null);

            }

        };


    // ========================================================
    // REJECT USER
    // ========================================================

    const handleRejectUser =
        async (selectedUserItem) => {

            if (!selectedUserItem) {

                return;

            }


            const confirmed =
                window.confirm(
                    `Are you sure you want to reject the registration of ${selectedUserItem.full_name}?`
                );


            if (!confirmed) {

                return;

            }


            setApprovalLoading(
                selectedUserItem.id
            );


            try {

                await rejectUserRegistration(
                    selectedUserItem.id
                );


                await loadDashboard();

            }

            catch (err) {

                setError(
                    err?.message ||
                    "Unable to reject user registration."
                );

            }

            finally {

                setApprovalLoading(null);

            }

        };


    // ========================================================
    // CHANGE PASSWORD
    // ========================================================

    const handleChangePassword =
        async () => {

            setPasswordMessage("");

            setPasswordError("");


            if (!selectedUser) {

                return;

            }


            if (
                selectedUser.registration_status !==
                "approved" ||
                !selectedUser.is_active
            ) {

                setPasswordError(
                    "Password can only be changed for an approved active user."
                );

                return;

            }


            if (
                !newPassword ||
                newPassword.length < 8
            ) {

                setPasswordError(
                    "Password must contain at least 8 characters."
                );

                return;

            }


            setPasswordLoading(true);


            try {

                const response =
                    await changeUserPassword(
                        selectedUser.id,
                        newPassword
                    );


                setPasswordMessage(
                    response?.message ||
                    "Password changed successfully."
                );


                setNewPassword("");

            }

            catch (err) {

                setPasswordError(
                    err?.message ||
                    "Unable to change password."
                );

            }

            finally {

                setPasswordLoading(false);

            }

        };


    // ========================================================
    // FORMAT STATUS
    // ========================================================

    const formatStatus =
        (status) => {

            if (!status) {

                return "—";

            }


            return String(status)
                .replaceAll("_", " ")
                .replace(
                    /\b\w/g,
                    (char) =>
                        char.toUpperCase()
                );

        };


    // ========================================================
    // FORMAT ROLE
    // ========================================================

    const formatRole =
        (role) => {

            if (!role) {

                return "—";

            }


            return String(role)
                .replaceAll("_", " ")
                .replace(
                    /\b\w/g,
                    (char) =>
                        char.toUpperCase()
                );

        };


    // ========================================================
    // PASSWORD PERMISSION
    // ========================================================

    const canChangePassword =
        (item) => {

            return (
                item?.registration_status ===
                "approved" &&
                item?.is_active === true
            );

        };


    // ========================================================
    // FIND EMPLOYEE
    // ========================================================

    const getImprovementEmployee =
        (improvement) => {

            if (!improvement) {

                return null;

            }


            const employeeId =
                improvement.employee_id;


            if (!employeeId) {

                return null;

            }


            return (
                users.find(
                    (item) =>
                        String(item.id) ===
                        String(employeeId)
                ) || null
            );

        };


    // ========================================================
    // BENEFIT
    // ========================================================

    const formatBenefit =
        (benefit) => {

            if (!benefit) {

                return "—";

            }


            const value =
                String(benefit).trim();


            const benefitMap = {

                S: "Safety",
                s: "Safety",
                SAFETY: "Safety",

                Q: "Quality",
                q: "Quality",
                QUALITY: "Quality",

                D: "Delivery",
                d: "Delivery",
                DELIVERY: "Delivery",

                C: "Cost",
                c: "Cost",
                COST: "Cost",

                M: "Morale",
                m: "Morale",
                MORALE: "Morale",

                P: "Productivity",
                p: "Productivity",
                PRODUCTIVITY: "Productivity",

            };


            return (
                benefitMap[value] ||
                value
            );

        };


    // ========================================================
    // EMPLOYEE NAME
    // ========================================================

    const getEmployeeName =
        (improvement) => {

            const employee =
                getImprovementEmployee(
                    improvement
                );


            return (
                employee?.full_name ||
                improvement?.employee_name ||
                improvement?.owner_name ||
                "—"
            );

        };


    // ========================================================
    // EMPLOYEE CODE
    // ========================================================

    const getEmployeeCode =
        (improvement) => {

            const employee =
                getImprovementEmployee(
                    improvement
                );


            return (
                employee?.employee_code ||
                improvement?.employee_code ||
                "—"
            );

        };


    // ========================================================
    // PLANT
    // ========================================================

    const getPlant =
        (improvement) => {

            const employee =
                getImprovementEmployee(
                    improvement
                );


            return (
                improvement?.plant ||
                improvement?.plant_name ||
                improvement?.plant_code ||
                employee?.plant ||
                employee?.plant_name ||
                employee?.plant_code ||
                "—"
            );

        };


    // ========================================================
    // DEPARTMENT
    // ========================================================

    const getDepartment =
        (improvement) => {

            const employee =
                getImprovementEmployee(
                    improvement
                );


            return (
                improvement?.department_line ||
                improvement?.department ||
                improvement?.department_name ||
                employee?.department ||
                employee?.department_name ||
                employee?.department_line ||
                "—"
            );

        };


    // ========================================================
    // IMPROVEMENT DATE
    // ========================================================

    const getImprovementDate =
        (improvement) => {

            const rawDate =
                improvement?.created_at ||
                improvement?.submitted_at ||
                improvement?.updated_at ||
                improvement?.date ||
                improvement?.createdAt ||
                improvement?.submittedAt ||
                improvement?.updatedAt;


            if (!rawDate) {

                return null;

            }


            const date =
                new Date(rawDate);


            return Number.isNaN(
                date.getTime()
            )
                ? null
                : date;

        };


    // ========================================================
    // FILTER IMPROVEMENTS
    // ========================================================

    const filteredImprovements =
        improvements.filter(
            (improvement) => {

                const status =
                    String(
                        improvement?.status ||
                        ""
                    )
                    .trim()
                    .toLowerCase();


                let matchesStatus = true;


                if (
                    improvementStatusFilter !==
                    "all"
                ) {

                    if (
                        improvementStatusFilter ===
                        "pending"
                    ) {

                        matchesStatus =
                            status.includes(
                                "pending"
                            );

                    }

                    else if (
                        improvementStatusFilter ===
                        "in_progress"
                    ) {

                        matchesStatus =
                            status ===
                                "in_progress" ||
                            status ===
                                "in progress";

                    }

                    else if (
                        improvementStatusFilter ===
                        "rejected"
                    ) {

                        matchesStatus =
                            status ===
                            "rejected";

                    }

                    else if (
                        improvementStatusFilter ===
                        "closed"
                    ) {

                        matchesStatus =
                            status ===
                            "closed";

                    }

                    else if (
                        improvementStatusFilter ===
                        "done"
                    ) {

                        matchesStatus =
                            status ===
                            "done";

                    }

                }


                if (!matchesStatus) {

                    return false;

                }


                const improvementDate =
                    getImprovementDate(
                        improvement
                    );


                if (
                    improvementFromDate
                ) {

                    const fromDate =
                        new Date(
                            `${improvementFromDate}T00:00:00`
                        );


                    if (
                        !improvementDate ||
                        improvementDate <
                            fromDate
                    ) {

                        return false;

                    }

                }


                if (
                    improvementToDate
                ) {

                    const toDate =
                        new Date(
                            `${improvementToDate}T23:59:59.999`
                        );


                    if (
                        !improvementDate ||
                        improvementDate >
                            toDate
                    ) {

                        return false;

                    }

                }


                return true;

            }
        );


    // ========================================================
    // CLEAR IMPROVEMENT FILTERS
    // ========================================================

    const clearImprovementFilters =
        () => {

            setImprovementStatusFilter(
                "all"
            );

            setImprovementFromDate(
                ""
            );

            setImprovementToDate(
                ""
            );

        };


    // ========================================================
    // FILTER USERS
    // ========================================================

    const filteredUsers =
        users.filter(
            (item) => {

                const role =
                    String(
                        item?.role ||
                        ""
                    )
                    .trim()
                    .toLowerCase();


                const activeStatus =
                    item?.is_active === true
                        ? "active"
                        : "inactive";


                const approvalStatus =
                    String(
                        item?.registration_status ||
                        ""
                    )
                    .trim()
                    .toLowerCase();


                let matchesRole = true;


                if (
                    userRoleFilter !==
                    "all"
                ) {

                    if (
                        userRoleFilter ===
                        "employees"
                    ) {

                        matchesRole =
                            role ===
                                "employee" ||
                            role ===
                                "employees";

                    }

                    else {

                        matchesRole =
                            role ===
                            userRoleFilter;

                    }

                }


                const matchesStatus =
                    userStatusFilter ===
                        "all" ||
                    activeStatus ===
                        userStatusFilter;


                const matchesApproval =
                    userApprovalFilter ===
                        "all" ||
                    approvalStatus ===
                        userApprovalFilter;


                return (
                    matchesRole &&
                    matchesStatus &&
                    matchesApproval
                );

            }
        );


    // ========================================================
    // CLEAR USER FILTERS
    // ========================================================

    const clearUserFilters =
        () => {

            setUserRoleFilter(
                "all"
            );

            setUserStatusFilter(
                "all"
            );

            setUserApprovalFilter(
                "all"
            );

        };


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
    // LOADING
    // ========================================================

    if (loading) {

        return (

            <div className="admin-shell">
                <ImprovementBackground />
                

                <header className="admin-header">

                    <div className="admin-brand">
                        <img
                            src={logo}
                            alt="NRB Industrial Bearings"
                            className="admin-brand-logo"
                        />
                    </div>


                    <div className="admin-header-badge">
                        ADMIN
                    </div>

                </header>


                <main className="admin-content">
                    <ImprovementBackground />
                    

                    <div className="admin-loading">
                        Loading dashboard...
                    </div>

                </main>

            </div>

        );

    }


    // ========================================================
    // ERROR
    // ========================================================

    if (error) {

        return (

            <div className="admin-shell">

                <header className="admin-header">

                    <div className="admin-brand">
                        <img
                            src={logo}
                            alt="NRB Industrial Bearings"
                            className="admin-brand-logo"
                        />
                    </div>


                    <div className="admin-header-right">

                        <span className="admin-header-badge">
                            ADMIN
                        </span>


                        <button
                            className="admin-logout admin-workspace"
                            onClick={() => goToPortal("/")}
                            type="button"
                        >
                            Workspace
                        </button>

                        <button
                            className="admin-logout"
                            onClick={logout}
                        >
                            Logout
                        </button>

                    </div>

                </header>


                <main className="admin-content">

                    <div className="admin-error">

                        <h2>
                            Unable to load dashboard
                        </h2>

                        <p>
                            {error}
                        </p>

                        <button
                            onClick={loadDashboard}
                            className="admin-retry"
                        >
                            Try Again
                        </button>

                    </div>

                </main>

            </div>

        );

    }


    // ========================================================
    // DASHBOARD
    // ========================================================

    return (

        <div className="admin-shell">
            <ImprovementBackground />
            

            {/* ==================================================
                HEADER
            ================================================== */}

            <header className="admin-header">

                <div className="admin-brand">
                    <img
                        src={logo}
                        alt="NRB Industrial Bearings"
                        className="admin-brand-logo"
                    />
                </div>


                <div className="admin-header-right">

                    <div
                        className="admin-user"
                        style={{
                            display: "flex",
                            alignItems: "center",
                        }}
                    >
                        <div
                            className="admin-user-text"
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                minWidth: 0,
                                gap: "2px",
                            }}
                        >
                            <span
                                className="admin-user-name"
                                style={{
                                    display: "block",
                                    lineHeight: 1.2,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {user?.full_name || user?.name || "Administrator"}
                            </span>

                            <span
                                className="admin-user-role"
                                style={{
                                    display: "block",
                                    lineHeight: 1.2,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                Administrator
                            </span>
                        </div>
                    </div>


                    <button
                        type="button"
                        className="admin-header-badge"
                        onClick={() => setShowProfile(true)}
                        aria-label="Open my profile"
                        title="Open My Profile"
                    >
                        ADMIN
                    </button>


                    <button
                        className="admin-logout admin-workspace"
                        onClick={() => goToPortal("/")}
                        type="button"
                    >
                        Workspace
                    </button>

                    <button
                        className="admin-logout"
                        onClick={logout}
                    >
                        Logout
                    </button>

                </div>

            </header>


            <main className="admin-content">

                {/* ==================================================
                    HERO
                ================================================== */}

                <section className="admin-hero">

                    <div>

                        <div className="admin-label">
                            ADMINISTRATION
                        </div>

                        <h1>
                            OIPM
                            <span>
                                Overview
                            </span>
                        </h1>

                        <p>
                            Monitor improvements,
                            manage users and maintain
                            the OIPM workspace.
                        </p>

                    </div>

                </section>


                {/* ==================================================
                    SUMMARY
                ================================================== */}

                <section className="admin-summary-grid">

                    <div className="admin-summary-card total-card">

                        <span className="summary-label">
                            TOTAL IMPROVEMENTS
                        </span>

                        <strong>
                            {
                                summary.total_improvements ??
                                0
                            }
                        </strong>

                        <p>
                            All improvements
                        </p>

                    </div>


                    <div className="admin-summary-card pending-card">

                        <span className="summary-label">
                            PENDING APPROVAL
                        </span>

                        <strong>
                            {
                                summary.pending_approval ??
                                0
                            }
                        </strong>

                        <p>
                            Awaiting approval
                        </p>

                    </div>


                    <div className="admin-summary-card progress-card">

                        <span className="summary-label">
                            IN PROGRESS
                        </span>

                        <strong>
                            {
                                summary.in_progress ??
                                0
                            }
                        </strong>

                        <p>
                            Currently active
                        </p>

                    </div>


                    <div className="admin-summary-card rejected-card">

                        <span className="summary-label">
                            REJECTED
                        </span>

                        <strong>
                            {
                                summary.rejected ??
                                0
                            }
                        </strong>

                        <p>
                            Not approved
                        </p>

                    </div>


                    <div className="admin-summary-card done-card">

                        <span className="summary-label">
                            DONE
                        </span>

                        <strong>
                            {
                                summary.done ??
                                0
                            }
                        </strong>

                        <p>
                            Completed
                        </p>

                    </div>

                </section>


                {/* ==================================================
                    IMPROVEMENTS
                ================================================== */}

                <section className="admin-section">

                    <div className="admin-section-heading">

                        <div>

                            <span>
                                IMPROVEMENTS
                            </span>

                            <h2>
                                All Improvements
                            </h2>

                        </div>


                        <div className="dashboard-panel-header-actions">
                            <div className="admin-count">
                                {
                                    filteredImprovements.length
                                }
                            </div>

                            <button
                                type="button"
                                className="dashboard-list-toggle"
                                onClick={() => setImprovementsCollapsed((value) => !value)}
                                aria-expanded={!improvementsCollapsed}
                                aria-label={improvementsCollapsed ? "Expand All Improvements" : "Collapse All Improvements"}
                            >
                                {improvementsCollapsed ? <span aria-hidden="true">⌄</span> : <span aria-hidden="true">⌃</span>}
                                {improvementsCollapsed ? "Expand" : "Collapse"}
                            </button>
                        </div>

                    </div>


                    {/* ================================
                        IMPROVEMENT FILTERS
                    ================================= */}

                    <div className="admin-filters">

                        <div className="admin-filter-group">

                            <label>
                                Status
                            </label>

                            <select
                                value={
                                    improvementStatusFilter
                                }
                                onChange={(event) =>
                                    setImprovementStatusFilter(
                                        event.target.value
                                    )
                                }
                            >

                                <option value="all">
                                    All Status
                                </option>

                                <option value="pending">
                                    Pending
                                </option>

                                <option value="in_progress">
                                    In Progress
                                </option>

                                <option value="rejected">
                                    Rejected
                                </option>

                                <option value="closed">
                                    Closed
                                </option>

                                <option value="done">
                                    Done
                                </option>

                            </select>

                        </div>


                        <div className="admin-filter-group">

                            <label>
                                From Date
                            </label>

                            <input
                                type="date"
                                value={
                                    improvementFromDate
                                }
                                onChange={(event) =>
                                    setImprovementFromDate(
                                        event.target.value
                                    )
                                }
                            />

                        </div>


                        <div className="admin-filter-group">

                            <label>
                                To Date
                            </label>

                            <input
                                type="date"
                                value={
                                    improvementToDate
                                }
                                onChange={(event) =>
                                    setImprovementToDate(
                                        event.target.value
                                    )
                                }
                            />

                        </div>


                        <button
                            type="button"
                            className="admin-clear-filters"
                            onClick={
                                clearImprovementFilters
                            }
                        >
                            Clear Filters
                        </button>

                    </div>


                    <div className="admin-filter-result">

                        Showing{" "}
                        <strong>
                            {
                                filteredImprovements.length
                            }
                        </strong>{" "}
                        of{" "}
                        <strong>
                            {
                                improvements.length
                            }
                        </strong>{" "}
                        improvements

                    </div>


                    {/* ================================
                        IMPROVEMENT TABLE
                    ================================= */}

                    {improvementsCollapsed ? (
                        <div className="dashboard-list-collapsed">
                            All Improvements list is collapsed. Click Expand to view it.
                        </div>
                    ) : (
                        <div className="admin-table-wrapper">

                        <table className="admin-table">

                            <thead>

                                <tr>

                                    <th>
                                        Improvement ID
                                    </th>

                                    <th>
                                        Employee Name
                                    </th>

                                    <th>
                                        Employee Code
                                    </th>

                                    <th>
                                        Plant
                                    </th>

                                    <th>
                                        Department
                                    </th>

                                    <th>
                                        Benefit
                                    </th>

                                    <th>
                                        Status
                                    </th>

                                </tr>

                            </thead>


                            <tbody>

                                {filteredImprovements.length === 0 ? (

                                    <tr>

                                        <td
                                            colSpan="7"
                                            className="empty-row"
                                        >

                                            {
                                                improvements.length === 0
                                                    ? "No improvements found."
                                                    : "No improvements match the selected filters."
                                            }

                                        </td>

                                    </tr>

                                ) : (

                                    filteredImprovements.map(
                                        (improvement) => (

                                            <tr
                                                key={
                                                    improvement.id
                                                }
                                            >

                                                <td>

                                                    <div className="project-cell">

                                                        <strong>
                                                            {
                                                                improvement.project_id ||
                                                                improvement.improvement_id ||
                                                                "Pending ID"
                                                            }
                                                        </strong>

                                                    </div>

                                                </td>


                                                <td>

                                                    <strong className="admin-employee-name">
                                                        {
                                                            getEmployeeName(
                                                                improvement
                                                            )
                                                        }
                                                    </strong>

                                                </td>


                                                <td>
                                                    {
                                                        getEmployeeCode(
                                                            improvement
                                                        )
                                                    }
                                                </td>


                                                <td>
                                                    {
                                                        getPlant(
                                                            improvement
                                                        )
                                                    }
                                                </td>


                                                <td>
                                                    {
                                                        getDepartment(
                                                            improvement
                                                        )
                                                    }
                                                </td>


                                                <td>

                                                    <span className="benefit-full-name">

                                                        {
                                                            formatBenefit(
                                                                improvement.benefit_type
                                                            )
                                                        }

                                                    </span>

                                                </td>


                                                <td>

                                                    <span
                                                        className={
                                                            `status-pill status-${improvement.status}`
                                                        }
                                                    >

                                                        {
                                                            formatStatus(
                                                                improvement.status
                                                            )
                                                        }

                                                    </span>

                                                </td>

                                            </tr>

                                        )
                                    )

                                )}

                            </tbody>

                        </table>

                    </div>
                    )}

                </section>


                {/* ==================================================
                    USERS
                ================================================== */}

                <section className="admin-section">

                    <div className="admin-section-heading">

                        <div>

                            <span>
                                USER MANAGEMENT
                            </span>

                            <h2>
                                All Users
                            </h2>

                        </div>


                        <div className="dashboard-panel-header-actions">
                            <div className="admin-count">
                                {
                                    filteredUsers.length
                                }
                            </div>

                            <button
                                type="button"
                                className="dashboard-list-toggle"
                                onClick={() => setUsersCollapsed((value) => !value)}
                                aria-expanded={!usersCollapsed}
                                aria-label={usersCollapsed ? "Expand All Users" : "Collapse All Users"}
                            >
                                {usersCollapsed ? <span aria-hidden="true">⌄</span> : <span aria-hidden="true">⌃</span>}
                                {usersCollapsed ? "Expand" : "Collapse"}
                            </button>
                        </div>

                    </div>


                    {/* ================================
                        USER FILTERS
                    ================================= */}

                    <div className="admin-filters admin-user-filters">

                        <div className="admin-filter-group">

                            <label>
                                Role
                            </label>

                            <select
                                value={
                                    userRoleFilter
                                }
                                onChange={(event) =>
                                    setUserRoleFilter(
                                        event.target.value
                                    )
                                }
                            >

                                <option value="all">
                                    All Roles
                                </option>

                                <option value="admin">
                                    Admin
                                </option>

                                <option value="accounts">
                                    Accounts
                                </option>

                                <option value="plant_head">
                                    Plant Head
                                </option>

                                <option value="employees">
                                    Employees
                                </option>

                            </select>

                        </div>


                        <div className="admin-filter-group">

                            <label>
                                Status
                            </label>

                            <select
                                value={
                                    userStatusFilter
                                }
                                onChange={(event) =>
                                    setUserStatusFilter(
                                        event.target.value
                                    )
                                }
                            >

                                <option value="all">
                                    All Status
                                </option>

                                <option value="active">
                                    Active
                                </option>

                                <option value="inactive">
                                    Inactive
                                </option>

                            </select>

                        </div>


                        <div className="admin-filter-group">

                            <label>
                                Approval
                            </label>

                            <select
                                value={
                                    userApprovalFilter
                                }
                                onChange={(event) =>
                                    setUserApprovalFilter(
                                        event.target.value
                                    )
                                }
                            >

                                <option value="all">
                                    All Approval
                                </option>

                                <option value="pending">
                                    Pending
                                </option>

                                <option value="approved">
                                    Approved
                                </option>

                                <option value="rejected">
                                    Rejected
                                </option>

                            </select>

                        </div>


                        <button
                            type="button"
                            className="admin-clear-filters"
                            onClick={
                                clearUserFilters
                            }
                        >
                            Clear Filters
                        </button>

                    </div>


                    <div className="admin-filter-result">

                        Showing{" "}
                        <strong>
                            {
                                filteredUsers.length
                            }
                        </strong>{" "}
                        of{" "}
                        <strong>
                            {
                                users.length
                            }
                        </strong>{" "}
                        users

                    </div>


                    {/* ================================
                        USER TABLE
                    ================================= */}

                    {usersCollapsed ? (
                        <div className="dashboard-list-collapsed">
                            All Users list is collapsed. Click Expand to view it.
                        </div>
                    ) : (
                        <div className="admin-table-wrapper">

                        <table className="admin-table">

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

                                    <th>
                                        Role
                                    </th>

                                    <th>
                                        Status
                                    </th>

                                    <th>
                                        Approval
                                    </th>

                                    <th>
                                        Action
                                    </th>

                                </tr>

                            </thead>


                            <tbody>

                                {filteredUsers.length === 0 ? (

                                    <tr>

                                        <td
                                            colSpan="7"
                                            className="empty-row"
                                        >

                                            {
                                                users.length === 0
                                                    ? "No users found."
                                                    : "No users match the selected filters."
                                            }

                                        </td>

                                    </tr>

                                ) : (

                                    filteredUsers.map(
                                        (item) => {

                                            const isPending =
                                                item.registration_status ===
                                                "pending";


                                            const isApproved =
                                                item.registration_status ===
                                                "approved";


                                            const isRejected =
                                                item.registration_status ===
                                                "rejected";


                                            const isApprovalLoading =
                                                approvalLoading ===
                                                item.id;


                                            const passwordAllowed =
                                                canChangePassword(
                                                    item
                                                );


                                            return (

                                                <tr
                                                    key={
                                                        item.id
                                                    }
                                                >

                                                    <td>

                                                        <strong>
                                                            {
                                                                item.full_name
                                                            }
                                                        </strong>

                                                    </td>


                                                    <td>
                                                        {
                                                            item.employee_code
                                                        }
                                                    </td>


                                                    <td>
                                                        {
                                                            item.email
                                                        }
                                                    </td>


                                                    <td>

                                                        <span className="role-pill">

                                                            {
                                                                formatRole(
                                                                    item.role
                                                                )
                                                            }

                                                        </span>

                                                    </td>


                                                    <td>

                                                        <span
                                                            className={
                                                                item.is_active
                                                                    ? "active-pill"
                                                                    : "inactive-pill"
                                                            }
                                                        >

                                                            {
                                                                item.is_active
                                                                    ? "Active"
                                                                    : "Inactive"
                                                            }

                                                        </span>

                                                    </td>


                                                    <td>

                                                        {isPending && (

                                                            <div className="approval-actions">

                                                                <button
                                                                    className="password-button"
                                                                    onClick={() =>
                                                                        handleApproveUser(
                                                                            item
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        isApprovalLoading
                                                                    }
                                                                >

                                                                    {
                                                                        isApprovalLoading
                                                                            ? "..."
                                                                            : "Approve"
                                                                    }

                                                                </button>


                                                                <button
                                                                    className="password-button reject-button"
                                                                    onClick={() =>
                                                                        handleRejectUser(
                                                                            item
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        isApprovalLoading
                                                                    }
                                                                >

                                                                    {
                                                                        isApprovalLoading
                                                                            ? "..."
                                                                            : "Reject"
                                                                    }

                                                                </button>

                                                            </div>

                                                        )}


                                                        {isApproved && (

                                                            <span className="active-pill">
                                                                Approved
                                                            </span>

                                                        )}


                                                        {isRejected && (

                                                            <span className="inactive-pill">
                                                                Rejected
                                                            </span>

                                                        )}

                                                    </td>


                                                    <td>

                                                        <button
                                                            className="password-button"
                                                            disabled={
                                                                !passwordAllowed
                                                            }
                                                            onClick={() => {

                                                                if (
                                                                    !passwordAllowed
                                                                ) {

                                                                    return;

                                                                }


                                                                setSelectedUser(
                                                                    item
                                                                );

                                                                setNewPassword(
                                                                    ""
                                                                );

                                                                setPasswordMessage(
                                                                    ""
                                                                );

                                                                setPasswordError(
                                                                    ""
                                                                );

                                                            }}
                                                        >
                                                            Change Password
                                                        </button>

                                                    </td>

                                                </tr>

                                            );

                                        }
                                    )

                                )}

                            </tbody>

                        </table>

                    </div>
                    )}

                </section>

            <Lists showAll={false} />

</main>


            {/* ==================================================
                PASSWORD MODAL
            ================================================== */}

            {selectedUser && (

                <div
                    className="password-overlay"
                    onClick={() =>
                        setSelectedUser(null)
                    }
                >

                    <div
                        className="password-modal"
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                    >

                        <div className="modal-header">

                            <div>

                                <span>
                                    ACCOUNT MANAGEMENT
                                </span>

                                <h2>
                                    Change Password
                                </h2>

                            </div>


                            <button
                                className="modal-close"
                                onClick={() =>
                                    setSelectedUser(null)
                                }
                            >
                                ×
                            </button>

                        </div>


                        <div className="modal-user">

                            <strong>
                                {
                                    selectedUser.full_name
                                }
                            </strong>

                            <span>
                                {
                                    selectedUser.email
                                }
                            </span>

                        </div>


                        <label>
                            New Password
                        </label>


                        <input
                            type="password"
                            value={newPassword}
                            onChange={(event) =>
                                setNewPassword(
                                    event.target.value
                                )
                            }
                            placeholder="Minimum 8 characters"
                        />


                        {passwordError && (

                            <div className="password-error">
                                {passwordError}
                            </div>

                        )}


                        {passwordMessage && (

                            <div className="password-success">
                                {passwordMessage}
                            </div>

                        )}


                        <div className="modal-actions">

                            <button
                                className="modal-cancel"
                                onClick={() =>
                                    setSelectedUser(null)
                                }
                            >
                                Cancel
                            </button>


                            <button
                                className="modal-confirm"
                                onClick={
                                    handleChangePassword
                                }
                                disabled={
                                    passwordLoading
                                }
                            >

                                {
                                    passwordLoading
                                        ? "Changing..."
                                        : "Change Password"
                                }

                            </button>

                        </div>

                    </div>

                </div>

            )}

        </div>

    );

}


export default AdminDashboard;