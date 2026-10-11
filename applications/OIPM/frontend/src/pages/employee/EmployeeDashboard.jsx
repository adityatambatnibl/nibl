import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FileX2,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  UserCircle,
  X,
  RotateCcw,
  CircleAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { goToPortal } from "../../utils/portal";

import {
  useEffect,
  useState,
} from "react";

import {
  getMyImprovements,
  getMyImprovementSummary,
  getImprovement,
  resubmitImprovement,
  updateOwnedImprovement,
} from "../../api/improvements";

import {
  useAuth,
} from "../../context/AuthContext";

import AddImprovement
  from "../improvements/AddImprovement.jsx";

import ViewImprovement
  from "../improvements/ViewImprovement.jsx";

import "./EmployeeDashboard.css";
import "../../DashboardEnhancements.css";
import Profile from "../profile/Profile.jsx";
import logo from "../../../assest/logo.jpg";

import Lists from "../../components/List.jsx";

/* ============================================================
   BENEFIT LABELS
============================================================ */

const BENEFIT_LABELS = {

  S: "S - Safety",

  Q: "Q - Quality",

  D: "D - Delivery",

  C: "C - Cost",

  M: "M - Morale",
  P: "P - Productivity",

};


/* ============================================================
   STATUS CONFIGURATION
============================================================ */

const STATUS_CONFIG = {

  pending_plant_head: {

    label: "Pending",

    stage: "Plant Head Approval",

    className:
      "status-pending",

    icon:
      <Clock3 size={13} />,

  },


  pending_hod: {

    label: "Pending",

    stage: "HOD Approval",

    className:
      "status-pending",

    icon:
      <Clock3 size={13} />,

  },


  pending_plant_head_2: {

    label: "Pending",

    stage: "Plant Head Approval",

    className:
      "status-pending",

    icon:
      <Clock3 size={13} />,

  },


  pending_plant_head_final: {

    label: "Pending",

    stage: "Plant Head Final Approval",

    className:
      "status-pending",

    icon:
      <Clock3 size={13} />,

  },


  pending_accounts: {

    label: "Pending",

    stage: "Accounts Approval",

    className:
      "status-pending",

    icon:
      <Clock3 size={13} />,

  },


  pending_plant_head_3: {

    label: "Pending",

    stage: "Final Plant Head Closure",

    className:
      "status-pending",

    icon:
      <Clock3 size={13} />,

  },


  in_progress: {

    label: "In Progress",

    stage: "Approved to Start",

    className:
      "status-progress",

    icon:
      <Clock3 size={13} />,

  },


  rejected: {

    label: "Rejected",

    stage: "Rejected",

    className:
      "status-rejected",

    icon:
      <FileX2 size={13} />,

  },


  resubmission_required: {

    label: "Resubmission",

    stage: "Action Required",

    className:
      "status-resubmission",

    icon:
      <RotateCcw size={13} />,

  },


  resubmit: {

    label: "Resubmission",

    stage: "Action Required",

    className:
      "status-resubmission",

    icon:
      <RotateCcw size={13} />,

  },


  resubmission: {

    label: "Resubmission",

    stage: "Action Required",

    className:
      "status-resubmission",

    icon:
      <RotateCcw size={13} />,

  },


  done: {

    label: "Completed",

    stage: "Completed",

    className:
      "status-done",

    icon:
      <CheckCircle2 size={13} />,

  },


  closed: {

    label: "Completed",

    stage: "Closed",

    className:
      "status-done",

    icon:
      <CheckCircle2 size={13} />,

  },

};


/* ============================================================
   FORMAT DATE
============================================================ */

function formatDate(
  dateValue
) {

  if (!dateValue) {

    return "-";

  }


  const date =
    new Date(dateValue);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return dateValue;

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


/* ============================================================
   RESUBMISSION STATUS
============================================================ */

function isResubmissionStatus(status) {

  return [
    "resubmission_required",
    "resubmit",
    "resubmission",
  ].includes(
    String(status || "").trim().toLowerCase()
  );

}


/* ============================================================
   GET STAGE
============================================================ */

function getStage(item) {

  if (
    item.status ===
    "rejected"
  ) {

    return (

      item.rejected_at_stage ||
      "Unknown Stage"

    );

  }


  if (
    isResubmissionStatus(
      item.status
    )
  ) {

    return (

      item.resubmission_stage ||
      "Action Required"

    );

  }


  const config =
    STATUS_CONFIG[
      item.status
    ];


  return (

    config?.stage ||
    "Processing"

  );

}


/* ============================================================
   FORMAT STAGE LABEL
============================================================ */

function formatStage(
  stage
) {

  if (!stage) {

    return "-";

  }


  const labels = {

    plant_head_1:
      "Plant Head Approval",

    plant_head_2:
      "Plant Head Approval",

    plant_head_3:
      "Final Plant Head Closure",

    hod:
      "HOD Approval",

    accounts:
      "Accounts Approval",

    pending_plant_head:
      "Plant Head Approval",

    pending_hod:
      "HOD Approval",

    pending_plant_head_2:
      "Plant Head Approval",

    pending_accounts:
      "Accounts Approval",

    pending_plant_head_3:
      "Final Plant Head Closure",

  };


  return (

    labels[stage] ||

    stage
      .replaceAll(
        "_",
        " "
      )
      .replace(
        /\b\w/g,
        (letter) =>
          letter.toUpperCase()
      )

  );

}


/* ============================================================
   EMPLOYEE DASHBOARD
============================================================ */

function EmployeeDashboard() {

  const {
    user,
    logout,
  } = useAuth();


  const [
    sidebarOpen,
    setSidebarOpen,
  ] = useState(false);


  const [
    showAddImprovement,
    setShowAddImprovement,
  ] = useState(false);

  const [
    showProfile,
    setShowProfile,
  ] = useState(false);

  const [
    myImprovementsCollapsed,
    setMyImprovementsCollapsed,
  ] = useState(false);


  const [
    improvements,
    setImprovements,
  ] = useState([]);


  const [
    summary,
    setSummary,
  ] = useState({

    total: 0,

    pending: 0,

    in_progress: 0,

    rejected: 0,

    done: 0,

  });


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState("");


  /* ========================================================
     IMPROVEMENT DETAIL
  ======================================================== */

  const [
    selectedImprovement,
    setSelectedImprovement,
  ] = useState(null);


  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);


  const [
    detailError,
    setDetailError,
  ] = useState("");

  const [draftToEdit, setDraftToEdit] = useState(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);



  /* ========================================================
     LOAD DASHBOARD
  ======================================================== */

  const loadDashboard =
    async () => {

      try {

        setLoading(true);

        setError("");


        const [

          improvementsData,

          summaryData,

        ] =

          await Promise.all([

            getMyImprovements(),

            getMyImprovementSummary(),

          ]);


        const improvementList =

          Array.isArray(
            improvementsData
          )

            ? improvementsData

            : improvementsData?.items ||
              [];


        setImprovements(
          improvementList
        );


        setSummary({

          total:
            summaryData?.total ||
            0,

          pending:
            summaryData?.pending ||
            0,

          in_progress:
            summaryData?.in_progress ||
            0,

          rejected:
            summaryData?.rejected ||
            0,

          done:
            summaryData?.done ||
            0,

        });

      }

      catch (err) {

        console.error(err);


        setError(

          err.message ||

          "Unable to load your dashboard."

        );

      }

      finally {

        setLoading(false);

      }

    };


  /* ========================================================
     INITIAL LOAD
  ======================================================== */

  useEffect(() => {

    const timerId = setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => {
      clearTimeout(timerId);
    };

  }, []);


  function scrollToMyImprovements() {
    document.getElementById("my-improvements-list")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }


  /* ========================================================
     CREATED
  ======================================================== */

  const handleImprovementCreated =
    async () => {

      setShowAddImprovement(
        false
      );

      setListRefreshKey((value) => value + 1);


      await loadDashboard();

    };


  /* ========================================================
     VIEW IMPROVEMENT
  ======================================================== */

  const handleViewImprovement =
    async (
      improvementId
    ) => {

      if (!improvementId) {

        return;

      }


      try {

        setDetailLoading(
          true
        );

        setDetailError("");

        setSelectedImprovement(
          null
        );


        const data =
          await getImprovement(
            improvementId
          );


        setSelectedImprovement(
          data
        );

      }

      catch (err) {

        console.error(err);


        setDetailError(

          err.message ||

          "Unable to load improvement details."

        );

      }

      finally {

        setDetailLoading(
          false
        );

      }

    };


  /* ========================================================
     CLOSE IMPROVEMENT DETAIL
  ======================================================== */

  const closeImprovementDetail =
    () => {

      setSelectedImprovement(
        null
      );

      setDetailError("");

    };


  /* ========================================================
     SAVE & RESUBMIT IMPROVEMENT
  ======================================================== */

  const handleSaveEdit =
    async (
      payload
    ) => {

      if (
        !selectedImprovement?.id
      ) {

        throw new Error(
          "Improvement ID is missing."
        );

      }


      try {

        const updated =
          await resubmitImprovement(
            selectedImprovement.id,
            payload
          );


        setSelectedImprovement(
          updated
        );


        await loadDashboard();

      }

      catch (error) {

        console.error(
          "Resubmission Error:",
          error
        );

        throw error;

      }

    };


  const handleSaveOwnerEdit = async (payload) => {
    if (!selectedImprovement?.id) throw new Error("Improvement ID is missing.");
    const updated = await updateOwnedImprovement(selectedImprovement.id, payload);
    setSelectedImprovement(updated);
    await loadDashboard();
  };


  /* ========================================================
     FIRST NAME
  ======================================================== */

  const firstName =

    user?.full_name
      ?.split(" ")
      ?. [0] ||

    user?.name
      ?.split(" ")
      ?. [0] ||

    "there";


  /* ========================================================
     PROFILE SCREEN
  ======================================================== */

  if (showProfile) {

    return (

      <Profile
        onBack={() => setShowProfile(false)}
      />

    );

  }


  /* ========================================================
     ADD IMPROVEMENT SCREEN
  ======================================================== */

  if (showAddImprovement) {

    return (

      <AddImprovement

        draft={draftToEdit}

        onBack={() => {
          setDraftToEdit(null);
          setShowAddImprovement(false);
        }}

        onCreated={async () => {
          setDraftToEdit(null);
          await handleImprovementCreated();
          setListRefreshKey((value) => value + 1);
        }}

      />

    );

  }


  /* ========================================================
     UI
  ======================================================== */

  return (

    <div className="employee-app-shell">
      


      {sidebarOpen && (

        <div

          className="mobile-sidebar-overlay"

          onClick={() =>
            setSidebarOpen(false)
          }

        />

      )}


      {/* ==================================================
          SIDEBAR
      ================================================== */}

      <aside

        className={

          `employee-sidebar ${
            sidebarOpen
              ? "employee-sidebar-open"
              : ""
          }`

        }

      >

        <div className="employee-brand dashboard-logo-wrap">
          <div className="logo-panel nrb-logo-panel">
              <img src={logo} alt="NRB Industrial Bearings" className="dashboard-logo" />
          </div>
        </div>


        <button

          className="sidebar-close-mobile"

          onClick={() =>
            setSidebarOpen(false)
          }

        >

          <X size={20} />

        </button>


        <nav className="employee-sidebar-nav">

          <button
            className="employee-nav-item active"
          >

            <LayoutDashboard
              size={18}
            />

            <span>
              Dashboard
            </span>

          </button>


          <button
            className="employee-nav-item"
            type="button"
            onClick={scrollToMyImprovements}
          >

            <ClipboardList
              size={18}
            />

            <span>
              My Improvements
            </span>

          </button>


          <button

            className="employee-nav-item"

            onClick={() =>
              setShowAddImprovement(
                true
              )
            }

          >

            <Plus size={19} />

            <span>
              Add Improvement
            </span>

          </button>


          <button
            className="employee-nav-item"
            type="button"
            onClick={() => setShowProfile(true)}
          >

            <UserCircle
              size={18}
            />

            <span>
              My Profile
            </span>

          </button>

        </nav>


        <div className="employee-sidebar-bottom">

          <button
              className="employee-nav-item workspace-item"
              onClick={() => goToPortal("/")}
              type="button"
          >
              <LayoutGrid size={18} />
              <span>Workspace</span>
          </button>

          <button
              className="employee-nav-item logout-item"

            onClick={logout}

          >

            <LogOut size={18} />

            <span>
              Logout
            </span>

          </button>

        </div>

      </aside>


      {/* ==================================================
          MAIN
      ================================================== */}

      <main className="employee-main">


        <header className="employee-header">

          <button

            className="mobile-menu-button"

            onClick={() =>
              setSidebarOpen(true)
            }

          >

            <Menu size={22} />

          </button>


          <div className="employee-header-spacer" />


          <button
            type="button"
            className="dashboard-profile-trigger"
            onClick={() => setShowProfile(true)}
            aria-label="Open my profile"
          >

          <div className="employee-user-area">

            <div className="employee-avatar">

              {firstName
                ?.charAt(0)
                ?.toUpperCase()}

            </div>


            <div className="employee-user-info">

              <strong>

                {user?.full_name ||
                  user?.name ||
                  "Employee"}

              </strong>

              <span>
                Employee
              </span>

            </div>

          </div>

          </button>

        </header>


        {/* ==================================================
            CONTENT
        ================================================== */}

        <section className="employee-content">


          <div className="employee-page-heading">

            <div>

              <div className="dashboard-heading-eyebrow">

                <span className="heading-dot" />

                OIPM DASHBOARD

              </div>


              <h1>
                {firstName}
              </h1>


             
            </div>


            <button

              className="primary-action-button"

              onClick={() =>
                setShowAddImprovement(
                  true
                )
              }

            >

              <Plus size={18} />

              Add Improvement

            </button>

          </div>


          {/* ERROR */}

          {error && (

            <div className="dashboard-error">

              <div className="dashboard-error-content">

                <CircleAlert
                  size={17}
                />

                <span>
                  {error}
                </span>

              </div>

            </div>

          )}


          {/* ==================================================
              SUMMARY
          ================================================== */}

          <div className="employee-summary-grid">


            <SummaryCard

              icon={
                <ClipboardList
                  size={21}
                />
              }

              value={
                summary.total
              }

              title="Total Improvements"

              description="All your improvements"

              type="total"

            />


            <SummaryCard

              icon={
                <Clock3
                  size={21}
                />
              }

              value={
                summary.pending
              }

              title="Pending Approval"

              description="Waiting for approval"

              type="pending"

            />


            <SummaryCard

              icon={
                <Clock3
                  size={21}
                />
              }

              value={
                summary.in_progress
              }

              title="In Progress"

              description="Approved improvements"

              type="progress"

            />


            <SummaryCard

              icon={
                <FileX2
                  size={21}
                />
              }

              value={
                summary.rejected
              }

              title="Rejected"

              description="Needs attention"

              type="rejected"

            />


            <SummaryCard

              icon={
                <CheckCircle2
                  size={21}
                />
              }

              value={
                summary.done
              }

              title="Done"

              description="Successfully completed"

              type="done"

            />

          </div>


          {/* ==================================================
              IMPROVEMENTS PANEL
          ================================================== */}

          <section className="employee-panel" id="my-improvements-list">


            <div className="employee-panel-header">

              <div>

                <h2>
                  My Improvements
                </h2>

              

              </div>


              <div className="dashboard-panel-header-actions">
                <div className="panel-header-count">

                  <ClipboardList
                    size={14}
                  />

                  <span>
                    {improvements.length}
                  </span>

                </div>

                <button
                  type="button"
                  className="dashboard-list-toggle"
                  onClick={() => setMyImprovementsCollapsed((value) => !value)}
                  aria-expanded={!myImprovementsCollapsed}
                  aria-label={myImprovementsCollapsed ? "Expand My Improvements" : "Collapse My Improvements"}
                >
                  {myImprovementsCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                  {myImprovementsCollapsed ? "Expand" : "Collapse"}
                </button>
              </div>

            </div>


            {myImprovementsCollapsed ? (

              <div className="dashboard-list-collapsed">
                 Click Expand to view it.
              </div>

            ) : (

            <div className="employee-table-wrapper">


              {loading ? (

                <div className="table-empty-state">

                  <div className="loading-spinner-small" />

                  <span>
                    Loading your improvements...
                  </span>

                </div>

              ) : improvements.length === 0 ? (

                <div className="empty-improvement-state">

                  <div className="empty-improvement-icon">

                    <ClipboardList
                      size={25}
                    />

                  </div>


                  <h3>
                    No improvements yet
                  </h3>


                  <p>
                    Start your first improvement
                    initiative and make an impact.
                  </p>


                  <button

                    className="secondary-action-button"

                    onClick={() =>
                      setShowAddImprovement(
                        true
                      )
                    }

                  >

                    <Plus size={17} />

                    Create Improvement

                  </button>

                </div>

              ) : (

                <table className="employee-improvements-table">

                  <thead>

                    <tr>

                      <th>
                        Improvement
                      </th>

                      <th>
                        Machine
                      </th>

                      <th>
                        Benefit
                      </th>

                      <th>
                        Current Stage
                      </th>

                      <th>
                        Status
                      </th>

                      <th>
                        Submitted
                      </th>

                      <th>
                        Action
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    {improvements
                      .slice(0, 8)
                      .map((item) => {

                        const status =
                          STATUS_CONFIG[
                            item.status
                          ] || {

                            label:
                              item.status ||
                              "Pending",

                            stage:
                              "Processing",

                            className:
                              "status-pending",

                            icon:
                              <Clock3
                                size={13}
                              />,

                          };


                        const stage =
                          getStage(item);


                        const isRejected =
                          item.status ===
                          "rejected";


                        const isResubmission =
                          isResubmissionStatus(
                            item.status
                          );


                        return (

                          <tr

                            key={item.id}

                            className={

                              isRejected

                                ? "improvement-row-rejected"

                                : isResubmission

                                ? "improvement-row-attention"

                                : ""

                            }

                          >

                            <td>

                              <div className="improvement-id-cell">

                                <div className="improvement-id-icon">

                                  <ClipboardList
                                    size={15}
                                  />

                                </div>


                                <div>

                                  <strong>

                                    {item.project_id ||

                                      `OIPM-${String(
                                        item.id
                                      )
                                        .slice(
                                          0,
                                          8
                                        )
                                        .toUpperCase()}`}

                                  </strong>


                                  <small>

                                    {formatDate(
                                      item.created_at
                                    )}

                                  </small>

                                </div>

                              </div>

                            </td>


                            <td>

                              <div className="project-idea-cell">

                                <span>

                                  {item.machine ||
                                    "-"}

                                </span>

                              </div>

                            </td>


                            <td>

                              <div className="project-idea-cell">

                                <span>

                                  {(() => {
                                    const firstBenefit = Array.isArray(item.benefit_type)
                                      ? item.benefit_type[0]
                                      : item.benefit_type || item.benefit;
                                    return BENEFIT_LABELS[firstBenefit] || firstBenefit || "-";
                                  })()}

                                </span>

                              </div>

                            </td>


                            <td>

                              <div className="stage-cell">

                                <span className="stage-line" />


                                <div>

                                  <strong>

                                    {formatStage(
                                      stage
                                    )}

                                  </strong>


                                  {isRejected && (

                                    <small className="stage-subtext rejected-stage-text">

                                      Rejected at this stage

                                    </small>

                                  )}


                                  {isResubmission && (

                                    <small className="stage-subtext resubmission-stage-text">

                                      Resubmission required

                                    </small>

                                  )}

                                </div>

                              </div>

                            </td>


                            <td>

                              <div className="status-cell">

                                <span

                                  className={

                                    `employee-status-badge ${status.className}`

                                  }

                                >

                                  {status.icon}

                                  {status.label}

                                </span>


                                {isRejected &&

                                  item.rejection_description && (

                                    <span className="status-description">

                                      {item.rejection_description}

                                    </span>

                                  )}


                                {isResubmission &&

                                  item.resubmission_description && (

                                    <span className="status-description">

                                      {item.resubmission_description}

                                    </span>

                                  )}

                              </div>

                            </td>


                            <td>

                              <span className="date-cell">

                                {formatDate(

                                  item.created_at ||

                                  item.submitted_at

                                )}

                              </span>

                            </td>


                            <td>

                              <button

                                className="view-improvement-button"

                                title="View improvement"

                                onClick={() =>
                                  handleViewImprovement(
                                    item.id
                                  )
                                }

                              >

                                <Eye
                                  size={16}
                                />

                              </button>

                            </td>

                          </tr>

                        );

                      })}

                  </tbody>

                </table>

              )}

            </div>

            )}

          </section>

          <Lists
            showAll={true}
            refreshKey={listRefreshKey}
            onOpenDraft={(draft) => {
              setDraftToEdit(draft);
              setShowAddImprovement(true);
            }}
          />

        </section>

      </main>


      {/*
      ====================================================
          IMPROVEMENT DETAIL
          LOADING + VIEW
      ==================================================== */}

      {(detailLoading ||
        detailError ||
        selectedImprovement) && (

        <div
          className="improvement-detail-overlay"
          onClick={closeImprovementDetail}
        >

          <div
            className="improvement-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >

            <div className="improvement-detail-header">

              <div>

                <span className="improvement-detail-eyebrow">
                  IMPROVEMENT RECORD
                </span>

                <h2>
                  {selectedImprovement?.project_id ||
                    "Improvement Details"}
                </h2>

              </div>

              <button
                type="button"
                className="improvement-detail-close"
                onClick={closeImprovementDetail}
                disabled={detailLoading}
                aria-label="Close improvement details"
              >
                <X size={20} />
              </button>

            </div>

            {detailLoading && (

              <div className="improvement-detail-loading">

                <div className="loading-spinner-small" />

                <span>
                  Loading improvement details...
                </span>

              </div>

            )}

            {detailError &&
              !detailLoading && (

                <div className="improvement-detail-error">

                  <CircleAlert size={18} />

                  <span>
                    {detailError}
                  </span>

                </div>

              )}

            {selectedImprovement &&
              !detailLoading && (

                <ViewImprovement
                  improvement={selectedImprovement}
                  onClose={closeImprovementDetail}
                  editableOnResubmission={true}
                  ownerEditEnabled={true}
                  onSaveEdit={handleSaveEdit}
                  onSaveOwnerEdit={handleSaveOwnerEdit}
                />

              )}

          </div>

        </div>

      )}

    </div>

  );

}


/* ============================================================
   SUMMARY CARD
============================================================ */

function SummaryCard({

  icon,

  value,

  title,

  description,

  type,

}) {

  return (

    <div

      className={

        `employee-summary-card summary-${type}`

      }

    >

      <div className="summary-icon">

        {icon}

      </div>


      <div className="summary-content">

        <strong>
          {value}
        </strong>


        <span>
          {title}
        </span>


        <small>
          {description}
        </small>

      </div>


      <div className="summary-card-arrow">
        →
      </div>

    </div>

  );

}


export default EmployeeDashboard;