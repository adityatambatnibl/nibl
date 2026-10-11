/**
 * Links to orders and APQP projects.
 *
 * Pages link by PRODUCT NAME, because that is what people recognise. The
 * backend accepts either the product name or the internal id (order_no /
 * project_id) at every URL, so old links keep working.
 *
 * A "/" cannot live inside one URL segment, so a product name containing
 * one falls back to the internal id. Everything is URL-encoded, so spaces,
 * "#", "?" and "%" are safe.
 */

export function recordKey(productName: string | null | undefined, fallbackId: string): string {
  const name = (productName ?? "").trim();
  return name && !name.includes("/") ? name : fallbackId;
}

/** One URL path segment, safely encoded. */
export const seg = (key: string) => encodeURIComponent(key);

export function orderPath(o: { product_name?: string | null; order_no: string }): string {
  return `/orders/${seg(recordKey(o.product_name, o.order_no))}`;
}

export function apqpPath(p: { product_name?: string | null; project_id: string }): string {
  return `/apqp/${seg(recordKey(p.product_name, p.project_id))}`;
}
