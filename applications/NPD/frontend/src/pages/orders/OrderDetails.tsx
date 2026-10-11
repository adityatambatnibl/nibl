import { plural } from "../../utils/formatters";



import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { orderApi, type StageUpdate } from "../../services/orderApi";
import { templateApi } from "../../services/templateApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { useAuth } from "../../hooks/useAuth";
import { Loading } from "../../components/Loading";
import { StageBadge } from "../../components/StageBadge";
import { PermissionGuard } from "../../components/PermissionGuard";
import { GanttChart } from "../../components/GanttChart";
import { excelApi } from "../../services/excelApi";
import { formatDate } from "../../utils/formatters";
import type { OrderStage, OrderDetail } from "../../types";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { seg } from "../../utils/links";
import { ExportButton } from "../../components/ExportButton";
import { DateInput } from "../../components/DateInput";

type Draft = Record<string, { plan_date: string; actual_date: string; remark: string; delay_reason: string }>;

export default function OrderDetails() {
  const { orderNo = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const { data, loading, error, setData, setError } = useFetch(() => orderApi.get(orderNo), [orderNo], { key: `order:${orderNo}` });
  const { data: lookups } = useFetch(() => templateApi.getLookups(), [], { key: "lookups" });

  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [tab, setTab] = useState<"tracking" | "timeline">("tracking");
  const { data: timeline } = useFetch(() => orderApi.timeline(orderNo), [orderNo], { key: `order-timeline:${orderNo}` });

  const [syncedFrom, setSyncedFrom] = useState<OrderDetail | null>(null);
  // Items card: read-only until an admin presses Edit.
  type ItemRow = { desc: string; bt: string; qty: string; value: string; group: string };
  const [itemEdit, setItemEdit] = useState(false);
  const [rows, setRows] = useState<Record<string, ItemRow>>({});
  // A0 / A dates of each item group (items in one group share them).
  const [anchors, setAnchors] = useState<Record<string, { a0: string; a: string }>>({});
  const [itemBusy, setItemBusy] = useState(false);
  const [itemMsg, setItemMsg] = useState("");

  if (data && data !== syncedFrom) {
    setSyncedFrom(data);
    const d: Draft = {};
    for (const s of data.stages) {
      d[s.id] = {
        plan_date: s.plan_date ?? "",
        actual_date: s.actual_date ?? "",
        remark: s.remark ?? "",
        delay_reason: s.delay_reason ?? "",
      };
    }
    setDraft(d);
    resetItems(data);
  }

  function resetItems(d: OrderDetail) {
    const r: Record<string, ItemRow> = {};
    const an: Record<string, { a0: string; a: string }> = {};
    for (const it of d.items) {
      r[it.id] = { desc: it.item_description, bt: it.bearing_type, qty: it.po_qty ?? "",
                   value: it.value == null ? "" : String(it.value), group: it.schedule_group };
      an[it.schedule_group] = { a0: it.anchor_a0 ?? "", a: it.anchor_a ?? "" };
    }
    setRows(r);
    setAnchors(an);
  }

  const itemGroups = Array.from(new Set((data?.items ?? []).map((i) => i.schedule_group)));

  const changedItems = (data?.items ?? []).filter((it) => {
    const r = rows[it.id];
    return r && (r.desc.trim() !== it.item_description || r.bt !== it.bearing_type ||
      r.qty.trim() !== (it.po_qty ?? "") || r.value.trim() !== (it.value == null ? "" : String(it.value)) ||
      r.group !== it.schedule_group);
  });
  const changedGroups = itemGroups.filter((g) => {
    const it = data?.items.find((i) => i.schedule_group === g);
    const a = anchors[g];
    return it && a && (a.a0 !== (it.anchor_a0 ?? "") || a.a !== (it.anchor_a ?? ""));
  });
  const itemsDirty = changedItems.length > 0 || changedGroups.length > 0;

  function editRow(id: string, field: keyof ItemRow, value: string) {
    setRows((x) => ({ ...x, [id]: { ...x[id], [field]: value } }));
    setItemMsg("");
  }

  function editAnchor(group: string, field: "a0" | "a", value: string) {
    setAnchors((x) => ({ ...x, [group]: { ...x[group], [field]: value } }));
    setItemMsg("");
  }

  function cancelItems() {
    if (data) resetItems(data);
    setItemEdit(false);
    setItemMsg("");
  }

  async function saveItems() {
    if (!data || !itemsDirty) return setItemEdit(false);
    for (const it of changedItems) {
      const r = rows[it.id];
      if (!r.desc.trim()) return setError("Description cannot be empty.");
      if (r.value.trim() && Number.isNaN(Number(r.value))) return setError(`Value for "${r.desc}" must be a number.`);
    }
    setItemBusy(true);
    setError("");
    try {
      for (const it of changedItems) {
        const r = rows[it.id];
        await orderApi.updateItem(orderNo, it.id, {
          item_description: r.desc.trim(), bearing_type: r.bt, po_qty: r.qty.trim() || null,
          value: r.value.trim() ? Number(r.value) : null, schedule_group: r.group,
        });
      }
      for (const g of changedGroups) {
        const it = data.items.find((i) => i.schedule_group === g)!;
        const a = anchors[g];
        await orderApi.updateAnchors(orderNo, g, {
          anchor_a0: a.a0 !== (it.anchor_a0 ?? "") && a.a0 ? a.a0 : undefined,
          anchor_a: a.a !== (it.anchor_a ?? "") && a.a ? a.a : undefined,
        });
      }
      setData(await orderApi.get(orderNo));
      setItemEdit(false);
      setItemMsg(changedGroups.length
        ? "Items saved. The later stages in Tracking moved with the new dates."
        : "Items saved.");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setItemBusy(false);
    }
  }


  function edit(id: string, field: keyof Draft[string], value: string) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
    setSaved("");
  }

  const dirty = data?.stages.some(s => {
    const d = draft[s.id];
    if (!d) return false;
    return (
      d.plan_date !== (s.plan_date ?? "") ||
      d.actual_date !== (s.actual_date ?? "") ||
      d.remark !== (s.remark ?? "") ||
      d.delay_reason !== (s.delay_reason ?? "")
    );
  });

  async function save() {
    if (!data) return;
    const updates: StageUpdate[] = data.stages
      .filter(s => {
        const d = draft[s.id];
        return (
          d &&
          (d.plan_date !== (s.plan_date ?? "") ||
            d.actual_date !== (s.actual_date ?? "") ||
            d.remark !== (s.remark ?? "") ||
            d.delay_reason !== (s.delay_reason ?? ""))
        );
      })
      .map(s => ({
        stage_id: s.id,
        plan_date: draft[s.id].plan_date || null,
        actual_date: draft[s.id].actual_date || null,
        remark: draft[s.id].remark || null,
        delay_reason: draft[s.id].delay_reason || null,
      }));

    if (updates.length === 0) return;

    setBusy(true);
    setError("");
    try {
      await orderApi.updateStages(orderNo, updates);
      setData(await orderApi.get(orderNo));
      setSaved(`${updates.length} Tracking saved.`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await orderApi.remove(orderNo);
      navigate("/orders", { replace: true });
    } catch (err) {
      setDeleteError(apiError(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!data) return <div className="text-sm text-red-700">{error || "Order not found."}</div>;

  const groups = [...new Set(data.stages.map(s => s.schedule_group))];
  const reasons = lookups?.delay_reasons ?? [];

  return (
    <div className="pb-10">
      <Link to="/orders" className="text-sm text-slate-500 hover:text-slate-900">← Back to TRACKING</Link>

      {/* header: stacks on mobile, side by side from sm up */}
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">
            {data.product_name ?? data.order_no}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.customer_name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <StageBadge status={data.status} />
          {user?.role === "admin" && (
            <Link
              to={`/orders/${seg(orderNo)}/edit`}
              className="btn-action inline-flex h-9 min-w-[128px] items-center justify-center rounded border px-4 text-sm font-medium border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              Edit
            </Link>
          )}
          <PermissionGuard permission="timeline_create">
            <Link
              to={`/orders/${seg(orderNo)}/emails`}
              className="btn-action inline-flex h-9 min-w-[128px] items-center justify-center rounded border px-4 text-sm font-medium border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              title="Who gets this order's tracking emails"
            >
              Emails
            </Link>
          </PermissionGuard>
          <PermissionGuard permission="excel_export">
            <ExportButton onExport={() => excelApi.exportOrder(orderNo)} className="btn-action inline-flex h-9 min-w-[128px] items-center justify-center rounded border px-4 text-sm font-medium border-slate-300 bg-white text-slate-700 hover:bg-slate-50" />
          </PermissionGuard>
          {user?.role === "admin" && (
            <button
              onClick={() => { setConfirmDelete(true); setDeleteError(""); }}
              className="btn-action inline-flex h-9 min-w-[128px] items-center justify-center rounded border px-4 text-sm font-medium border-red-200 bg-white text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* summary cards: 2 up on phones, 4 across from md */}
      <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5 md:grid-cols-4">
        {[
          ["Order date", formatDate(data.order_date)],
          ["Sample delivery", formatDate(data.planned_delivery_sample)],
          ["Batch delivery", formatDate(data.planned_delivery_batch)],
          ["RPD status", data.rpd_status],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-slate-500">{k}</p>
            <p className="mt-0.5 text-sm font-medium text-slate-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-900">Overall progress</p>
          <p className="text-sm text-slate-600">
            {data.progress.completed} of {plural(data.progress.total, "stage")} · {data.progress.percent}%
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-brand-600" style={{ width: `${data.progress.percent}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>Overdue: <strong className="text-red-600">{data.stage_counts.overdue}</strong></span>
          <span>In progress: <strong>{data.stage_counts.in_progress}</strong></span>
          <span>Completed: <strong className="text-green-700">{data.stage_counts.completed}</strong></span>
          <span>Completed late: <strong className="text-amber-700">{data.stage_counts.completed_late}</strong></span>
        </div>
      </div>

      {/* ITEMS TABLE — scrolls sideways on narrow screens */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Items ({data.items.length})</p>
          {user?.role === "admin" && (
            <div className="flex items-center gap-3">
              {itemMsg && <span className="text-sm text-green-700">{itemMsg}</span>}
              {!itemEdit ? (
                <button
                  onClick={() => { setItemEdit(true); setItemMsg(""); }}
                  disabled={!!dirty}
                  title={dirty ? "Save the tracking changes below first" : "Edit the items"}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Edit
                </button>
              ) : (
                <>
                  <button onClick={cancelItems} disabled={itemBusy}
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    Cancel
                  </button>
                  <button onClick={saveItems} disabled={itemBusy || !itemsDirty}
                    className="rounded bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40">
                    {itemBusy ? "Saving..." : "Save"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <div className="inline-block min-w-full px-4 align-middle sm:px-0">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 font-medium">Bearing type</th>
                  <th className="py-2 pr-3 font-medium">PO qty</th>
                  <th className="py-2 pr-3 font-medium">Value</th>
                  <th className="py-2 pr-3 font-medium">Group</th>
                  <th className="py-2 pr-3 font-medium">Sample study - expected (A0)</th>
                  <th className="py-2 font-medium">Proposal Drawing to customer (A)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((i) => {
                  const r = rows[i.id];
                  const a = anchors[r?.group ?? i.schedule_group];
                  if (!itemEdit || !r) {
                    return (
                      <tr key={i.id}>
                        <td className="py-2 pr-3 font-medium text-slate-900">{i.item_description}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{i.bearing_type}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{i.po_qty || "—"}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{i.value ?? "—"}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-500">{i.schedule_group.split("-").pop()}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{formatDate(i.anchor_a0)}</td>
                        <td className="whitespace-nowrap py-2 text-slate-600">{formatDate(i.anchor_a)}</td>
                      </tr>
                    );
                  }
                  const types = lookups?.bearing_types ?? [];
                  return (
                    <tr key={i.id} className="align-top">
                      <td className="py-2 pr-3"><input value={r.desc} maxLength={200} onChange={(e) => editRow(i.id, "desc", e.target.value)} className="w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-sm" aria-label="Description" /></td>
                      <td className="py-2 pr-3">
                        <select value={r.bt} onChange={(e) => editRow(i.id, "bt", e.target.value)} className="w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-sm" aria-label="Bearing type">
                          {!types.includes(r.bt) && <option value={r.bt}>{r.bt}</option>}
                          {types.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-3"><input value={r.qty} onChange={(e) => editRow(i.id, "qty", e.target.value)} className="w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-sm" style={{ width: 90 }} aria-label="PO qty" /></td>
                      <td className="py-2 pr-3"><input value={r.value} inputMode="decimal" onChange={(e) => editRow(i.id, "value", e.target.value)} className="w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-sm" style={{ width: 90 }} aria-label="Value" /></td>
                      <td className="py-2 pr-3">
                        <select value={r.group} onChange={(e) => editRow(i.id, "group", e.target.value)} className="w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-sm" style={{ width: 70 }} aria-label="Group" disabled={itemGroups.length < 2}>
                          {itemGroups.map((g) => <option key={g} value={g}>{g.split("-").pop()}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-3"><DateInput value={a?.a0 ?? ""} onChange={(e) => editAnchor(r.group, "a0", e.target.value)} className="w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-sm" aria-label="Sample study - expected (A0)" /></td>
                      <td className="py-2"><DateInput value={a?.a ?? ""} onChange={(e) => editAnchor(r.group, "a", e.target.value)} className="w-full min-w-0 rounded border border-slate-300 px-2 py-1 text-sm" aria-label="Proposal drawing to customer (A)" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* tab bar + save button */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {(["tracking", "timeline"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
                tab === t ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "tracking" && (
          <PermissionGuard permission="tracking_edit">
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm text-green-700">{saved}</span>}
              <button
                onClick={save}
                disabled={!dirty || busy}
                className="w-full rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40 sm:w-auto"
              >
                {busy ? "Saving..." : "Save changes"}
              </button>
            </div>
          </PermissionGuard>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {tab === "timeline" ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          {timeline?.range_start && timeline?.range_end ? (
            <div className="overflow-x-auto">
              <GanttChart
                bars={timeline.bars}
                today={timeline.today}
                rangeStart={timeline.range_start}
                rangeEnd={timeline.range_end}
              />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No dates to display.</p>
          )}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g} className="mt-4 rounded-lg border border-slate-200 bg-white">
            {groups.length > 1 && (
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">
                Schedule group {g.split("-").pop()}
              </div>
            )}

            {/* STAGE TRACKING TABLE — the one that was clipped before */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Code</th>
                    <th className="px-3 py-3 font-medium">Stage</th>
                    <th className="px-3 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 font-medium">Actual</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Delay reason</th>
                    <th className="px-3 py-3 font-medium">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.stages.filter(s => s.schedule_group === g).map((s: OrderStage) => (
                    <tr key={s.id} className={s.status === "overdue" ? "bg-red-50/40" : ""}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-slate-900">
                        {s.stage_code}
                      </td>
                      <td className="min-w-[190px] px-3 py-2 text-slate-700">{s.stage_name}</td>
                                        <td className="whitespace-nowrap px-3 py-2">
                          {/* Same date box as APQP for everyone, so both pages show the
                              same date format; only an admin can change the plan. */}
                          <DateInput
                            value={draft[s.id]?.plan_date ?? ""}
                            disabled={user?.role !== "admin"}
                            onChange={(e) => edit(s.id, "plan_date", e.target.value)}
                            className="w-32 rounded border border-amber-300 px-1.5 py-1 text-xs outline-none focus:border-amber-500 disabled:bg-slate-50 disabled:text-slate-700"
                          />
                        </td>
                      <td className="px-3 py-2">
                        <DateInput
                          value={draft[s.id]?.actual_date ?? ""}
                          onChange={(e) => edit(s.id, "actual_date", e.target.value)}
                          className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <StageBadge status={s.status} delayDays={s.delay_days} />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={draft[s.id]?.delay_reason ?? ""}
                          onChange={(e) => edit(s.id, "delay_reason", e.target.value)}
                          className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="">—</option>
                          {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={draft[s.id]?.remark ?? ""}
                          onChange={(e) => edit(s.id, "remark", e.target.value)}
                          className="w-full min-w-[180px] rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete order"
          message={
            <>
              <p>Permanently delete <strong>{data.product_name ?? data.order_no}</strong>?</p>
              <p className="mt-2">
                This removes {plural(data.items.length, "item")}, {plural(data.stages.length, "stage record")} and any
                attachments. Linked APQP projects are unlinked but kept.
              </p>
              <p className="mt-2">This cannot be undone.</p>
            </>
          }
          requireText={data.product_name ?? data.order_no}
          busy={deleteBusy}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
