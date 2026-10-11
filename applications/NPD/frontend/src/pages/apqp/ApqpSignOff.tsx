import { useState } from "react";
import { apqpApi } from "../../services/apqpApi";
import { apiError } from "../../services/api";
import type { ApqpSignOff as SignOff } from "../../types";

const SLOTS = Array.from({ length: 12 }, (_, i) => String(i + 1));

export function ApqpSignOffSection({
  projectId,
  initial,
  canEdit,
}: {
  projectId: string;
  initial: SignOff;
  canEdit: boolean;
}) {
  const [team, setTeam] = useState<Record<string, string>>(initial.team ?? {});
  const [prepared, setPrepared] = useState(initial.prepared_by ?? "");
  const [reviewed, setReviewed] = useState(initial.reviewed_by ?? "");
  const [approved, setApproved] = useState(initial.approved_by ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  function setMember(slot: string, value: string) {
    setTeam((t) => ({ ...t, [slot]: value }));
    setSaved("");
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apqpApi.updateSignOff(projectId, {
        team: Object.fromEntries(Object.entries(team).filter(([, v]) => v.trim())),
        prepared_by: prepared || null,
        reviewed_by: reviewed || null,
        approved_by: approved || null,
      });
      setSaved("Sign-off saved.");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-600";

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-2 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Gantt Chart Acceptance &amp; Team Sign-Off
        </h2>
        {canEdit && (
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-green-700">{saved}</span>}
            <button onClick={save} disabled={busy}
              className="rounded bg-brand-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40">
              {busy ? "Saving..." : "Save sign-off"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
          {SLOTS.map((slot) => (
            <div key={slot} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-baseline gap-2 sm:contents">
                <span className="w-6 shrink-0 text-xs font-medium text-slate-500">{slot}.</span>
                <span className="text-xs text-slate-600 sm:w-40 sm:shrink-0">
                  {slot === "1" ? "APQP Team Leader" : "Team Member"}
                </span>
              </div>
              <input value={team[slot] ?? ""} disabled={!canEdit}
                onChange={(e) => setMember(slot, e.target.value)}
                placeholder="Name & sign"
                aria-label={`Team member ${slot}`}
                className={input} />
            </div>
          ))}
        </div>

        <h3 className="mt-6 mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Approvals</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["Prepared By", prepared, setPrepared],
            ["Reviewed By", reviewed, setReviewed],
            ["Approved By", approved, setApproved],
          ] as const).map(([label, value, setter]) => (
            <div key={label}>
              <label className="block text-xs font-medium text-slate-600">{label}</label>
              <input value={value} disabled={!canEdit}
                onChange={(e) => setter(e.target.value)}
                className={`mt-1 ${input}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}