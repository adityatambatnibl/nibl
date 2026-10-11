const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "/api/v1";


// ============================================================
// TOKEN
// ============================================================

function getAccessToken() {

    return (
        localStorage.getItem("access_token") ||
        sessionStorage.getItem("access_token") ||
        null
    );

}


// ============================================================
// ERROR FORMATTER
// ============================================================

function formatApiError(data) {

    if (!data) {

        return (
            "Something went wrong. Please try again."
        );

    }


    if (
        typeof data.detail ===
        "string"
    ) {

        return data.detail;

    }


    if (
        Array.isArray(
            data.detail
        )
    ) {

        return data.detail
            .map(
                (error) => {

                    if (
                        typeof error ===
                        "string"
                    ) {

                        return error;

                    }


                    if (
                        error?.msg
                    ) {

                        const location =
                            Array.isArray(
                                error.loc
                            )
                                ? error.loc.join(
                                    " â†’ "
                                )
                                : "";


                        return location
                            ? `${location}: ${error.msg}`
                            : error.msg;

                    }


                    return JSON.stringify(
                        error
                    );

                }
            )
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
// API REQUEST
// ============================================================

async function apiRequest(
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
    // JSON
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


        throw new Error(
            formatApiError(
                data
            )
        );

    }


    return data;

}


// ============================================================
// CREATE IMPROVEMENT
// ============================================================

export async function createImprovement(
    improvementData
) {

    if (
        !improvementData ||
        typeof improvementData !==
        "object"
    ) {

        throw new Error(
            "Improvement data is missing."
        );

    }


    return apiRequest(
        "/improvements",
        {
            method: "POST",

            body:
                JSON.stringify(
                    improvementData
                ),
        }
    );

}


// ============================================================
// GET MY IMPROVEMENTS
//
// Used by employee dashboards and other dashboards
// where the logged-in user's own improvements are shown.
// ============================================================

export async function getMyImprovements() {

    return apiRequest(
        "/improvements/my",
        {
            method: "GET",
        }
    );

}


// ============================================================
// GET MY SUMMARY
// ============================================================

export async function getMyImprovementSummary() {

    return apiRequest(
        "/improvements/my/summary",
        {
            method: "GET",
        }
    );

}


// ============================================================
// GET SINGLE IMPROVEMENT
//
// COMMON VIEW API
//
// Employee
// HOD
// Accounts
// Plant Head
// ============================================================

export async function getImprovementReference(improvementId) {
    if (!improvementId) {
        throw new Error("Improvement ID is missing.");
    }

    return apiRequest(
        `/improvements/all/${improvementId}`,
        { method: "GET" }
    );
}


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


    return apiRequest(
        `/improvements/${improvementId}`,
        {
            method: "GET",
        }
    );

}


// ============================================================
// RESUBMIT / EDIT IMPROVEMENT
//
// Used ONLY when the improvement has been returned for
// resubmission.
//
// Workflow:
//
//     Accounts / Plant Head
//             â†“
//       Request Resubmission
//             â†“
//          Employee
//             â†“
//       View Improvement
//             â†“
//             Edit
//             â†“
//      Save & Resubmit
//
// The employee does NOT edit the Add Improvement page.
//
// Backend endpoint:
//
//     PUT /improvements/{improvement_id}/resubmit
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


    return apiRequest(
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
// ONLY:
//
//     problem
//     countermeasure
//     results
//
// There is intentionally NO horizontal deployment
// image section.
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


    return apiRequest(
        `/improvements/${improvementId}/images?section=${encodeURIComponent(section)}`,
        {
            method: "POST",

            body:
                formData,
        }
    );

}



export async function deleteImprovementImage(improvementId, section, storagePath) {
    if (!improvementId || !section || !storagePath) throw new Error("Improvement image details are missing.");
    return apiRequest(`/improvements/${improvementId}/images?section=${encodeURIComponent(section)}&storage_path=${encodeURIComponent(storagePath)}`, { method: "DELETE" });
}


// Upload images attached to a saved improvement draft.
export async function uploadDraftImages(draftId, section, files) {
    if (!draftId) throw new Error("Draft ID is missing.");
    if (!section) throw new Error("Draft image section is missing.");
    if (!Array.isArray(files) || files.length === 0) {
        throw new Error("Please select at least one image.");
    }

    const allowedSections = ["problem", "countermeasure", "results"];
    if (!allowedSections.includes(section)) {
        throw new Error("Invalid draft image section.");
    }

    const formData = new FormData();
    files.forEach((file) => {
        if (file instanceof File) formData.append("files", file);
    });

    return apiRequest(
        `/drafts/${draftId}/images?section=${encodeURIComponent(section)}`,
        { method: "POST", body: formData }
    );
}

// ============================================================
// BENEFIT LABEL
// ============================================================

export function getBenefitLabel(benefitType) {
    const labels = {
        P: "P â€“ Productivity",
        Q: "Q â€“ Quality",
        C: "C â€“ Cost",
        D: "D â€“ Delivery",
        S: "S â€“ Safety",
        M: "M â€“ Morale",
    };

    const values = Array.isArray(benefitType)
        ? benefitType
        : benefitType === null || benefitType === undefined || benefitType === ""
            ? []
            : [benefitType];

    if (!values.length) return "-";

    return values
        .map((value) => {
            const key = String(value).trim().toUpperCase();
            return labels[key] || labels[key.charAt(0)] || String(value);
        })
        .join(", ");
}


// ============================================================
// STATUS LABEL
// ============================================================

export function getImprovementStatusLabel(
    status
) {

    const labels = {

        draft:
            "Draft",

        pending_accounts:
            "Pending Accounts Review",

        pending_plant_head:
            "Pending Plant Head Review",

        resubmission_required:
            "Resubmit",

        resubmit:
            "Resubmit",

        resubmission:
            "Resubmit",

        in_progress:
            "In Progress",

        rejected:
            "Rejected",

        done:
            "Completed",

        closed:
            "Closed",

    };


    if (
        !status
    ) {

        return "Unknown";

    }


    return (
        labels[status] ||
        status
    );

}


// ============================================================
// CHECK WHETHER EMPLOYEE CAN EDIT
//
// ONLY resubmission_required / resubmit / resubmission.
//
// Normal submitted improvements cannot be edited.
// ============================================================

export function canEditImprovement(
    improvement
) {

    if (
        !improvement
    ) {

        return false;

    }


    const resubmissionStatuses = [

        "resubmission_required",

        "resubmit",

        "resubmission",

    ];


    return resubmissionStatuses.includes(
        improvement.status
    );

}


// ============================================================
// CHECK WHETHER IMPROVEMENT IS RESUBMISSION
// ============================================================

export function isResubmission(
    improvement
) {

    if (
        !improvement
    ) {

        return false;

    }


    return [

        "resubmission_required",

        "resubmit",

        "resubmission",

    ].includes(
        improvement.status
    );

}


// ============================================================
// FINANCIAL FORMATTER
// ============================================================

export function formatCurrency(
    value
) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return "â‚¹ 0.00";

    }


    const number =
        Number(value);


    if (
        Number.isNaN(number)
    ) {

        return `â‚¹ ${value}`;

    }


    return (
        `â‚¹ ${number.toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }
        )}`
    );

}


// ============================================================
// FORMAT COST SAVING ITEM
// ============================================================

export function formatCostSavingItem(
    item,
    index = 0
) {

    if (
        !item
    ) {

        return {

            sl_no:
                index + 1,

            particular:
                "-",

            before:
                0,

            after:
                0,

            monthly_saving:
                0,

        };

    }


    return {

        sl_no:
            item.sl_no ||
            index + 1,

        particular:
            item.particular ||
            "-",

        before:
            item.before ??
            0,

        after:
            item.after ??
            0,

        monthly_saving:
            item.monthly_saving ??
            0,

    };

}


// ============================================================
// NORMALIZE DESCRIPTION ROWS
// ============================================================

export function normalizeDescriptionRows(
    rows
) {

    if (
        !Array.isArray(rows)
    ) {

        return [];

    }


    return rows.map(
        (
            row,
            index
        ) => ({

            sl_no:
                row?.sl_no ||
                index + 1,

            description:
                row?.description ||
                "",

        })
    );

}


// ============================================================
// NORMALIZE DEPLOYMENT ROWS
// ============================================================

export function normalizeDeploymentRows(
    rows
) {

    if (
        !Array.isArray(rows)
    ) {

        return [];

    }


    return rows.map(
        (
            row,
            index
        ) => ({

            sl_no:
                row?.sl_no ||
                index + 1,

            machine_no:
                row?.machine_no ||
                "",

            target_date:
                row?.target_date ||
                "",

            responsibility:
                row?.responsibility ||
                "",

            status:
                row?.status ||
                "",

        })
    );

}


// ============================================================
// NORMALIZE IMPROVEMENT
//
// Gives the reusable View Improvement component a
// predictable structure.
// ============================================================

export function normalizeImprovement(
    improvement
) {

    if (
        !improvement
    ) {

        return null;

    }


    return {

        ...improvement,

        activity:
            Array.isArray(improvement.activity)
                ? improvement.activity
                : improvement.activity
                    ? [improvement.activity]
                    : [],

        benefit_type:
            Array.isArray(improvement.benefit_type)
                ? improvement.benefit_type
                : improvement.benefit_type
                    ? [improvement.benefit_type]
                    : [],

        problem_present_status:
            normalizeDescriptionRows(
                improvement.problem_present_status
            ),


        countermeasure:
            normalizeDescriptionRows(
                improvement.countermeasure
            ),


        results:
            normalizeDescriptionRows(
                improvement.results
            ),


        cost_saving_items:
            Array.isArray(
                improvement.cost_saving_items
            )
                ? improvement.cost_saving_items.map(
                    (
                        item,
                        index
                    ) =>
                        formatCostSavingItem(
                            item,
                            index
                        )
                )
                : [],


        horizontal_deployment:
            normalizeDeploymentRows(
                improvement.horizontal_deployment
            ),


        problem_images:
            Array.isArray(
                improvement.problem_images
            )
                ? improvement.problem_images
                : [],


        countermeasure_images:
            Array.isArray(
                improvement.countermeasure_images
            )
                ? improvement.countermeasure_images
                : [],


        result_images:
            Array.isArray(
                improvement.result_images
            )
                ? improvement.result_images
                : [],


        total_monthly_saving:
            Number(
                improvement.total_monthly_saving
            ) || 0,


        annualized_saving:
            Number(
                improvement.annualized_saving
            ) || 0,

    };

}


// ============================================================
// DEFAULT EXPORT
// ============================================================

const improvementApi = {

    createImprovement,

    getMyImprovements,

    getMyImprovementSummary,

    getImprovement,

    getImprovementReference,

    resubmitImprovement,

    uploadImprovementImages,

    getBenefitLabel,

    getImprovementStatusLabel,

    canEditImprovement,

    isResubmission,

    formatCurrency,

    formatCostSavingItem,

    normalizeDescriptionRows,

    normalizeDeploymentRows,

    normalizeImprovement,

};


export default improvementApi;
// ============================================================
// OWNER EDIT
// ============================================================

export async function updateOwnedImprovement(improvementId, improvementData) {
    if (!improvementId) throw new Error("Improvement ID is missing.");
    return apiRequest(`/improvements/${improvementId}/owner-edit`, {
        method: "PUT",
        body: JSON.stringify(improvementData || {}),
    });
}

export async function updateReviewerImprovement(improvementId, improvementData) {
    if (!improvementId) throw new Error("Improvement ID is missing.");
    return apiRequest(`/improvements/${improvementId}/reviewer-edit`, {
        method: "PUT",
        body: JSON.stringify(improvementData || {}),
    });
}


// ============================================================
// DRAFTS
// ============================================================

export async function getDrafts() {
    return apiRequest("/drafts", { method: "GET" });
}

export async function saveDraft(draftData) {
    return apiRequest("/drafts", {
        method: "POST",
        body: JSON.stringify(draftData || {}),
    });
}

export async function getDraft(draftId) {
    if (!draftId) throw new Error("Draft ID is missing.");
    return apiRequest(`/drafts/${draftId}`, { method: "GET" });
}

export async function deleteDraft(draftId) {
    if (!draftId) throw new Error("Draft ID is missing.");
    return apiRequest(`/drafts/${draftId}`, { method: "DELETE" });
}

export async function submitDraft(draftId) {
    if (!draftId) throw new Error("Draft ID is missing.");
    return apiRequest(`/drafts/${draftId}/submit`, { method: "POST" });
}

export async function getAllImprovementsReference() {
    return apiRequest("/improvements/all", { method: "GET" });
}



