// Drawing Control - API client. Same axios instance (and NPD session) as the rest of NPD.
import { api } from "./apiClient";

export type DStatus = "under_review" | "approved" | "denied" | "locked" | "deleted";

export interface Me {
  id?: string; name?: string; email?: string; status: string; can_view: boolean; is_admin: boolean;
  employee_code?: string | null; department?: string | null; member_since?: string | null;
  on_email_list?: boolean; waiting?: number; confirmed?: number; denied?: number;
}
export interface MailPreview {
  subject: string; html: string; shown_for: string; rev_label: string;
  recipients: { name: string; email: string; department: string | null }[];
}
export interface Folder { id: string; parent_id: string | null; name: string; direct_count: number }
export interface DrawingRow {
  id: string; drawing_no: string; item_code: string; description: string;
  folder_id: string; folder_path: string; rev_label: string; revision_count: number;
  status: DStatus; updated_at: string | null; awaiting_me: boolean;
}
export interface Page<T> { items: T[]; total: number; page: number; size: number }
export interface Counts { total: number; under_review: number; denied: number; approved: number; pending: number; mine: number; deleted?: number }
export interface Review {
  user_id: string; user_name: string; user_email: string;
  decision: "pending" | "confirmed" | "denied" | "cancelled";
  reason: string | null; decided_at: string | null; notified_at: string | null; reminders_sent: number;
}
export interface Revision {
  id: string; seq: number; rev_label: string; change_note: string; original_filename: string; size_bytes: number;
  status: DStatus; review_status: DStatus; locked: boolean; uploaded_by_name: string; uploaded_at: string;
  decided_at: string | null; locked_at: string | null; locked_by_name: string | null;
  reviews?: Review[]; confirmed?: number; reviewer_total?: number;
}
export interface Detail {
  drawing: DrawingRow; folder_names: string[]; revisions: Revision[]; hidden_locked: number;
  shown: Revision | null; my_review: Review | null; can_decide: boolean; is_admin: boolean;
  deleted: { by: string; at: string | null; reason: string } | null;
}
export interface DcUser {
  id: string; name: string; email: string; employee_code: string | null; department: string | null;
  role: "admin" | "user"; status: "pending" | "approved" | "rejected"; is_active: boolean;
  can_view: boolean; is_dc_admin: boolean; on_email_list: boolean; created_at: string | null;
}
export interface RecordRow extends Revision { drawing_id: string; drawing_no: string; item_code: string; description: string; folder_path: string }
export interface AccessRow { id: string; drawing_id: string; drawing_no: string; rev_label: string; user_name: string; action: string; ip: string | null; at: string }
export interface AuditRow {
  id: string; action: string; actor_name: string; target_type: string | null; target_id: string | null;
  target_label: string | null; note: string | null; created_at: string;
}
export interface Notice { id: string; title: string; message: string; link: string; is_read: boolean; created_at: string }
export interface ImportFile { file: string; drawing_no: string; folder: string; status: "ready" | "exists" | "invalid"; reason: string; item_code: string; description: string; rev: string }
export interface ImportPreview { folder: string; total: number; ready: number; exists: number; invalid: number; with_details: number; index_notes: string[]; files: ImportFile[] }
export interface ImportResult { imported: { file: string; drawing_no: string; folder: string; rev: string }[]; failed: { file: string; reason: string }[]; remaining: number; skipped_existing: number; skipped_invalid: number }
export interface MyReview extends DrawingRow { revision_id: string; sent_at: string; reminders_sent: number; change_note: string }

const B = "/drawings";
const d = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export const dc = {
  me: () => d<Me>(api.get(`${B}/me`)),
  counts: () => d<Counts>(api.get(`${B}/counts`)),
  search: (params: Record<string, unknown>) => d<Page<DrawingRow>>(api.get(B, { params })),
  myReviews: () => d<MyReview[]>(api.get(`${B}/reviews/mine`)),
  detail: (id: string, revisionId?: string) =>
    d<Detail>(api.get(`${B}/${id}`, { params: revisionId ? { revision_id: revisionId } : {} })),
  folders: () => d<Folder[]>(api.get(`${B}/folders`)),
  createFolder: (name: string, parent_id: string | null) => d(api.post(`${B}/folders`, { name, parent_id })),
  renameFolder: (id: string, name: string) => d(api.put(`${B}/folders/${id}`, { name })),
  deleteFolder: (id: string) => d(api.delete(`${B}/folders/${id}`)),
  upload: (form: FormData) => d<{ id: string }>(api.post(B, form)),
  mailPreview: (body: { file_name: string; drawing_id?: string; reviewer_ids: string[] }) =>
    d<MailPreview>(api.post(`${B}/mail-preview`, body)),
  revise: (id: string, form: FormData) => d<{ id: string }>(api.post(`${B}/${id}/revise`, form)),
  updateDetails: (id: string, body: { item_code: string; description: string; folder_id: string }) =>
    d(api.put(`${B}/${id}`, body)),
  remove: (id: string, reason: string) => d(api.post(`${B}/${id}/delete`, { reason })),
  restore: (id: string) => d<{ id: string; status: string }>(api.post(`${B}/${id}/restore`)),
  decide: (revisionId: string, decision: "confirm" | "deny", reason?: string) =>
    d<{ outcome: string; changed_mind?: boolean }>(api.post(`${B}/revisions/${revisionId}/decision`, { decision, reason })),
  remind: (revisionId: string) => d<{ reminded: number }>(api.post(`${B}/revisions/${revisionId}/remind`)),
  file: (revisionId: string, download = false) =>
    api.get(`${B}/revisions/${revisionId}/file`, { params: download ? { download: 1 } : {}, responseType: "blob" }),
  users: () => d<DcUser[]>(api.get(`${B}/users`)),
  emailList: () => d<DcUser[]>(api.get(`${B}/email-list`)),
  setStatus: (id: string, status: "approved" | "rejected" | "pending") => d<DcUser>(api.put(`${B}/users/${id}/status`, { status })),
  setRole: (id: string, role: "admin" | "user") => d<DcUser>(api.put(`${B}/users/${id}/role`, { role })),
  setOnList: (id: string, on: boolean) => d<DcUser>(api.put(`${B}/users/${id}/email-list`, { on })),
  records: (params: Record<string, unknown>) => d<Page<RecordRow>>(api.get(`${B}/records`, { params })),
  locked: (params: Record<string, unknown>) => d<Page<RecordRow>>(api.get(`${B}/locked`, { params })),
  downloads: (params: Record<string, unknown>) => d<Page<AccessRow>>(api.get(`${B}/downloads`, { params })),
  importPreview: () => d<ImportPreview>(api.get(`${B}/import`)),
  importRun: (limit = 100) => d<ImportResult>(api.post(`${B}/import`, null, { params: { limit }, timeout: 600_000 })),
  notifications: () => d<Notice[]>(api.get(`${B}/notifications`)),
  unreadCount: () => d<{ count: number }>(api.get(`${B}/notifications/unread-count`)).then((r) => r.count),
  markRead: (id: string) => d(api.post(`${B}/notifications/${id}/read`)),
  markAllRead: () => d(api.post(`${B}/notifications/read-all`)),
  deleteNotifications: () => d(api.delete(`${B}/notifications`)),
  audit: (params: Record<string, unknown>) => d<Page<AuditRow>>(api.get(`${B}/audit`, { params })),
};
