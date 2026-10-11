const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "/api/v1";


// ============================================================
// COMMON RESPONSE HANDLER
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
// AUTH HEADERS
//
// IMPORTANT:
// App.jsx stores the JWT as:
// localStorage.setItem("access_token", ...)
//
// Therefore Plant Head API must read access_token.
// ============================================================

function getAuthHeaders() {

    const token =
        localStorage.getItem(
            "access_token"
        );


    return {

        "Content-Type":
            "application/json",

        ...(token
            ? {
                Authorization:
                    `Bearer ${token}`,
            }
            : {}),

    };

}


// ============================================================
// GET HELPER
// ============================================================

async function get(
    endpoint
) {

    const response =
        await fetch(
            `${API_BASE_URL}${endpoint}`,
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
// POST HELPER
// ============================================================

async function post(
    endpoint,
    body = null
) {

    const response =
        await fetch(
            `${API_BASE_URL}${endpoint}`,
            {
                method: "POST",

                headers:
                    getAuthHeaders(),

                ...(body !== null
                    ? {
                        body:
                            JSON.stringify(
                                body
                            ),
                    }
                    : {}),
            }
        );


    return handleResponse(
        response
    );

}


// ============================================================
// PLANT HEAD SUMMARY
// ============================================================

export async function getPlantHeadSummary() {

    return get(
        "/plant-head/summary"
    );

}

// ============================================================
// PLANT HEAD ANALYTICS
// ============================================================

export async function getPlantHeadAnalytics(fy = "") {

    const query = fy
        ? `?fy=${encodeURIComponent(fy)}`
        : "";

    return get(
        `/plant-head/analytics${query}`
    );

}


// ============================================================
// MY IMPROVEMENTS
// ============================================================

export async function getPlantHeadImprovements() {

    return get(
        "/plant-head/improvements"
    );

}


// ============================================================
// FOR APPROVAL
// ============================================================

export async function getPlantHeadApprovals() {

    return get(
        "/plant-head/approvals"
    );

}


// ============================================================
// ALL IMPROVEMENTS
// ============================================================

export async function getPlantHeadAllImprovements(
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


    return get(
        `/plant-head/all-improvements${
            query
                ? `?${query}`
                : ""
        }`
    );

}


// ============================================================
// TOTAL EMPLOYEES
// ============================================================

export async function getPlantHeadEmployees() {

    return get(
        "/plant-head/employees"
    );

}


// ============================================================
// APPROVE IMPROVEMENT
// ============================================================

export async function approvePlantHeadImprovement(
    improvementId,
    remarks = ""
) {

    return post(
        `/plant-head/improvements/${improvementId}/approve`,
        {
            remarks,
        }
    );

}


// ============================================================
// REJECT IMPROVEMENT
// ============================================================

export async function rejectPlantHeadImprovement(
    improvementId,
    description
) {

    return post(
        `/plant-head/improvements/${improvementId}/reject`,
        {
            description,
        }
    );

}


// REQUEST RESUBMISSION
// ============================================================

export async function requestPlantHeadResubmission(
    improvementId,
    description
) {
    return post(
        `/plant-head/improvements/${improvementId}/resubmit`,
        { description }
    );
}


// DOWNLOAD REPORT
// ============================================================

export async function downloadPlantHeadReport(
    improvementId,
    format
) {

    const token =
        localStorage.getItem(
            "access_token"
        );


    const response =
        await fetch(
            `${API_BASE_URL}/plant-head/improvements/${improvementId}/report/${format}`,
            {
                method: "GET",

                headers: {

                    ...(token
                        ? {
                            Authorization:
                                `Bearer ${token}`,
                        }
                        : {}),

                },

            }
        );


    if (!response.ok) {

        let message =
            "Unable to download report.";


        try {

            const data =
                await response.json();


            if (
                typeof data.detail ===
                "string"
            ) {

                message =
                    data.detail;

            }

        }

        catch {
            // Keep default message.
        }


        throw new Error(
            message
        );

    }


    return response.blob();

}


// ============================================================
// DOWNLOAD REPORT FILE
// ============================================================

export async function downloadPlantHeadReportFile(
    improvementId,
    format,
    fileName
) {

    const blob =
        await downloadPlantHeadReport(
            improvementId,
            format
        );


    const url =
        window.URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    link.href =
        url;


    link.download =
        fileName ||
        `Improvement_Report_${improvementId}.${format === "word" ? "docx" : "xlsx"}`;


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    window.URL.revokeObjectURL(
        url
    );

}


// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {

    getPlantHeadSummary,

    getPlantHeadAnalytics,

    getPlantHeadImprovements,

    getPlantHeadApprovals,

    getPlantHeadAllImprovements,

    getPlantHeadEmployees,

    approvePlantHeadImprovement,

    rejectPlantHeadImprovement,

    requestPlantHeadResubmission,

    downloadPlantHeadReport,

    downloadPlantHeadReportFile,

};


