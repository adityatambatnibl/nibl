import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apqpApi } from "../../services/apqpApi";
import { orderApi } from "../../services/orderApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { apqpPath } from "../../utils/links";
import { DateInput } from "../../components/DateInput";

function monthOptions() {
  const out: { value: string; label: string }[] = [];
  for (let y = 2000; y <= new Date().getFullYear() + 5; y++) {
    for (let m = 0; m < 12; m++) {
      const d = new Date(y, m, 1);
      out.push({
        value: `${y}-${String(m + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      });
    }
  }
  return out;
}

function nextFive(start: string) {
  if (!start) return [];
  const [y, m] = start.split("-").map(Number);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(y, m - 1 + i, 1);
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  });
}

export default function CreateApqpProject() {
  const navigate = useNavigate();
  const { data: orders } = useFetch(() => orderApi.list());
  const months = monthOptions();

  const [form, setForm] = useState({
    project_id: "",
    order_no: "",
    customer: "",
    product_name: "",
    customer_part_no: "",
    program_name: "",
    application: "",
    supply_condition: "",
    original_date: "",
    ppap_date: "",
    sample_submission_date: "",
    start_month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
  });

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const project = await apqpApi.create({
        project_id: form.project_id.trim(),
        order_no: form.order_no || null,
        customer: form.customer.trim(),
        product_name: form.product_name || null,
        customer_part_no: form.customer_part_no || null,
        program_name: form.program_name || null,
        application: form.application || null,
        supply_condition: form.supply_condition || null,
        original_date: form.original_date || null,
        ppap_date: form.ppap_date || null,
        sample_submission_date: form.sample_submission_date || null,
        start_month: form.start_month,
      });
      navigate(apqpPath(project));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  const valid = form.project_id.trim() && form.customer.trim() && form.start_month;
  const field = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600";
  const label = "block text-xs font-medium text-slate-600";

  return (
    <div className="max-w-4xl pb-10">
      <h1 className="text-xl font-semibold text-slate-900">New APQP Project</h1>
      <p className="mt-1 text-sm text-slate-500">
        The 64 standard activities are created automatically. You fill them in afterwards.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Project details</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={label}>Project ID *</label>
            <input value={form.project_id} onChange={(e) => set("project_id", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Customer *</label>
            <input value={form.customer} onChange={(e) => set("customer", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Link to order</label>
            <select value={form.order_no} onChange={(e) => set("order_no", e.target.value)} className={field}>
              <option value="">— not linked —</option>
              {(orders ?? []).map((o) => (
                <option key={o.order_no} value={o.order_no}>{o.order_no} — {o.customer_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Product name</label>
            <input value={form.product_name} onChange={(e) => set("product_name", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Customer part no</label>
            <input value={form.customer_part_no} onChange={(e) => set("customer_part_no", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Program name</label>
            <input value={form.program_name} onChange={(e) => set("program_name", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Application</label>
            <input value={form.application} onChange={(e) => set("application", e.target.value)} className={field} />
          </div>
          <div className="md:col-span-2">
            <label className={label}>Supply condition</label>
            <input value={form.supply_condition} onChange={(e) => set("supply_condition", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Original date</label>
            <DateInput value={form.original_date} onChange={(e) => set("original_date", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>PPAP date</label>
            <DateInput value={form.ppap_date} onChange={(e) => set("ppap_date", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Sample submission date</label>
            <DateInput value={form.sample_submission_date} onChange={(e) => set("sample_submission_date", e.target.value)} className={field} />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Timing plan window</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick the first month. The plan covers 5 consecutive months, 4 weeks each — 20 columns.
        </p>

        <div className="mt-4 max-w-xs">
          <label className={label}>Start month *</label>
          <select value={form.start_month} onChange={(e) => set("start_month", e.target.value)} className={field}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {form.start_month && (
          <div className="mt-4 flex flex-wrap gap-2">
            {nextFive(form.start_month).map((m, i) => (
              <span key={m} className={`rounded border px-3 py-1 text-xs ${
                i === 0 ? "border-slate-900 bg-brand-700 text-white" : "border-slate-200 bg-slate-50 text-slate-600"
              }`}>
                {m}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 flex justify-end gap-2">
        <button onClick={() => navigate("/apqp")}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button onClick={submit} disabled={!valid || busy}
          className="rounded bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40">
          {busy ? "Creating..." : "Create project"}
        </button>
      </div>
    </div>
  );
}