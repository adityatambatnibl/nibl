import { useEffect, useState } from "react";
import { templateApi } from "../../services/templateApi";
import { apiError } from "../../services/api";
import { Loading } from "../../components/Loading";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { plural } from "../../utils/formatters";
import type { BearingPlan, BearingPlanRow } from "../../types";

/*
 * Bearing Plans - how long each Tracking stage takes, per bearing type.
 *
 * Pick "Default" or one bearing type on the left; the table shows that
 * bearing's plan: which stage each one starts after, how many days it takes,
 * and whether it is needed at all. New orders are planned from this. Orders
 * that already exist keep their dates.
 */

const DEFAULT = ""; // the default plan, used by every bearing without its own rule

const FIXED_TEXT: Record<string, string> = {
  A: "Proposal drawing date - entered on each order",
  A0: "Customer sample date - entered on each order",
};

export default function BearingPlans() {
  const [selected, setSelected] = useState<string>(DEFAULT);
  const [plan, setPlan] = useState<BearingPlan | null>(null);
  const [rows, setRows] = useState<BearingPlanRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [copyFrom, setCopyFrom] = useState(DEFAULT);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    templateApi
      .getBearingPlan(selected || null)
      .then((p) => {
        if (cancelled) return;
        setPlan(p);
        setRows(p.stages);
        setDirty(false);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err, "Could not load the plan."));
      });
    return () => {
      cancelled = true;
    };
  }, [selected, reloadKey]);

  // Showing a spinner until the plan on screen is the one that was picked.
  const loading = !plan || (plan.bearing_type ?? DEFAULT) !== selected;

  function pick(bt: string) {
    if (bt === selected) return;
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    setSaved("");
    setSelected(bt);
  }

  function update(code: string, patch: Partial<BearingPlanRow>) {
    setRows((rs) => rs.map((r) => (r.code === code ? { ...r, ...patch } : r)));
    setDirty(true);
    setSaved("");
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const p = await templateApi.saveBearingPlan(
        selected || null,
        rows.map((r) => ({ code: r.code, starts_after: r.starts_after, days: r.days, needed: r.needed })),
      );
      setPlan(p);
      setRows(p.stages);
      setDirty(false);
      setSaved("Saved. New orders will use this plan.");
    } catch (err) {
      setError(apiError(err, "Could not save the plan."));
    } finally {
      setBusy(false);
    }
  }

  async function addType() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      await templateApi.addBearingType(name, copyFrom || null);
      setAdding(false);
      setNewName("");
      setCopyFrom(DEFAULT);
      setSaved(`Bearing type ${name} added.`);
      setSelected(name);
      if (selected === name) reload();
    } catch (err) {
      setError(apiError(err, "Could not add the bearing type."));
    } finally {
      setBusy(false);
    }
  }

  async function removeType() {
    setBusy(true);
    try {
      await templateApi.removeBearingType(selected);
      setConfirmRemove(false);
      setSaved(`Bearing type ${selected} removed.`);
      setSelected(DEFAULT);
    } catch (err) {
      setError(apiError(err, "Could not remove the bearing type."));
    } finally {
      setBusy(false);
    }
  }

  const types = plan?.bearing_types ?? [];
  const isDefault = selected === DEFAULT;
  const stageOptions = rows.map((r) => ({ code: r.code, name: r.name }));
  const customCount = rows.filter((r) => r.is_custom).length;

  const field = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-600";

  return (
    <div className="pb-10">
      <h1 className="text-xl font-semibold text-slate-900">Bearing Plans</h1>
      <p className="mt-1 text-sm text-slate-500">
        How many days each Tracking stage takes, for each bearing type. New orders are planned from
        this; existing orders keep their dates.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="mt-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{saved}</div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* ── bearing list ── */}
        <aside className="rounded-lg border border-slate-200 bg-white p-2">
          <button
            onClick={() => pick(DEFAULT)}
            className={`w-full rounded px-3 py-2 text-left text-sm ${
              isDefault ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            Default (all bearings)
          </button>
          <p className="mt-2 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Bearing types
          </p>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => pick(t)}
              className={`w-full rounded px-3 py-2 text-left text-sm ${
                selected === t ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t}
            </button>
          ))}

          {adding ? (
            <div className="mt-2 space-y-2 rounded border border-slate-200 p-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addType()}
                placeholder="New bearing type"
                className={`${field} w-full`}
              />
              <label className="block text-[11px] text-slate-500">Start with the plan of</label>
              <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={`${field} w-full`}>
                <option value={DEFAULT}>Default</option>
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={addType}
                  disabled={busy || !newName.trim()}
                  className="flex-1 rounded bg-brand-700 px-2 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="mt-2 w-full rounded border border-dashed border-slate-300 px-3 py-2 text-left text-sm text-brand-700 hover:bg-brand-50"
            >
              + Add bearing type
            </button>
          )}
        </aside>

        {/* ── plan table ── */}
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
            <div className="mr-auto">
              <h2 className="text-base font-semibold text-slate-900">
                {isDefault ? "Default plan" : selected}
              </h2>
              <p className="text-xs text-slate-500">
                {isDefault
                  ? "Used by every bearing type that has no rule of its own."
                  : customCount
                    ? `${plural(customCount, "stage")} set specially for ${selected}; the rest follow the default.`
                    : `Follows the default plan. Change any row to set it for ${selected} only.`}
              </p>
            </div>
            {plan?.lead_time_days != null && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                Proposal drawing → dispatch: <b>{plural(plan.lead_time_days, "day")}</b>
              </span>
            )}
            {!isDefault && (
              <button
                onClick={() => setConfirmRemove(true)}
                className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Remove type
              </button>
            )}
            <button
              onClick={reload}
              disabled={!dirty || busy}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Undo changes
            </button>
            <button
              onClick={save}
              disabled={!dirty || busy}
              className="rounded bg-brand-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40"
            >
              {busy ? "Saving..." : "Save"}
            </button>
          </div>

          {loading ? (
            <Loading />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Stage</th>
                    <th className="px-4 py-2.5 font-medium">Starts after</th>
                    <th className="px-4 py-2.5 font-medium">Days</th>
                    {!isDefault && <th className="px-4 py-2.5 font-medium">Needed</th>}
                    <th className="px-4 py-2.5 font-medium">Plan day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const off = !r.needed;
                    return (
                      <tr key={r.code} className={`${r.is_custom ? "bg-amber-50/60" : ""} ${off ? "text-slate-400" : ""}`}>
                        <td className="px-4 py-2">
                          <span className="font-medium text-slate-900">{r.name.replace(/\s*\(\s*\d+\s*[*x×]\s*\d+\s*\)/, "")}</span>
                          {r.is_custom && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              {selected} only
                            </span>
                          )}
                        </td>

                        {r.fixed === "A" || r.fixed === "A0" ? (
                          <td colSpan={isDefault ? 2 : 3} className="px-4 py-2 text-xs text-slate-500">
                            {FIXED_TEXT[r.fixed]}
                          </td>
                        ) : (
                          <>
                            <td className="px-4 py-2">
                              {r.fixed === "order_date" ? (
                                <span className="text-xs text-slate-500">Order date</span>
                              ) : (
                                <select
                                  value={r.starts_after ?? ""}
                                  disabled={off}
                                  onChange={(e) => update(r.code, { starts_after: e.target.value || null })}
                                  className={`${field} max-w-[220px]`}
                                >
                                  {stageOptions
                                    .filter((o) => o.code !== r.code)
                                    .map((o) => (
                                      <option key={o.code} value={o.code}>
                                        {o.name.replace(/\s*\(\s*\d+\s*[*x×]\s*\d+\s*\)/, "")}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min={0}
                                max={365}
                                value={r.days}
                                disabled={off}
                                onChange={(e) => update(r.code, { days: Math.max(0, Number(e.target.value) || 0) })}
                                className={`${field} w-20`}
                              />
                            </td>
                            {!isDefault && (
                              <td className="px-4 py-2">
                                <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={r.needed}
                                    onChange={(e) => update(r.code, { needed: e.target.checked })}
                                  />
                                  {r.needed ? "Yes" : "Not for this bearing"}
                                </label>
                              </td>
                            )}
                          </>
                        )}

                        <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                          {off ? "—" : r.plan_day == null ? "" : r.plan_day === 0 ? "Day 0" : `Day ${r.plan_day}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
                Plan day counts from the proposal drawing date (Day 0). It refreshes after you save.
              </p>
            </div>
          )}
        </section>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove bearing type"
          message={
            <>
              <p>
                Remove <strong>{selected}</strong> from the list? It will no longer be offered for new
                orders, and its own plan rules are deleted.
              </p>
              <p className="mt-2">Orders that already use it keep their dates.</p>
            </>
          }
          busy={busy}
          onConfirm={removeType}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}
