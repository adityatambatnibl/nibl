import { api } from "./api";
import type { NotificationConfig, EmailLog } from "../types";

export type UpdateConfigPayload = {
  owners: { stage_code: string; emails: string[]; label?: string | null }[];
  cc_emails: string[];
  handoff_enabled: boolean;
  overdue_enabled: boolean;
  overdue_hour: number;
  overdue_minute: number;
} & Partial<Record<EmailSwitch, boolean>>;

/** The on/off switches beyond the two Tracking ones. */
export type EmailSwitch =
  | "apqp_handoff_enabled"
  | "apqp_overdue_enabled"
  | "signup_alert_enabled"
  | "password_reset_alert_enabled"
  | "password_email_enabled"
  | "approval_email_enabled"
  | "summary_enabled";

export type PreviewKind =
  | "stage_overdue" | "stage_test" | "apqp_overdue" | "apqp_test"
  | "tracking_digest" | "apqp_digest" | "summary";

export interface PreviewMail {
  subject: string;
  to: string[];
  cc: string[];
  html: string;
}

export interface SendResult {
  sent: boolean;
  recipients?: string[];
  stages?: number;
  reason?: string | null;
}

export const notificationConfigApi = {
  get: () => api.get<NotificationConfig>("/notification-config").then((r) => r.data),

  update: (payload: UpdateConfigPayload) =>
    api.put<NotificationConfig>("/notification-config", payload).then((r) => r.data),

  logs: () => api.get<EmailLog[]>("/notification-config/logs").then((r) => r.data),

  sendNow: (stageCode: string) =>
    api.post<SendResult>(`/notification-config/send/${stageCode}`).then((r) => r.data),

  sendTest: (stageCode: string) =>
    api.post<SendResult>(`/notification-config/test/${stageCode}`).then((r) => r.data),

  nextRun: () =>
    api.get<{ next_run: string | null }>("/notification-config/next-run").then((r) => r.data.next_run),

  

  updateApqpOwners: (
    owners: { responsibility: string; label?: string | null; emails: string[] }[],
  ) =>
    api
      .put<{ message: string }>("/notification-config/apqp-owners", owners)
      .then((r) => r.data),


  apqpSend: (responsibility: string) =>
    api
      .post<{
        sent: boolean;
        overdue?: number;
        recipients?: string[];
        worst_days?: number;
        reason?: string | null;
      }>(`/notification-config/apqp-send/${encodeURIComponent(responsibility)}`)
      .then((r) => r.data),

  apqpTest: (responsibility: string) =>
    api
      .post<{ sent: boolean; recipients?: string[]; reason?: string | null }>(
        `/notification-config/apqp-test/${encodeURIComponent(responsibility)}`,
      )
      .then((r) => r.data),

  preview: (kind: PreviewKind, key?: string) =>
    api
      .post<{ mails: PreviewMail[]; note: string | null }>("/notification-config/preview", { kind, key })
      .then((r) => r.data),

  sendSummary: () =>
    api
      .post<{ sent: boolean; reason?: string; recipients?: number }>("/notification-config/send-summary")
      .then((r) => r.data),

  runOverdueCheck: () =>
    api
      .post<{
        recipients: number;
        stages: number;
        total_overdue?: number;
        breakdown?: Record<string, number>;
        skipped?: string;
        emails_sent?: number;
        emails_failed?: number;
        error?: string | null;
      }>("/notification-config/run-overdue-check")
      .then((r) => r.data),

  runApqpOverdueCheck: () =>
    api
      .post<{
        sent: number;
        failed?: number;
        error?: string | null;
        departments_without_address?: number;
        departments?: number;
        total_overdue?: number;
        breakdown?: Record<
          string,
          { overdue: number; sent: boolean; worst_days?: number; reason?: string | null }
        >;
        reason?: string;
      }>("/notification-config/run-apqp-overdue-check")
      .then((r) => r.data),
};