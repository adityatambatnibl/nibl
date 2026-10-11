import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { orderApi } from "../../services/orderApi";
import { templateApi } from "../../services/templateApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Loading } from "../../components/Loading";
import type { OrderDetail } from "../../types";
import { orderPath, seg } from "../../utils/links";
import { DateInput } from "../../components/DateInput";

export default function EditOrder() {
  const { orderNo = "" } = useParams();
  const navigate = useNavigate();

  const { data, loading, error: loadError } = useFetch(() => orderApi.get(orderNo), [orderNo], { key: `order:${orderNo}` });
  const { data: lookups } = useFetch(() => templateApi.getLookups(), [], { key: "lookups" });

  const [form, setForm] = useState({
    product_name: "",
    order_date: "",
    customer_name: "",
    planned_delivery_sample: "",
    planned_delivery_batch: "",
    rpd_status: "",
    notes: "",
  });
  const [syncedFrom, setSyncedFrom] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (data && data !== syncedFrom) {
    setSyncedFrom(data);
    setForm({
      product_name: data.product_name ?? "",
      order_date: data.order_date ?? "",
      customer_name: data.customer_name,
      planned_delivery_sample: data.planned_delivery_sample ?? "",
      planned_delivery_batch: data.planned_delivery_batch ?? "",
      rpd_status: data.rpd_status,
      notes: data.notes ?? "",
    });
  }

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setError("");
    setBusy(true);
    try {
      const saved = await orderApi.update(orderNo, {
        product_name: form.product_name.trim() || null,
        order_date: form.order_date || null,
        customer_name: form.customer_name.trim(),
        planned_delivery_sample: form.planned_delivery_sample || null,
        planned_delivery_batch: form.planned_delivery_batch || null,
        rpd_status: form.rpd_status,
        notes: form.notes || null,
      });
      // The product name may have changed, and it is the link - so go to
      // the saved record, not the URL we came in on.
      navigate(orderPath(saved));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!data) return <div className="text-sm text-red-700">{loadError || "Order not found."}</div>;

  const field = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600";
  const label = "block text-xs font-medium text-slate-600";

  return (
    <div className="max-w-4xl pb-10">
      <Link to={`/orders/${seg(orderNo)}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to Tracking
      </Link>

      <h1 className="mt-2 text-xl font-semibold text-slate-900">Edit {data.product_name ?? data.order_no}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Order header only. Items, plan dates and stages are not changed here.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={label}>Product name *</label>
            <input value={form.product_name} onChange={(e) => set("product_name", e.target.value)} className={field} />
            <p className="mt-1 text-xs text-slate-400">Also renames the linked APQP project</p>
          </div>
          <div>
            <label className={label}>Order date</label>
            <DateInput value={form.order_date} onChange={(e) => set("order_date", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Customer</label>
            <input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Planned delivery (sample)</label>
            <DateInput value={form.planned_delivery_sample} onChange={(e) => set("planned_delivery_sample", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Planned delivery (batch)</label>
            <DateInput value={form.planned_delivery_batch} onChange={(e) => set("planned_delivery_batch", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>RPD status</label>
            <select value={form.rpd_status} onChange={(e) => set("rpd_status", e.target.value)} className={field}>
              {(lookups?.rpd_statuses ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={label}>Notes</label>
            <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={field} />
          </div>
        </div>
      </section>

      <div className="mt-6 flex justify-end gap-2">
        <button onClick={() => navigate(`/orders/${seg(orderNo)}`)}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button onClick={save} disabled={busy || !form.customer_name.trim() || !form.product_name.trim()}
          className="rounded bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40">
          {busy ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}