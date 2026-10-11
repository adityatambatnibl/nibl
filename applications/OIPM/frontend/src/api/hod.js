const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "/api/v1";


// ============================================================
// AUTH
// ============================================================

function getAccessToken() {

    return (
        localStorage.getItem("access_token") ||
        sessionStorage.getItem("access_token") ||
        null
    );

}


// ============================================================
// RESPONSE ERROR HANDLER
// ============================================================

function formatApiError(data) {

    if (!data) {

        return "Something went wrong. Please try again.";

    }


    if (
        typeof data.detail ===
        "string"
    ) {

        return data.detail;

    }


    if (
        Array.isArray(data.detail)
    ) {

        return data.detail
            .map((error) => {

                if (
                    typeof error ===
                    "string"
                ) {

                    return error;

                }


                if (error?.msg) {

                    return error.msg;

                }


                return JSON.stringify(
                    error
                );

            })
            .join("\n");

    }


    if (
        data.detail &&
        typeof data.detail ===
        "object"
    ) {

        return JSON.stringify(
            data.detail
        );

    }


    if (
        typeof data.message ===
        "string"
    ) {

        return data.message;

    }


    return (
        "Something went wrong. Please try again."
    );

}


// ============================================================
// COMMON AUTHENTICATED REQUEST
// ============================================================

async function authenticatedRequest(
    endpoint,
    options = {}
) {

    const token =
        getAccessToken();


    if (!token) {

        throw new Error(
            "Your session has expired. Please sign in again."
        );

    }


    const headers = {

        ...(options.headers || {}),

        Authorization:
            `Bearer ${token}`,

    };


    // --------------------------------------------------------
    // JSON requests
    // --------------------------------------------------------

    if (
        !(options.body instanceof FormData)
    ) {

        headers[
            "Content-Type"
        ] =
            "application/json";

    }


    const response =
        await fetch(
            `${API_BASE_URL}${endpoint}`,
            {
                ...options,
                headers,
            }
        );


    let data = null;


    try {

        data =
            await response.json();

    }

    catch {

        //

    }


    // --------------------------------------------------------
    // Authentication failure
    // --------------------------------------------------------

    if (
        response.status ===
        401
    ) {

        throw new Error(
            "Your session has expired. Please sign in again."
        );

    }


    // --------------------------------------------------------
    // Other API errors
    // --------------------------------------------------------

    if (
        !response.ok
    ) {

        throw new Error(
            formatApiError(
                data
            )
        );

    }


    return data;

}


// ============================================================
// HOD SUMMARY
//
// Returns:
// ------------------------------------------------------------
// My Improvements
// - my_total
// - my_pending
// - my_in_progress
// - my_rejected
// - my_done
//
// Under Me Improvements
// - under_me_employees
// - under_me_total
// - under_me_approved
// - under_me_resubmission
// - under_me_pending
// - under_me_in_progress
// - under_me_rejected
// - under_me_done
// ============================================================

export async function getHODSummary() {

    return authenticatedRequest(
        "/hod/summary",
        {
            method: "GET",
        }
    );

}


// ============================================================
// MY IMPROVEMENTS
//
// Improvements created by the logged-in HOD.
//
// HOD can VIEW these.
// HOD can also CREATE improvements using the existing
// AddImprovement component.
//
// No approval/rejection/resubmission action here.
// ============================================================

export async function getHODMyImprovements() {

    return authenticatedRequest(
        "/hod/my-improvements",
        {
            method: "GET",
        }
    );

}


// ============================================================
// UNDER ME IMPROVEMENTS
//
// Improvements created by employees reporting to
// the logged-in HOD.
//
// VIEW ONLY.
//
// Supports:
// - status
// - start_date
// - end_date
// - search
// ============================================================

export async function getHODUnderMeImprovements(
    params = {}
) {

    const searchParams =
        new URLSearchParams();


    // --------------------------------------------------------
    // STATUS
    // --------------------------------------------------------

    if (
        params.status &&
        params.status !== "all"
    ) {

        searchParams.set(
            "status",
            params.status
        );

    }


    // --------------------------------------------------------
    // FROM DATE
    // --------------------------------------------------------

    if (
        params.start_date
    ) {

        searchParams.set(
            "start_date",
            params.start_date
        );

    }


    // --------------------------------------------------------
    // TO DATE
    // --------------------------------------------------------

    if (
        params.end_date
    ) {

        searchParams.set(
            "end_date",
            params.end_date
        );

    }


    // --------------------------------------------------------
    // SEARCH
    // --------------------------------------------------------

    if (
        params.search
    ) {

        searchParams.set(
            "search",
            params.search
        );

    }


    const query =
        searchParams.toString();


    return authenticatedRequest(

        `/hod/under-me-improvements${
            query
                ? `?${query}`
                : ""
        }`,

        {
            method: "GET",
        }

    );

}


// ============================================================
// ALL IMPROVEMENTS
//
// Read-only HOD view of all improvements available
// through the HOD dashboard.
//
// Supports:
// - status
// - start_date
// - end_date
// - search
// ============================================================

export async function getHODAllImprovements(
    params = {}
) {

    const searchParams =
        new URLSearchParams();


    if (
        params.status &&
        params.status !== "all"
    ) {

        searchParams.set(
            "status",
            params.status
        );

    }


    if (
        params.start_date
    ) {

        searchParams.set(
            "start_date",
            params.start_date
        );

    }


    if (
        params.end_date
    ) {

        searchParams.set(
            "end_date",
            params.end_date
        );

    }


    if (
        params.search
    ) {

        searchParams.set(
            "search",
            params.search
        );

    }


    const query =
        searchParams.toString();


    return authenticatedRequest(

        `/hod/all-improvements${
            query
                ? `?${query}`
                : ""
        }`,

        {
            method: "GET",
        }

    );

}


// ============================================================
// HOD IMPROVEMENTS
//
// General read-only improvement list.
//
// Kept as a separate function so existing code that imports
// getHODImprovements() does not break.
// ============================================================

export async function getHODImprovements() {

    return authenticatedRequest(
        "/hod/improvements",
        {
            method: "GET",
        }
    );

}


// ============================================================
// UNDER ME EMPLOYEES
//
// Returns employees reporting to the logged-in HOD.
//
// Expected fields:
// - id
// - full_name / name
// - employee_code
// - email
// ============================================================

export async function getHODEmployees() {

    return authenticatedRequest(
        "/hod/employees",
        {
            method: "GET",
        }
    );

}


// ============================================================
// EMPLOYEE SUMMARY
//
// Kept for compatibility if the dashboard/API uses it.
// ============================================================

export async function getHODEmployeeSummary() {

    return authenticatedRequest(
        "/hod/employees/summary",
        {
            method: "GET",
        }
    );

}


// ============================================================
// DEFAULT EXPORT
// ============================================================
//
// IMPORTANT:
//
// There are intentionally NO:
// - approveHODImprovement()
// - rejectHODImprovement()
// - resubmitHODImprovement()
//
// HOD is VIEW ONLY for employee improvements.
// ============================================================

export default {

    getHODSummary,

    getHODMyImprovements,

    getHODUnderMeImprovements,

    getHODAllImprovements,

    getHODImprovements,

    getHODEmployees,

    getHODEmployeeSummary,

};


