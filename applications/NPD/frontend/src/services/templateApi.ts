import { api } from "./api";
import type { BearingPlan, BearingPlanRowIn, StageOffset, Lookups, PreviewResponse } from "../types";

export const templateApi = {
  getStages: () => api.get<StageOffset[]>("/templates/stages").then((r) => r.data),

  updateStages: (stages: StageOffset[]) =>
    api.put<StageOffset[]>("/templates/stages", { stages }).then((r) => r.data),

  getLookups: () => api.get<Lookups>("/templates/lookups").then((r) => r.data),

  getBearingPlan: (bearingType: string | null) =>
    api
      .get<BearingPlan>("/templates/bearing-plan", { params: bearingType ? { bearing_type: bearingType } : {} })
      .then((r) => r.data),

  saveBearingPlan: (bearingType: string | null, stages: BearingPlanRowIn[]) =>
    api.put<BearingPlan>("/templates/bearing-plan", { bearing_type: bearingType, stages }).then((r) => r.data),

  addBearingType: (name: string, copyFrom: string | null) =>
    api.post<Lookups>("/templates/bearing-types", { name, copy_from: copyFrom }).then((r) => r.data),

  removeBearingType: (name: string) =>
    api.post<Lookups>("/templates/bearing-types/remove", { name }).then((r) => r.data),

  preview: (payload: { a0_date?: string | null; a_date?: string | null; order_date?: string | null; conditions: string[] }) =>
    api.post<PreviewResponse>("/templates/preview-schedule", payload).then((r) => r.data),
};