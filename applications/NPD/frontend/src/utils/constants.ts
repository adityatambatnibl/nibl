// Same order as the backend list, so the account page and the admin
// dialog read identically.
export const PERMISSION_LABELS: Record<string, string> = {
  dashboard_view: "View dashboard",
  apqp_view: "View APQP timeline",
  apqp_edit: "Edit APQP timeline",
  attachment_upload: "Upload & delete attachments",
  tracking_view: "View tracking",
  tracking_edit: "Edit tracking",
  analytics_view: "View analytics",
  excel_export: "Export Excel",
  timeline_create: "Create new timeline",
};

export const AUDIT_LABELS: Record<string, string> = {
  signed_in: "Signed in",
  user_signed_up: "Signed up",
  user_approved: "Approved user",
  user_rejected: "Rejected user",
  user_role_changed: "Changed role",
  user_permissions_changed: "Changed permissions",
  user_activated: "Activated user",
  user_deactivated: "Deactivated user",
  user_deleted: "Deleted user",
  password_reset_requested: "Asked for password reset",
  password_reset_completed: "Reset own password",
  password_changed: "Changed password",
  password_reset_by_admin: "Reset a user's password",
  project_created: "Created project",
  order_created: "Created tracking",
  order_updated: "Edited tracking details",
  order_deleted: "Deleted tracking",
  stages_updated: "Updated tracking stages",
  apqp_created: "Created APQP timeline",
  apqp_updated: "Edited APQP details",
  apqp_deleted: "Deleted APQP timeline",
  activities_updated: "Updated APQP activities",
  signoff_updated: "Saved APQP sign-off",
  plan_rebuilt: "Rebuilt APQP plan dates",
  file_uploaded: "Uploaded file",
  file_deleted: "Deleted file",
  excel_exported: "Exported Excel",
  stage_offsets_changed: "Changed bearing plan",
  bearing_type_added: "Added bearing type",
  bearing_type_removed: "Removed bearing type",
  stage_owners_changed: "Changed email settings",
};

/** Colour group per action, for the small dot on the Audit History page. */
export const AUDIT_TONE: Record<string, string> = {
  signed_in: "bg-slate-300",
  project_created: "bg-green-500", order_created: "bg-green-500", apqp_created: "bg-green-500",
  stages_updated: "bg-blue-500", activities_updated: "bg-blue-500", signoff_updated: "bg-blue-500",
  order_updated: "bg-blue-500", apqp_updated: "bg-blue-500", plan_rebuilt: "bg-blue-500",
  file_uploaded: "bg-amber-500", file_deleted: "bg-amber-500", excel_exported: "bg-amber-500",
  order_deleted: "bg-red-500", apqp_deleted: "bg-red-500", user_deleted: "bg-red-500",
};

export const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  overdue: "Overdue",
  delayed: "Delayed",
  completed: "Completed",
  completed_late: "Completed late",
};

export const STATUS_STYLES: Record<string, string> = {
  not_started:    "bg-page text-ink-500 border-line",
  in_progress:    "bg-info-bg text-info border-info/25",
  overdue:        "bg-danger-bg text-danger border-danger/25",
  delayed:        "bg-danger-bg text-danger border-danger/25",
  completed:      "bg-ok-bg text-ok border-ok/25",
  completed_late: "bg-alert-bg text-alert border-alert/25",
};