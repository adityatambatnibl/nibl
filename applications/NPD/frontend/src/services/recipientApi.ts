// Who gets the emails of one project (Tracking stages + APQP departments).
import { api } from "./api";
import { seg } from "../utils/links";

export type EmailMap = Record<string, string[]>;
export interface Recipients { stage_owners: EmailMap; dept_owners: EmailMap }
export interface RecipientOptions {
  stages: { code: string; name: string }[];
  departments: string[];
  users: { name: string; email: string }[];
  defaults: Recipients;
  defaults_from: string;
}
export interface ProjectRecipients extends Recipients { project_id: string; order_no: string | null; own_list: boolean }

export interface RecipientPreview {
  example: string | null;
  is_example?: boolean;
  mails: { title: string; subject: string; to: string[]; cc: string[]; html: string }[];
  notes: string[];
}

export const recipientApi = {
  options: () => api.get<RecipientOptions>("/recipients/options").then((r) => r.data),
  get: (key: string) => api.get<ProjectRecipients>(`/recipients/project/${seg(key)}`).then((r) => r.data),
  preview: (body: { project: string | null; kind: "stage" | "dept"; code: string; emails: string[] }) =>
    api.post<RecipientPreview>("/recipients/preview", body).then((r) => r.data),
  save: (key: string, body: Recipients) =>
    api.put<ProjectRecipients>(`/recipients/project/${seg(key)}`, body).then((r) => r.data),
};
