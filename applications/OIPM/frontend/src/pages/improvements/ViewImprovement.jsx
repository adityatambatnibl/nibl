import {
    useState,
} from "react";

import {
    X,
    Eye,
    Pencil,
    CircleAlert,
    Save,
    RotateCcw,
    Plus,
    Trash2,
    Image as ImageIcon,
} from "lucide-react";

import "./ViewImprovement.css";
import MultiSelect from "../../components/MultiSelect.jsx";
import {
    uploadImprovementImages,
    deleteImprovementImage,
} from "../../api/improvements";
import {
    SAVING_TYPE_OPTIONS,
    calculatePaybackPeriod,
    calculateRowSaving,
    getMonthlySaving,
    getOneTimeSaving,
    getApplicableAnnualSaving,
} from "../../utils/financial";


// ============================================================
// CONSTANTS
// ============================================================

const ACTIVITY_OPTIONS = [
    { value: "JH", label: "JH - Autonomous Maintenance" },
    { value: "PM", label: "PM - Planned Maintenance" },
    { value: "KK", label: "KK - Focused Improvement" },
    { value: "QM", label: "QM - Quality Maintenance" },
    { value: "DM", label: "DM - Early Equipment Management" },
    { value: "E&T", label: "E&T - Training and Education" },
    { value: "SHE", label: "SHE - Safety, Health & Environment" },
    { value: "OTPM", label: "OTPM - Office TPM / Administration" },
];

const BENEFIT_OPTIONS = [

    {
        value: "P",
        label: "P - Productivity",
    },

    {
        value: "Q",
        label: "Q - Quality",
    },

    {
        value: "C",
        label: "C - Cost",
    },

    {
        value: "D",
        label: "D - Delivery",
    },

    {
        value: "S",
        label: "S - Safety",
    },

    {
        value: "M",
        label: "M - Morale",
    },

];


// ============================================================
// HELPERS
// ============================================================

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

        return String(value);

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


function formatNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return "0.00";

    }

    const number =
        Number(value);

    if (
        Number.isNaN(number)
    ) {

        return String(value);

    }

    return number.toLocaleString(
        "en-IN",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }
    );

}


function formatCurrency(value) {

    return `Rs. ${formatNumber(value)}`;

}


function normalizeMultiValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (value === null || value === undefined || value === "") return [];
    return [value];
}

function getBenefitValues(value) {
    return normalizeMultiValue(value).map((item) => {
        const normalized = String(item).trim().toUpperCase();
        const found = BENEFIT_OPTIONS.find((option) => option.value === normalized || option.label.toUpperCase() === normalized);
        return found?.value || item;
    });
}

function getBenefitLabel(value) {
    const values = getBenefitValues(value);
    if (!values.length) return "-";
    return values.map((item) => BENEFIT_OPTIONS.find((option) => option.value === String(item).toUpperCase())?.label || item).join(", ");
}

function getActivityLabel(value) {
    const values = normalizeMultiValue(value);
    if (!values.length) return "-";
    return values.map((item) => ACTIVITY_OPTIONS.find((option) => option.value === String(item).toUpperCase())?.label || item).join(", ");
}

// Financial calculations are centralized in utils/financial.js.

// ============================================================
// IMAGE URL
// ============================================================

function getImageUrl(image) {

    if (!image) {
        return null;
    }


    if (
        typeof image ===
        "string"
    ) {

        if (
            image.startsWith(
                "http://"
            ) ||
            image.startsWith(
                "https://"
            ) ||
            image.startsWith(
                "blob:"
            ) ||
            image.startsWith(
                "data:"
            )
        ) {

            return image;

        }


        return null;

    }


    return (
        image.url ||
        image.signed_url ||
        image.signedUrl ||
        image.signedURL ||
        image.public_url ||
        image.publicUrl ||
        image.download_url ||
        image.downloadUrl ||
        null
    );

}


// ============================================================
// STATUS
// ============================================================

function isResubmissionStatus(
    status
) {

    const normalized =
        String(
            status || ""
        )
            .trim()
            .toLowerCase();


    return [

        "resubmission_required",
        "resubmit",
        "resubmission",

    ].includes(
        normalized
    );

}


function getStatusLabel(
    status
) {

    const normalized =
        String(
            status || ""
        )
            .trim()
            .toLowerCase();


    const labels = {

        draft:
            "Draft",

        pending_accounts:
            "Pending Accounts Review",

        pending_plant_head:
            "Pending Plant Head Approval to Start",

        pending_plant_head_final:
            "Pending Plant Head Final Approval",

        in_progress:
            "Plant Head Approved to Start",

        resubmission_required:
            "Resubmit",

        resubmit:
            "Resubmit",

        resubmission:
            "Resubmit",

        approved:
            "Approved",

        completed:
            "Completed",

        done:
            "Completed",

        rejected:
            "Rejected",

    };


    return (
        labels[normalized] ||
        status ||
        "Unknown"
    );

}


// ============================================================
// DETAIL ITEM
// ============================================================

function DetailItem({
    label,
    value,
}) {

    return (

        <div className="view-improvement-detail-item">

            <span>
                {label}
            </span>

            <strong>

                {
                    value !== null &&
                    value !== undefined &&
                    value !== ""
                        ? String(value)
                        : "-"
                }

            </strong>

        </div>

    );

}


// ============================================================
// EDIT FIELD
// ============================================================

function EditField({

    label,

    value,

    onChange,

    type = "text",

    fullWidth = false,

    placeholder = "",

    disabled = false,

    readOnly = false,

    options = [],

}) {

    return (

        <div
            className={
                `view-edit-field ${
                    fullWidth
                        ? "view-edit-field-full"
                        : ""
                }`
            }
        >

            <label>
                {label}
            </label>


            {type === "textarea" ? (

                <textarea

                    value={
                        value ?? ""
                    }

                    onChange={(event) =>
                        onChange(
                            event.target.value
                        )
                    }

                    placeholder={
                        placeholder
                    }

                    rows={4}

                    disabled={
                        disabled
                    }

                    readOnly={
                        readOnly
                    }

                />

            ) : type === "select" ? (

                <select

                    value={
                        value ?? ""
                    }

                    onChange={(event) =>
                        onChange(
                            event.target.value
                        )
                    }

                    disabled={
                        disabled
                    }

                >

                    {options.map(
                        (option) => (

                            <option
                                key={
                                    option.value
                                }
                                value={
                                    option.value
                                }
                            >

                                {
                                    option.label
                                }

                            </option>

                        )
                    )}

                </select>

            ) : (

                <input

                    type={
                        type
                    }

                    value={
                        value ?? ""
                    }

                    onChange={(event) =>
                        onChange(
                            event.target.value
                        )
                    }

                    placeholder={
                        placeholder
                    }

                    disabled={
                        disabled
                    }

                    readOnly={
                        readOnly
                    }

                />

            )}

        </div>

    );

}


// ============================================================
// DETAIL LIST
// ============================================================

function DetailList({
    items,
}) {

    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {

        return (

            <div className="view-improvement-detail-empty">

                No information added.

            </div>

        );

    }


    return (

        <div className="view-improvement-detail-list">

            {items.map(
                (
                    item,
                    index
                ) => {

                    const key =
                        item?.sl_no ||
                        item?.id ||
                        index;


                    if (
                        typeof item ===
                        "string"
                    ) {

                        return (

                            <div
                                className="view-improvement-list-item"
                                key={key}
                            >

                                <div className="view-improvement-list-number">

                                    {index + 1}

                                </div>


                                <div className="view-improvement-list-content">

                                    <p>
                                        {item}
                                    </p>

                                </div>

                            </div>

                        );

                    }


                    return (

                        <div
                            className="view-improvement-list-item"
                            key={key}
                        >

                            <div className="view-improvement-list-number">

                                {
                                    item?.sl_no ||
                                    index + 1
                                }

                            </div>


                            <div className="view-improvement-list-content">

                                {item?.description && (

                                    <div className="detail-row">

                                        <span>
                                            Description
                                        </span>

                                        <strong>
                                            {
                                                item.description
                                            }
                                        </strong>

                                    </div>

                                )}


                                {
                                    item?.particular !==
                                        undefined &&
                                    item?.particular !==
                                        null &&
                                    item?.particular !==
                                        "" && (

                                        <div className="detail-row">

                                            <span>
                                                Particular
                                            </span>

                                            <strong>
                                                {
                                                    item.particular
                                                }
                                            </strong>

                                        </div>

                                    )
                                }


                                {
                                    item?.before !==
                                        undefined &&
                                    item?.before !==
                                        null &&
                                    item?.before !==
                                        "" && (

                                        <div className="detail-row">

                                            <span>
                                                Before : Required Expense
                                            </span>

                                            <strong>
                                                {
                                                    item.before
                                                }
                                            </strong>

                                        </div>

                                    )
                                }


                                {
                                    item?.after !==
                                        undefined &&
                                    item?.after !==
                                        null &&
                                    item?.after !==
                                        "" && (

                                        <div className="detail-row">

                                            <span>
                                                After : Required Expense
                                            </span>

                                            <strong>
                                                {
                                                    item.after
                                                }
                                            </strong>

                                        </div>

                                    )
                                }


                                {
                                    item?.monthly_saving !==
                                        undefined &&
                                    item?.monthly_saving !==
                                        null &&
                                    item?.monthly_saving !==
                                        "" && (

                                        <div className="detail-row">

                                            <span>
                                                Monthly Saving
                                            </span>

                                            <strong className="detail-money">

                                                {
                                                    formatCurrency(
                                                        item.monthly_saving
                                                    )
                                                }

                                            </strong>

                                        </div>

                                    )
                                }


                                {item?.machine_no && (

                                    <div className="detail-row">

                                        <span>
                                            Machine/Area/Process
                                        </span>

                                        <strong>
                                            {
                                                item.machine_no
                                            }
                                        </strong>

                                    </div>

                                )}


                                {item?.target_date && (

                                    <div className="detail-row">

                                        <span>
                                            Target Date
                                        </span>

                                        <strong>
                                            {
                                                formatDate(
                                                    item.target_date
                                                )
                                            }
                                        </strong>

                                    </div>

                                )}


                                {item?.responsibility && (

                                    <div className="detail-row">

                                        <span>
                                            Responsibility
                                        </span>

                                        <strong>
                                            {
                                                item.responsibility
                                            }
                                        </strong>

                                    </div>

                                )}

                            </div>

                        </div>

                    );

                }
            )}

        </div>

    );

}


// ============================================================
// COST SAVING VIEW
// ============================================================

function CostSavingDisplay({
    improvement,
}) {

    const items =
        Array.isArray(
            improvement.cost_saving_items
        )
            ? improvement.cost_saving_items
            : [];


    return (

        <div className="cost-saving-container">

            <div className="cost-saving-summary-grid">

                <div className="cost-saving-summary-card">

                    <span>
                        Monthly Saving
                    </span>

                    <strong>
                        {
                            formatCurrency(
                                improvement.total_monthly_saving
                            )
                        }
                    </strong>

                    <small>
                        Recurring / limited-period monthly benefit
                    </small>

                </div>


                <div className="cost-saving-summary-card">

                    <span>
                        Annualized Saving
                    </span>

                    <strong>
                        {
                            formatCurrency(
                                items.length
                                    ? getApplicableAnnualSaving(
                                        improvement.kaizen_start,
                                        items
                                    )
                                    : improvement.annualized_saving
                            )
                        }
                    </strong>

                    <small>
                        Applicable saving for the starting financial year
                    </small>

                </div>

                <div className="cost-saving-summary-card">

                    <span>
                        One-Time Saving
                    </span>

                    <strong>
                        {
                            formatCurrency(
                                getOneTimeSaving(items)
                            )
                        }
                    </strong>

                    <small>
                        Savings received once
                    </small>

                </div>

            </div>


            <div className="cost-saving-items-container">

                <div className="cost-saving-items-heading">

                    <div>

                        <h4>
                            Saving Details
                        </h4>

                        <p>
                            Breakdown of the improvement's
                            financial benefit
                        </p>

                    </div>


                    <span className="cost-saving-item-count">

                        {items.length}

                        {" "}

                        {
                            items.length === 1
                                ? "Item"
                                : "Items"
                        }

                    </span>

                </div>


                {items.length === 0 ? (

                    <div className="view-improvement-detail-empty">

                        No individual cost-saving items added.

                    </div>

                ) : (

                    <div className="cost-saving-item-list">

                        {items.map(
                            (
                                item,
                                index
                            ) => (

                                <div
                                    className="cost-saving-item-card"
                                    key={
                                        item?.sl_no ||
                                        item?.id ||
                                        index
                                    }
                                >

                                    <div className="cost-saving-item-header">

                                        <div className="cost-saving-item-number">

                                            {
                                                item?.sl_no ||
                                                index + 1
                                            }

                                        </div>


                                        <div>

                                            <h5>
                                                {
                                                    item?.particular ||
                                                    `Saving Item ${index + 1}`
                                                }
                                            </h5>

                                        </div>

                                    </div>


                                    <div className="cost-saving-values-grid">
                                        <div className="cost-saving-value">
                                            <span>Saving Type</span>
                                            <strong>{item?.saving_type_label || (item?.saving_type === "limited" ? "Limited Period Saving" : item?.saving_type === "one_time" ? "One-Time Saving" : "Recurring Saving")}</strong>
                                        </div>
                                        <div className="cost-saving-value">
                                            <span>Before : Required Expense</span>
                                            <strong>{item?.saving_type === "one_time" ? "-" : (item?.before ?? "-")}</strong>
                                        </div>
                                        <div className="cost-saving-value">
                                            <span>After : Required Expense</span>
                                            <strong>{item?.saving_type === "one_time" ? "-" : (item?.after ?? "-")}</strong>
                                        </div>
                                        <div className="cost-saving-value cost-saving-value-highlight">
                                            <span>{item?.saving_type === "one_time" ? "One-Time Saving" : "Monthly Saving"}</span>
                                            <strong>{formatCurrency(item?.saving_type === "one_time" ? item?.one_time_saving : item?.monthly_saving)}</strong>
                                        </div>
                                        <div className="cost-saving-value">
                                            <span>Duration</span>
                                            <strong>{item?.saving_type === "limited" ? `${Math.floor((Number(item?.duration_months) || 0) / 12) ? `${Math.floor((Number(item?.duration_months) || 0) / 12)} years ` : ""}${(Number(item?.duration_months) || 0) % 12 ? `${(Number(item?.duration_months) || 0) % 12} months` : ""}`.trim() || "-" : item?.saving_type === "one_time" ? "One time" : "Ongoing"}</strong>
                                        </div>
                                    </div>

                                </div>

                            )
                        )}

                    </div>

                )}

            </div>

        </div>

    );

}


// ============================================================
// IMAGES
// ============================================================

function DetailImages({

    title,

    images,

    onImageClick,

}) {

    const validImages =
        Array.isArray(images)
            ? images
                .map(
                    (
                        image,
                        index
                    ) => ({

                        image,

                        url:
                            getImageUrl(
                                image
                            ),

                        index,

                    })
                )
                .filter(
                    (
                        item
                    ) =>
                        Boolean(
                            item.url
                        )
                )
            : [];


    if (
        validImages.length === 0
    ) {

        return (

            <div className="view-improvement-images-empty">

                <ImageIcon size={16} />

                <span>
                    No images uploaded.
                </span>

            </div>

        );

    }


    return (

        <div className="view-improvement-images">

            <div className="view-improvement-images-heading">

                <div>

                    <span>
                        {title}
                    </span>

                    <small>
                        Click an image to view it
                    </small>

                </div>


                <strong>

                    {validImages.length}

                    {" "}

                    {
                        validImages.length === 1
                            ? "image"
                            : "images"
                    }

                </strong>

            </div>


            <div className="view-improvement-image-grid">

                {validImages.map(
                    ({
                        image,
                        url,
                        index,
                    }) => (

                        <button
                            key={
                                image?.storage_path ||
                                image?.path ||
                                image?.name ||
                                index
                            }
                            type="button"
                            className="view-improvement-image-card"
                            onClick={() =>
                                onImageClick({
                                    ...(typeof image === "object"
                                        ? image
                                        : {}),
                                    url,
                                })
                            }
                        >

                            <img
                                src={
                                    url
                                }
                                alt={
                                    image?.name ||
                                    `${title} ${index + 1}`
                                }
                                loading="lazy"
                            />


                            <span className="view-improvement-image-overlay">

                                <Eye size={18} />

                                <span>
                                    View
                                </span>

                            </span>

                        </button>

                    )
                )}

            </div>

        </div>

    );

}


// ============================================================
// DETAIL SECTION
// ============================================================

function DetailSection({

    title,

    subtitle,

    items,

    images,

    imageTitle,

    onImageClick,

    showImages = true,

}) {

    return (

        <div className="view-improvement-section">

            <div className="view-improvement-section-heading">

                <div className="section-heading-accent" />

                <div>

                    <h3>
                        {title}
                    </h3>

                    <p>
                        {
                            subtitle ||
                            "Improvement information"
                        }
                    </p>

                </div>

            </div>


            <DetailList
                items={
                    items
                }
            />


            {showImages && (

                <DetailImages

                    title={
                        imageTitle ||
                        `${title} Images`
                    }

                    images={
                        images
                    }

                    onImageClick={
                        onImageClick
                    }

                />

            )}

        </div>

    );

}


// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ViewImprovement({

    improvement,

    onClose,

    onSaveEdit,

    onSaveOwnerEdit,

    reviewerEditEnabled = false,

    onSaveReviewerEdit,

    editableOnResubmission = true,

  

    onSaveAccountsFinancialEdit,

    ownerEditEnabled = false,

}) {

    const [
        previewImage,
        setPreviewImage,
    ] = useState(null);


    const [
        editMode,
        setEditMode,
    ] = useState(false);


    const [
        editModeType,
        setEditModeType,
    ] = useState(null);


    const [
        editData,
        setEditData,
    ] = useState(() =>
        improvement
            ? buildEditableData(
                improvement
            )
            : null
    );


    const [
        saveLoading,
        setSaveLoading,
    ] = useState(false);


    const [
        editError,
        setEditError,
    ] = useState("");

    const [imageActionLoading, setImageActionLoading] = useState("");


    if (!improvement) {
        return null;
    }


    const isResubmission =
        isResubmissionStatus(
            improvement.status
        );


    const isRejected =
        String(
            improvement.status || ""
        )
            .toLowerCase() ===
        "rejected";


    const normalizedImprovementStatus =
        String(
            improvement.status || ""
        )
            .trim()
            .toLowerCase();

    const isAccountsApprovalStage =
        normalizedImprovementStatus ===
        "pending_accounts";

    const isOwnerEditableStatus = [
        "in_progress",
        "pending_plant_head",
        "pending_plant_head_final",
        "pending_accounts",
        "resubmission_required",
        "resubmit",
        "resubmission",
    ].includes(
        normalizedImprovementStatus
    );


    const isAccountsFinancialEdit =
        editModeType ===
        "accounts_financial";

    const isReviewerEdit =
        editModeType ===
        "reviewer";

    const isOwnerEdit =
        editModeType ===
        "owner";


    // ========================================================
    // BUILD EDIT DATA
    // ========================================================

    function buildEditableData(
        source
    ) {

        /*
         * IMPORTANT:
         *
         * We start with the ENTIRE existing DB object.
         * Nothing is thrown away.
         *
         * Then we normalize the arrays used by the editor.
         */

        const existingCostItems =
            Array.isArray(
                source?.cost_saving_items
            )
                ? source.cost_saving_items
                : [];


        const existingProblem =
            Array.isArray(
                source?.problem_present_status
            )
                ? source.problem_present_status
                : [];


        const existingCountermeasure =
            Array.isArray(
                source?.countermeasure
            )
                ? source.countermeasure
                : [];


        const existingResults =
            Array.isArray(
                source?.results
            )
                ? source.results
                : [];


        const existingDeployment =
            Array.isArray(
                source?.horizontal_deployment
            )
                ? source.horizontal_deployment
                : [];


        return {

            ...source,


            // ------------------------------------------------
            // BENEFIT
            // ------------------------------------------------

            activity:
                normalizeMultiValue(source?.activity),

            benefit_type:
                getBenefitValues(source?.benefit_type),


            // ------------------------------------------------
            // PROBLEM
            // ------------------------------------------------

            problem_present_status:
                existingProblem.map(
                    (
                        item,
                        index
                    ) => ({

                        ...item,

                        sl_no:
                            index + 1,

                        description:
                            item?.description ||
                            "",

                    })
                ),


            // ------------------------------------------------
            // COUNTERMEASURE
            // ------------------------------------------------

            countermeasure:
                existingCountermeasure.map(
                    (
                        item,
                        index
                    ) => ({

                        ...item,

                        sl_no:
                            index + 1,

                        description:
                            item?.description ||
                            "",

                    })
                ),


            // ------------------------------------------------
            // RESULTS
            // ------------------------------------------------

            results:
                existingResults.map(
                    (
                        item,
                        index
                    ) => ({

                        ...item,

                        sl_no:
                            index + 1,

                        description:
                            item?.description ||
                            "",

                    })
                ),


            // ------------------------------------------------
            // COST SAVING
            //
            // THIS IS THE IMPORTANT PART.
            //
            // Existing DB rows are loaded.
            //
            // If there are no rows, we still provide one
            // blank row so the user can add a new saving.
            // ------------------------------------------------

            cost_saving_items:
                existingCostItems.length > 0

                    ? existingCostItems.map(
                        (
                            item,
                            index
                        ) => ({

                            ...item,

                            sl_no:
                                index + 1,

                            particular:
                                item?.particular ||
                                "",

                            before:
                                item?.before ??
                                "",

                            after:
                                item?.after ??
                                "",

                            saving_type:
                                item?.saving_type ||
                                "recurring",

                            monthly_saving:
                                item?.monthly_saving ??
                                "",

                            one_time_saving:
                                item?.one_time_saving ??
                                "",

                            duration_months:
                                item?.duration_months ??
                                "",

                        })
                    )

                    : [

                        {

                            sl_no:
                                1,

                            particular:
                                "",

                            saving_type:
                                "recurring",

                            before:
                                "",

                            after:
                                "",

                            monthly_saving:
                                "",

                            one_time_saving:
                                "",

                            duration_months:
                                "",

                        },

                    ],


            // ------------------------------------------------
            // DEPLOYMENT
            // ------------------------------------------------

            horizontal_deployment:
                existingDeployment.map(
                    (
                        item,
                        index
                    ) => ({

                        ...item,

                        sl_no:
                            index + 1,

                        machine_no:
                            item?.machine_no ||
                            "",

                        target_date:
                            item?.target_date ||
                            "",

                        responsibility:
                            item?.responsibility ||
                            "",

                        status:
                            item?.status ||
                            "",

                    })
                ),

        };

    }


    // ========================================================
    // START EDIT
    // ========================================================

    function handleEditStart(
        mode = "full"
    ) {

        /*
         * Rebuild from the actual existing improvement.
         *
         * This guarantees that entering Edit does NOT
         * start with an empty Add Improvement form.
         */

        setEditData(
            buildEditableData(
                improvement
            )
        );

        setEditError("");

        setEditModeType(
            mode
        );

        setEditMode(true);

    }


    // ========================================================
    // CANCEL
    // ========================================================

    function handleCancelEdit() {

        setEditData(
            buildEditableData(
                improvement
            )
        );

        setEditError("");

        setEditMode(false);

        setEditModeType(null);

    }


    // ========================================================
    // SIMPLE FIELD UPDATE
    // ========================================================

    function updateField(
        field,
        value
    ) {

        setEditData(
            (previous) => ({

                ...previous,

                [field]:
                    value,

            })
        );

    }


    // ========================================================
    // INVESTMENT REQUIRED
    // ========================================================

    function handleInvestmentRequiredChange(
        value
    ) {

        setEditData(
            (previous) => {

                /*
                 * If user selects NO:
                 *
                 * Existing investment information is
                 * intentionally removed.
                 *
                 * This is what you asked for:
                 *
                 * YES -> amount/details exist
                 * NO  -> investment is gone.
                 */

                if (
                    value === "No"
                ) {

                    return {

                        ...previous,

                        investment_required:
                            "No",

                        investment_amount:
                            "",

                        payback_period:
                            "",

                        investment_details:
                            "",

                    };

                }


                /*
                 * If user selects YES:
                 *
                 * Do not destroy existing data.
                 * They can edit it afterwards.
                 */

                return {

                    ...previous,

                    investment_required:
                        "Yes",

                };

            }
        );

    }


    // ========================================================
    // LIST UPDATE
    // ========================================================

    function updateListItem(
        field,
        index,
        key,
        value
    ) {

        setEditData(
            (previous) => {

                const list =
                    Array.isArray(
                        previous?.[field]
                    )
                        ? [
                            ...previous[field],
                        ]
                        : [];


                list[index] = {

                    ...list[index],

                    [key]:
                        value,

                };


                return {

                    ...previous,

                    [field]:
                        list,

                };

            }
        );

    }


    // ========================================================
    // COST SAVING UPDATE
    // ========================================================

    function updateCostSavingItem(index, key, value) {
        setEditData((previous) => {
            const list = Array.isArray(previous?.cost_saving_items) ? [...previous.cost_saving_items] : [];
            const updatedItem = { ...list[index], [key]: value };
            if (key === "saving_type") {
                if (value === "one_time") {
                    updatedItem.before = "";
                    updatedItem.after = "";
                    updatedItem.monthly_saving = "";
                } else {
                    updatedItem.one_time_saving = "";
                }
                if (value !== "limited") updatedItem.duration_months = "";
            }
            updatedItem.monthly_saving = calculateRowSaving(updatedItem) || "";
            list[index] = updatedItem;
            return { ...previous, cost_saving_items: list };
        });
    }


    // ========================================================
    // ADD DESCRIPTION ITEM
    // ========================================================

    function addDescriptionItem(
        field
    ) {

        setEditData(
            (previous) => {

                const list =
                    Array.isArray(
                        previous?.[field]
                    )
                        ? [
                            ...previous[field],
                        ]
                        : [];


                return {

                    ...previous,

                    [field]: [

                        ...list,

                        {

                            sl_no:
                                list.length + 1,

                            description:
                                "",

                        },

                    ],

                };

            }
        );

    }


    // ========================================================
    // ADD COST SAVING ITEM
    // ========================================================

    function addCostSavingItem() {

        setEditData(
            (previous) => {

                const list =
                    Array.isArray(
                        previous?.cost_saving_items
                    )
                        ? [
                            ...previous.cost_saving_items,
                        ]
                        : [];


                return {

                    ...previous,

                    cost_saving_items: [

                        ...list,

                        {

                            sl_no:
                                list.length + 1,

                            particular:
                                "",

                            saving_type:
                                "recurring",

                            before:
                                "",

                            after:
                                "",

                            monthly_saving:
                                "",

                            one_time_saving:
                                "",

                            duration_months:
                                "",

                        },

                    ],

                };

            }
        );

    }


    // ========================================================
    // ADD DEPLOYMENT
    // ========================================================

    function addDeploymentItem() {

        setEditData(
            (previous) => {

                const list =
                    Array.isArray(
                        previous?.horizontal_deployment
                    )
                        ? [
                            ...previous.horizontal_deployment,
                        ]
                        : [];


                return {

                    ...previous,

                    horizontal_deployment: [

                        ...list,

                        {

                            sl_no:
                                list.length + 1,

                            machine_no:
                                "",

                            target_date:
                                "",

                            responsibility:
                                "",

                            status:
                                "",

                        },

                    ],

                };

            }
        );

    }


    // ========================================================
    // DELETE ITEM
    // ========================================================

    function deleteListItem(
        field,
        index
    ) {

        setEditData(
            (previous) => {

                const list =
                    Array.isArray(
                        previous?.[field]
                    )
                        ? [
                            ...previous[field],
                        ]
                        : [];


                const updated =
                    list
                        .filter(
                            (
                                _,
                                itemIndex
                            ) =>
                                itemIndex !==
                                index
                        )
                        .map(
                            (
                                item,
                                itemIndex
                            ) => ({

                                ...item,

                                sl_no:
                                    itemIndex + 1,

                            })
                        );


                /*
                 * IMPORTANT:
                 *
                 * Unlike the old version, we DO NOT force
                 * one row to remain.
                 *
                 * [] is valid.
                 *
                 * That means deleting all cost rows will
                 * actually remove cost saving from DB.
                 */

                return {

                    ...previous,

                    [field]:
                        updated,

                };

            }
        );

    }


    // ========================================================
    // CALCULATE TOTAL MONTHLY SAVING
    // ========================================================

    function getTotalMonthlySaving(items) {
        return getMonthlySaving(Array.isArray(items) ? items : []);
    }

        // ========================================================
    // SAVE
    // ========================================================

    async function handleSaveEdit() {

        const isFinancialEdit =
            editModeType ===
            "accounts_financial";


        const saveHandler =
            isFinancialEdit
                ? onSaveAccountsFinancialEdit
                : isReviewerEdit
                    ? onSaveReviewerEdit
                    : isOwnerEdit
                        ? onSaveOwnerEdit
                        : onSaveEdit;


        if (!saveHandler) {

            setEditError(
                isFinancialEdit
                    ? "Accounts financial save function is not connected."
                    : "Save function is not connected."
            );

            return;

        }


        try {

            setSaveLoading(true);

            setEditError("");


            if (isFinancialEdit) {

                const payload =
                    prepareAccountsFinancialPayload(
                        editData
                    );

                console.log(
                    "OIPM ACCOUNTS FINANCIAL UPDATE PAYLOAD:",
                    payload
                );

                await saveHandler(
                    payload
                );

            } else {

                const payload =
                    prepareSubmitPayload(
                        editData
                    );

                console.log(
                    "OIPM RESUBMISSION PAYLOAD:",
                    payload
                );

                await saveHandler(
                    payload
                );

            }

            setEditMode(false);

            setEditModeType(null);

        }

        catch (error) {

            console.error(
                "View Improvement Save Error:",
                error
            );

            setEditError(
                error?.message ||
                "Unable to save the improvement."
            );

        }

        finally {

            setSaveLoading(false);

        }

    }

    // ========================================================
    // PREPARE ACCOUNTS FINANCIAL PAYLOAD
    //
    // Accounts may update ONLY these two sections while the
    // improvement is pending Accounts approval.
    // Workflow fields are deliberately excluded.
    // ========================================================

    function prepareAccountsFinancialPayload(
        data
    ) {

        const rawItems =
            Array.isArray(
                data?.cost_saving_items
            )
                ? data.cost_saving_items
                : [];


        const costSavingItems =
            rawItems
                .filter(
                    (item) =>
                        String(
                            item?.particular ||
                            ""
                        ).trim() !== "" ||
                        item?.before !== "" ||
                        item?.after !== ""
                )
                .map(
                    (item, index) => {

                        const normalizedType = item?.saving_type || "recurring";
                        const monthlySaving = calculateRowSaving(item);

                        return {

                            ...item,

                            sl_no:
                                index + 1,

                            particular:
                                String(
                                    item?.particular ||
                                    ""
                                ).trim(),

                            saving_type:
                                normalizedType,

                            one_time_saving:
                                normalizedType === "one_time" ? (item?.one_time_saving || null) : null,

                            duration_months:
                                normalizedType === "limited" ? (item?.duration_months || null) : null,

                            before:
                                item?.before === "" ||
                                item?.before === null ||
                                item?.before === undefined
                                    ? null
                                    : item.before,

                            after:
                                item?.after === "" ||
                                item?.after === null ||
                                item?.after === undefined
                                    ? null
                                    : item.after,

                            monthly_saving:
                                monthlySaving,

                        };

                    }
                );


        const totalMonthlySaving =
            costSavingItems.reduce(
                (total, item) =>
                    total +
                    Number(
                        item?.monthly_saving ||
                        0
                    ),
                0
            );


        const annualizedSaving =
            getApplicableAnnualSaving(data?.kaizen_start, costSavingItems);


        const investmentRequired =
            String(
                data?.investment_required ||
                ""
            ).trim().toLowerCase() === "yes"
                ? "Yes"
                : "No";


        let investmentAmount = null;
        let investmentDetails = null;
        let paybackPeriod = null;


        if (investmentRequired === "Yes") {

            investmentAmount =
                data?.investment_amount !== "" &&
                data?.investment_amount !== null &&
                data?.investment_amount !== undefined
                    ? data.investment_amount
                    : null;

            investmentDetails =
                String(
                    data?.investment_details ||
                    ""
                ).trim() || null;

            paybackPeriod =
                calculatePaybackPeriod(
                    investmentAmount,
                    costSavingItems
                ) || null;

        }


        return {

            cost_saving_items:
                costSavingItems,

            total_monthly_saving:
                costSavingItems.length > 0
                    ? totalMonthlySaving
                    : null,

            annualized_saving:
                costSavingItems.length > 0
                    ? annualizedSaving
                    : null,

            investment_required:
                investmentRequired,

            investment_amount:
                investmentAmount,

            payback_period:
                paybackPeriod,

            investment_details:
                investmentDetails,

        };

    }


    // ========================================================
    // PREPARE SUBMIT PAYLOAD
    // ========================================================

    function prepareSubmitPayload(
        data
    ) {

        if (!data) {
            return {};
        }


        // ====================================================
        // COST SAVING
        // ====================================================

        const costSavingItems =
            Array.isArray(
                data.cost_saving_items
            )
                ? data.cost_saving_items
                    .filter(
                        (item) =>
                            (
                                item?.particular ||
                                ""
                            ).trim() !== ""
                    )
                    .map(
                        (
                            item,
                            index
                        ) => {

                            const normalizedType = item?.saving_type || "recurring";
                            const monthlySaving = calculateRowSaving(item);


                            return {

                                /*
                                 * Keep any existing item fields
                                 * that the backend may already use.
                                 */

                                ...item,

                                sl_no:
                                    index + 1,

                                particular:
                                    (
                                        item?.particular ||
                                        ""
                                    ).trim(),

                                saving_type:
                                    normalizedType,

                                one_time_saving:
                                    normalizedType === "one_time" ? (item?.one_time_saving || null) : null,

                                duration_months:
                                    normalizedType === "limited" ? (item?.duration_months || null) : null,

                                before:
                                    item?.before ===
                                        "" ||
                                    item?.before ===
                                        null ||
                                    item?.before ===
                                        undefined
                                        ? null
                                        : item.before,

                                after:
                                    item?.after ===
                                        "" ||
                                    item?.after ===
                                        null ||
                                    item?.after ===
                                        undefined
                                        ? null
                                        : item.after,

                                monthly_saving:
                                    monthlySaving,

                            };

                        }
                    )
                : [];


        // ====================================================
        // TOTAL
        // ====================================================

        const totalMonthlySaving =
            costSavingItems.reduce(
                (
                    total,
                    item
                ) => {

                    return (
                        total +
                        Number(
                            item?.monthly_saving ||
                            0
                        )
                    );

                },
                0
            );


        // ====================================================
        // ANNUAL
        // ====================================================

        const annualizedSaving =
            getApplicableAnnualSaving(data?.kaizen_start, costSavingItems);


        // ====================================================
        // INVESTMENT
        // ====================================================

        const investmentRequired =
            data?.investment_required ===
                "Yes"
                ? "Yes"
                : data?.investment_required ===
                    "No"
                    ? "No"
                    : null;


        /*
         * If Investment Required = NO,
         * absolutely clear all investment values.
         */

        let investmentAmount =
            null;

        let investmentDetails =
            null;

        let paybackPeriod =
            null;


        if (
            investmentRequired ===
            "Yes"
        ) {

            investmentAmount =
                data?.investment_amount !==
                    ""
                    ? data?.investment_amount
                    : null;


            investmentDetails =
                data?.investment_details
                    ?.trim()
                    ? data.investment_details.trim()
                    : null;


            paybackPeriod =
                calculatePaybackPeriod(
                    investmentAmount,
                    costSavingItems
                ) || null;

        }


        // ====================================================
        // PAYLOAD
        // ====================================================

        const payload = {

            /*
             * Keep all editable existing fields.
             */

            ...data,


            // ------------------------------------------------
            // BASIC
            // ------------------------------------------------

            department:
                data?.department ??
                data?.department_line ??
                null,

            plant:
                data?.plant ??
                null,

            kaizen_theme:
                data?.kaizen_theme ??
                null,

            idea:
                data?.idea ??
                null,

            target:
                data?.target ??
                null,

            machine:
                data?.machine ||
                null,

            kaizen_start:
                data?.kaizen_start ||
                null,


            // ------------------------------------------------
            // BENEFIT
            // ------------------------------------------------

            activity:
                normalizeMultiValue(data?.activity),

            benefit_type:
                getBenefitValues(data?.benefit_type),


            // ------------------------------------------------
            // PROBLEM
            // ------------------------------------------------

            problem_present_status:
                Array.isArray(
                    data?.problem_present_status
                )
                    ? data.problem_present_status
                        .filter(
                            (item) =>
                                (
                                    item?.description ||
                                    ""
                                ).trim() !== ""
                        )
                        .map(
                            (
                                item,
                                index
                            ) => ({

                                sl_no:
                                    index + 1,

                                description:
                                    (
                                        item?.description ||
                                        ""
                                    ).trim(),

                            })
                        )
                    : [],


            // ------------------------------------------------
            // COUNTERMEASURE
            // ------------------------------------------------

            countermeasure:
                Array.isArray(
                    data?.countermeasure
                )
                    ? data.countermeasure
                        .filter(
                            (item) =>
                                (
                                    item?.description ||
                                    ""
                                ).trim() !== ""
                        )
                        .map(
                            (
                                item,
                                index
                            ) => ({

                                sl_no:
                                    index + 1,

                                description:
                                    (
                                        item?.description ||
                                        ""
                                    ).trim(),

                            })
                        )
                    : [],


            // ------------------------------------------------
            // RESULTS
            // ------------------------------------------------

            results:
                Array.isArray(
                    data?.results
                )
                    ? data.results
                        .filter(
                            (item) =>
                                (
                                    item?.description ||
                                    ""
                                ).trim() !== ""
                        )
                        .map(
                            (
                                item,
                                index
                            ) => ({

                                sl_no:
                                    index + 1,

                                description:
                                    (
                                        item?.description ||
                                        ""
                                    ).trim(),

                            })
                        )
                    : [],


            // ------------------------------------------------
            // COST SAVING
            // ------------------------------------------------

            cost_saving_items:
                costSavingItems,


            total_monthly_saving:
                costSavingItems.length > 0
                    ? totalMonthlySaving
                    : null,


            annualized_saving:
                costSavingItems.length > 0
                    ? annualizedSaving
                    : null,


            // ------------------------------------------------
            // INVESTMENT
            // ------------------------------------------------

            investment_required:
                investmentRequired,


            investment_amount:
                investmentAmount,


            payback_period:
                paybackPeriod,


            investment_details:
                investmentDetails,


            // ------------------------------------------------
            // HORIZONTAL DEPLOYMENT
            // ------------------------------------------------

            horizontal_deployment:
                Array.isArray(
                    data?.horizontal_deployment
                )
                    ? data.horizontal_deployment
                        .filter(
                            (item) =>
                                (
                                    item?.machine_no ||
                                    ""
                                ).trim() ||
                                item?.target_date ||
                                (
                                    item?.responsibility ||
                                    ""
                                ).trim() ||
                                (
                                    item?.status ||
                                    ""
                                ).trim()
                        )
                        .map(
                            (
                                item,
                                index
                            ) => ({

                                sl_no:
                                    index + 1,

                                machine_no:
                                    (
                                        item?.machine_no ||
                                        ""
                                    ).trim() ||
                                    null,

                                target_date:
                                    item?.target_date ||
                                    null,

                                responsibility:
                                    (
                                        item?.responsibility ||
                                        ""
                                    ).trim() ||
                                    null,

                                status:
                                    (
                                        item?.status ||
                                        ""
                                    ).trim() ||
                                    null,

                            })
                        )
                    : [],


            /*
             * End date is NEVER taken from edited data.
             *
             * It stays exactly as it was in the original
             * improvement.
             */

            kaizen_end:
                improvement.kaizen_end,

        };


        // ====================================================
        // REMOVE SERVER CONTROLLED FIELDS
        // ====================================================

        delete payload.id;

        delete payload.improvement_id;

        delete payload.project_id;

        delete payload.status;

        delete payload.current_stage;

        delete payload.resubmission_stage;

        delete payload.resubmission_description;

        delete payload.resubmission_remarks;

        delete payload.remarks;

        delete payload.accounts_verified_by;

        delete payload.accounts_verified_by_name;

        delete payload.accounts_verified_designation;

        delete payload.accounts_verified_at;

        delete payload.accounts_remarks;

        delete payload.rejection_description;


        /*
         * Image arrays are not modified by this JSON
         * resubmission endpoint.
         *
         * Existing image records remain untouched.
         */

        delete payload.problem_images;

        delete payload.countermeasure_images;

        delete payload.result_images;


        return payload;

    }


    // ========================================================
    // ACCOUNTS FINANCIAL EDIT MODE
    //
    // Used only while status === pending_accounts.
    // Everything else remains visible/read-only.
    // ========================================================

    function renderAccountsFinancialEditMode() {

        if (!editData) {
            return null;
        }


        const costItems =
            Array.isArray(
                editData.cost_saving_items
            )
                ? editData.cost_saving_items
                : [];


        const totalMonthlySaving =
            getTotalMonthlySaving(
                costItems
            );


        const annualizedSaving =
            getApplicableAnnualSaving(editData?.kaizen_start, costItems);


        const investmentRequired =
            editData.investment_required === "Yes"
                ? "Yes"
                : "No";


        const paybackPeriod =
            investmentRequired === "Yes"
                ? calculatePaybackPeriod(
                    editData.investment_amount,
                    editData.cost_saving_items || []
                )
                : "";


        return (

            <div className="view-improvement-content edit-mode-content">

                <div className="view-improvement-edit-notice">

                    <CircleAlert size={18} />

                    <div>

                        <strong>
                            Accounts Financial Review
                        </strong>

                        <p>
                            You can edit only Cost Saving and Investment & Payback while this improvement is at the Accounts approval stage. All other information remains unchanged.
                        </p>

                    </div>

                </div>


                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">

                        <div className="section-heading-accent" />

                        <div>

                            <h3>
                                Project Information
                            </h3>

                            <p>
                                View only during Accounts financial review.
                            </p>

                        </div>

                    </div>


                    <div className="view-improvement-grid">

                        <DetailItem label="Improvement ID" value={improvement.project_id || improvement.improvement_id || improvement.id} />
                        <DetailItem label="Department" value={improvement.department || improvement.department_line} />
                        <DetailItem label="Plant" value={improvement.plant} />
                        <DetailItem label="Kaizen Theme" value={improvement.kaizen_theme} />
                        <DetailItem label="Activity" value={getActivityLabel(improvement.activity)} />

                        <DetailItem label="Benefit" value={getBenefitLabel(improvement.benefit_type)} />
                        <DetailItem label="Machine/Area/Process" value={improvement.machine} />
                        <DetailItem label="Target" value={improvement.target} />
                        <DetailItem label="Start Date" value={formatDate(improvement.kaizen_start)} />
                        <DetailItem label="End Date" value={formatDate(improvement.kaizen_end)} />

                    </div>


                    <div className="view-improvement-detail-text">
                        <span>Improvement Idea</span>
                        <p>{improvement.idea || "-"}</p>
                    </div>

                </div>


                <DetailSection
                    title="Problem / Present Status"
                    subtitle="View only during Accounts financial review."
                    items={improvement.problem_present_status}
                    images={improvement.problem_images}
                    imageTitle="Problem Images"
                    onImageClick={setPreviewImage}
                />


                <DetailSection
                    title="Countermeasure / Engineering Solution / Team Mates"
                    subtitle="View only during Accounts financial review."
                    items={improvement.countermeasure}
                    images={improvement.countermeasure_images}
                    imageTitle="Countermeasure Images"
                    onImageClick={setPreviewImage}
                />


                <DetailSection
                    title="Results"
                    subtitle="View only during Accounts financial review."
                    items={improvement.results}
                    images={improvement.result_images}
                    imageTitle="Result Images"
                    onImageClick={setPreviewImage}
                />


                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">

                        <div className="section-heading-accent" />

                        <div>
                            <h3>Cost Saving</h3>
                            <p>Accounts can edit, add or remove saving particulars. Totals are calculated automatically.</p>
                        </div>

                    </div>


                    <div className="view-edit-grid">

                        <EditField
                            label="Total Monthly Saving"
                            value={totalMonthlySaving}
                            type="number"
                            disabled
                            onChange={() => {}}
                        />

                        <EditField
                            label="Annualized Saving"
                            value={annualizedSaving}
                            type="number"
                            disabled
                            onChange={() => {}}
                        />


                        <EditField
                            label="One-Time Saving"
                            value={getOneTimeSaving(costItems)}
                            type="number"
                            disabled
                            onChange={() => {}}
                        />

                    </div>


                    <div className="editable-cost-saving-container">

                        <div className="editable-subheading">
                            <div>
                                <h4>Saving Details</h4>
                                <p>Particular, Before and After are editable. Monthly Saving is calculated automatically.</p>
                            </div>
                        </div>


                        {costItems.length === 0 ? (

                            <div className="editable-list-empty">
                                No saving items added.
                            </div>

                        ) : (

                            costItems.map((item, index) => {

                                const before = Number(item?.before);
                                const after = Number(item?.after);
                                const rowSaving = Number.isFinite(before) && Number.isFinite(after)
                                    ? Math.max(0, before - after)
                                    : "";

                                return (

                                    <div className="editable-cost-saving-card" key={item?.id || item?.sl_no || index}>

                                        <div className="editable-cost-saving-header">
                                            <strong>Saving Item {index + 1}</strong>
                                            <button type="button" className="editable-delete-button" onClick={() => deleteListItem("cost_saving_items", index)}>
                                                <Trash2 size={15} />
                                            </button>
                                        </div>

                                        <div className="view-edit-grid">

                                            <EditField
                                                label="Particular"
                                                value={item?.particular || ""}
                                                onChange={(value) => updateCostSavingItem(index, "particular", value)}
                                            />

                                            <EditField
                                                label="Saving Type"
                                                type="select"
                                                value={item?.saving_type || "recurring"}
                                                options={SAVING_TYPE_OPTIONS}
                                                onChange={(value) => updateCostSavingItem(index, "saving_type", value)}
                                            />

                                            <EditField
                                                label="Before : Required Expense"
                                                type="number"
                                                value={item?.saving_type === "one_time" ? "" : (item?.before ?? "")}
                                                disabled={item?.saving_type === "one_time"}
                                                onChange={(value) => updateCostSavingItem(index, "before", value)}
                                            />

                                            <EditField
                                                label="After : Required Expense"
                                                type="number"
                                                value={item?.saving_type === "one_time" ? "" : (item?.after ?? "")}
                                                disabled={item?.saving_type === "one_time"}
                                                onChange={(value) => updateCostSavingItem(index, "after", value)}
                                            />

                                            <EditField
                                                label="Monthly Saving"
                                                type="number"
                                                value={rowSaving}
                                                disabled
                                                onChange={() => {}}
                                            />

                                            <EditField
                                                label="One-Time Saving"
                                                type="number"
                                                value={item?.saving_type === "one_time" ? (item?.one_time_saving ?? "") : ""}
                                                disabled={item?.saving_type !== "one_time"}
                                                onChange={(value) => updateCostSavingItem(index, "one_time_saving", value)}
                                            />

                                            {item?.saving_type === "limited" && (
                                                <EditField
                                                    label="Duration (Months)"
                                                    type="number"
                                                    value={item?.duration_months ?? ""}
                                                    onChange={(value) => updateCostSavingItem(index, "duration_months", value)}
                                                />
                                            )}

                                        </div>

                                    </div>

                                );

                            })

                        )}


                        <button type="button" className="editable-add-button" onClick={addCostSavingItem}>
                            <Plus size={16} />
                            Add Saving Item
                        </button>

                    </div>

                </div>


                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">
                        <div className="section-heading-accent" />
                        <div>
                            <h3>Investment & Payback</h3>
                            <p>Accounts can change the investment decision, amount and details. Payback is automatic.</p>
                        </div>
                    </div>


                    <div className="view-edit-grid">

                        <EditField
                            label="Investment Required"
                            type="select"
                            value={investmentRequired}
                            onChange={handleInvestmentRequiredChange}
                            options={[
                                { value: "Yes", label: "Yes" },
                                { value: "No", label: "No" },
                            ]}
                        />

                        <EditField
                            label="Investment Amount"
                            type="number"
                            value={investmentRequired === "Yes" ? (editData.investment_amount ?? "") : ""}
                            disabled={investmentRequired !== "Yes"}
                            onChange={(value) => updateField("investment_amount", value)}
                            placeholder="Rs. 0"
                        />

                        <EditField
                            label="Payback Period"
                            value={paybackPeriod}
                            disabled
                            onChange={() => {}}
                            placeholder="Auto calculated"
                        />

                    </div>


                    <EditField
                        label="Investment Details"
                        value={investmentRequired === "Yes" ? (editData.investment_details || "") : ""}
                        type="textarea"
                        fullWidth
                        disabled={investmentRequired !== "Yes"}
                        onChange={(value) => updateField("investment_details", value)}
                        placeholder="Describe the investment / resources required..."
                    />

                </div>


                {editError && (
                    <div className="view-improvement-edit-error">
                        <CircleAlert size={17} />
                        <span>{editError}</span>
                    </div>
                )}

            </div>

        );

    }


    // ========================================================
    // EDIT MODE
    // ========================================================

    async function handleEditImageUpload(section, files) {
        if (!files?.length) return;
        try {
            setImageActionLoading(section);
            const response = await uploadImprovementImages(improvement.id, section, Array.from(files));
            const field = section === "problem" ? "problem_images" : section === "countermeasure" ? "countermeasure_images" : "result_images";
            setEditData((previous) => ({ ...previous, [field]: [...(previous?.[field] || []), ...(response?.images || [])] }));
        } catch (error) { setEditError(error?.message || "Unable to upload image(s)."); } finally { setImageActionLoading(""); }
    }

    async function handleEditImageDelete(section, image) {
        const storagePath = image?.storage_path;
        if (!storagePath) return;
        try {
            setImageActionLoading(storagePath);
            await deleteImprovementImage(improvement.id, section, storagePath);
            const field = section === "problem" ? "problem_images" : section === "countermeasure" ? "countermeasure_images" : "result_images";
            setEditData((previous) => ({ ...previous, [field]: (previous?.[field] || []).filter((item) => item?.storage_path !== storagePath) }));
        } catch (error) { setEditError(error?.message || "Unable to delete image."); } finally { setImageActionLoading(""); }
    }

    function renderEditableImages(section, field, title) {
        const images = editData?.[field] || [];
        return <div className="view-improvement-edit-images"><div className="view-improvement-edit-images-header"><strong>{title}</strong><label className="editable-add-button"><ImageIcon size={16} /> Add Images<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={Boolean(imageActionLoading)} onChange={(event) => { handleEditImageUpload(section, event.target.files); event.target.value = ""; }} /></label></div>{images.length > 0 && <div className="view-improvement-edit-image-grid">{images.map((image, index) => { const url = getImageUrl(image); return <div className="view-improvement-edit-image-card" key={image?.storage_path || image?.name || index}>{url ? <img src={url} alt={image?.name || `${title} ${index + 1}`} onClick={() => setPreviewImage(url)} /> : <div className="view-improvement-edit-image-placeholder">Image</div>}<button type="button" className="editable-delete-button" disabled={Boolean(imageActionLoading)} onClick={() => handleEditImageDelete(section, image)} title="Delete image"><Trash2 size={15} /></button></div>; })}</div>}</div>;
    }


    function renderEditMode() {

        if (isAccountsFinancialEdit) {
            return renderAccountsFinancialEditMode();
        }

        if (!editData) {
            return null;
        }


        const costItems =
            Array.isArray(
                editData.cost_saving_items
            )
                ? editData.cost_saving_items
                : [];


        const totalMonthlySaving =
            getTotalMonthlySaving(
                costItems
            );


        const annualizedSaving =
            getApplicableAnnualSaving(editData?.kaizen_start, costItems);


        const investmentRequired =
            editData.investment_required;


        const paybackPeriod =
            investmentRequired ===
                "Yes"
                ? calculatePaybackPeriod(
                    editData.investment_amount,
                    editData.cost_saving_items || []
                )
                : "";


        return (

            <div className="view-improvement-content edit-mode-content">

                {/* ==================================================
                    NOTICE
                ================================================== */}

                <div className="view-improvement-edit-notice">

                    <CircleAlert size={18} />

                    <div>

                        <strong>
                            Update Required
                        </strong>

                        <p>

                            Review the request below and
                            update any part of the improvement.
                            Your existing information has been
                            loaded and can be edited.

                        </p>

                    </div>

                </div>


                {/* ==================================================
                    REVIEWER REMARK
                ================================================== */}

                <div className="view-improvement-resubmission-remark">

                    <div className="view-improvement-resubmission-remark-header">

                        <CircleAlert size={17} />

                        <span>
                            Changes Requested By Reviewer
                        </span>

                    </div>


                    <p>

                        {
                            improvement.resubmission_description ||
                            improvement.resubmission_remarks ||
                            improvement.remarks ||
                            "Please review and update the improvement."
                        }

                    </p>

                </div>


                {/* ==================================================
                    SECTION 1
                ================================================== */}

                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">

                        <div className="section-heading-accent" />

                        <div>

                            <h3>
                                Project Information
                            </h3>

                            <p>
                                Existing project information
                                can be corrected during resubmission.
                            </p>

                        </div>

                    </div>


                    <div className="view-edit-grid">

                        <EditField
                            label="Improvement ID"
                            value={
                                improvement.project_id ||
                                improvement.improvement_id ||
                                improvement.id ||
                                ""
                            }
                            disabled
                            onChange={() => {}}
                        />


                        <EditField
                            label="Department"
                            value={
                                editData.department ||
                                editData.department_line ||
                                ""
                            }
                            onChange={(value) =>
                                updateField(
                                    "department",
                                    value
                                )
                            }
                        />


                        <EditField
                            label="Plant"
                            value={
                                editData.plant ||
                                ""
                            }
                            onChange={(value) =>
                                updateField(
                                    "plant",
                                    value
                                )
                            }
                        />


                        <EditField
                            label="Kaizen Theme"
                            value={
                                editData.kaizen_theme ||
                                ""
                            }
                            onChange={(value) =>
                                updateField(
                                    "kaizen_theme",
                                    value
                                )
                            }
                        />


                        <MultiSelect
                            label="Activity"
                            value={normalizeMultiValue(editData.activity)}
                            onChange={(value) => updateField("activity", value)}
                            options={ACTIVITY_OPTIONS}
                            placeholder="Select Activity"
                        />


                        <MultiSelect
                            label="Benefit"
                            value={getBenefitValues(editData.benefit_type)}
                            onChange={(value) => updateField("benefit_type", value)}
                            options={BENEFIT_OPTIONS}
                            placeholder="Select Benefit"
                        />


                        <EditField
                            label="Machine/Area/Process"
                            value={
                                editData.machine ||
                                ""
                            }
                            onChange={(value) =>
                                updateField(
                                    "machine",
                                    value
                                )
                            }
                        />


                        <EditField
                            label="Target"
                            value={
                                editData.target ||
                                ""
                            }
                            onChange={(value) =>
                                updateField(
                                    "target",
                                    value
                                )
                            }
                        />


                        <EditField
                            label="Start Date"
                            type="date"
                            value={
                                editData.kaizen_start
                                    ? String(
                                        editData.kaizen_start
                                    ).slice(
                                        0,
                                        10
                                    )
                                    : ""
                            }
                            onChange={(value) =>
                                updateField(
                                    "kaizen_start",
                                    value
                                )
                            }
                        />


                        {/* ==================================================
                            END DATE LOCKED
                        ================================================== */}

                        <EditField

                            label="End Date"

                            type="date"

                            value={
                                improvement.kaizen_end
                                    ? String(
                                        improvement.kaizen_end
                                    ).slice(
                                        0,
                                        10
                                    )
                                    : ""
                            }

                            disabled

                            onChange={() => {}}

                        />

                    </div>


                    <EditField

                        label="Improvement Idea"

                        value={
                            editData.idea ||
                            ""
                        }

                        type="textarea"

                        fullWidth

                        onChange={(value) =>
                            updateField(
                                "idea",
                                value
                            )
                        }

                    />

                </div>


                {/* ==================================================
                    SECTION 2
                ================================================== */}

                <EditableDescriptionSection

                    title="Problem / Present Status"

                    description="Edit, add or remove problem statements."

                    field="problem_present_status"

                    items={
                        editData.problem_present_status
                    }

                    onUpdate={
                        updateListItem
                    }

                    onAdd={
                        addDescriptionItem
                    }

                    onDelete={
                        deleteListItem
                    }

                />


                {renderEditableImages("problem", "problem_images", "Problem Images")}

                {/* ==================================================
                    SECTION 3
                ================================================== */}

                <EditableDescriptionSection

                    title="Countermeasure / Engineering Solution / Team Mates"

                    description="Edit, add or remove countermeasure steps."

                    field="countermeasure"

                    items={
                        editData.countermeasure
                    }

                    onUpdate={
                        updateListItem
                    }

                    onAdd={
                        addDescriptionItem
                    }

                    onDelete={
                        deleteListItem
                    }

                />


                {renderEditableImages("countermeasure", "countermeasure_images", "Countermeasure Images")}

                {/* ==================================================
                    SECTION 4
                ================================================== */}

                <EditableDescriptionSection

                    title="Results"

                    description="Edit, add or remove result statements."

                    field="results"

                    items={
                        editData.results
                    }

                    onUpdate={
                        updateListItem
                    }

                    onAdd={
                        addDescriptionItem
                    }

                    onDelete={
                        deleteListItem
                    }

                />


                {renderEditableImages("results", "result_images", "Result Images")}

                {/* ==================================================
                    SECTION 5 - COST SAVING
                ================================================== */}

                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">

                        <div className="section-heading-accent" />

                        <div>

                            <h3>
                                Cost Saving
                            </h3>

                            <p>
                                Existing cost-saving particulars
                                are loaded here. You can edit,
                                add or remove them.
                            </p>

                        </div>

                    </div>


                    {/* ==================================================
                        TOTALS
                    ================================================== */}

                    <div className="view-edit-grid">

                        <EditField

                            label="Total Monthly Saving"

                            value={
                                totalMonthlySaving
                            }

                            type="number"

                            disabled

                            onChange={() => {}}

                        />


                        <EditField

                            label="Annualized Saving"

                            value={
                                annualizedSaving
                            }

                            type="number"

                            disabled

                            onChange={() => {}}

                        />


                        <EditField
                            label="One-Time Saving"
                            value={getOneTimeSaving(costItems)}
                            type="number"
                            disabled
                            onChange={() => {}}
                        />

                    </div>


                    {/* ==================================================
                        COST SAVING ROWS
                    ================================================== */}

                    <div className="editable-cost-saving-container">

                        <div className="editable-subheading">

                            <div>

                                <h4>
                                    Saving Details
                                </h4>

                                <p>
                                    Particular, Before and After
                                    are editable. Monthly Saving
                                    is calculated automatically.
                                </p>

                            </div>

                        </div>


                        {costItems.length === 0 ? (

                            <div className="editable-list-empty">

                                No saving items added.

                            </div>

                        ) : (

                            costItems.map(
                                (
                                    item,
                                    index
                                ) => {

                                    const rowSaving = calculateRowSaving(item) || "";


                                    return (

                                        <div

                                            className="editable-cost-saving-card"

                                            key={
                                                item?.id ||
                                                item?.sl_no ||
                                                index
                                            }

                                        >

                                            <div className="editable-cost-saving-header">

                                                <strong>
                                                    Saving Item {
                                                        index + 1
                                                    }
                                                </strong>


                                                <button

                                                    type="button"

                                                    className="editable-delete-button"

                                                    onClick={() =>
                                                        deleteListItem(
                                                            "cost_saving_items",
                                                            index
                                                        )
                                                    }

                                                >

                                                    <Trash2
                                                        size={15}
                                                    />

                                                </button>

                                            </div>


                                            <div className="view-edit-grid">

                                                {/* ==================================================
                                                    PARTICULAR
                                                ================================================== */}

                                                <EditField
                                                    label="Particular"
                                                    value={item?.particular || ""}
                                                    onChange={(value) => updateCostSavingItem(index, "particular", value)}
                                                />

                                                <EditField
                                                    label="Saving Type"
                                                    type="select"
                                                    value={item?.saving_type || "recurring"}
                                                    options={SAVING_TYPE_OPTIONS}
                                                    onChange={(value) => updateCostSavingItem(index, "saving_type", value)}
                                                />

                                                <EditField
                                                    label="Before : Required Expense"
                                                    type="number"
                                                    value={item?.saving_type === "one_time" ? "" : (item?.before ?? "")}
                                                    disabled={item?.saving_type === "one_time"}
                                                    onChange={(value) => updateCostSavingItem(index, "before", value)}
                                                />

                                                <EditField
                                                    label="After : Required Expense"
                                                    type="number"
                                                    value={item?.saving_type === "one_time" ? "" : (item?.after ?? "")}
                                                    disabled={item?.saving_type === "one_time"}
                                                    onChange={(value) => updateCostSavingItem(index, "after", value)}
                                                />

                                                <EditField
                                                    label="Monthly Saving"
                                                    type="number"
                                                    value={rowSaving}
                                                    disabled
                                                    onChange={() => {}}
                                                />

                                                <EditField
                                                    label="One-Time Saving"
                                                    type="number"
                                                    value={item?.saving_type === "one_time" ? (item?.one_time_saving ?? "") : ""}
                                                    disabled={item?.saving_type !== "one_time"}
                                                    onChange={(value) => updateCostSavingItem(index, "one_time_saving", value)}
                                                />

                                                {item?.saving_type === "limited" && (
                                                    <EditField
                                                        label="Duration (Months)"
                                                        type="number"
                                                        value={item?.duration_months ?? ""}
                                                        onChange={(value) => updateCostSavingItem(index, "duration_months", value)}
                                                    />
                                                )}
                                            </div>

                                        </div>

                                    );

                                }
                            )

                        )}


                        {/* ==================================================
                            ADD
                        ================================================== */}

                        <button

                            type="button"

                            className="editable-add-button"

                            onClick={
                                addCostSavingItem
                            }

                        >

                            <Plus size={16} />

                            Add Saving Item

                        </button>

                    </div>

                </div>


                {/* ==================================================
                    SECTION 6 - INVESTMENT
                ================================================== */}

                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">

                        <div className="section-heading-accent" />

                        <div>

                            <h3>
                                Investment & Payback
                            </h3>

                            <p>
                                Select whether investment is
                                required. Investment details are
                                only retained when Yes is selected.
                            </p>

                        </div>

                    </div>


                    <div className="view-edit-grid">

                        {/* ==================================================
                            YES / NO DROPDOWN
                        ================================================== */}

                        <EditField

                            label="Investment Required"

                            type="select"

                            value={
                                editData.investment_required ||
                                ""
                            }

                            onChange={
                                handleInvestmentRequiredChange
                            }

                            options={[

                                {
                                    value: "",
                                    label: "Select",
                                },

                                {
                                    value: "Yes",
                                    label: "Yes",
                                },

                                {
                                    value: "No",
                                    label: "No",
                                },

                            ]}

                        />


                        {/* ==================================================
                            INVESTMENT AMOUNT
                        ================================================== */}

                        <EditField

                            label="Investment Amount"

                            type="number"

                            value={
                                investmentRequired ===
                                    "Yes"
                                    ? (
                                        editData.investment_amount ??
                                        ""
                                    )
                                    : ""
                            }

                            disabled={
                                investmentRequired !==
                                "Yes"
                            }

                            onChange={(value) =>
                                updateField(
                                    "investment_amount",
                                    value
                                )
                            }

                            placeholder="Rs. 0"

                        />


                        {/* ==================================================
                            PAYBACK
                        ================================================== */}

                        <EditField

                            label="Payback Period"

                            value={
                                paybackPeriod
                            }

                            disabled

                            onChange={() => {}}

                            placeholder="Auto calculated"

                        />

                    </div>


                    {/* ==================================================
                        INVESTMENT DETAILS
                    ================================================== */}

                    <EditField

                        label="Investment Details"

                        value={
                            investmentRequired ===
                                "Yes"
                                ? (
                                    editData.investment_details ||
                                    ""
                                )
                                : ""
                        }

                        type="textarea"

                        fullWidth

                        disabled={
                            investmentRequired !==
                            "Yes"
                        }

                        onChange={(value) =>
                            updateField(
                                "investment_details",
                                value
                            )
                        }

                        placeholder="Describe the investment / resources required..."

                    />

                </div>


                {/* ==================================================
                    SECTION 7 - HORIZONTAL DEPLOYMENT
                ================================================== */}

                <EditableDeploymentSection

                    items={
                        editData.horizontal_deployment
                    }

                    onUpdate={
                        updateListItem
                    }

                    onAdd={
                        addDeploymentItem
                    }

                    onDelete={
                        deleteListItem
                    }

                />


                {/* ==================================================
                    ERROR
                ================================================== */}

                {editError && (

                    <div className="view-improvement-edit-error">

                        <CircleAlert size={17} />

                        <span>
                            {editError}
                        </span>

                    </div>

                )}

            </div>

        );

    }


    // ========================================================
    // VIEW MODE
    // ========================================================

    function renderViewMode() {

        return (

            <div className="view-improvement-content">

                {/* ==================================================
                    PROJECT
                ================================================== */}

                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">

                        <div className="section-heading-accent" />

                        <div>

                            <h3>
                                Project Information
                            </h3>

                            <p>
                                Basic information about the
                                improvement.
                            </p>

                        </div>

                    </div>


                    <div className="view-improvement-grid">

                        <DetailItem
                            label="Improvement ID"
                            value={
                                improvement.improvement_id ||
                                improvement.project_id ||
                                improvement.id
                            }
                        />


                        <DetailItem
                            label="Department"
                            value={
                                improvement.department ||
                                improvement.department_line
                            }
                        />


                        <DetailItem
                            label="Plant"
                            value={
                                improvement.plant
                            }
                        />


                        <DetailItem
                            label="Kaizen Theme"
                            value={
                                improvement.kaizen_theme
                            }
                        />


                        <DetailItem
                            label="Activity"
                            value={
                                getActivityLabel(
                                    improvement.activity
                                )
                            }
                        />


                        <DetailItem
                            label="Benefit"
                            value={
                                getBenefitLabel(
                                    improvement.benefit_type
                                )
                            }
                        />


                        <DetailItem
                            label="Machine/Area/Process"
                            value={
                                improvement.machine
                            }
                        />


                        <DetailItem
                            label="Target"
                            value={
                                improvement.target
                            }
                        />


                        <DetailItem
                            label="Start Date"
                            value={
                                formatDate(
                                    improvement.kaizen_start
                                )
                            }
                        />


                        <DetailItem
                            label="End Date"
                            value={
                                formatDate(
                                    improvement.kaizen_end
                                )
                            }
                        />

                    </div>


                    <div className="view-improvement-detail-text">

                        <span>
                            Improvement Idea
                        </span>

                        <p>
                            {
                                improvement.idea ||
                                "-"
                            }
                        </p>

                    </div>

                </div>


                {/* ==================================================
                    PROBLEM
                ================================================== */}

                <DetailSection

                    title="Problem / Present Status"

                    subtitle="Problem identified before implementing the improvement."

                    items={
                        improvement.problem_present_status
                    }

                    images={
                        improvement.problem_images
                    }

                    imageTitle="Problem Images"

                    onImageClick={
                        setPreviewImage
                    }

                />


                {/* ==================================================
                    COUNTERMEASURE
                ================================================== */}

                <DetailSection

                    title="Countermeasure / Engineering Solution / Team Mates"

                    subtitle="Action taken to address the identified problem, and helping hands if any."

                    items={
                        improvement.countermeasure
                    }

                    images={
                        improvement.countermeasure_images
                    }

                    imageTitle="Countermeasure Images"

                    onImageClick={
                        setPreviewImage
                    }

                />


                {/* ==================================================
                    RESULTS
                ================================================== */}

                <DetailSection

                    title="Results"

                    subtitle="Result achieved after implementation."

                    items={
                        improvement.results
                    }

                    images={
                        improvement.result_images
                    }

                    imageTitle="Result Images"

                    onImageClick={
                        setPreviewImage
                    }

                />


                {/* ==================================================
                    COST SAVING
                ================================================== */}

                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">

                        <div className="section-heading-accent" />

                        <div>

                            <h3>
                                Cost Saving
                            </h3>

                            <p>
                                Financial benefit generated
                                by the improvement.
                            </p>

                        </div>

                    </div>


                    <CostSavingDisplay
                        improvement={
                            improvement
                        }
                    />

                </div>


                {/* ==================================================
                    INVESTMENT
                ================================================== */}

                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">

                        <div className="section-heading-accent" />

                        <div>

                            <h3>
                                Investment & Payback
                            </h3>

                            <p>
                                Investment required to implement
                                the improvement.
                            </p>

                        </div>

                    </div>


                    <div className="view-improvement-grid">

                        <DetailItem

                            label="Investment Required"

                            value={
                                improvement.investment_required
                            }

                        />


                        <DetailItem

                            label="Investment Amount"

                            value={
                                improvement.investment_required === "Yes" &&
                                improvement.investment_amount !==
                                    null &&
                                improvement.investment_amount !==
                                    undefined &&
                                improvement.investment_amount !==
                                    ""
                                    ? formatCurrency(
                                        improvement.investment_amount
                                    )
                                    : "-"
                            }

                        />


                        <DetailItem

                            label="Payback Period"

                            value={
                                improvement.investment_required === "Yes"
                                    ? (improvement.payback_period || "-")
                                    : "-"
                            }

                        />

                    </div>


                    <div className="view-improvement-detail-text">

                        <span>
                            Investment Details
                        </span>

                        <p>
                            {
                                improvement.investment_required === "Yes"
                                    ? (improvement.investment_details || "-")
                                    : "-"
                            }
                        </p>

                    </div>

                </div>


                {/* ==================================================
                    HORIZONTAL DEPLOYMENT
                ================================================== */}

                <DetailSection

                    title="Horizontal Deployment"

                    subtitle="Other areas where the improvement can be implemented."

                    items={
                        improvement.horizontal_deployment
                    }

                    images={[]}

                    showImages={false}

                    onImageClick={
                        setPreviewImage
                    }

                />


                {/* ==================================================
                    ACCOUNTS
                ================================================== */}

                {
                    (
                        improvement.accounts_verified_by ||
                        improvement.accounts_verified_by_name ||
                        improvement.accounts_verified_designation ||
                        improvement.accounts_verified_at ||
                        improvement.accounts_remarks
                    ) && (

                        <div className="view-improvement-section">

                            <div className="view-improvement-section-heading">

                                <div className="section-heading-accent" />

                                <div>

                                    <h3>
                                        Accounts Verification
                                    </h3>

                                    <p>
                                        Finance verification record.
                                    </p>

                                </div>

                            </div>


                            <div className="view-improvement-grid">

                                <DetailItem
                                    label="Verified By"
                                    value={
                                        improvement.accounts_verified_by_name ||
                                        improvement.accounts_verified_by_user?.full_name ||
                                        improvement.accounts_verified_by_user?.name ||
                                        improvement.accounts_verified_by
                                    }
                                />


                                <DetailItem
                                    label="Designation"
                                    value={
                                        improvement.accounts_verified_designation
                                    }
                                />


                                <DetailItem
                                    label="Verification Date"
                                    value={
                                        formatDate(
                                            improvement.accounts_verified_at
                                        )
                                    }
                                />

                            </div>


                            <div className="view-improvement-detail-text">

                                <span>
                                    Verification Remarks
                                </span>

                                <p>
                                    {
                                        improvement.accounts_remarks ||
                                        "-"
                                    }
                                </p>

                            </div>

                        </div>

                    )
                }


                {/* ==================================================
                    APPROVAL
                ================================================== */}

                <div className="view-improvement-section">

                    <div className="view-improvement-section-heading">

                        <div className="section-heading-accent" />

                        <div>

                            <h3>
                                Approval Status
                            </h3>

                            <p>
                                Current workflow position.
                            </p>

                        </div>

                    </div>


                    <div className="view-improvement-grid">

                        <DetailItem

                            label="Current Status"

                            value={
                                getStatusLabel(
                                    improvement.status
                                )
                            }

                        />


                        <DetailItem

                            label="Current Stage"

                            value={
                                improvement.current_stage ||
                                improvement.resubmission_stage ||
                                "-"
                            }

                        />

                    </div>


                    {isResubmission && (

                        <div className="view-improvement-resubmission-remark">

                            <div className="view-improvement-resubmission-remark-header">

                                <CircleAlert
                                    size={17}
                                />

                                <span>
                                    Changes Requested
                                </span>

                            </div>


                            <p>

                                {
                                    improvement.resubmission_description ||
                                    improvement.resubmission_remarks ||
                                    improvement.remarks ||
                                    "Please review and update the improvement."
                                }

                            </p>

                        </div>

                    )}


                    {isRejected && (

                        <div className="view-improvement-rejection-remark">

                            <strong>
                                Rejection Description
                            </strong>

                            <p>
                                {
                                    improvement.rejection_description ||
                                    "-"
                                }
                            </p>

                        </div>

                    )}

                </div>

            </div>

        );

    }


    // ========================================================
    // MAIN RETURN
    // ========================================================

    return (

        <>

            <div
                className="view-improvement-overlay"
                onClick={
                    onClose
                }
            >

                <div

                    className="view-improvement-modal"

                    onClick={(event) =>
                        event.stopPropagation()
                    }

                >

                    {/* ==================================================
                        HEADER
                    ================================================== */}

                    <div className="view-improvement-header">

                        <div>

                            <span className="view-improvement-eyebrow">

                                {
                                    editMode
                                        ? (
                                            isAccountsFinancialEdit
                                                ? "ACCOUNTS FINANCIAL EDIT"
                                                : "EDIT IMPROVEMENT"
                                        )
                                        : "IMPROVEMENT RECORD"
                                }

                            </span>


                            <h2>

                                {
                                    improvement.project_id ||
                                    improvement.improvement_id ||
                                    improvement.id ||
                                    "Improvement Details"
                                }

                            </h2>

                        </div>


                        <button

                            type="button"

                            className="view-improvement-close"

                            onClick={
                                onClose
                            }

                            disabled={
                                saveLoading
                            }

                        >

                            <X size={20} />

                        </button>

                    </div>


                    {/* ==================================================
                        RESUBMISSION BANNER
                    ================================================== */}

                    {isResubmission &&
                        !editMode && (

                            <div className="view-improvement-resubmission-banner">

                                <div className="view-improvement-resubmission-icon">

                                    <CircleAlert
                                        size={19}
                                    />

                                </div>


                                <div>

                                    <strong>
                                        Resubmission Required
                                    </strong>

                                    <p>

                                        This improvement has been
                                        returned for changes. Review
                                        the remarks and use
                                        <b>
                                            {" "}Edit Improvement{" "}
                                        </b>
                                        to make the requested changes.

                                    </p>

                                </div>

                            </div>

                        )}


                    {/* ==================================================
                        CONTENT
                    ================================================== */}

                    {editMode
                        ? renderEditMode()
                        : renderViewMode()
                    }


                    {/* ==================================================
                        FOOTER
                    ================================================== */}

                    <div className="view-improvement-footer">

                        {editMode ? (

                            <>

                                <button

                                    type="button"

                                    className="view-improvement-cancel-edit-button"

                                    onClick={
                                        handleCancelEdit
                                    }

                                    disabled={
                                        saveLoading
                                    }

                                >

                                    <RotateCcw size={16} />

                                    Cancel Changes

                                </button>


                                <button

                                    type="button"

                                    className="view-improvement-save-button"

                                    onClick={
                                        handleSaveEdit
                                    }

                                    disabled={
                                        saveLoading
                                    }

                                >

                                    <Save size={16} />

                                    {
                                        saveLoading
                                            ? "Saving..."
                                            : isAccountsFinancialEdit
                                                ? "Save Financial Changes"
                                                : isOwnerEdit
                                                    ? (String(improvement.status || "").toLowerCase() === "in_progress" ? "Submit Improvement" : "Save Changes")
                                                : isReviewerEdit
                                                    ? "Save Changes"
                                                    : "Save & Resubmit"
                                    }

                                </button>

                            </>

                        ) : (

                            <>

                                <button

                                    type="button"

                                    className="view-improvement-close-button"

                                    onClick={
                                        onClose
                                    }

                                >

                                    Close

                                </button>

                                {ownerEditEnabled &&
                                    isOwnerEditableStatus &&
                                    !isRejected &&
                                    !isResubmission && (

                                    <button
                                        type="button"
                                        className="view-improvement-edit-button"
                                        onClick={() => handleEditStart("owner")}
                                    >
                                        <Pencil size={16} />
                                        {isAccountsApprovalStage
                                            ? "Edit Improvement/Financials"
                                            : "Edit Improvement"}
                                    </button>

                                )}

                                {reviewerEditEnabled &&
                                    !ownerEditEnabled &&
                                    !isResubmission && (
                                    <button
                                        type="button"
                                        className="view-improvement-edit-button"
                                        onClick={() => handleEditStart("reviewer")}
                                    >
                                        <Pencil size={16} />
                                        {isAccountsApprovalStage
                                            ? "Edit Improvement/Financials"
                                            : "Edit Improvement"}
                                    </button>
                                )}

                                {isResubmission &&
                                    editableOnResubmission && (

                                        <button

                                            type="button"

                                            className="view-improvement-edit-button"

                                            onClick={() =>
                                                handleEditStart(
                                                    "full"
                                                )
                                            }

                                        >

                                            <Pencil
                                                size={16}
                                            />

                                            Edit Improvement

                                        </button>

                                    )}

                            </>

                        )}

                    </div>

                </div>

            </div>


            {/* ==================================================
                IMAGE PREVIEW
            ================================================== */}

            {previewImage && (

                <div

                    className="view-improvement-image-preview-overlay"

                    onClick={() =>
                        setPreviewImage(
                            null
                        )
                    }

                >

                    <div

                        className="view-improvement-image-preview"

                        onClick={(event) =>
                            event.stopPropagation()
                        }

                    >

                        <button

                            type="button"

                            className="view-improvement-image-preview-close"

                            onClick={() =>
                                setPreviewImage(
                                    null
                                )
                            }

                        >

                            <X size={20} />

                        </button>


                        <img

                            src={
                                previewImage.url
                            }

                            alt={
                                previewImage.name ||
                                "Improvement"
                            }

                        />

                    </div>

                </div>

            )}

        </>

    );

}


// ============================================================
// EDITABLE DESCRIPTION SECTION
// ============================================================

function EditableDescriptionSection({

    title,

    description,

    field,

    items,

    onUpdate,

    onAdd,

    onDelete,

}) {

    const list =
        Array.isArray(items)
            ? items
            : [];


    return (

        <div className="view-improvement-section">

            <div className="view-improvement-section-heading">

                <div className="section-heading-accent" />

                <div>

                    <h3>
                        {title}
                    </h3>

                    <p>
                        {description}
                    </p>

                </div>

            </div>


            <div className="editable-list-container">

                {list.length === 0 ? (

                    <div className="editable-list-empty">

                        No entries added.

                    </div>

                ) : (

                    list.map(
                        (
                            item,
                            index
                        ) => (

                            <div

                                className="editable-list-card"

                                key={
                                    item?.id ||
                                    item?.sl_no ||
                                    index
                                }

                            >

                                <div className="editable-list-card-header">

                                    <span>
                                        Step {index + 1}
                                    </span>


                                    <button

                                        type="button"

                                        className="editable-delete-button"

                                        onClick={() =>
                                            onDelete(
                                                field,
                                                index
                                            )
                                        }

                                    >

                                        <Trash2
                                            size={15}
                                        />

                                    </button>

                                </div>


                                <EditField

                                    label="Description"

                                    value={
                                        item?.description ||
                                        ""
                                    }

                                    type="textarea"

                                    fullWidth

                                    onChange={(value) =>
                                        onUpdate(
                                            field,
                                            index,
                                            "description",
                                            value
                                        )
                                    }

                                />

                            </div>

                        )
                    )

                )}


                <button

                    type="button"

                    className="editable-add-button"

                    onClick={() =>
                        onAdd(
                            field
                        )
                    }

                >

                    <Plus size={16} />

                    Add Entry

                </button>

            </div>

        </div>

    );

}


// ============================================================
// EDITABLE DEPLOYMENT SECTION
// ============================================================

function EditableDeploymentSection({

    items,

    onUpdate,

    onAdd,

    onDelete,

}) {

    const list =
        Array.isArray(items)
            ? items
            : [];


    return (

        <div className="view-improvement-section">

            <div className="view-improvement-section-heading">

                <div className="section-heading-accent" />

                <div>

                    <h3>
                        Horizontal Deployment
                    </h3>

                    <p>
                        Edit, add or remove deployment plans.
                    </p>

                </div>

            </div>


            <div className="editable-list-container">

                {list.length === 0 ? (

                    <div className="editable-list-empty">

                        No deployment plans added.

                    </div>

                ) : (

                    list.map(
                        (
                            item,
                            index
                        ) => (

                            <div

                                className="editable-list-card"

                                key={
                                    item?.id ||
                                    item?.sl_no ||
                                    index
                                }

                            >

                                <div className="editable-list-card-header">

                                    <span>
                                        Deployment {
                                            index + 1
                                        }
                                    </span>


                                    <button

                                        type="button"

                                        className="editable-delete-button"

                                        onClick={() =>
                                            onDelete(
                                                "horizontal_deployment",
                                                index
                                            )
                                        }

                                    >

                                        <Trash2
                                            size={15}
                                        />

                                    </button>

                                </div>


                                <div className="view-edit-grid">

                                    <EditField

                                        label="Machine/Area/Process"

                                        value={
                                            item?.machine_no ||
                                            ""
                                        }

                                        onChange={(value) =>
                                            onUpdate(
                                                "horizontal_deployment",
                                                index,
                                                "machine_no",
                                                value
                                            )
                                        }

                                    />


                                    <EditField

                                        label="Target Date"

                                        type="date"

                                        value={
                                            item?.target_date
                                                ? String(
                                                    item.target_date
                                                ).slice(
                                                    0,
                                                    10
                                                )
                                                : ""
                                        }

                                        onChange={(value) =>
                                            onUpdate(
                                                "horizontal_deployment",
                                                index,
                                                "target_date",
                                                value
                                            )
                                        }

                                    />


                                    <EditField

                                        label="Responsibility"

                                        value={
                                            item?.responsibility ||
                                            ""
                                        }

                                        onChange={(value) =>
                                            onUpdate(
                                                "horizontal_deployment",
                                                index,
                                                "responsibility",
                                                value
                                            )
                                        }

                                    />


                                    <EditField

                                        label="Status"

                                        type="select"

                                        value={
                                            item?.status ||
                                            ""
                                        }

                                        onChange={(value) =>
                                            onUpdate(
                                                "horizontal_deployment",
                                                index,
                                                "status",
                                                value
                                            )
                                        }

                                        options={[

                                            {
                                                value: "",
                                                label: "Select",
                                            },

                                            {
                                                value: "planned",
                                                label: "Planned",
                                            },

                                            {
                                                value: "in_progress",
                                                label: "In Progress",
                                            },

                                            {
                                                value: "completed",
                                                label: "Completed",
                                            },

                                        ]}

                                    />

                                </div>

                            </div>

                        )
                    )

                )}


                <button

                    type="button"

                    className="editable-add-button"

                    onClick={
                        onAdd
                    }

                >

                    <Plus size={16} />

                    Add Deployment

                </button>

            </div>

        </div>

    );

}
