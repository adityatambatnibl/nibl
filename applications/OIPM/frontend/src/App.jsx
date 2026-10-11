import {
    useEffect,
    useState,
} from "react";

import {
    useAuth,
} from "./context/AuthContext";

import EmployeeDashboard
    from "./pages/employee/EmployeeDashboard";

import AdminDashboard
    from "./pages/admin/AdminDashboard";

import AccountsDashboard
    from "./pages/accounts/AccountsDashboard";

import AddImprovement
    from "./pages/improvements/AddImprovement";

import PlantHeadDashboard
    from "./pages/planthead/PlantHeadDashboard";

import HODDashboard
    from "./pages/hod/HODDashboard";

import "./App.css";

import nrbLogo from "../assest/logo.jpg";

import BearingBackground
    from "./components/BearingBackground";

import BearingSpinner
    from "./components/BearingSpinner";


/* =====================================================
   OIPM APPLICATION

   Sign in, sign up, forgot password and the project cards now live in
   the NIBL portal (portal/frontend). The portal leaves a refresh cookie;
   AuthContext turns it into an OIPM session through OIPM's own
   /api/v1/auth/refresh, which also checks OIPM approval.
   Without an OIPM session the user is sent back to the portal.
===================================================== */

const PORTAL_URL =
    (import.meta.env.VITE_PORTAL_URL || "/").replace(/\/+$/, "") || "";

function goToPortal(path = "/") {
    window.location.replace(`${PORTAL_URL}${path}`);
}


/* =====================================================
   TEMP AUTH SCREEN
===================================================== */

/* =====================================================
   ROLES (labels shown in OIPM)

   Plant Head and Admin are system-created accounts.
===================================================== */

const ROLES = [

    {
        value: "employee",

        label: "Employee",

        description:
            "Create and manage your improvement initiatives.",
    },

    {
        value: "hod",

        label: "HOD",

        description:
            "Review and manage improvements submitted by your employees.",
    },

    {
        value: "accounts",

        label: "Accounts",

        description:
            "Verify improvement financial information.",
    },

    {
        value: "plant_head",

        label: "Plant Head",

        description:
            "Approve and manage plant-wide improvement initiatives.",
    },

];


function AuthenticatedScreen({
    user,
    onLogout,
    onAddImprovement,
}) {

    const roleLabel =
        ROLES.find(
            (role) =>
                role.value ===
                user.role
        )?.label ||
        (
            user.role === "plant_head"
                ? "Plant Head"
                : user.role === "admin"
                    ? "Admin"
                    : user.role
        );


    return (

        <div className="authenticated-page">

            <header className="dashboard-header">

                <div className="brand">

                    <img
                        src={nrbLogo}
                        alt="NRB Industrial Bearings Limited"
                        className="nibl-logo-image dashboard-logo-image"
                    />

                </div>


                <div className="dashboard-title">
                    NIBL INTERNAL WORKING SPACE
                </div>


                <button
                    className="logout-button"
                    onClick={onLogout}
                    type="button"
                >
                    Logout
                </button>

            </header>


            <main className="authenticated-content">

                <div className="success-icon">
                    Ã¢Å“â€œ
                </div>


                <span className="eyebrow">
                    AUTHENTICATION SUCCESSFUL
                </span>


                <h1>
                    Welcome,{" "}
                    {user.full_name}
                </h1>


                <p>
                    Your NIBL Internal Working Space account is
                    connected successfully.
                </p>


                <div className="user-summary">

                    <div>

                        <span>
                            Employee Code
                        </span>


                        <strong>
                            {
                                user.employee_code
                            }
                        </strong>

                    </div>


                    <div>

                        <span>
                            Role
                        </span>


                        <strong>
                            {roleLabel}
                        </strong>

                    </div>


                    <div>

                        <span>
                            Email
                        </span>


                        <strong>
                            {user.email}
                        </strong>

                    </div>

                </div>


                {user.role !== "admin" && (

                    <button
                        className="primary-button"
                        type="button"
                        onClick={
                            onAddImprovement
                        }
                        style={{
                            marginTop: "20px",
                        }}
                    >
                        + Add Improvement
                    </button>

                )}


                <div className="next-stage-card">

                    <span>
                        NEXT
                    </span>


                    <h2>
                        Your project dashboard
                        will appear here.
                    </h2>


                    <p>
                        Authentication and
                        role-based access are
                        now connected to the
                        backend.
                    </p>

                </div>

            </main>

        </div>
    );
}




function App() {

    const {
        user,
        token,
        isAuthenticated,
        loading,
        logout,
    } = useAuth();


    /* The OIPM API helpers read localStorage "access_token" (written by the old
       sign-in screen). Keep it equal to the current OIPM session token. */
    if (token && localStorage.getItem("access_token") !== token) {
        localStorage.setItem("access_token", token);
    }


    const [screen, setScreen] =
        useState(() => {

            const savedScreen =
                localStorage.getItem("oipm_current_screen");

            return savedScreen === "add-improvement"
                ? "add-improvement"
                : "authenticated";
        });


    useEffect(() => {

        localStorage.setItem(
            "oipm_current_screen",
            screen
        );

    }, [screen]);


    /* No OIPM session (not signed in, or not approved for OIPM): back to the portal. */
    useEffect(() => {

        if (!loading && !isAuthenticated) {
            goToPortal("/");
        }

    }, [loading, isAuthenticated]);


    const openAddImprovement = () => {
        setScreen("add-improvement");
    };


    const handleImprovementCreated = () => {
        setScreen("authenticated");
    };


    /* Signing out of OIPM signs out of the portal (one sign-in for everything). */
    const handleLogout = async () => {

        await logout();

        localStorage.removeItem("access_token");
        sessionStorage.removeItem("access_token");
        localStorage.removeItem("oipm_current_screen");

        goToPortal("/logout");
    };


    if (loading || !isAuthenticated) {

        return (

            <div className="app-loading">

                <BearingSpinner
                    size={72}
                />

                <p>
                    Loading OIPM...
                </p>

            </div>

        );

    }


    return (

        <div className="app-shell">

            {/* =================================================
                ADD IMPROVEMENT
            ================================================= */}

            {screen === "add-improvement" &&
                user && (

                <>
                    <BearingBackground />

                    <AddImprovement

                        onBack={() =>
                            setScreen(
                                "authenticated"
                            )
                        }

                        onCreated={
                            handleImprovementCreated
                        }

                    />
                </>

                )}


            {/* =================================================
                AUTHENTICATED
            ================================================= */}

            {screen === "authenticated" &&
                user && (

                    user.role ===
                    "employee"

                        ? (

                            <EmployeeDashboard

                                user={
                                    user
                                }

                                onLogout={
                                    handleLogout
                                }

                                onAddImprovement={
                                    openAddImprovement
                                }

                            />

                        )

                        :

                    user.role ===
                    "accounts"

                        ? (

                            <AccountsDashboard

                                user={
                                    user
                                }

                                onLogout={
                                    handleLogout
                                }

                                onAddImprovement={
                                    openAddImprovement
                                }

                            />

                        )

                        :

                    /* =================================================
                       HOD
                       -------------------------------------------------
                       ONLY ADDITION TO THE EXISTING APP ROUTING.
                       HOD gets its own dashboard.
                    ================================================= */

                    user.role ===
                    "hod"

                        ? (

                            <HODDashboard

                                user={
                                    user
                                }

                                onLogout={
                                    handleLogout
                                }

                                onAddImprovement={
                                    openAddImprovement
                                }

                            />

                        )

                        :

                    user.role ===
                    "plant_head"

                        ? (

                            <PlantHeadDashboard

                                user={
                                    user
                                }

                                onLogout={
                                    handleLogout
                                }

                                onAddImprovement={
                                    openAddImprovement
                                }

                            />

                        )

                        :

                    user.role ===
                    "admin"

                        ? (

                            <AdminDashboard />

                        )

                        :

                    (

                        <AuthenticatedScreen

                            user={
                                user
                            }

                            onLogout={
                                handleLogout
                            }

                            onAddImprovement={
                                openAddImprovement
                            }

                        />

                    )

                )}



        </div>

    );

}


export default App;
