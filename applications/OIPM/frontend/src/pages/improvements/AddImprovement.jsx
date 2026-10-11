import {
  ArrowLeft,
  Check,
  ClipboardList,
  ImagePlus,
  Info,
  Plus,
  X,
  
  Send,
  Trash2,
  UserCircle,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  createImprovement,
  uploadImprovementImages,
  uploadDraftImages,
  saveDraft,
  submitDraft,
} from "../../api/improvements";

import {
  useAuth,
} from "../../context/AuthContext";

import "./AddImprovement.css";

import ImprovementBackground from "../../components/ImprovementBackground";
import MultiSelect from "../../components/MultiSelect.jsx";
import {
  SAVING_TYPE_OPTIONS,
  calculatePaybackPeriod,
  calculateRowSaving,
  getMonthlySaving,
  getOneTimeSaving,
  getApplicableAnnualSaving,
  normalizeSavingType,
} from "../../utils/financial";
// ============================================================
// CONSTANTS
// ============================================================

const ACTIVITY_OPTIONS = [
  { value: "JH", label: "JH – Autonomous Maintenance" },
  { value: "PM", label: "PM – Planned Maintenance" },
  { value: "KK", label: "KK – Focused Improvement" },
  { value: "QM", label: "QM – Quality Maintenance" },
  { value: "DM", label: "DM – Early Equipment Management" },
  { value: "E&T", label: "E&T – Training and Education" },
  { value: "SHE", label: "SHE – Safety, Health & Environment" },
  { value: "OTPM", label: "OTPM – Office TPM / Administration" },
];

const BENEFIT_OPTIONS = [
  { value: "P", label: "P – Productivity" },
  { value: "Q", label: "Q – Quality" },
  { value: "C", label: "C – Cost" },
];

const MAX_IMAGE_SIZE =
  10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];


// ============================================================
// HELPERS
// ============================================================

function createRow() {

  return {
    id:
      `${Date.now()}-${Math.random()}`,

    description: "",
  };

}


function createCostRow() {

  return {
    id: `${Date.now()}-${Math.random()}`,
    particular: "",
    saving_type: "recurring",
    before: "",
    after: "",
    monthly_saving: "",
    one_time_saving: "",
    duration_months: "",
  };

}

function createDeploymentRow() {

  return {
    id:
      `${Date.now()}-${Math.random()}`,

    machine_no: "",

    target_date: "",

    responsibility: "",

    status: "",
  };

}


function formatMoney(
  value
) {

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {

    return "";

  }


  const number =
    Number(value);


  if (
    Number.isNaN(number)
  ) {

    return value;

  }


  return number.toLocaleString(
    "en-IN",
    {
      maximumFractionDigits: 2,
    }
  );

}


// ============================================================
// IMAGE PREVIEW URL
// ============================================================

function getImagePreviewUrl(image) {
  if (!image) {
    return "";
  }

  if (typeof image === "string") {
    return image;
  }

  return (
    image.previewUrl ||
    image.url ||
    image.signed_url ||
    image.signedUrl ||
    image.signedURL ||
    image.public_url ||
    image.publicUrl ||
    ""
  );
}


// ============================================================
// DRAFT FINANCIAL NORMALIZATION
// ============================================================

function normalizeDraftCostSavingItems(items) {
  if (!Array.isArray(items)) {
    return [createCostRow()];
  }

  return items.map((item, index) => {
    const savingType = normalizeSavingType(item?.saving_type);

    return {
      ...item,
      id: item?.id || `${Date.now()}-${index}-${Math.random()}`,
      saving_type: savingType,
      monthly_saving:
        savingType === "one_time"
          ? ""
          : calculateRowSaving(item) || "",
      one_time_saving:
        savingType === "one_time"
          ? (item?.one_time_saving ?? "")
          : "",
      duration_months:
        savingType === "limited"
          ? (item?.duration_months ?? "")
          : "",
    };
  });
}

function calculateDraftFinancialValues(sourceForm) {
  const costSavingItems = normalizeDraftCostSavingItems(
    sourceForm?.cost_saving_items
  );

  const totalMonthlySaving = getMonthlySaving(
    costSavingItems
  );

  const applicableSaving = getApplicableAnnualSaving(
    sourceForm?.kaizen_start,
    costSavingItems
  );

  const paybackPeriod =
    sourceForm?.investment_required === "Yes"
      ? calculatePaybackPeriod(
          sourceForm?.investment_amount,
          costSavingItems
        )
      : "";

  return {
    cost_saving_items: costSavingItems,
    total_monthly_saving: totalMonthlySaving || "",
    annualized_saving: applicableSaving || "",
    payback_period: paybackPeriod || "",
  };
}


// ============================================================
// COMPONENT
// ============================================================

function AddImprovement({
  onBack,
  onCreated,
  draft = null,
}) {

  const {
    user,
  } = useAuth();


  // ==========================================================
  // FORM
  // ==========================================================

  const [
    form,
    setForm,
  ] = useState({

    department_line: "",

    plant: "",

    kaizen_theme: "",

    idea: "",

    target: "",

    machine: "",

    kaizen_start: "",

    problem_present_status: [
      createRow(),
    ],

    problem_images: [],

    countermeasure_actions: [
      createRow(),
    ],

    countermeasure_images: [],

    result_items: [
      createRow(),
    ],

    result_images: [],

    activity: [],

    benefit_type: [],

    cost_saving_items: [
      createCostRow(),
    ],

    total_monthly_saving: "",

    annualized_saving: "",

    investment_required: "",

    investment_amount: "",

    payback_period: "",

    investment_details: "",

    horizontal_deployment: [
      createDeploymentRow(),
    ],

  });


  const [
    draftId,
    setDraftId,
  ] = useState(draft?.id || null);

  const [
    draftSaving,
    setDraftSaving,
  ] = useState(false);

  const [
    previewImage,
    setPreviewImage,
  ] = useState(null);

  const [
    draftMessage,
    setDraftMessage,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);



  const [
    error,
    setError,
  ] = useState("");


  const [
    success,
    setSuccess,
  ] = useState(false);


  // ==========================================================
  // IMAGE PREVIEW URL CLEANUP
  // ==========================================================

  useEffect(() => {

    return () => {

      [
        ...form.problem_images,
        ...form.countermeasure_images,
        ...form.result_images,
      ].forEach(
        (image) => {

          if (
            image.previewUrl
          ) {

            URL.revokeObjectURL(
              image.previewUrl
            );

          }

        }
      );

    };

  }, [
    form.problem_images,
    form.countermeasure_images,
    form.result_images,
  ]);


  // ==========================================================
  // LOAD EXISTING DRAFT
  // ==========================================================

  useEffect(() => {
    if (!draft?.payload) return;

    const timerId = setTimeout(() => {
      const data = draft.payload;

      const rows = (items) =>
        Array.isArray(items) && items.length
          ? items.map((item) => ({
              id:
                item.id ||
                `${Date.now()}-${Math.random()}`,
              description:
                item.description || "",
            }))
          : [createRow()];

      const draftFinancials =
        calculateDraftFinancialValues(data);

      setDraftId(draft.id || null);

      setForm((previous) => ({
        ...previous,
        ...data,
        department_line:
          data.department_line ||
          data.department ||
          "",
        investment_amount:
          data.investment_required === "Yes"
            ? (data.investment_amount ?? "")
            : "",
        payback_period:
          data.investment_required === "Yes"
            ? (
                draftFinancials.payback_period ||
                data.payback_period ||
                ""
              )
            : "",
        investment_details:
          data.investment_required === "Yes"
            ? (data.investment_details ?? "")
            : "",
        activity:
          Array.isArray(data.activity)
            ? data.activity
            : data.activity
                ? [data.activity]
                : [],
        benefit_type:
          Array.isArray(data.benefit_type)
            ? data.benefit_type
            : data.benefit_type
                ? [data.benefit_type]
                : [],
        problem_present_status:
          rows(data.problem_present_status),
        countermeasure_actions:
          rows(
            data.countermeasure ||
            data.countermeasure_actions
          ),
        result_items:
          rows(
            data.results ||
            data.result_items
          ),
        cost_saving_items:
          draftFinancials.cost_saving_items,
        total_monthly_saving:
          draftFinancials.total_monthly_saving,
        annualized_saving:
          draftFinancials.annualized_saving,
        horizontal_deployment:
          Array.isArray(data.horizontal_deployment) &&
          data.horizontal_deployment.length
            ? data.horizontal_deployment
            : [createDeploymentRow()],
        problem_images:
          (
            Array.isArray(data.problem_images)
              ? data.problem_images
              : []
          ).map((image) => ({
            ...image,
            previewUrl:
              image.previewUrl ||
              image.url ||
              image.signed_url ||
              image.signedUrl ||
              "",
          })),
        countermeasure_images:
          (
            Array.isArray(
              data.countermeasure_images
            )
              ? data.countermeasure_images
              : []
          ).map((image) => ({
            ...image,
            previewUrl:
              image.previewUrl ||
              image.url ||
              image.signed_url ||
              image.signedUrl ||
              "",
          })),
        result_images:
          (
            Array.isArray(data.result_images)
              ? data.result_images
              : []
          ).map((image) => ({
            ...image,
            previewUrl:
              image.previewUrl ||
              image.url ||
              image.signed_url ||
              image.signedUrl ||
              "",
          })),
      }));
    }, 0);

    return () =>
      clearTimeout(timerId);
  }, [draft]);


  // ==========================================================
  // BASIC FIELD UPDATE
  // ==========================================================

  const updateField = (
    field,
    value
  ) => {

    setForm(
      (previous) => {

        if (field === "investment_required") {

          if (value !== "Yes") {
            return {
              ...previous,
              investment_required: value,
              investment_amount: "",
              payback_period: "",
              investment_details: "",
            };
          }

          return {
            ...previous,
            investment_required: "Yes",
          };
        }

        return {
          ...previous,
          [field]: value,
        };
      }
    );

  };


  // ==========================================================
  // ROW UPDATE
  // ==========================================================

  const updateRow = (
    field,
    id,
    key,
    value
  ) => {

    setForm(
      (previous) => ({

        ...previous,

        [field]:
          previous[field].map(
            (row) =>
              row.id === id
                ? {
                    ...row,
                    [key]: value,
                  }
                : row
          ),

      })
    );

  };


  // ==========================================================
  // ADD ROW
  // ==========================================================

  const addRow = (
    field,
    type = "description"
  ) => {

    let row;


    if (
      type === "cost"
    ) {

      row =
        createCostRow();

    }

    else if (
      type === "deployment"
    ) {

      row =
        createDeploymentRow();

    }

    else {

      row =
        createRow();

    }


    setForm(
      (previous) => ({

        ...previous,

        [field]: [
          ...previous[field],
          row,
        ],

      })
    );

  };


  // ==========================================================
  // REMOVE ROW
  // ==========================================================

  const removeRow = (
    field,
    id
  ) => {

    setForm(
      (previous) => {

        const rows =
          previous[field]
            .filter(
              (row) =>
                row.id !== id
            );


        return {

          ...previous,

          [field]:
            rows.length > 0
              ? rows
              : previous[field],

        };

      }
    );

  };


  // ==========================================================
  // IMAGE VALIDATION
  // ==========================================================

  const validateImage = (
    file
  ) => {

    if (
      !ALLOWED_IMAGE_TYPES.includes(
        file.type
      )
    ) {

      return (
        `${file.name} is not a supported image. ` +
        "Please use JPG, PNG or WEBP."
      );

    }


    if (
      file.size >
      MAX_IMAGE_SIZE
    ) {

      return (
        `${file.name} is larger than 10 MB.`
      );

    }


    for (const row of form.cost_saving_items) {
      if (!String(row.particular || "").trim()) continue;
      const type = row.saving_type || "recurring";
      if (type === "one_time" && !(Number(row.one_time_saving) > 0)) {
        return "Please enter the one-time saving amount.";
      }
      if (type !== "one_time" && (row.before === "" || row.after === "")) {
        return "Please enter Before and After values for each recurring or limited-period saving.";
      }
      if (type === "limited" && !(Number(row.duration_months) > 0)) {
        return "Please enter the duration in months for limited-period saving.";
      }
    }

    return null;

  };


  // ==========================================================
  // IMAGE HANDLING
  // ==========================================================

  const addImages = (
    field,
    event
  ) => {

    const files =
      Array.from(
        event.target.files || []
      );


    if (
      files.length === 0
    ) {

      return;

    }


    setError("");


    const validFiles = [];


    for (
      const file of files
    ) {

      const validationError =
        validateImage(
          file
        );


      if (
        validationError
      ) {

        setError(
          validationError
        );

        continue;

      }


      validFiles.push({
        file,

        name:
          file.name,

        previewUrl:
          URL.createObjectURL(
            file
          ),
      });

    }


    if (
      validFiles.length > 0
    ) {

      setForm(
        (previous) => ({

          ...previous,

          [field]: [
            ...previous[field],
            ...validFiles,
          ],

        })
      );

    }


    event.target.value = "";

  };


  // ==========================================================
  // REMOVE IMAGE
  // ==========================================================

  const removeImage = (
    field,
    index
  ) => {

    setForm(
      (previous) => {

        const image =
          previous[field][
            index
          ];


        if (
          image?.previewUrl
        ) {

          URL.revokeObjectURL(
            image.previewUrl
          );

        }


        return {

          ...previous,

          [field]:
            previous[field].filter(
              (_, imageIndex) =>
                imageIndex !== index
            ),

        };

      }
    );

  };


  // ==========================================================
  // COST SAVING CALCULATION
  // ==========================================================

  // Financial calculations are centralized in utils/financial.js.

  const handleCostChange = (id, key, value) => {
    setForm((previous) => {
      const updatedRows = previous.cost_saving_items.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [key]: value };
        if (key === "saving_type") {
          if (value === "one_time") {
            updated.before = "";
            updated.after = "";
            updated.monthly_saving = "";
          } else {
            updated.one_time_saving = "";
          }
          if (value !== "limited") updated.duration_months = "";
        }
        updated.monthly_saving = calculateRowSaving(updated) || "";
        return updated;
      });
      const total = getMonthlySaving(updatedRows);
      return {
        ...previous,
        cost_saving_items: updatedRows,
        total_monthly_saving: total || "",
        annualized_saving: updatedRows.length ? getApplicableAnnualSaving(previous.kaizen_start, updatedRows) : "",
        payback_period: calculatePaybackPeriod(previous.investment_amount, updatedRows),
      };
    });
  };

  // ==========================================================
  // VALIDATION
  // ==========================================================

  const validateForm = () => {

    if (
      !form.department_line.trim()
    ) {

      return (
        "Please enter the department."
      );

    }


    if (
      !form.plant.trim()
    ) {

      return (
        "Please enter the plant."
      );

    }


    if (
      !form.kaizen_theme.trim()
    ) {

      return (
        "Please enter the Kaizen theme."
      );

    }


    if (
      !form.idea.trim()
    ) {

      return (
        "Please enter the improvement idea."
      );

    }


    if (
      !form.target.trim()
    ) {

      return (
        "Please enter the improvement target."
      );

    }


    if (
      !form.kaizen_start
    ) {

      return (
        "Please select the Kaizen start date."
      );

    }


    if (
      !Array.isArray(form.activity) ||
      form.activity.length === 0
    ) {
      return (
        "Please select at least one activity."
      );
    }


    if (
      !Array.isArray(form.benefit_type) ||
      form.benefit_type.length === 0
    ) {

      return (
        "Please select the benefit type."
      );

    }


    const hasProblem =
      form.problem_present_status.some(
        (row) =>
          row.description.trim()
      );


    if (
      !hasProblem
    ) {

      return (
        "Please enter at least one problem / present-status item."
      );

    }


    const hasCountermeasure =
      form.countermeasure_actions.some(
        (row) =>
          row.description.trim()
      );


    if (
      !hasCountermeasure
    ) {

      return (
        "Please enter at least one countermeasure."
      );

    }


    const hasResult =
      form.result_items.some(
        (row) =>
          row.description.trim()
      );


    if (
      !hasResult
    ) {

      return (
        "Please enter at least one result."
      );

    }


    return null;

  };


  // ==========================================================
  // BUILD PAYLOAD
  // ==========================================================

  const buildPayload = () => {

    return {

      // ======================================================
      // SECTION 1
      // ======================================================

      department:
        form.department_line.trim(),

      plant:
        form.plant.trim(),

      kaizen_theme:
        form.kaizen_theme.trim(),

      idea:
        form.idea.trim(),

      target:
        form.target.trim(),

      machine:
        form.machine.trim()
        || null,

      kaizen_start:
        form.kaizen_start
        || null,


      // ======================================================
      // SECTION 2
      // ======================================================

      problem_present_status:
        form.problem_present_status
          .filter(
            (row) =>
              row.description.trim()
          )
          .map(
            (
              row,
              index
            ) => ({

              sl_no:
                index + 1,

              description:
                row.description.trim(),

            })
          ),

      // Backend stores image metadata here.
      // Actual binary files are uploaded afterwards.

      problem_images: [],


      // ======================================================
      // SECTION 3
      // ======================================================

      countermeasure:
        form.countermeasure_actions
          .filter(
            (row) =>
              row.description.trim()
          )
          .map(
            (
              row,
              index
            ) => ({

              sl_no:
                index + 1,

              description:
                row.description.trim(),

            })
          ),

      countermeasure_images: [],


      // ======================================================
      // SECTION 4
      // ======================================================

      results:
        form.result_items
          .filter(
            (row) =>
              row.description.trim()
          )
          .map(
            (
              row,
              index
            ) => ({

              sl_no:
                index + 1,

              description:
                row.description.trim(),

            })
          ),

      result_images: [],


      // ======================================================
      // ACTIVITY + BENEFIT
      // ======================================================

      activity:
        Array.isArray(form.activity)
          ? form.activity
          : [],

      benefit_type:
        Array.isArray(form.benefit_type)
          ? form.benefit_type
          : [],


      // ======================================================
      // SECTION 7
      // ======================================================

      cost_saving_items:
        form.cost_saving_items
          .filter(
            (row) =>
              row.particular.trim()
          )
          .map(
            (
              row,
              index
            ) => ({

              sl_no:
                index + 1,

              particular:
                row.particular.trim(),

              saving_type:
                row.saving_type || "recurring",

              before:
                row.saving_type === "one_time" ? null : (row.before || null),

              after:
                row.saving_type === "one_time" ? null : (row.after || null),

              monthly_saving:
                row.saving_type === "one_time" ? null : (row.monthly_saving || null),

              one_time_saving:
                row.saving_type === "one_time" ? (row.one_time_saving || null) : null,

              duration_months:
                row.saving_type === "limited" ? (row.duration_months || null) : null,

            })
          ),

      total_monthly_saving:
        getMonthlySaving(
          form.cost_saving_items
        )
        || null,

      annualized_saving:
        getApplicableAnnualSaving(
          form.kaizen_start,
          form.cost_saving_items
        )
        || null,


      // ======================================================
      // SECTION 6
      // ======================================================

      investment_required:
        form.investment_required
        || null,

      investment_amount:
        form.investment_required === "Yes"
          ? (form.investment_amount || null)
          : null,

      payback_period:
        form.investment_required === "Yes"
          ? (calculatePaybackPeriod(form.investment_amount, form.cost_saving_items) || null)
          : null,

      investment_details:
        form.investment_required === "Yes"
          ? (form.investment_details.trim() || null)
          : null,


      // ======================================================
      // SECTION 7
      // ======================================================

      horizontal_deployment:
        form.horizontal_deployment
          .filter(
            (row) =>
              row.machine_no.trim() ||
              row.target_date ||
              row.responsibility.trim() ||
              row.status.trim()
          )
          .map(
            (
              row,
              index
            ) => ({

              sl_no:
                index + 1,

              machine_no:
                row.machine_no.trim()
                || null,

              target_date:
                row.target_date
                || null,

              responsibility:
                row.responsibility.trim()
                || null,

              status:
                row.status.trim()
                || null,

            })
          ),

    };

  };


  // ==========================================================
  // UPLOAD ALL IMAGES
  // ==========================================================

  const uploadAllImages = async (
    improvementId
  ) => {

    const uploads = [];


    // --------------------------------------------------------
    // Problem images
    // --------------------------------------------------------

    if (
      form.problem_images.length > 0
    ) {

      uploads.push(
        uploadImprovementImages(
          improvementId,

          "problem",

          form.problem_images.map(
            (item) =>
              item.file
          )
        )
      );

    }


    // --------------------------------------------------------
    // Countermeasure images
    // --------------------------------------------------------

    if (
      form.countermeasure_images.length > 0
    ) {

      uploads.push(
        uploadImprovementImages(
          improvementId,

          "countermeasure",

          form.countermeasure_images.map(
            (item) =>
              item.file
          )
        )
      );

    }


    // --------------------------------------------------------
    // Result images
    // --------------------------------------------------------

    if (
      form.result_images.length > 0
    ) {

      uploads.push(
        uploadImprovementImages(
          improvementId,

          "results",

          form.result_images.map(
            (item) =>
              item.file
          )
        )
      );

    }


    if (
      uploads.length === 0
    ) {

      return [];

    }


    return Promise.all(
      uploads
    );

  };


  // ==========================================================
  // SAVE DRAFT
  // ==========================================================

  const sanitizeDraftValue = (value) => {
    if (Array.isArray(value)) {
      return value.map(sanitizeDraftValue);
    }

    if (value && typeof value === "object") {
      const result = {};

      Object.entries(value).forEach(([key, item]) => {
        if (key === "file" || key === "previewUrl") {
          return;
        }

        result[key] = sanitizeDraftValue(item);
      });

      return result;
    }

    return value;
  };

  const sanitizeDraftImages = (images) => {
    if (!Array.isArray(images)) {
      return [];
    }

    return images
      .filter((image) => {
        if (!image || typeof image !== "object") {
          return false;
        }

        return Boolean(
          image.storage_path ||
          image.path ||
          image.url ||
          image.signed_url ||
          image.signedUrl ||
          image.public_url ||
          image.publicUrl
        );
      })
      .map((image) => sanitizeDraftValue(image));
  };

  const buildDraftPayload = (
    sourceForm = form
  ) => {
    const financials =
      calculateDraftFinancialValues(
        sourceForm
      );

    const payload =
      sanitizeDraftValue({
        ...sourceForm,
        department:
          sourceForm.department_line,
        countermeasure:
          sourceForm.countermeasure_actions,
        results:
          sourceForm.result_items,
        cost_saving_items:
          financials.cost_saving_items,
        total_monthly_saving:
          financials.total_monthly_saving,
        annualized_saving:
          financials.annualized_saving,
        payback_period:
          financials.payback_period,
      });

    payload.problem_images =
      sanitizeDraftImages(
        sourceForm.problem_images
      );

    payload.countermeasure_images =
      sanitizeDraftImages(
        sourceForm.countermeasure_images
      );

    payload.result_images =
      sanitizeDraftImages(
        sourceForm.result_images
      );

    if (
      sourceForm.investment_required !==
      "Yes"
    ) {
      payload.investment_amount = "";
      payload.payback_period = "";
      payload.investment_details = "";
    }

    return payload;
  };

  const persistDraftState = async () => {
    const result = await saveDraft({
      draft_id: draftId,
      payload: buildDraftPayload(),
    });

    const savedDraftId = result?.id || draftId;

    if (!savedDraftId) {
      throw new Error(
        "Draft could not be saved because no draft ID was returned."
      );
    }

    setDraftId(savedDraftId);

    const imageFields = [
      ["problem_images", "problem"],
      ["countermeasure_images", "countermeasure"],
      ["result_images", "results"],
    ];

    let latestForm = form;

    for (const [field, section] of imageFields) {
      const files = (form[field] || [])
        .filter((image) => image?.file instanceof File)
        .map((image) => image.file);

      if (files.length === 0) {
        continue;
      }

      const uploaded = await uploadDraftImages(
        savedDraftId,
        section,
        files
      );

      const uploadedImages = Array.isArray(
        uploaded?.images
      )
        ? uploaded.images
        : [];

      latestForm = {
        ...latestForm,
        [field]: [
          ...(latestForm[field] || []).filter(
            (image) => !(image?.file instanceof File)
          ),
          ...uploadedImages.map((image) => ({
            ...image,
            previewUrl:
              image.url ||
              image.signed_url ||
              image.signedUrl ||
              "",
          })),
        ],
      };
    }

    if (latestForm !== form) {
      setForm(latestForm);

      await saveDraft({
        draft_id: savedDraftId,
        payload:
          buildDraftPayload(
            latestForm
          ),
      });
    }

    return {
      id: savedDraftId,
      form: latestForm,
    };
  };

  const handleSaveDraft = async () => {
    try {
      setDraftSaving(true);
      setDraftMessage("");

      await persistDraftState();

      setDraftMessage(
        "Draft saved successfully."
      );

      if (onCreated) {
        setTimeout(
          () => onCreated({ type: "draft" }),
          150
        );
      }
    } catch (err) {
      setError(
        err?.message ||
        "Unable to save the draft."
      );
    } finally {
      setDraftSaving(false);
    }
  };

  const handleSubmitDraft = async () => {
    if (!draftId) {
      setError("Draft ID is missing.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Save the latest form state and any newly selected
      // images before converting the draft into an improvement.
      const saved = await persistDraftState();

      const result = await submitDraft(
        saved.id
      );

      if (onCreated) {
        onCreated({
          type: "submitted",
          result,
        });
      }
    } catch (err) {
      setError(
        err?.message ||
        "Unable to submit the draft."
      );
    } finally {
      setSubmitting(false);
    }
  };


  // ==========================================================
  // SUBMIT
  // ==========================================================

  const handleSubmit =
    async (event) => {

      event.preventDefault();

      if (draftId) {
        await handleSubmitDraft();
        return;
      }

      setError("");


      const validationError =
        validateForm();


      if (
        validationError
      ) {

        setError(
          validationError
        );


        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });


        return;

      }


      try {

        setSubmitting(true);


        // ====================================================
        // STEP 1
        // CREATE DATABASE RECORD
        // ====================================================

        const payload =
          buildPayload();


        console.log(
          "OIPM submission payload:",
          payload
        );


        const createdImprovement =
          await createImprovement(
            payload
          );


        // ====================================================
        // STEP 2
        // GET CREATED ID
        // ====================================================

        const improvementId =
          createdImprovement?.id;


        if (
          !improvementId
        ) {

          throw new Error(
            "Improvement was created, but the server did not return an improvement ID."
          );

        }


        console.log(
          "Created improvement:",
          createdImprovement
        );


        // ====================================================
        // STEP 3
        // UPLOAD IMAGES
        // ====================================================

        await uploadAllImages(
          improvementId
        );


        // ====================================================
        // STEP 4
        // SUCCESS
        // ====================================================

       


        setSuccess(
          true
        );


        setTimeout(
          () => {

            if (
              onCreated
            ) {

              onCreated();

            }

          },
          1300
        );

      }

      catch (err) {

        console.error(
          "Improvement submission error:",
          err
        );


        setError(
          err.message ||
          "Unable to submit the improvement."
        );


        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });

      }

      finally {

        setSubmitting(
          false
        );

      }

    };


  // ==========================================================
  // SAVE DRAFT
  // ==========================================================




  // ==========================================================
  // SUCCESS
  // ==========================================================

  if (
    success
  ) {

    return (

      <div className="improvement-page">
        <ImprovementBackground />

        <div className="improvement-success-card">

          <div className="success-icon">

            <Check size={32} />

          </div>


          <h2>
            Improvement Submitted
          </h2>


          <p>
            Your OIPM improvement has
            been submitted successfully
            for Accounts / Finance review.
          </p>


          <span>
            You will be redirected to
            your dashboard.
          </span>

        </div>

      </div>

    );

  }


  // ==========================================================
  // RENDER
  // ==========================================================

  return (

    <div className="improvement-page">
      
      <ImprovementBackground />

      {/* ======================================================
          TOP BAR
      ====================================================== */}

      <div className="improvement-topbar">

        <button
          className="back-button"
          onClick={onBack}
          type="button"
          disabled={submitting}
        >

          <ArrowLeft size={18} />

          Back to Dashboard

        </button>


        <div className="improvement-topbar-title">

          <ClipboardList size={20} />

          <span>
            Add Improvement
          </span>

        </div>

      </div>


      {/* ======================================================
          FORM
      ====================================================== */}

      <form
        className="improvement-form"
        onSubmit={handleSubmit}
      >

        {/* ====================================================
            HEADING
        ==================================================== */}

        <div className="improvement-heading">

          <div>

            <span className="form-eyebrow">
              ONE PERSON ONE IMPROVEMENT
            </span>


            <h1>
              Create your improvement
            </h1>


            <p>
              Complete the improvement record
              with the problem, solution, results
              and financial impact.
            </p>

          </div>


          <div className="form-owner-chip">

            <UserCircle size={18} />

            <div>

              <strong>
                {user?.full_name ||
                  user?.name ||
                  "User"}
              </strong>


              <span>
                {user?.employee_code ||
                  "Employee ID unavailable"}
              </span>

            </div>

          </div>

        </div>


        {/* ====================================================
            ERROR
        ==================================================== */}

        {error && (

          <div className="form-alert error">

            <Info size={18} />

            <span>
              {error}
            </span>

          </div>

        )}


        {/* ====================================================
            SUBMISSION INFO
        ==================================================== */}

        <div className="current-status-info">

          <Info size={18} />

          <p>

            <strong>
              One simple workflow:
            </strong>

            {" Complete the form → Accounts / Finance "
            + "review → Plant Head final closure."}

          </p>

        </div>


        {/* ====================================================
            SECTION 1
        ==================================================== */}

        <section className="form-section">

          <SectionHeader
            number="1"
            title="Project Identification"
            description="Tell us what the improvement is and who owns it."
            onImageClick={setPreviewImage}
          />


          <div className="form-grid">

            <ReadOnlyField
              label="Project ID"
              value="Generated automatically"
              note="Assigned after successful submission."
            />


            <ReadOnlyField
              label="Project Owner"
              value={
                user?.full_name ||
                user?.name ||
                "-"
              }
              note="Automatically taken from your account."
            />


            <ReadOnlyField
              label="Owner Employee ID"
              value={
                user?.employee_code ||
                "-"
              }
              note="Automatically taken from your account."
            />


            <FormField
              label="Department"
              required
              value={
                form.department_line
              }
              onChange={(value) =>
                updateField(
                  "department_line",
                  value
                )
              }
              placeholder="e.g. Production, Quality, Maintenance"
            />


            <FormField
              label="Plant"
              required
              value={
                form.plant
              }
              onChange={(value) =>
                updateField(
                  "plant",
                  value
                )
              }
              placeholder="Enter plant name"
            />


            <FormField
              label="Kaizen Theme"
              required
              value={
                form.kaizen_theme
              }
              onChange={(value) =>
                updateField(
                  "kaizen_theme",
                  value
                )
              }
              placeholder="e.g. Productivity improvement"
            />


            <FormField
              label="Target"
              required
              value={
                form.target
              }
              onChange={(value) =>
                updateField(
                  "target",
                  value
                )
              }
              placeholder="Define the measurable target"
            />


            <FormField
              label="Machine/ Area / Process"
              value={
                form.machine
              }
              onChange={(value) =>
                updateField(
                  "machine",
                  value
                )
              }
              placeholder="Machine / line / equipment"
            />


            <FormField
              label="Kaizen Start"
              required
              type="date"
              value={
                form.kaizen_start
              }
              onChange={(value) =>
                updateField(
                  "kaizen_start",
                  value
                )
              }
            />


            <ReadOnlyField
              label="Kaizen End"
              value="Will be filled at final Accounts closure"
              note="You do not need to enter this."
            />


            <FormField
              label="Idea"
              required
              fullWidth
              type="textarea"
              value={
                form.idea
              }
              onChange={(value) =>
                updateField(
                  "idea",
                  value
                )
              }
              placeholder="Describe your improvement idea clearly..."
              rows={4}
            />

          </div>

        </section>


        {/* ====================================================
            SECTION 2
        ==================================================== */}

        <section className="form-section">

          <SectionHeader
            number="2"
            title="Problem / Present Status"
            description="Describe the situation before the improvement."
          />


          <div className="section-helper">

            <Info size={16} />

            <span>
              Use facts, measurements and observations
              wherever possible. Add an image if it helps
              explain the problem.
            </span>

          </div>


          <DescriptionTable
            rows={
              form.problem_present_status
            }
            onChange={(
              id,
              value
            ) =>
              updateRow(
                "problem_present_status",
                id,
                "description",
                value
              )
            }
            onAdd={() =>
              addRow(
                "problem_present_status"
              )
            }
            onRemove={(id) =>
              removeRow(
                "problem_present_status",
                id
              )
            }
            placeholder="Describe the present problem, condition, loss, delay, defect, etc."
          />


          <ImageUpload
            images={
              form.problem_images
            }
            onChange={(event) =>
              addImages(
                "problem_images",
                event
              )
            }
            onRemove={(index) =>
              removeImage(
                "problem_images",
                index
              )
            }
                      onImageClick={setPreviewImage}
/>

        </section>


        {/* ====================================================
            SECTION 3
        ==================================================== */}

        <section className="form-section">

          <SectionHeader
            number="3"
            title="Countermeasure / Engineering Solution / Team Mates If Any"
            description="Explain what you changed or implemented, and if anyone helped you mention there name."
          />


          <DescriptionTable
            rows={
              form.countermeasure_actions
            }
            onChange={(
              id,
              value
            ) =>
              updateRow(
                "countermeasure_actions",
                id,
                "description",
                value
              )
            }
            onAdd={() =>
              addRow(
                "countermeasure_actions"
              )
            }
            onRemove={(id) =>
              removeRow(
                "countermeasure_actions",
                id
              )
            }
            placeholder="Describe the engineering solution / countermeasure implemented..."
          />


          <ImageUpload
            images={
              form.countermeasure_images
            }
            onChange={(event) =>
              addImages(
                "countermeasure_images",
                event
              )
            }
            onRemove={(index) =>
              removeImage(
                "countermeasure_images",
                index
              )
            }
                      onImageClick={setPreviewImage}
/>

        </section>


        {/* ====================================================
            SECTION 4
        ==================================================== */}

        <section className="form-section">

          <SectionHeader
            number="4"
            title="Results"
            description="Show the measurable result after implementation."
          />


          <DescriptionTable
            rows={
              form.result_items
            }
            onChange={(
              id,
              value
            ) =>
              updateRow(
                "result_items",
                id,
                "description",
                value
              )
            }
            onAdd={() =>
              addRow(
                "result_items"
              )
            }
            onRemove={(id) =>
              removeRow(
                "result_items",
                id
              )
            }
            placeholder="Describe the result, improvement, quality gain, time reduction, saving, etc."
          />


          <ImageUpload
            images={
              form.result_images
            }
            onChange={(event) =>
              addImages(
                "result_images",
                event
              )
            }
            onRemove={(index) =>
              removeImage(
                "result_images",
                index
              )
            }
                      onImageClick={setPreviewImage}
/>

        </section>


        {/* ====================================================
            ACTIVITY
        ==================================================== */}

        <section className="form-section multi-select-section">
          <SectionHeader
            number="5"
            title="Activity"
            description="Select one or more TPM activities related to the improvement."
          />
          <div className="form-grid">
            <MultiSelect
              label="Activity"
              required
              value={form.activity}
              onChange={(value) => updateField("activity", value)}
              options={ACTIVITY_OPTIONS}
              placeholder="Select Activity"
            />
          </div>
        </section>


        {/* ====================================================
            BENEFIT
        ==================================================== */}

        <section className="form-section multi-select-section">

          <SectionHeader
            number="6"
            title="Benefit"
            description="Select the primary benefit category of the improvement."
          />

          <div className="form-grid">

            <MultiSelect
              label="Benefit Type"
              required
              value={form.benefit_type}
              onChange={(value) => updateField("benefit_type", value)}
              options={BENEFIT_OPTIONS}
              placeholder="Select Benefit"
            />

          </div>

        </section>


        {/* ====================================================
            SECTION 6
        ==================================================== */}

        <section className="form-section">

          <SectionHeader
            number="7"
            title="Cost Saving Calculation"
            description="Capture the financial impact of the improvement."
          />


          <div className="table-wrapper">

            <table className="improvement-data-table">

              <thead>

                <tr>

                  <th>
                    #
                  </th>

                  <th>
                    Particular
                  </th>

                  <th>Saving Type</th>
                  <th>Before<span className="table-header-note">: Required Expense</span></th>
                  <th>After<span className="table-header-note">: Required Expense</span></th>
                  <th>Monthly Saving</th>
                  <th>One-Time Saving</th>
                  <th>Duration</th>

                  <th>
                  </th>

                </tr>

              </thead>


              <tbody>

                {form.cost_saving_items.map(
                  (
                    row,
                    index
                  ) => (

                    <tr
                      key={
                        row.id
                      }
                    >

                      <td>
                        {index + 1}
                      </td>


                      <td>

                        <input
                          value={
                            row.particular
                          }
                          onChange={(event) =>
                            handleCostChange(
                              row.id,
                              "particular",
                              event.target.value
                            )
                          }
                          placeholder="Particular"
                        />

                      </td>


                      <td>
                        <select value={row.saving_type || "recurring"} onChange={(event) => handleCostChange(row.id, "saving_type", event.target.value)}>
                          {SAVING_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <input type="number" value={row.saving_type === "one_time" ? "" : row.before} disabled={row.saving_type === "one_time"} onChange={(event) => handleCostChange(row.id, "before", event.target.value)} placeholder={row.saving_type === "one_time" ? "N/A" : "0"} />
                      </td>

                      <td>
                        <input type="number" value={row.saving_type === "one_time" ? "" : row.after} disabled={row.saving_type === "one_time"} onChange={(event) => handleCostChange(row.id, "after", event.target.value)} placeholder={row.saving_type === "one_time" ? "N/A" : "0"} />
                      </td>

                      <td>
                        <div className="calculated-value">₹ {formatMoney(row.monthly_saving) || "0"}</div>
                      </td>

                      <td>
                        <input type="number" min="0" value={row.saving_type === "one_time" ? row.one_time_saving : ""} disabled={row.saving_type !== "one_time"} onChange={(event) => handleCostChange(row.id, "one_time_saving", event.target.value)} placeholder={row.saving_type === "one_time" ? "0" : "N/A"} />
                      </td>

                      <td>
                        {row.saving_type === "limited" ? (
                          <input type="number" min="1" step="1" value={row.duration_months} onChange={(event) => handleCostChange(row.id, "duration_months", event.target.value)} placeholder="Months" />
                        ) : (
                          <div className="calculated-value">{row.saving_type === "recurring" ? "Ongoing" : "One time"}</div>
                        )}
                      </td>


                      <td>

                        <button
                          type="button"
                          className="icon-danger-button"
                          onClick={() =>
                            removeRow(
                              "cost_saving_items",
                              row.id
                            )
                          }
                          disabled={
                            form.cost_saving_items.length === 1
                          }
                        >

                          <Trash2
                            size={15}
                          />

                        </button>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>


          <button
            type="button"
            className="add-row-button"
            onClick={() =>
              addRow(
                "cost_saving_items",
                "cost"
              )
            }
          >

            <Plus size={15} />

            Add Cost Saving Row

          </button>


          <div className="financial-summary">

            <div>

              <span>
                Total Monthly Saving
              </span>

              <strong>
                ₹{" "}
                {
                  formatMoney(
                    form.total_monthly_saving
                  ) || "0"
                }
              </strong>

            </div>


            <div>

              <span>
                Annualized Saving
              </span>

              <strong>
                ₹{" "}
                {
                  formatMoney(
                    getApplicableAnnualSaving(
                      form.kaizen_start,
                      form.cost_saving_items
                    )
                  ) || "0"
                }
              </strong>

            </div>

            <div>

              <span>
                One-Time Saving
              </span>

              <strong>
                ₹{" "}
                {
                  formatMoney(
                    getOneTimeSaving(form.cost_saving_items)
                  ) || "0"
                }
              </strong>

            </div>

          </div>

        </section>


        {/* ====================================================
            SECTION 7
        ==================================================== */}

        <section className="form-section">

          <SectionHeader
            number="8"
            title="Investment Required & Payback"
            description="Record the investment needed to implement the improvement."
          />


          <div className="form-grid">

            <FormField
              label="Investment Required"
              type="select"
              value={
                form.investment_required
              }
              onChange={(value) =>
                updateField(
                  "investment_required",
                  value
                )
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


            <FormField
              label="Investment Amount"
              type="number"
              value={
                form.investment_required === "Yes"
                  ? form.investment_amount
                  : ""
              }
              disabled={
                form.investment_required !== "Yes"
              }
              onChange={(value) =>
                setForm(
                  (previous) => ({
                    ...previous,

                    investment_amount:
                      value,

                    payback_period:
                      calculatePaybackPeriod(
                        value,
                        previous.cost_saving_items
                      ),

                  })
                )
              }
              placeholder="₹ 0"
            />


            <FormField
              label="Payback Period"
              value={
                form.payback_period
              }
              placeholder="Auto calculated"
              readOnly
            />


            <FormField
              label="Investment Details"
              type="textarea"
              fullWidth
              value={
                form.investment_required === "Yes"
                  ? form.investment_details
                  : ""
              }
              disabled={
                form.investment_required !== "Yes"
              }
              onChange={(value) =>
                updateField(
                  "investment_details",
                  value
                )
              }
              placeholder="Describe the investment / resources required..."
              rows={3}
            />

          </div>

        </section>


        {/* ====================================================
            SECTION 8
        ==================================================== */}

        <section className="form-section">

          <SectionHeader
            number="9"
            title="Scope & Plan for Horizontal Deployment"
            description="Define where the improvement can be replicated."
          />


          <div className="table-wrapper">

            <table className="improvement-data-table deployment-table">

              <thead>

                <tr>

                  <th>
                    #
                  </th>

                  <th>
                    Machine / Area
                  </th>

                  <th>
                    Target Date
                  </th>

                  <th>
                    Responsibility
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                  </th>

                </tr>

              </thead>


              <tbody>

                {form.horizontal_deployment.map(
                  (
                    row,
                    index
                  ) => (

                    <tr
                      key={
                        row.id
                      }
                    >

                      <td>
                        {index + 1}
                      </td>


                      <td>

                        <input
                          value={
                            row.machine_no
                          }
                          onChange={(event) =>
                            updateRow(
                              "horizontal_deployment",
                              row.id,
                              "machine_no",
                              event.target.value
                            )
                          }
                          placeholder="Machine / area"
                        />

                      </td>


                      <td>

                        <input
                          type="date"
                          value={
                            row.target_date
                          }
                          onChange={(event) =>
                            updateRow(
                              "horizontal_deployment",
                              row.id,
                              "target_date",
                              event.target.value
                            )
                          }
                        />

                      </td>


                      <td>

                        <input
                          value={
                            row.responsibility
                          }
                          onChange={(event) =>
                            updateRow(
                              "horizontal_deployment",
                              row.id,
                              "responsibility",
                              event.target.value
                            )
                          }
                          placeholder="Responsible person"
                        />

                      </td>


                      <td>

                        <select
                          value={
                            row.status
                          }
                          onChange={(event) =>
                            updateRow(
                              "horizontal_deployment",
                              row.id,
                              "status",
                              event.target.value
                            )
                          }
                        >

                          <option value="">
                            Select
                          </option>

                          <option value="planned">
                            Planned
                          </option>

                          <option value="in_progress">
                            In Progress
                          </option>

                          <option value="completed">
                            Completed
                          </option>

                        </select>

                      </td>


                      <td>

                        <button
                          type="button"
                          className="icon-danger-button"
                          onClick={() =>
                            removeRow(
                              "horizontal_deployment",
                              row.id
                            )
                          }
                          disabled={
                            form.horizontal_deployment.length === 1
                          }
                        >

                          <Trash2
                            size={15}
                          />

                        </button>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>


          <button
            type="button"
            className="add-row-button"
            onClick={() =>
              addRow(
                "horizontal_deployment",
                "deployment"
              )
            }
          >

            <Plus size={15} />

            Add Deployment Plan

          </button>

        </section>


        {/* ====================================================
            FINAL INFORMATION
        ==================================================== */}

        <div className="submission-information">

          <div className="submission-information-icon">

            <Send size={18} />

          </div>


          <div>

            <strong>
              Ready to submit?
            </strong>


            <p>

              Your completed improvement will be sent for
              approval. You can also save it as a draft
              and continue working on it later.

            </p>

          </div>

        </div>


        {/* ====================================================
            ACTIONS
        ==================================================== */}

        <div className="form-actions">

          <button
            type="button"
            className="form-secondary-button"
            onClick={onBack}
            disabled={
              submitting
            }
          >

            Cancel

          </button>


          

          {draftMessage && (
            <span className="draft-save-message">{draftMessage}</span>
          )}

          <button
            type="button"
            className="form-draft-button"
            onClick={handleSaveDraft}
            disabled={submitting || draftSaving}
          >
            {draftSaving ? "Saving..." : draftId ? "Save Draft" : "Save as Draft"}
          </button>

          <button
            type="submit"
            className="form-submit-button"
            disabled={
              submitting
            }
          >

            {submitting ? (

              <>

                <span className="button-spinner" />

                Submitting...

              </>

            ) : (

              <>

                <Send size={18} />

                Submit Improvement

              </>

            )}

          </button>

        </div>

      </form>

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

    </div>

  );

}


// ============================================================
// SECTION HEADER
// ============================================================

function SectionHeader({
  number,
  title,
  description,
}) {

  return (

    <div className="form-section-header">

      <div className="section-number">
        {number}
      </div>


      <div>

        <h2>
          {title}
        </h2>


        <p>
          {description}
        </p>

      </div>

    </div>

  );

}


// ============================================================
// READ ONLY FIELD
// ============================================================

function ReadOnlyField({
  label,
  value,
  note,
}) {

  return (

    <div className="form-field">

      <label>
        {label}
      </label>


      <div className="readonly-field">

        {value}

      </div>


      {note && (

        <small>
          {note}
        </small>

      )}

    </div>

  );

}


// ============================================================
// FORM FIELD
// ============================================================

function FormField({
  label,
  required = false,
  value,
  onChange,
  placeholder,
  type = "text",
  rows = 3,
  fullWidth = false,
  options = [],
  readOnly = false,
}) {

  return (

    <div
      className={
        `form-field ${
          fullWidth
            ? "form-field-full"
            : ""
        }`
      }
    >

      <label>

        {label}

        {required && (

          <span className="required">
            *
          </span>

        )}

      </label>


      {type === "textarea" ? (

        <textarea
          value={
            value
          }
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={
            placeholder
          }
          rows={
            rows
          }
        />

      ) : type === "select" ? (

        <select
          value={
            value
          }
          onChange={(event) =>
            onChange(
              event.target.value
            )
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
            value
          }
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={
            placeholder
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
// DESCRIPTION TABLE
// ============================================================

function DescriptionTable({
  rows,
  onChange,
  onAdd,
  onRemove,
  placeholder,
}) {

  return (

    <>

      <div className="table-wrapper">

        <table className="improvement-data-table">

          <thead>

            <tr>

              <th>
                #
              </th>

              <th>
                Description
              </th>

              <th>
              </th>

            </tr>

          </thead>


          <tbody>

            {rows.map(
              (
                row,
                index
              ) => (

                <tr
                  key={
                    row.id
                  }
                >

                  <td>
                    {index + 1}
                  </td>


                  <td>

                    <textarea
                      value={
                        row.description
                      }
                      onChange={(event) =>
                        onChange(
                          row.id,
                          event.target.value
                        )
                      }
                      placeholder={
                        placeholder
                      }
                      rows={3}
                    />

                  </td>


                  <td>

                    <button
                      type="button"
                      className="icon-danger-button"
                      onClick={() =>
                        onRemove(
                          row.id
                        )
                      }
                      disabled={
                        rows.length === 1
                      }
                    >

                      <Trash2
                        size={15}
                      />

                    </button>

                  </td>

                </tr>

              )
            )}

          </tbody>

        </table>

      </div>


      <button
        type="button"
        className="add-row-button"
        onClick={
          onAdd
        }
      >

        <Plus size={15} />

        Add Row

      </button>

    </>

  );

}


// ============================================================
// IMAGE UPLOAD
// ============================================================

function ImageUpload({
  images,
  onChange,
  onRemove,
  onImageClick,
}) {

  return (

    <div className="image-upload-area">

      <div className="image-upload-heading">

        <div>

          <strong>
            Supporting Images
          </strong>

          <span>
            Optional — add photos that help
            explain this section.
          </span>

        </div>


        <label className="image-upload-button">

          <ImagePlus size={16} />

          Add Images

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={
              onChange
            }
          />

        </label>

      </div>


      {images.length > 0 && (

        <div className="image-preview-grid">

          {images.map(
            (
              image,
              index
            ) => (

              <div
                className="image-preview"
                key={
                  `${image.name}-${index}`
                }
              >

                <img
                  src={getImagePreviewUrl(image)}
                  alt={image.name}
                  onClick={() => {
                    const imageUrl =
                      getImagePreviewUrl(image);

                    if (imageUrl) {
                      onImageClick?.({
                        ...(typeof image === "object"
                          ? image
                          : {}),
                        url: imageUrl,
                      });
                    }
                  }}
                />


                <button
                  type="button"
                  onClick={() =>
                    onRemove(
                      index
                    )
                  }
                  aria-label="Remove image"
                >

                  <Trash2
                    size={13}
                  />

                </button>

              </div>

            )
          )}

        </div>

      )}


      {images.length === 0 && (

        <div className="image-upload-empty">

          <ImagePlus size={19} />

          <span>
            No images added
          </span>

        </div>

      )}

    </div>

  );

}


export default AddImprovement;