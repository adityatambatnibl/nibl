import { api } from "./api";
import { seg } from "../utils/links";

async function download(url: string) {
  const res = await api.get(url, { responseType: "blob" });

  const disposition = res.headers["content-disposition"] as string | undefined;
  let filename = "export.xlsx";
  if (disposition) {
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    if (match) filename = decodeURIComponent(match[1]);
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(res.data as Blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export const excelApi = {
  exportAllOrders: () => download("/excel/orders/export"),
  exportOrder: (orderNo: string) => download(`/excel/orders/${seg(orderNo)}/export`),
  exportApqp: (projectId: string) => download(`/excel/apqp/${seg(projectId)}/export`),
};