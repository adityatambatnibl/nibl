import { api } from "./api";
import { seg } from "../utils/links";
import type { Attachment } from "../types";

export const attachmentApi = {
  listForEntity: (entityType: string, entityId: string) =>
    api
      .get<Attachment[]>("/attachments", {
        params: {
          entity_type: entityType,
          entity_id: entityId,
        },
      })
      .then((r) => r.data),

  listForProject: (projectId: string) =>
    api
      .get<Attachment[]>(`/attachments/project/${seg(projectId)}`)
      .then((r) => r.data),

  listForOrder: (orderNo: string) =>
    api
      .get<Attachment[]>(`/attachments/order/${seg(orderNo)}`)
      .then((r) => r.data),

  upload: (
    file: File,
    entityType: string,
    entityId: string,
    description?: string,
    onProgress?: (progress: number) => void,
  ) => {
    const form = new FormData();

    form.append("file", file);
    form.append("entity_type", entityType);
    form.append("entity_id", entityId);

    if (description) {
      form.append("description", description);
    }

    return api
      .post<Attachment>("/attachments", form, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (event) => {
          if (!event.total) return;

          const progress = Math.round(
            (event.loaded / event.total) * 100,
          );

          onProgress?.(Math.min(progress, 100));
        },
      })
      .then((r) => r.data);
  },

  remove: (id: string) =>
    api.delete(`/attachments/${id}`).then((r) => r.data),

  open: async (id: string, filename: string) => {
    const res = await api.get(`/attachments/${id}/download`, {
      responseType: "blob",
    });

    const blob = res.data as Blob;
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  },

  download: async (id: string, filename: string) => {
    const res = await api.get(`/attachments/${id}/download`, {
      responseType: "blob",
    });

    const link = document.createElement("a");
    const url = URL.createObjectURL(res.data as Blob);

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  },
};
