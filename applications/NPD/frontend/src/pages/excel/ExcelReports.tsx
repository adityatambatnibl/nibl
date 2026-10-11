import { useState } from "react";
import { excelApi } from "../../services/excelApi";
import { orderApi } from "../../services/orderApi";
import { apqpApi } from "../../services/apqpApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Loading } from "../../components/Loading";

type Kind = "order" | "apqp";

export default function ExcelReports() {
  const { data: orders, loading: ordersLoading } = useFetch(() => orderApi.list(), [], { key: "orders-list:" });
  const { data: projects, loading: projectsLoading } = useFetch(() => apqpApi.list(), [], { key: "apqp-list:" });

  const [selected, setSelected] = useState<Record<Kind, string>>({ order: "", apqp: "" });
  const [busy, setBusy] = useState<Kind | "">("");
  const [error, setError] = useState("");

  function set(kind: Kind, value: string) {
    setSelected((s) => ({ ...s, [kind]: value }));
    setError("");
  }

  async function run(kind: Kind) {
    setBusy(kind);
    setError("");
    try {
      if (kind === "order") await excelApi.exportOrder(selected.order);
      else await excelApi.exportApqp(selected.apqp);
    } catch (err) {
      setError(apiError(err, "Unable to generate the report."));
    } finally {
      setBusy("");
    }
  }

  const cards: {
    kind: Kind;
    title: string;
    description: string;
    note: string;
    loading: boolean;
    options: { value: string; label: string }[];
    emptyLabel: string;
  }[] = [
    {
      kind: "order",
      title: "Production Tracking",
      description:
        "One row per item with plan and actual dates for every stage. Overdue and late dates are colour-coded.",
      note: "Downloads as a single .xlsx file.",
      loading: ordersLoading,
      options: (orders ?? []).map((o) => ({
        value: o.order_no,
        label: `${o.product_name ?? o.order_no} — ${o.customer_name}`,
      })),
      emptyLabel: "No orders yet.",
    },
    {
      kind: "apqp",
      title: "APQP Timing Plan",
      description:
        "The full timing plan in the standard form layout, including the team sign-off block.",
      note: "Downloads as a .zip when files are attached, otherwise a single .xlsx.",
      loading: projectsLoading,
      options: (projects ?? []).map((p) => ({
        value: p.project_id,
        label: `${p.product_name ?? p.project_id} — ${p.customer}`,
      })),
      emptyLabel: "No APQP projects yet.",
    },
  ];

  return (
    <div className="max-w-4xl pb-10">
      <h1 className="text-[26px] font-bold tracking-[-0.8px] text-slate-900">REPORTS - NPD</h1>
      <p className="mt-1 text-sm text-slate-500">
        Select a record and download its Excel report.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <section
            key={c.kind}
            className="flex flex-col rounded-lg border border-slate-200 bg-white p-5"
          >
            <h2 className="text-sm font-semibold text-slate-900">{c.title}</h2>
            <p className="mt-1 flex-1 text-sm text-slate-500">{c.description}</p>

            {c.loading ? (
              <Loading label="Loading..." />
            ) : c.options.length === 0 ? (
              <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                {c.emptyLabel}
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                <select
                  value={selected[c.kind]}
                  onChange={(e) => set(c.kind, e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
                >
                  <option value="">— select —</option>
                  {c.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => run(c.kind)}
                  disabled={!selected[c.kind] || busy !== ""}
                  className="w-full rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40"
                >
                  {busy === c.kind ? "Generating..." : "Download"}
                </button>
              </div>
            )}

            <p className="mt-3 text-xs text-slate-400">{c.note}</p>
          </section>
        ))}
      </div>
    </div>
  );
}