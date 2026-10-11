import { api } from "./api";
import type { UserListItem, Notification, AuditEntry } from "../types";

export const userApi = {
  list: (status?: string) =>
    api.get<UserListItem[]>("/users", { params: status ? { status } : {} }).then((r) => r.data),

  availablePermissions: () => api.get<string[]>("/users/permissions").then((r) => r.data),

  approve: (id: string) => api.post<UserListItem>(`/users/${id}/approve`).then((r) => r.data),
  reject: (id: string) => api.post<UserListItem>(`/users/${id}/reject`).then((r) => r.data),

  setPermissions: (id: string, permissions: string[]) =>
    api.put<UserListItem>(`/users/${id}/permissions`, { permissions }).then((r) => r.data),

  setRole: (id: string, role: string) =>
    api.put<UserListItem>(`/users/${id}/role`, { role }).then((r) => r.data),

  setActive: (id: string, is_active: boolean) =>
    api.put<UserListItem>(`/users/${id}/active`, { is_active }).then((r) => r.data),

  remove: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),

    syncSupabase: () =>
    api
      .post<{
        found: number;
        created: number;
        already_present: number;
        unusable: number;
        new_users: string[];
      }>("/users/sync-supabase")
      .then((r) => r.data),
};

export const notificationApi = {
  list: (unreadOnly = false) =>
    api.get<Notification[]>("/notifications", { params: { unread_only: unreadOnly } }).then((r) => r.data),
  unreadCount: () => api.get<{ count: number }>("/notifications/unread-count").then((r) => r.data.count),
  markRead: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post("/notifications/read-all").then((r) => r.data),
  deleteAll: () => api.delete("/notifications").then((r) => r.data),
};

export const auditApi = {
  list: (params: { target_type?: string; actor_id?: string; limit?: number } = {}) =>
    api.get<AuditEntry[]>("/audit", { params }).then((r) => r.data),
  count: () =>
    api.get<{ total: number; without_sign_ins: number }>("/audit/count").then((r) => r.data),
};