import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apqpApi } from "../../services/apqpApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Loading } from "../../components/Loading";
import type { ApqpDetail } from "../../types";
import { apqpPath, seg } from "../../utils/links";
import { DateInput } from "../../components/DateInput";

export default function EditApqp() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();

  const { data, loading, error: loadError } = useFetch(
    () => apqpApi.get(projectId),
    [projectId]
  );

  const [form, setForm] = useState({
    order_no: "",
    customer: "",
    product_name: "",
    customer_part_no: "",
    program_name: "",
    application: "",
    supply_condition: "",
    enquiry_date: "",
    order_date: "",
    original_date: "",
    ppap_date: "",
    sample_submission_date: "",
  });
  const [syncedFrom, setSyncedFrom] = useState<ApqpDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (data && data !== syncedFrom) {
    setSyncedFrom(data);
    setForm({
      order_no: data.order_no ?? "",
      customer: data.customer,
      product_name: data.product_name ?? "",
      customer_part_no: data.customer_part_no ?? "",
      program_name: data.program_name ?? "",
      application: data.application ?? "",
      supply_condition: data.supply_condition ?? "",
      enquiry_date: data.enquiry_date ?? "",
      order_date: data.order_date ?? "",
      original_date: data.original_date ?? "",
      ppap_date: data.ppap_date ?? "",
      sample_submission_date: data.sample_submission_date ?? "",
    });
  }

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setError("");
    setBusy(true);
    try {
      const saved = await apqpApi.update(projectId, {
        order_no: form.order_no.trim() || null,
        customer: form.customer.trim(),
        product_name: form.product_name.trim() || null,
        customer_part_no: form.customer_part_no.trim() || null,
        program_name: form.program_name.trim() || null,
        application: form.application.trim() || null,
        supply_condition: form.supply_condition.trim() || null,
        enquiry_date: form.enquiry_date || null,
        order_date: form.order_date || null,
        original_date: form.original_date || null,
        ppap_date: form.ppap_date || null,
        sample_submission_date: form.sample_submission_date || null,
      });
      // The product name is the link, and it may just have changed.
      navigate(apqpPath(saved));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!data)
    return <div className="text-sm text-red-700">{loadError || "Project not found."}</div>;

  const field =
    "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600";
  const label = "block text-xs font-medium text-slate-600";

  return (
    <div className="max-w-4xl pb-10">
      <Link
        to={`/apqp/${seg(projectId)}`}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to APQP Timeline
      </Link>

      <h1 className="mt-2 text-xl font-semibold text-slate-900">
        Edit {data.project_id}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Project header only. Activities, plan dates and the week grid are not changed here.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={label}>Project ID</label>
            <input
              value={data.project_id}
              disabled
              className={`${field} bg-slate-50 text-slate-500`}
            />
            <p className="mt-1 text-xs text-slate-400">Cannot be changed</p>
          </div>
          <div>
            <label className={label}>Customer</label>
            <input
              value={form.customer}
              onChange={(e) => set("customer", e.target.value)}
              className={field}
            />
          </div>
          {/* The linked order is kept as it is (sent back unchanged on save);
              it is no longer shown - the product name is the reference. */}

          <div>
            <label className={label}>Product name</label>
            <input
              value={form.product_name}
              onChange={(e) => set("product_name", e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Customer part no.</label>
            <input
              value={form.customer_part_no}
              onChange={(e) => set("customer_part_no", e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Program name</label>
            <input
              value={form.program_name}
              onChange={(e) => set("program_name", e.target.value)}
              className={field}
            />
          </div>

          <div>
            <label className={label}>Application</label>
            <input
              value={form.application}
              onChange={(e) => set("application", e.target.value)}
              className={field}
            />
          </div>
                    <div>
            <label className={label}>Supply condition</label>
            <input
              value={form.supply_condition}
              onChange={(e) => set("supply_condition", e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Enquiry date</label>
            <DateInput
              value={form.enquiry_date}
              onChange={(e) => set("enquiry_date", e.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-slate-400">
              Plan date of activity 0.1 Receipt of Enquiry
            </p>
          </div>
          <div>
            <label className={label}>Order date</label>
            <DateInput
              value={form.order_date}
              onChange={(e) => set("order_date", e.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-slate-400">
              Plan date of activity 0.3 b, P.O from customer
            </p>
          </div>
          <div>
            <label className={label}>PPAP date</label>
            <DateInput
              value={form.ppap_date}
              onChange={(e) => set("ppap_date", e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Sample submission date</label>
            <DateInput
              value={form.sample_submission_date}
              onChange={(e) => set("sample_submission_date", e.target.value)}
              className={field}
            />
          </div>
        </div>
      </section>

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={() => navigate(`/apqp/${seg(projectId)}`)}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || !form.customer.trim() || !form.product_name.trim()}
          className="rounded bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40"
        >
          {busy ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}