import { api } from "./api";
import { seg } from "../utils/links";
import type { OrderListItem, OrderDetail, OrderStage, TimelineResponse } from "../types";

export interface ItemIn {
  item_description: string;
  bearing_type: string;
  po_qty?: string | null;
  value?: number | null;
}

export interface GroupIn {
  label?: string | null;
  anchor_a0?: string | null;
  anchor_a?: string | null;
  items: ItemIn[];
}

export interface CreateOrderPayload {
  product_name: string;
  order_no?: string | null;
  order_date: string;
  customer_name: string;
  planned_delivery_sample?: string | null;
  planned_delivery_batch?: string | null;
  rpd_status?: string;
  notes?: string | null;
  groups: GroupIn[];
}

export interface StageUpdate {
  stage_id: string;
  actual_date?: string | null;
  remark?: string | null;
  delay_reason?: string | null;
}


export interface UpdateOrderPayload {
  product_name?: string | null;
  order_date?: string | null;
  customer_name?: string | null;
  planned_delivery_sample?: string | null;
  planned_delivery_batch?: string | null;
  rpd_status?: string | null;
  notes?: string | null;
}

export const orderApi = {
  list: (params: { search?: string; rpd_status?: string } = {}) =>
    api.get<OrderListItem[]>("/orders", { params }).then((r) => r.data),

  get: (orderNo: string) => api.get<OrderDetail>(`/orders/${seg(orderNo)}`).then((r) => r.data),

  create: (payload: CreateOrderPayload) =>
    api.post<OrderDetail>("/orders", payload).then((r) => r.data),

  updateStages: (orderNo: string, updates: StageUpdate[]) =>
    api.put<OrderStage[]>(`/orders/${seg(orderNo)}/stages`, { updates }).then((r) => r.data),

  updateItem: (orderNo: string, itemId: string, payload: {
    item_description: string; bearing_type: string; po_qty: string | null; value: number | null; schedule_group: string;
  }) => api.put<OrderDetail>(`/orders/${seg(orderNo)}/items/${seg(itemId)}`, payload).then((r) => r.data),

  updateAnchors: (orderNo: string, group: string, payload: { anchor_a0?: string | null; anchor_a?: string | null }) =>
    api.put<OrderDetail>(`/orders/${seg(orderNo)}/groups/${seg(group)}/anchors`, payload).then((r) => r.data),

  timeline: (orderNo: string) =>
    api.get<TimelineResponse>(`/orders/${seg(orderNo)}/timeline`).then((r) => r.data),

  remove: (orderNo: string) =>
    api
      .delete<{ items: number; stages: number; attachments: number; unlinked_apqp: number }>(`/orders/${seg(orderNo)}`)
      .then((r) => r.data),

    update: (orderNo: string, payload: UpdateOrderPayload) =>
    api.put<OrderDetail>(`/orders/${seg(orderNo)}`, payload).then((r) => r.data),
};