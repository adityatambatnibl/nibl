import { api } from "./api";
import type { AnalyticsResponse } from "../types";

export interface AnalyticsParams {
  month?: string;
  customer?: string;
  bearing_type?: string;
  months?: number;
}

export const analyticsApi = {
  get: (params: AnalyticsParams = {}) => {
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
    );
    return api.get<AnalyticsResponse>("/analytics", { params: clean }).then((r) => r.data);
  },
};