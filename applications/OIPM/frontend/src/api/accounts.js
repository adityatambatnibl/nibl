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
// AUTHENTICATED REQUEST
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


    // --------------------------------------------------------
    // Do not set JSON content type for FormData.
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
            `${API_BASE_URL}${url}`,
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

          // Response body is not valid JSON.
    // Keep data as null.

    }


    // ========================================================
    // ERROR HANDLING
    // ========================================================

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
// ACCOUNTS SUMMARY
//
// Same basic summary as Employee Dashboard.
//
// Additional Accounts-specific value:
//     approval_pending
// ============================================================

export async function getAccountsSummary() {

    return authenticatedRequest(
        "/accounts/summary",
        {
            method: "GET",
        }
    );

}


// ============================================================
// ACCOUNTS â€” MY IMPROVEMENTS
//
// Improvements created by the logged-in Accounts user.
//
// Accounts users are also allowed to create their own
// improvements, so these are completely separate from the
// approval queue.
// ============================================================

export async function getAccountsImprovements() {

    return authenticatedRequest(
        "/accounts/improvements",
        {
            method: "GET",
        }
    );

}


// ============================================================
// ACCOUNTS â€” PENDING APPROVALS
//
// Returns improvements currently waiting for Accounts.
//
// Expected status:
//
//     pending_accounts
//
// These can be:
//     View
//     Approve
//     Reject
//     Resubmit
// ============================================================

export async function getAccountsApprovals() {

    return authenticatedRequest(
        "/accounts/approvals",
        {
            method: "GET",
        }
    );

}


// ============================================================
// ACCOUNTS â€” HISTORY
//
// Shows decisions already taken by the logged-in Accounts
// user.
//
// Included:
//     Approved
//     Rejected
//
// NOT included:
//     Resubmission
// ============================================================

export async function getAccountsHistory() {

    return authenticatedRequest(
        "/accounts/history",
        {
            method: "GET",
        }
    );

}


// ============================================================
// GET SINGLE IMPROVEMENT
//
// Used by the Accounts "View" screen.
//
// The response should contain the complete improvement:
//
//     Section 1
//     Benefit
//     Problem
//     Problem Images
//     Countermeasure
//     Countermeasure Images
//     Results
//     Result Images
//     Cost Saving
//     Investment
//     Payback
//     Horizontal Deployment
//     Workflow information
// ============================================================

export async function getAccountsImprovement(
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
        `/accounts/improvements/${improvementId}`,
        {
            method: "GET",
        }
    );

}


// ============================================================
// ACCOUNTS â€” UPDATE FINANCIALS
//
// Used only while an improvement is at pending_accounts.
// This does NOT approve, reject or request resubmission.
// It only updates Cost Saving + Investment & Payback.
// ============================================================

export async function updateAccountsFinancials(
    improvementId,
    payload
) {

    if (!improvementId) {

        throw new Error(
            "Improvement ID is missing."
        );

    }


    return authenticatedRequest(
        `/accounts/improvements/${improvementId}/financials`,
        {
            method: "PUT",

            body: JSON.stringify(
                payload || {}
            ),
        }
    );

}


// ============================================================
// ACCOUNTS â€” APPROVE
//
// Workflow:
//
//     pending_accounts
//             â†“
//     pending_plant_head
//
// Accounts may also save their verification details.
// ============================================================

export async function approveAccountsImprovement(
    improvementId,
    designation = null,
    remarks = null
) {

    if (
        !improvementId
    ) {

        throw new Error(
            "Improvement ID is missing."
        );

    }


    return authenticatedRequest(
        `/accounts/improvements/${improvementId}/approve`,
        {
            method: "POST",

            body:
                JSON.stringify({

                    designation:
                        designation,

                    remarks:
                        remarks,

                }),
        }
    );

}


// ============================================================
// ACCOUNTS â€” REJECT
//
// Workflow:
//
//     pending_accounts
//             â†“
//          rejected
//
// Description is mandatory from the UI.
// ============================================================

export async function rejectAccountsImprovement(
    improvementId,
    description
) {

    if (
        !improvementId
    ) {

        throw new Error(
            "Improvement ID is missing."
        );

    }


    if (
        !description ||
        !description.trim()
    ) {

        throw new Error(
            "Rejection description is required."
        );

    }


    return authenticatedRequest(
        `/accounts/improvements/${improvementId}/reject`,
        {
            method: "POST",

            body:
                JSON.stringify({

                    description:
                        description.trim(),

                }),
        }
    );

}


// ============================================================
// ACCOUNTS â€” REQUEST RESUBMISSION
//
// Workflow:
//
//     pending_accounts
//             â†“
//     resubmission_required
//             â†“
//          Employee
//
// Description is mandatory.
// ============================================================

export async function requestAccountsResubmission(
    improvementId,
    description
) {

    if (
        !improvementId
    ) {

        throw new Error(
            "Improvement ID is missing."
        );

    }


    if (
        !description ||
        !description.trim()
    ) {

        throw new Error(
            "Resubmission description is required."
        );

    }


    return authenticatedRequest(
        `/accounts/improvements/${improvementId}/resubmit`,
        {
            method: "POST",

            body:
                JSON.stringify({

                    description:
                        description.trim(),

                }),
        }
    );

}


// ============================================================
// BENEFIT LABEL
//
// Always display the complete benefit name.
//
// P â†’ Productivity
// Q â†’ Quality
// C â†’ Cost
// D â†’ Delivery
// S â†’ Safety
// M â†’ Morale
// ============================================================

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


    // --------------------------------------------------------
    // Handle already-expanded values.
    // --------------------------------------------------------

    if (
        labels[benefitType]
    ) {

        return labels[
            benefitType
        ];

    }


    // --------------------------------------------------------
    // Handle values such as:
    //
    // "P â€“ Productivity"
    // "P - Productivity"
    // --------------------------------------------------------

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


