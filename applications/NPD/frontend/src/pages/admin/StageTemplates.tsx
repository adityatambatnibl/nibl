import { plural } from "../../utils/formatters";


import { useState } from "react";
import { templateApi } from "../../services/templateApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Loading } from "../../components/Loading";
import { formatDate } from "../../utils/formatters";
import type { StageOffset } from "../../types";
import { DateInput } from "../../components/DateInput";

const GROUPS: { label: string; codes: string[] }[] = [
  { label: "Anchors", codes: ["ERP", "A0", "A"] },
  { label: "Design", codes: ["B", "C"] },
  { label: "Material & tooling", codes: ["D", "E", "F", "G", "H"] },
  { label: "Machining", codes: ["J", "J1", "K", "L", "M", "N", "P", "P1", "P2", "P3", "P4"] },
  { label: "Assembly & inspection", codes: ["S", "S1", "T", "U"] },
  { label: "Dispatch", codes: ["V", "W", "X", "Y", "Z"] },
];

export default function StageTemplates() {
  const { data, loading, error, setData, setError } = useFetch(() => templateApi.getStages());
  const { data: lookups } = useFetch(() => templateApi.getLookups());

  const [synced, setSynced] = useState<StageOffset[] | null>(null);
  const [rows, setRows] = useState<StageOffset[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  const [bearingType, setBearingType] = useState("");
  const [anchorDate, setAnchorDate] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [totalDays, setTotalDays] = useState<number | null>(null);
  const [editingVariants, setEditingVariants] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  if (data && data !== synced) {
    setSynced(data);
    setRows(data);
    setDirty(false);
  }

  const types = lookups?.bearing_types ?? [];
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));

  function update(code: string, patch: Partial<StageOffset>) {
    setRows((r) => r.map((s) => (s.code === code ? { ...s, ...patch } : s)));
    setDirty(true);
    setSaved("");
  }

  function setVariant(code: string, type: string, value: string) {
    setRows((r) =>
      r.map((s) => {
        if (s.code !== code) return s;
        const variants = { ...s.variants };
        if (value === "") delete variants[type];
        else variants[type] = Number(value) || 0;
        return { ...s, variants };
      })
    );
    setDirty(true);
    setSaved("");
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const updated = await templateApi.updateStages(rows);
      setData(updated);
      setSynced(updated);
      setRows(updated);
      setDirty(false);
      setSaved("Saved.");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!anchorDate) return;
    setError("");
    try {
      const res = await templateApi.preview({
        a_date: anchorDate,
        order_date: orderDate || null,
        conditions: bearingType ? [bearingType] : [],
      });
      setPreview(Object.fromEntries(res.stages.map((s) => [s.code, s.plan_date])));
      setTotalDays(res.total_days);
    } catch (err) {
      setError(apiError(err));
    }
  }

  /** Groups bearing types that share the same override value into one pill. */
  function variantPills(s: StageOffset) {
    const grouped: Record<number, string[]> = {};
    for (const [type, value] of Object.entries(s.variants)) {
      (grouped[value] ??= []).push(type);
    }
    const covered = new Set(Object.keys(s.variants));
    const missing = types.filter((t) => !covered.has(t));
    return { grouped, missing };
  }

  if (loading) return <Loading />;

  const unconfirmed = rows.filter((r) => r.unconfirmed);
  const drift = rows.filter((r) => r.variance != null && Math.abs(r.variance) >= 2);

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Stage offsets</h1>
          <p className="mt-1 text-sm text-slate-500">How every plan date is calculated</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {saved && <span className="text-sm text-green-700">{saved}</span>}
          <button onClick={save} disabled={!dirty || busy}
            className="w-full rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40 sm:w-auto">
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {/* ── Why this page exists ── */}
      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
        >
          <span className="text-sm font-semibold text-slate-900">
            What are stage offsets, and why do they matter?
          </span>
          <span className="shrink-0 text-slate-400">{showHelp ? "▾" : "▸"}</span>
        </button>

        {showHelp && (
          <div className="space-y-4 border-t border-slate-200 px-4 py-4 text-sm text-slate-700">
            <div>
              <p className="font-semibold text-slate-900">Nobody types 30 dates</p>
              <p className="mt-1 text-slate-600">
                When an order is created you enter <strong>one</strong> date — the A0 anchor.
                Every one of the {rows.length} stage dates after it is calculated from the rules
                on this page. That is the only reason a new order takes seconds instead of
                half an hour.
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-900">Each rule is “after X, add N days”</p>
              <div className="mt-2 overflow-x-auto">
                <pre className="inline-block rounded bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-700">
{`A0   30-Apr    you type this
A    04-May    = A0 + 4
B    14-May    = A  + 10   drawing approval
C    19-May    = B  + 5    component design
D    29-May    = C  + 10   tool design ready
G    08-Jul    = F  + 45   raw material receipt`}
                </pre>
              </div>
              <p className="mt-2 text-slate-600">
                It is a chain, not a straight line. F waits on C, not on E — so tooling and
                raw material run in parallel and rejoin later.
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-900">Offsets differ by bearing type</p>
              <p className="mt-1 text-slate-600">
                Tool design takes 4 days for IM/BI but 15 for RAX. Those are the
                <strong> variants</strong> under each stage. When none is set, the default applies.
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-900">Why it lives here and not in code</p>
              <p className="mt-1 text-slate-600">
                If raw material starts taking 60 days instead of 45, you change stage G on this
                page and save. Every new order uses the new figure. No developer, no deployment.
              </p>
            </div>

            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-800">
                <strong>Existing orders never change.</strong> Their dates were calculated when
                they were created and stored. Editing an offset today will not move a schedule
                somebody has already promised a customer.
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-900">The two warnings above</p>
              <p className="mt-1 text-slate-600">
                <strong>Unconfirmed</strong> means the predecessor or the number was assumed when
                the system was set up, and never verified — every date after it may be wrong.{" "}
                <strong>Drift</strong> means actual completion dates disagree with the configured
                offset by more than 2 days, so the plan no longer matches the factory.
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-900">Check before you save</p>
              <p className="mt-1 text-slate-600">
                Pick a bearing type and an A date in the bar below and press Preview. The dates
                appear beside each stage, so you can see the effect of a change before it reaches
                a real order.
              </p>
            </div>
          </div>
        )}
      </section>

      {unconfirmed.length > 0 && (
        <div className="mt-5 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <span className="shrink-0 text-amber-600">⚠</span>
          <p className="text-xs text-amber-800">
            <strong>{plural(unconfirmed.length, "rule")} {unconfirmed.length === 1 ? "is" : "are"} unconfirmed.</strong>{" "}
            {unconfirmed.map((u) => u.code).join(", ")} use assumed predecessors or offsets — every date
            after them may be wrong.
          </p>
        </div>
      )}

      {drift.length > 0 && (
        <div className="mt-2 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
          <span className="shrink-0 text-red-600">●</span>
          <p className="text-xs text-red-800">
            <strong>{plural(drift.length, "stage")} {drift.length === 1 ? "drifts" : "drift"} from reality.</strong>{" "}
            Actual averages differ from the configured offset by more than 2 days.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 p-3">
        <span className="w-full text-xs text-slate-500 sm:w-auto">Preview for</span>
        <select value={bearingType} onChange={(e) => setBearingType(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">— no bearing type —</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <DateInput value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)}
          aria-label="A date" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <DateInput value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
          aria-label="Order date" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
        <button onClick={runPreview} disabled={!anchorDate}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          Preview
        </button>
        {totalDays !== null && (
          <span className="w-full text-xs text-slate-500 sm:ml-auto sm:w-auto">
            Lead time A → X: <strong className="text-slate-900">{plural(totalDays, "day")}</strong>
          </span>
        )}
      </div>

      {GROUPS.map((group) => {
        const stages = group.codes.map((c) => byCode[c]).filter(Boolean);
        if (!stages.length) return null;
        const groupUnconfirmed = stages.filter((s) => s.unconfirmed).length;

        return (
          <section key={group.label}
            className={`mt-3 overflow-hidden rounded-xl border bg-white ${
              groupUnconfirmed ? "border-amber-200" : "border-slate-200"
            }`}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <span className="text-xs font-medium text-slate-500">{group.label}</span>
              {groupUnconfirmed > 0 && (
                <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {groupUnconfirmed} unconfirmed
                </span>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              {stages.map((s) => {
                const isAnchor = s.depends_on === null && !s.anchor_field;
                const { grouped, missing } = variantPills(s);
                const hasVariants = Object.keys(s.variants).length > 0;

                return (
                  <div key={s.code} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="w-9 shrink-0 font-mono text-sm font-medium text-slate-900">{s.code}</span>

                      <div className="min-w-40 flex-1">
                        <p className="text-sm text-slate-900">
                          {s.name}
                          {s.unconfirmed && <span className="ml-1.5 text-amber-600">⚠</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {s.anchor_field
                            ? `Order date + ${plural(s.offset_days, "day")}`
                            : isAnchor
                              ? "Entered per order — everything else derives from this"
                              : <>after <span className="font-mono text-slate-700">{s.depends_on}</span>{hasVariants && " · varies by bearing type"}</>}
                        </p>
                        {s.unconfirmed && s.note && (
                          <p className="mt-0.5 text-xs text-amber-700">{s.note}</p>
                        )}
                      </div>

                      {!isAnchor && (
                        <>
                          {!s.anchor_field && (
                            <select value={s.depends_on ?? ""}
                              onChange={(e) => update(s.code, { depends_on: e.target.value })}
                              className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs">
                              {rows.filter((r) => r.code !== s.code).map((r) => (
                                <option key={r.code} value={r.code}>{r.code}</option>
                              ))}
                            </select>
                          )}
                          <input type="number" value={s.offset_days}
                            onChange={(e) => update(s.code, { offset_days: Number(e.target.value) || 0 })}
                            aria-label={`${s.code} offset days`}
                            className="w-14 rounded border border-slate-300 px-2 py-1 text-center text-xs" />
                        </>
                      )}

                      <span className="w-20 shrink-0 whitespace-nowrap text-right text-xs text-slate-500">
                        {preview[s.code] ? formatDate(preview[s.code]) : "—"}
                      </span>
                    </div>

                    {!isAnchor && !s.anchor_field && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:pl-12">
                        {Object.entries(grouped).map(([value, typeList]) => (
                          <span key={value}
                            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {typeList.join(" · ")} <strong className="text-slate-900">+{value}</strong>
                          </span>
                        ))}
                        {hasVariants && missing.length > 0 && (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                            {missing.join(" · ")} not set
                          </span>
                        )}
                        {s.variance != null && Math.abs(s.variance) >= 2 && (
                          <span className={`rounded px-2 py-0.5 text-xs ${
                            s.variance > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                          }`}>
                            Actual average +{s.actual_avg_offset} — {Math.abs(s.variance)}d
                            {s.variance > 0 ? " over" : " under"} (n={s.sample_size})
                          </span>
                        )}
                        <button
                          onClick={() => setEditingVariants(editingVariants === s.code ? null : s.code)}
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          {editingVariants === s.code ? "Done" : "Edit variants"}
                        </button>
                      </div>
                    )}

                    {editingVariants === s.code && (
                      <div className="mt-2 rounded-lg bg-slate-50 p-3 sm:ml-12">
                        <p className="mb-2 text-xs text-slate-500">
                          Leave blank to use the default of +{plural(s.offset_days, "day")}.
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {types.map((t) => (
                            <label key={t} className="flex items-center gap-2 text-xs text-slate-700">
                              <span className="min-w-0 flex-1 truncate">{t}</span>
                              <input type="number" placeholder={String(s.offset_days)}
                                value={s.variants[t] ?? ""}
                                onChange={(e) => setVariant(s.code, t, e.target.value)}
                                className="w-14 rounded border border-slate-300 px-1.5 py-1 text-center" />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="mt-4 px-1 text-xs text-slate-500">
        Changing an offset affects new orders only. Existing plan dates are never recalculated.
      </p>
    </div>
  );
}