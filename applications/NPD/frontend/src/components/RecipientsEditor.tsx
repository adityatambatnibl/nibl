// Who gets this project's emails: one row per APQP department and per Tracking stage.
import { useState } from "react";
import { recipientApi, type RecipientOptions, type RecipientPreview, type Recipients } from "../services/recipientApi";
import { apiError } from "../services/api";
import { EmailPicker } from "./EmailPicker";
import { RecipientPreviewDialog } from "./RecipientPreviewDialog";

export function RecipientsEditor({
  options, value, onChange, projectKey = null, only = null, layout = "rows",
}: {
  options: RecipientOptions;
  value: Recipients;
  onChange: (v: Recipients) => void;
  projectKey?: string | null;     // null on Create new timeline -> example data
  only?: "tracking" | "apqp" | null;   // show just one section (Tracking page shows stages only)
  layout?: "rows" | "cards";           // "cards": small card per department / stage (Create new project)
}) {
  const [stagesOpen, setStagesOpen] = useState(only === "tracking");
  const [pv, setPv] = useState<{ title: string; data: RecipientPreview } | null>(null);
  const [pvBusy, setPvBusy] = useState("");
  const [pvErr, setPvErr] = useState("");

  async function preview(kind: "stage" | "dept", code: string, title: string, emails: string[]) {
    setPvBusy(`${kind}:${code}`); setPvErr("");
    try {
      setPv({ title, data: await recipientApi.preview({ project: projectKey, kind, code, emails }) });
    } catch (e) {
      setPvErr(apiError(e));
    } finally {
      setPvBusy("");
    }
  }
  const pvBtn = (kind: "stage" | "dept", code: string, title: string, emails: string[]) => (
    <button type="button" onClick={() => preview(kind, code, title, emails)} disabled={pvBusy !== ""}
      title="See the emails these people would get"
      className="mt-1 shrink-0 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
      {pvBusy === `${kind}:${code}` ? "…" : "Preview"}
    </button>
  );
  const setDept = (d: string, emails: string[]) => onChange({ ...value, dept_owners: { ...value.dept_owners, [d]: emails } });
  const setStage = (c: string, emails: string[]) => onChange({ ...value, stage_owners: { ...value.stage_owners, [c]: emails } });
  const deptSet = options.departments.filter((d) => (value.dept_owners[d] ?? []).length).length;
  const stageSet = options.stages.filter((s) => (value.stage_owners[s.code] ?? []).length).length;
  const [allStages, setAllStages] = useState(false);

  if (layout === "cards") {
    const card = (key: string, title: string, code: string | null, emails: string[], set: (v: string[]) => void, kind: "stage" | "dept") => {
      const pk = kind === "stage" ? key : title;
      return (
        <div key={key} className={`flex h-full flex-col rounded-lg border bg-white ${emails.length ? "border-slate-200" : "border-dashed border-slate-300"}`}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <div className="min-w-0">
              {code && <span className="mr-1.5 font-mono text-[11px] font-semibold text-slate-400">{code}</span>}
              <span className="text-[13.5px] font-semibold text-ink-900">{title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${emails.length ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                {emails.length ? `${emails.length} ${emails.length === 1 ? "person" : "people"}` : "Nobody"}
              </span>
              <button type="button" onClick={() => preview(kind, pk, title, emails)} disabled={pvBusy !== ""}
                title="See the emails these people would get"
                className="rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40">
                {pvBusy === `${kind}:${pk}` ? "…" : "Preview"}
              </button>
            </div>
          </div>
          <div className="flex-1 px-3.5 py-3">
            <EmailPicker variant="card" value={emails} users={options.users} onChange={set} />
          </div>
        </div>
      );
    };
    const stages = allStages ? options.stages : options.stages.slice(0, 6);
    const head = (t: string, sub: string, n: string) => (
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink-900">{t}</h3>
          <p className="text-xs text-ink-500">{sub}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">{n}</span>
      </div>
    );
    return (
      <div className="space-y-7">
        {pvErr && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pvErr}</p>}
        {pv && <RecipientPreviewDialog title={pv.title} data={pv.data} onClose={() => setPv(null)} />}
        {only !== "tracking" && (
          <div>
            {head("APQP Timeline - departments", "Activity handoffs and the daily overdue reminder", `${deptSet} of ${options.departments.length} set`)}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {options.departments.map((d) => card(d, d, null, value.dept_owners[d] ?? [], (v) => setDept(d, v), "dept"))}
            </div>
          </div>
        )}
        {only !== "apqp" && (
          <div className={only !== "tracking" ? "border-t border-slate-200 pt-6" : ""}>
            {head("Tracking - stage owners", "\"Stage complete - next can start\" and the daily overdue reminder", `${stageSet} of ${options.stages.length} set`)}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {stages.map((st) => card(st.code, st.name, st.code, value.stage_owners[st.code] ?? [], (v) => setStage(st.code, v), "stage"))}
            </div>
            {options.stages.length > 6 && (
              <button type="button" onClick={() => setAllStages((o) => !o)} className="mt-3 text-sm font-semibold text-brand-600 hover:underline">
                {allStages ? "Show fewer ▴" : `Show all ${options.stages.length} stages ▾`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const row = "grid grid-cols-1 items-start gap-2 border-b border-slate-100 px-4 py-2.5 last:border-0 sm:grid-cols-[220px_1fr_auto]";

  return (
    <div className="space-y-4">
      {pvErr && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pvErr}</p>}
      {pv && <RecipientPreviewDialog title={pv.title} data={pv.data} onClose={() => setPv(null)} />}
      {only !== "tracking" && (
      <section className="overflow-hidden rounded-lg border border-slate-200">
        <div className="flex items-baseline justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">APQP Timeline - departments</h3>
            <p className="text-[11px] text-slate-500">Activity handoffs and the daily overdue reminder go to these people.</p>
          </div>
          <span className="text-[11px] text-slate-500">{deptSet} of {options.departments.length} set</span>
        </div>
        {options.departments.map((d) => (
          <div key={d} className={row}>
            <span className="pt-2 text-sm font-medium text-slate-800">{d}</span>
            <EmailPicker users={options.users} value={value.dept_owners[d] ?? []} onChange={(v) => setDept(d, v)} />
            {pvBtn("dept", d, d, value.dept_owners[d] ?? [])}
          </div>
        ))}
      </section>
      )}

      {only !== "apqp" && (
      <section className="overflow-hidden rounded-lg border border-slate-200">
        <button type="button" onClick={() => setStagesOpen((o) => !o)}
          className="flex w-full items-baseline justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Tracking - stage owners {stagesOpen ? "▾" : "▸"}</h3>
            <p className="text-[11px] text-slate-500">"Stage complete - next can start" and the daily overdue reminder go to these people.</p>
          </div>
          <span className="text-[11px] text-slate-500">{stageSet} of {options.stages.length} set</span>
        </button>
        {stagesOpen && options.stages.map((s) => (
          <div key={s.code} className={row}>
            <span className="pt-2 text-sm text-slate-800" title={s.name}>
              <b className="mr-1.5 font-mono text-[12px] text-slate-500">{s.code}</b>{s.name}
            </span>
            <EmailPicker users={options.users} value={value.stage_owners[s.code] ?? []} onChange={(v) => setStage(s.code, v)} />
            {pvBtn("stage", s.code, `${s.code} ${s.name}`, value.stage_owners[s.code] ?? [])}
          </div>
        ))}
      </section>
      )}
    </div>
  );
}
