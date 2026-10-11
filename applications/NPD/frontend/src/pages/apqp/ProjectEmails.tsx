// Change who gets one project's emails (set first on "Create new timeline").
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { recipientApi, type ProjectRecipients, type Recipients } from "../../services/recipientApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Loading } from "../../components/Loading";
import { RecipientsEditor } from "../../components/RecipientsEditor";
import { seg } from "../../utils/links";

export default function ProjectEmails() {
  // Opened from APQP (/apqp/:projectId/emails) or from Tracking (/orders/:orderNo/emails).
  // From Tracking only the stage owners are shown, from APQP only the departments.
  const { projectId: pid, orderNo } = useParams();
  const fromTracking = !!orderNo;
  const projectId = (fromTracking ? orderNo : pid) ?? "";
  const { data: options, error: optErr } = useFetch(() => recipientApi.options(), [], { key: "recipient-options" });
  const { data: current, error: curErr, setData } = useFetch(() => recipientApi.get(projectId), [projectId], { key: `recipients:${projectId}` });
  const [value, setValue] = useState<Recipients | null>(null);
  const [synced, setSynced] = useState<ProjectRecipients | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  if (current && current !== synced) {
    setSynced(current);
    setValue({ stage_owners: current.stage_owners, dept_owners: current.dept_owners });
  }
  const dirty = !!current && !!value && JSON.stringify(value) !== JSON.stringify({ stage_owners: current.stage_owners, dept_owners: current.dept_owners });

  async function save() {
    if (!value) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const fresh = await recipientApi.save(projectId, value);
      setData(fresh);
      setMsg(`Saved. New emails for this ${fromTracking ? "order" : "project"} go to these people.`);
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (optErr || curErr) return <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optErr || curErr}</div>;
  if (!options || !current || !value) return <Loading />;

  return (
    <div className="pb-10">
      <Link to={`/${fromTracking ? "orders" : "apqp"}/${seg(projectId)}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to the {fromTracking ? "order" : "project"}
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{fromTracking ? "Tracking email recipients" : "Email recipients"}</h1>
          <p className="mt-1 text-sm text-ink-500">
            Who gets the emails of <b>{current.order_no ?? current.project_id}</b>.
            {!current.own_list && " This project still uses the shared list from Email Settings - saving gives it its own."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-green-700">{msg}</span>}
          <button onClick={save} disabled={!dirty || busy}
            className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40">
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {err && <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="mt-4 rounded-xl border border-line bg-white p-5">
        <RecipientsEditor options={options} value={value} projectKey={projectId} only={fromTracking ? "tracking" : "apqp"} onChange={(v) => { setValue(v); setMsg(""); }} />
      </div>
    </div>
  );
}
