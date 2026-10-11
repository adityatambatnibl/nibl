import { api } from "./api";
import type { DashboardSummary } from "../types";

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/dashboard/summary").then((r) => r.data),
};