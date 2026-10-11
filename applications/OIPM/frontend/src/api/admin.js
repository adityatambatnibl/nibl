const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "/api/v1";


// ============================================================
// RESPONSE HANDLER
// ============================================================

async function handleResponse(response) {

    let data = {};

    try {

        data = await response.json();

    } catch {

        //

    }


    if (!response.ok) {

        let message =
            "Something went wrong. Please try again.";


        if (Array.isArray(data.detail)) {

            message = data.detail
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


        else if (
            typeof data.detail ===
            "string"
        ) {

            message =
                data.detail;

        }


        else if (
            data.detail &&
            typeof data.detail ===
            "object"
        ) {

            message =
                JSON.stringify(
                    data.detail
                );

        }


        else if (
            typeof data.message ===
            "string"
        ) {

            message =
                data.message;

        }


        throw new Error(
            message
        );

    }


    return data;
}


// ============================================================
// AUTHORIZATION HEADER
// ============================================================

function getAuthHeaders() {

    const token =
        localStorage.getItem(
            "access_token"
        );


    if (!token) {

        throw new Error(
            "Authentication token is missing. Please log in again."
        );

    }


    return {
        "Authorization":
            `Bearer ${token}`,

        "Content-Type":
            "application/json",
    };

}


// ============================================================
// ADMIN - ALL USERS
// ============================================================

export async function getAllUsers() {

    const response =
        await fetch(
            `${API_BASE_URL}/admin/users`,
            {
                method: "GET",

                headers:
                    getAuthHeaders(),
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// ADMIN - PENDING REGISTRATIONS
// ============================================================

export async function getPendingRegistrations() {

    const response =
        await fetch(
            `${API_BASE_URL}/admin/registrations/pending`,
            {
                method: "GET",

                headers:
                    getAuthHeaders(),
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// ADMIN - APPROVE USER REGISTRATION
// ============================================================

export async function approveUserRegistration(
    userId
) {

    const response =
        await fetch(
            `${API_BASE_URL}/admin/users/${userId}/approve`,
            {
                method: "POST",

                headers:
                    getAuthHeaders(),
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// ADMIN - REJECT USER REGISTRATION
// ============================================================

export async function rejectUserRegistration(
    userId
) {

    const response =
        await fetch(
            `${API_BASE_URL}/admin/users/${userId}/reject`,
            {
                method: "POST",

                headers:
                    getAuthHeaders(),
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// ADMIN - ALL IMPROVEMENTS
// ============================================================

export async function getAllImprovements() {

    const response =
        await fetch(
            `${API_BASE_URL}/admin/improvements`,
            {
                method: "GET",

                headers:
                    getAuthHeaders(),
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// ADMIN - IMPROVEMENT SUMMARY
// ============================================================

export async function getImprovementSummary() {

    const response =
        await fetch(
            `${API_BASE_URL}/admin/improvements/summary`,
            {
                method: "GET",

                headers:
                    getAuthHeaders(),
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// ADMIN - CHANGE USER PASSWORD
// ============================================================

export async function changeUserPassword(
    userId,
    newPassword
) {

    const response =
        await fetch(
            `${API_BASE_URL}/admin/users/${userId}/change-password`,
            {
                method: "POST",

                headers:
                    getAuthHeaders(),

                body:
                    JSON.stringify({
                        new_password:
                            newPassword,
                    }),
            }
        );


    return handleResponse(
        response
    );

}


