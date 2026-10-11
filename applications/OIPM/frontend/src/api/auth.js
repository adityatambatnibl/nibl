const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "/api/v1";


// ============================================================
// GET STORED ACCESS TOKEN
// ============================================================

function getAccessToken() {

    return (
        localStorage.getItem("access_token") ||
        sessionStorage.getItem("access_token") ||
        null
    );

}


// ============================================================
// FORMAT API ERROR
// ============================================================

function formatApiError(data) {

    if (!data) {

        return (
            "Something went wrong. Please try again."
        );

    }


    // --------------------------------------------------------
    // Normal FastAPI error
    // --------------------------------------------------------

    if (
        typeof data.detail ===
        "string"
    ) {

        return data.detail;

    }


    // --------------------------------------------------------
    // FastAPI validation error
    // --------------------------------------------------------

    if (
        Array.isArray(
            data.detail
        )
    ) {

        return data.detail
            .map(
                (item) => {

                    if (
                        typeof item ===
                        "string"
                    ) {

                        return item;

                    }


                    if (
                        item?.msg
                    ) {

                        const location =
                            Array.isArray(
                                item.loc
                            )
                                ? item.loc.join(
                                    " â†’ "
                                )
                                : "";


                        return location
                            ? `${location}: ${item.msg}`
                            : item.msg;

                    }


                    return JSON.stringify(
                        item
                    );

                }
            )
            .join("\n");

    }


    // --------------------------------------------------------
    // Object error
    // --------------------------------------------------------

    if (
        data.detail &&
        typeof data.detail ===
        "object"
    ) {

        return JSON.stringify(
            data.detail
        );

    }


    // --------------------------------------------------------
    // Generic message
    // --------------------------------------------------------

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
// HANDLE NORMAL RESPONSE
// ============================================================

async function handleResponse(
    response
) {

    let data = null;


    try {

        data =
            await response.json();

    }

    catch {

      //

    }


    if (
        !response.ok
    ) {

        if (
            response.status ===
            401
        ) {

            throw new Error(
                "Your session has expired. Please sign in again."
            );

        }


        if (
            response.status ===
            403
        ) {

            throw new Error(
                formatApiError(
                    data
                ) ||
                "You do not have permission to perform this action."
            );

        }


        throw new Error(
            formatApiError(
                data
            )
        );

    }


    return data;

}


// ============================================================
// AUTHENTICATED REQUEST
//
// Used for APIs which require:
//     Authorization: Bearer <token>
//
// IMPORTANT:
// FormData requests do NOT receive a manual
// Content-Type header.
// The browser automatically adds the correct
// multipart boundary.
// ============================================================

async function authenticatedRequest(
    url,
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
            `${API_BASE_URL}${url}`,
            {
                ...options,
                headers,
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// REGISTER
// ============================================================

export async function registerUser(
    userData
) {

    const response =
        await fetch(
            `${API_BASE_URL}/auth/register`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body:
                    JSON.stringify(
                        userData
                    ),
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// LOGIN
// ============================================================

export async function loginUser(
    credentials
) {

    const response =
        await fetch(
            `${API_BASE_URL}/auth/login`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body:
                    JSON.stringify(
                        credentials
                    ),
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// HODS
// ============================================================

export async function getHods() {

    const response =
        await fetch(
            `${API_BASE_URL}/auth/hods`
        );


    return handleResponse(
        response
    );

}


// ============================================================
// GET CURRENT USER
//
// Useful for restoring the logged-in user after
// page refresh if your backend exposes:
//
//     GET /auth/me
//
// If your backend does not currently expose this
// endpoint, this function simply should not be called.
// ============================================================

export async function getCurrentUser() {

    return authenticatedRequest(
        "/auth/me",
        {
            method: "GET",
        }
    );

}


// ============================================================
// GET SINGLE IMPROVEMENT
//
// Used by the reusable ViewImprovement component.
//
// Endpoint:
//
//     GET /improvements/{improvement_id}
// ============================================================

export async function getImprovement(
    improvementId
) {

    if (
        !improvementId
    ) {

        throw new Error(
            "Improvement ID is missing."
        );

    }


    return authenticatedRequest(
        `/improvements/${improvementId}`,
        {
            method: "GET",
        }
    );

}


// ============================================================
// RESUBMIT / EDIT IMPROVEMENT
//
// This is the important new API for the resubmission flow.
//
// Workflow:
//
//     resubmission_required
//              â†“
//        Employee edits
//              â†“
//       Save & Submit
//              â†“
//     pending_accounts
//
// or:
//
//     resubmission_required
//              â†“
//        Employee edits
//              â†“
//       Save & Submit
//              â†“
//     pending_plant_head
//
// The backend decides the correct next stage based
// on the stored resubmission_stage.
// ============================================================

export async function resubmitImprovement(
    improvementId,
    improvementData
) {

    if (
        !improvementId
    ) {

        throw new Error(
            "Improvement ID is missing."
        );

    }


    if (
        !improvementData ||
        typeof improvementData !==
        "object"
    ) {

        throw new Error(
            "Improvement data is missing."
        );

    }


    return authenticatedRequest(
        `/improvements/${improvementId}/resubmit`,
        {
            method: "PUT",

            body:
                JSON.stringify(
                    improvementData
                ),
        }
    );

}


// ============================================================
// UPLOAD IMPROVEMENT IMAGES
//
// section:
//
//     problem
//     countermeasure
//     results
//
// files:
//
//     File[]
//
// IMPORTANT:
// Do NOT set Content-Type manually.
// authenticatedRequest() intentionally leaves it
// unset for FormData.
// ============================================================

export async function uploadImprovementImages(
    improvementId,
    section,
    files
) {

    if (
        !improvementId
    ) {

        throw new Error(
            "Improvement ID is missing."
        );

    }


    if (
        !section
    ) {

        throw new Error(
            "Image section is missing."
        );

    }


    if (
        !Array.isArray(files) ||
        files.length === 0
    ) {

        throw new Error(
            "Please select at least one image."
        );

    }


    const allowedSections = [
        "problem",
        "countermeasure",
        "results",
    ];


    if (
        !allowedSections.includes(
            section
        )
    ) {

        throw new Error(
            "Invalid image section."
        );

    }


    const formData =
        new FormData();


    files.forEach(
        (file) => {

            if (
                file instanceof File
            ) {

                formData.append(
                    "files",
                    file
                );

            }

        }
    );


    return authenticatedRequest(
        `/improvements/${improvementId}/images?section=${encodeURIComponent(section)}`,
        {
            method: "POST",

            body:
                formData,
        }
    );

}




export function getBenefitLabel(
    benefitType
) {

    const labels = {

        P:
            "P â€“ Productivity",

        Q:
            "Q â€“ Quality",

        C:
            "C â€“ Cost",

        D:
            "D â€“ Delivery",

        S:
            "S â€“ Safety",

        M:
            "M â€“ Morale",

    };


    if (
        !benefitType
    ) {

        return "-";

    }


    if (
        labels[benefitType]
    ) {

        return labels[
            benefitType
        ];

    }


    const normalized =
        String(
            benefitType
        )
        .trim()
        .toUpperCase();


    if (
        normalized.startsWith(
            "P"
        )
    ) {

        return "P â€“ Productivity";

    }


    if (
        normalized.startsWith(
            "Q"
        )
    ) {

        return "Q â€“ Quality";

    }


    if (
        normalized.startsWith(
            "C"
        )
    ) {

        return "C â€“ Cost";

    }


    if (
        normalized.startsWith(
            "D"
        )
    ) {

        return "D â€“ Delivery";

    }


    if (
        normalized.startsWith(
            "S"
        )
    ) {

        return "S â€“ Safety";

    }


    if (
        normalized.startsWith(
            "M"
        )
    ) {

        return "M â€“ Morale";

    }


    return benefitType;

}

// ============================================================
// FORGOT PASSWORD
//
// User provides:
//     Email
//     Employee Code
//
// Backend verifies both values and, if valid:
//     1. Generates a new password
//     2. Updates the password
//     3. Sends the new password to the user's email
// ============================================================

export async function forgotPassword(
    email,
    employeeCode
) {

    if (!email || !email.trim()) {

        throw new Error(
            "Please enter your email address."
        );

    }


    if (
        !employeeCode ||
        !employeeCode.trim()
    ) {

        throw new Error(
            "Please enter your employee code."
        );

    }


    const response =
        await fetch(
            `${API_BASE_URL}/auth/forgot-password`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body:
                    JSON.stringify({
                        email:
                            email.trim(),

                        employee_code:
                            employeeCode.trim(),
                    }),
            }
        );


    return handleResponse(
        response
    );

}


