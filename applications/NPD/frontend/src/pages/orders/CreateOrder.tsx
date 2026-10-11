import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { orderApi, type ItemIn } from "../../services/orderApi";
import { templateApi } from "../../services/templateApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { formatDate } from "../../utils/formatters";
import type { PreviewStage } from "../../types";
import { orderPath } from "../../utils/links";
import { DateInput } from "../../components/DateInput";

interface GroupDraft {
  anchor_a0: string;
  anchor_a: string;
  items: ItemIn[];
}

const emptyItem = (): ItemIn => ({ item_description: "", bearing_type: "", po_qty: "", value: null });

export default function CreateOrder() {
  const navigate = useNavigate();
  const { data: lookups } = useFetch(() => templateApi.getLookups());

  const [header, setHeader] = useState({
    order_no: "",
    order_date: "",
    customer_name: "",
    planned_delivery_sample: "",
    planned_delivery_batch: "",
    rpd_status: "Not received",
    notes: "",
  });

  const [groups, setGroups] = useState<GroupDraft[]>([
    { anchor_a0: "", anchor_a: "", items: [emptyItem()] },
  ]);

  const [preview, setPreview] = useState<Record<number, PreviewStage[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const types = lookups?.bearing_types ?? [];
  const statuses = lookups?.rpd_statuses ?? [];

  function setH(key: keyof typeof header, value: string) {
    setHeader((h) => ({ ...h, [key]: value }));
  }

  function setGroup(gi: number, patch: Partial<GroupDraft>) {
    setGroups((g) => g.map((x, i) => (i === gi ? { ...x, ...patch } : x)));
    setPreview((p) => ({ ...p, [gi]: [] }));
  }

  function setItem(gi: number, ii: number, patch: Partial<ItemIn>) {
    setGroups((g) =>
      g.map((x, i) =>
        i === gi ? { ...x, items: x.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : x
      )
    );
  }

  async function runPreview(gi: number) {
    const g = groups[gi];
    if (!g.anchor_a0 && !g.anchor_a) {
      setError("Enter the A0 date or the A date before previewing.");
      return;
    }
    setError("");
    try {
      const res = await templateApi.preview({
        a0_date: g.anchor_a0 || null,
        a_date: g.anchor_a || null,
        order_date: header.order_date || null,
        conditions: [...new Set(g.items.map((i) => i.bearing_type).filter(Boolean))],
      });
      setPreview((p) => ({ ...p, [gi]: res.stages }));
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function submit() {
    setError("");
    setBusy(true);
    try {
      // Not routed any more (/orders/new opens the combined form), kept for
      // reference. The product name is the identity, so it is required.
      const order = await orderApi.create({
        product_name: header.order_no.trim(),
        order_no: header.order_no.trim() || null,
        order_date: header.order_date,
        customer_name: header.customer_name.trim(),
        planned_delivery_sample: header.planned_delivery_sample || null,
        planned_delivery_batch: header.planned_delivery_batch || null,
        rpd_status: header.rpd_status,
        notes: header.notes || null,
        groups: groups.map((g) => ({
          anchor_a0: g.anchor_a0 || null,
          anchor_a: g.anchor_a || null,
          items: g.items
            .filter((i) => i.item_description.trim() && i.bearing_type)
            .map((i) => ({ ...i, value: i.value === null || isNaN(Number(i.value)) ? null : Number(i.value) })),
        })),
      });
      navigate(orderPath(order));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  const valid =
    header.order_no.trim() &&
    header.order_date &&
    header.customer_name.trim() &&
    groups.every(
      (g) => (g.anchor_a0 || g.anchor_a) && g.items.some((i) => i.item_description.trim() && i.bearing_type)
    );

  const field = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600";
  const label = "block text-xs font-medium text-slate-600";

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-semibold text-slate-900">New Order</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter the order details, then add items grouped by schedule.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Order details</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={label}>Order No. *</label>
            <input value={header.order_no} onChange={(e) => setH("order_no", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Order date *</label>
            <DateInput value={header.order_date} onChange={(e) => setH("order_date", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Customer *</label>
            <input value={header.customer_name} onChange={(e) => setH("customer_name", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Planned delivery (sample)</label>
            <DateInput value={header.planned_delivery_sample} onChange={(e) => setH("planned_delivery_sample", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Planned delivery (batch)</label>
            <DateInput value={header.planned_delivery_batch} onChange={(e) => setH("planned_delivery_batch", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>RPD status</label>
            <select value={header.rpd_status} onChange={(e) => setH("rpd_status", e.target.value)} className={field}>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={label}>Notes</label>
            <input value={header.notes} onChange={(e) => setH("notes", e.target.value)} className={field} />
          </div>
        </div>
      </section>

      {groups.map((g, gi) => (
        <section key={gi} className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Schedule group {gi + 1}
              <span className="ml-2 font-normal text-slate-500">
                — items here share one set of 29 stage dates
              </span>
            </h2>
            {groups.length > 1 && (
              <button
                onClick={() => setGroups((x) => x.filter((_, i) => i !== gi))}
                className="text-xs text-red-600 hover:underline"
              >
                Remove group
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className={label}>A0 date (sample expected)</label>
              <DateInput value={g.anchor_a0} onChange={(e) => setGroup(gi, { anchor_a0: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>A date (proposal drawing)</label>
              <DateInput value={g.anchor_a} onChange={(e) => setGroup(gi, { anchor_a: e.target.value })} className={field} />
              <p className="mt-1 text-xs text-slate-500">If left blank, A = A0 + 4 days.</p>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => runPreview(gi)}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Preview 29 dates
              </button>
            </div>
          </div>

          <table className="mt-5 w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 font-medium">Item description</th>
                <th className="py-2 font-medium">Bearing type</th>
                <th className="py-2 font-medium">PO qty</th>
                <th className="py-2 font-medium">Value</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {g.items.map((it, ii) => (
                <tr key={ii}>
                  <td className="py-1.5 pr-2">
                    <input value={it.item_description} onChange={(e) => setItem(gi, ii, { item_description: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select value={it.bearing_type} onChange={(e) => setItem(gi, ii, { bearing_type: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="">— select —</option>
                      {types.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input value={it.po_qty ?? ""} onChange={(e) => setItem(gi, ii, { po_qty: e.target.value })}
                      placeholder="500 or 200+200"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="number" step="any" value={it.value ?? ""} onChange={(e) => setItem(gi, ii, { value: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </td>
                  <td className="py-1.5">
                    {g.items.length > 1 && (
                      <button onClick={() => setGroups((x) => x.map((y, i) => i === gi ? { ...y, items: y.items.filter((_, j) => j !== ii) } : y))}
                        className="text-xs text-red-600 hover:underline">Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={() => setGroups((x) => x.map((y, i) => i === gi ? { ...y, items: [...y.items, emptyItem()] } : y))}
            className="mt-3 text-sm text-slate-700 underline"
          >
            + Add item
          </button>

          {preview[gi]?.length > 0 && (
            <div className="mt-5 rounded border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Calculated plan dates
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
                {preview[gi].map((s) => (
                  <div key={s.code} className="flex justify-between text-xs">
                    <span className="font-mono font-medium text-slate-700">{s.code}</span>
                    <span className="text-slate-600">{formatDate(s.plan_date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}

      <button
        onClick={() => setGroups((g) => [...g, { anchor_a0: "", anchor_a: "", items: [emptyItem()] }])}
        className="mt-4 rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        + Add another schedule group
      </button>

      <div className="mt-6 flex justify-end gap-2 pb-10">
        <button onClick={() => navigate("/orders")}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button onClick={submit} disabled={!valid || busy}
          className="rounded bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40">
          {busy ? "Creating..." : "Create order"}
        </button>
      </div>
    </div>
  );
}