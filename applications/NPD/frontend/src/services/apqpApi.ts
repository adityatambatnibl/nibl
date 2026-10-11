
import { api } from "./api";
import { seg } from "../utils/links";
import type { ApqpListItem, ApqpDetail, ApqpActivity, ApqpSignOff, TimelineResponse } from "../types";

export interface CreateApqpPayload {
  project_id: string;
  order_no?: string | null;
  customer: string;
  product_name?: string | null;
  customer_part_no?: string | null;
  program_name?: string | null;
  application?: string | null;
  supply_condition?: string | null;
  original_date?: string | null;
  ppap_date?: string | null;
  sample_submission_date?: string | null;
  start_month: string;
}

/** Header fields only. project_id and start_month cannot be changed. */
export interface UpdateApqpPayload {
  order_no?: string | null;
  customer?: string;
  product_name?: string | null;
  customer_part_no?: string | null;
  program_name?: string | null;
  application?: string | null;
  supply_condition?: string | null;
  enquiry_date?: string | null;
  order_date?: string | null;
  original_date?: string | null;
  ppap_date?: string | null;
  sample_submission_date?: string | null;
  start_month?: string;
}

export interface ActivityUpdate {
  id: string;
  check_point?: string | null;
  responsibility?: string | null;
  plan_start?: string | null;
  plan_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  week_flags?: Record<string, boolean>;
  remark?: string | null;
}

export const apqpApi = {
  list: (params: { search?: string } = {}) =>
    api.get<ApqpListItem[]>("/apqp", { params }).then((r) => r.data),

  get: (projectId: string) => api.get<ApqpDetail>(`/apqp/${seg(projectId)}`).then((r) => r.data),

  create: (payload: CreateApqpPayload) =>
    api.post<ApqpDetail>("/apqp", payload).then((r) => r.data),

  update: (projectId: string, payload: UpdateApqpPayload) =>
    api.put<ApqpDetail>(`/apqp/${seg(projectId)}`, payload).then((r) => r.data),

  updateActivities: (projectId: string, updates: ActivityUpdate[]) =>
    api.put<ApqpActivity[]>(`/apqp/${seg(projectId)}/activities`, { updates }).then((r) => r.data),

  updateSignOff: (projectId: string, payload: ApqpSignOff) =>
    api.put<ApqpSignOff>(`/apqp/${seg(projectId)}/signoff`, payload).then((r) => r.data),

  remove: (projectId: string) =>
    api
      .delete<{ activities: number; attachments: number }>(`/apqp/${seg(projectId)}`)
      .then((r) => r.data),

  timeline: (projectId: string) =>
    api.get<TimelineResponse>(`/apqp/${seg(projectId)}/timeline`).then((r) => r.data),
};