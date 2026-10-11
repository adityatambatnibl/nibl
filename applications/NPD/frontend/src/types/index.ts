export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  permissions: string[];
  must_change_password?: boolean;
}

export interface UserListItem extends User {
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  can_delete: boolean;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  ref_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor_id: string;
  actor_name: string;
  target_type: string | null;
  target_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}

export interface StageOffset {
  code: string;
  name: string;
  sequence: number;
  depends_on: string | null;
  offset_days: number;
  variants: Record<string, number>;
  depends_on_variants: Record<string, string>;
  anchor_field: string | null;
  note: string | null;
  actual_avg_offset: number | null;
  variance: number | null;
  sample_size: number;
  unconfirmed: boolean;
}

export interface BearingPlanRow {
  code: string;
  name: string;
  sequence: number;
  starts_after: string | null;
  days: number;
  needed: boolean;
  is_custom: boolean;
  fixed: string | null; // "A", "A0" or "order_date"
  plan_day: number | null;
}

export interface BearingPlan {
  bearing_type: string | null;
  bearing_types: string[];
  lead_time_days: number | null;
  stages: BearingPlanRow[];
}

export interface BearingPlanRowIn {
  code: string;
  starts_after: string | null;
  days: number;
  needed: boolean;
}

export interface Lookups {
  bearing_types: string[];
  rpd_statuses: string[];
  delay_reasons: string[];
  responsibilities: string[];
  check_point_options: string[];
}

export interface PreviewStage {
  code: string;
  name: string;
  sequence: number;
  depends_on: string | null;
  offset_days: number;
  plan_date: string;
  days_from_a: number;
}

export interface PreviewResponse {
  a0_date: string | null;
  a_date: string;
  total_days: number | null;
  stages: PreviewStage[];
}

export interface OrderListItem {
  order_no: string;
  customer_name: string;
  product_name: string | null;
  order_date: string | null;
  planned_delivery_sample: string | null;
  planned_delivery_batch: string | null;
  rpd_status: string;
  item_count: number;
  status: string;
  progress_percent: number;
  overdue_count: number;
}

export interface OrderItem {
  id: string;
  item_description: string;
  bearing_type: string;
  po_qty: string | null;
  value: number | null;
  schedule_group: string;
  anchor_a0: string | null;
  anchor_a: string;
}

export interface OrderStage {
  id: string;
  schedule_group: string;
  stage_code: string;
  stage_name: string;
  sequence: number;
  plan_date: string | null;
  actual_date: string | null;
  remark: string | null;
  delay_reason: string | null;
  status: string;
  delay_days: number | null;
}

export interface OrderDetail {
  order_no: string;
  order_date: string | null;
  customer_name: string;
  product_name: string | null;
  planned_delivery_sample: string | null;
  planned_delivery_batch: string | null;
  rpd_status: string;
  notes: string | null;
  apqp_project_id: string | null;
  created_at: string;
  items: OrderItem[];
  stages: OrderStage[];
  status: string;
  progress: { completed: number; total: number; percent: number };
  stage_counts: Record<string, number>;
  overdue_count: number;
}

export interface DashboardSummary {
  orders: {
    total: number;
    not_started: number;
    in_progress: number;
    delayed: number;
    completed: number;
    total_items: number;
    total_activities: number;
    overdue_activities: number;
    active_stages?: number;
    active_stages_done?: number;
  };
  stage_counts: Record<string, number>;
  attention: {
    order_no: string;
    customer_name: string;
    stage_code: string;
    stage_name: string;
    plan_date: string;
    days_overdue: number;
  }[];
  recent: {
    product_name?: string | null;
    order_no: string;
    customer_name: string;
    order_date: string | null;
    status: string;
    progress_percent: number;
  }[];
  upcoming_deliveries: {
    product_name?: string | null;
    order_no: string;
    customer_name: string;
    order_date: string | null;
    delivery_date: string | null;
    status: string;
    progress_percent: number;
  }[];
    apqp: {
    total: number;
    not_started: number;
    in_progress: number;
    delayed: number;
    completed: number;
    total_activities: number;
    overdue_activities: number;
    active_activities?: number;
    active_activities_done?: number;
  };
  apqp_attention: {
    project_id: string;
    customer: string;
    no_label: string;
    activity_name: string;
    responsibility: string | null;
    plan_date: string;
    days_overdue: number;
  }[];
  apqp_recent: {
    product_name?: string | null;
    project_id: string;
    customer: string;
    customer_part_no: string | null;
    current_phase: string | null;
    percent: number;
    status: string;
  }[];
    combined_attention: {
    kind: "order" | "apqp";
    record_id: string;
    display_name?: string | null;
    customer: string;
    code: string;
    name: string;
    owner: string | null;
    plan_date: string;
    days_overdue: number;
  }[];
  /** Totals over ALL overdue items; combined_attention holds only the worst rows. */
  combined_attention_stats?: {
    total: number;
    orders: number;
    apqp: number;
    max_days: number;
    buckets: number[];
    top_owner: string | null;
    top_owner_count: number;
    late_by: Record<string, { days: number; count: number; what: string }>;
  };
  stage_groups: { label: string; count: number }[];
  week_load: {
    label: string; starts: string; count: number;
    items?: { order_no: string; product_name: string | null; customer_name: string; stage_name: string; plan_date: string }[];
  }[];
  due_next_7_days: number;
}

export interface TimelineBar {
  stage_code: string;
  stage_name: string;
  sequence: number;
  schedule_group: string;
  plan_date: string | null;
  actual_date: string | null;
  status: string;
  delay_days: number | null;
}

export interface TimelineResponse {
  order_no: string;
  customer_name: string;
  today: string;
  range_start: string | null;
  range_end: string | null;
  groups: string[];
  bars: TimelineBar[];
}

export interface ApqpListItem {
  project_id: string;
  order_no: string | null;
  customer: string;
  product_name: string | null;
  customer_part_no: string | null;
  current_phase: string | null;
  total_activities: number;
  completed: number;
  overdue: number;
  percent: number;
  status: string;
}

export interface ApqpActivity {
  id: string;
  activity_id: string;
  phase_code: string;
  no_label: string;
  activity_name: string;
  sequence: number;
  check_point: string | null;
  responsibility: string | null;
  is_heading: boolean;
  plan_start: string | null;
  plan_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  week_flags: Record<string, boolean>;
  actual_week_flags: Record<string, boolean>;
  remark: string | null;
  status: string;
  delay_days: number | null;
}

export interface ApqpPhaseSummary {
  phase_code: string;
  phase_name: string;
  sequence: number;
  plan_start: string | null;
  plan_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  total: number;
  completed: number;
  overdue: number;
  percent: number;
  status: string;
}

export interface ApqpSignOff {
  team: Record<string, string>;
  prepared_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
}

export interface ApqpDetail {
  project_id: string;
  order_no: string | null;
  customer: string;
  product_name: string | null;
  customer_part_no: string | null;
  program_name: string | null;
  application: string | null;
  supply_condition: string | null;
  enquiry_date: string | null;
  order_date: string | null;
  original_date: string | null;
  ppap_date: string | null;
  sample_submission_date: string | null;
  months: string[];
  week_columns: string[];
  created_at: string;
  phases: ApqpPhaseSummary[];
  activities: ApqpActivity[];
  sign_off: ApqpSignOff;
  percent: number;
  overdue_count: number;
  status: string;
}


export interface Attachment {
  id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  entity_type: string;
  entity_id: string;
  description: string | null;
  uploaded_by_name: string;
  uploaded_at: string;
  is_excel: boolean;
}

export interface StageOwner {
  stage_code: string;
  stage_name: string;
  sequence: number;
  emails: string[];
  label: string | null;
}

export interface NotificationConfig {
  owners: StageOwner[];
  cc_emails: string[];
  handoff_enabled: boolean;
  overdue_enabled: boolean;
  email_sending_live: boolean;
  overdue_hour: number;
  overdue_minute: number;
  apqp_owners?: { responsibility: string; label: string | null; emails: string[] }[];
  apqp_handoff_enabled?: boolean;
  apqp_overdue_enabled?: boolean;
  signup_alert_enabled?: boolean;
  password_reset_alert_enabled?: boolean;
  password_email_enabled?: boolean;
  approval_email_enabled?: boolean;
  summary_enabled?: boolean;
}

export interface EmailLog {
  id: string;
  email_type: string;
  to_emails: string[];
  subject: string;
  order_no: string | null;
  stage_code: string | null;
  status: string;
  error: string | null;
  sent_at: string;
}

export interface StageBottleneck {
  stage_code: string;
  stage_name: string;
  sequence: number;
  total_records: number;
  completed: number;
  on_time: number;
  late: number;
  still_overdue: number;
  avg_delay_days: number | null;
  max_delay_days: number | null;
  late_rate: number;
}

export interface DelayReasonCount {
  reason: string;
  count: number;
  avg_delay_days: number | null;
}

export interface OnTimeSummary {
  dispatch_stage: string;
  total_with_actual: number;
  on_time: number;
  late: number;
  on_time_rate: number;
  avg_delay_days: number | null;
}

export interface MonthlyTrend {
  month: string;
  completed: number;
  on_time: number;
  on_time_rate: number;
}

export interface LeadTimeComparison {
  stage_code: string;
  stage_name: string;
  template_offset: number;
  actual_avg_offset: number | null;
  variance: number | null;
  sample_size: number;
}

export interface DepartmentLoad {
  responsibility: string;
  total: number;
  completed: number;
  overdue: number;
  percent: number;
}

export interface AnalyticsResponse {
  filters_applied: {
    available_months?: string[];
    customer: string | null;
    bearing_type: string | null;
  };
  order_count: number;
  item_count: number;
  bottlenecks: StageBottleneck[];
  delay_reasons: DelayReasonCount[];
  on_time: OnTimeSummary | null;
  trend: MonthlyTrend[];
  lead_times: LeadTimeComparison[];
  apqp_departments: DepartmentLoad[];
  available_customers: string[];
  matched_orders?: string[];
  available_months?: string[];

  // Business tab
  intake?: { month: string; received: number; completed: number }[];
  cycles?: { month: string; avg_days: number; orders: number }[];
  order_book?: {
    total: number;
    delivered: number;
    in_progress: number;
    not_started: number;
    order_count: number;
  } | null;
  customers?: { customer: string; value: number; orders: number; percent: number }[];
  currency?: string;

  // APQP tab
  apqp_phases?: {
    phase_code: string;
    phase_name: string;
    total: number;
    completed: number;
    overdue: number;
    percent: number;
    avg_delay_days: number | null;
  }[];
  apqp_projects?: {
    project_id: string;
    customer: string;
    product_name: string | null;
    total: number;
    completed: number;
    overdue: number;
    percent: number;
    current_phase: string | null;
  }[];
  apqp_project_count?: number;
  apqp_activity_count?: number;
}

