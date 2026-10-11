// Drawing admin pages: Users & Email List, Approval Records, Locked Versions, Download Log, Audit History.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiError } from "../apiClient";
import { dc, type AccessRow, type AuditRow, type DcUser, type Page, type RecordRow } from "../api";
import { AdminOnly } from "../DrawingLayout";
import { card, Empty, ErrorLine, field, fmtDate, input, Pager, PageHead, Pill, td, th, useDebounced } from "../ui";
import { DateInput } from "../components/DateInput";

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition ${on ? "bg-brand-600" : "bg-slate-300"} disabled:opacity-40`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function UsersInner() {
  const [rows, setRows] = useState<DcUser[]>([]);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"pending" | "approved" | "rejected" | "list" | "all">("all");
  const [err, setErr] = useState("");
  useEffect(() => { dc.users().then(setRows).catch((e) => setErr(apiError(e))); }, []);
  const put = (u: DcUser) => setRows((rs) => rs.map((r) => (r.id === u.id ? u : r)));
  const act = (p: Promise<DcUser>) => { setErr(""); p.then(put).catch((e) => setErr(apiError(e, "Could not save."))); };
  const term = q.trim().toLowerCase();
  const shown = rows.filter((u) => (!term || `${u.name} ${u.email} ${u.employee_code ?? ""} ${u.department ?? ""}`.toLowerCase().includes(term))
    && (only === "all" || (only === "list" ? u.on_email_list : u.status === only)));
  const listCount = rows.filter((u) => u.on_email_list && u.is_active).length;
  const pendingCount = rows.filter((u) => u.status === "pending").length;
  const tabs: [typeof only, string][] = [["all", "All users"], ["pending", `Waiting for approval (${pendingCount})`], ["approved", "Approved"], ["rejected", "Rejected"], ["list", "On Email List"]];
  return (
    <div>
      <PageHead title="Users & Approvals" sub={`New NIBL portal registrations arrive here as pending. Approve who may use AI Drawing Control. Everyone on the Email List (${listCount}) is asked to confirm each new drawing.`} />
      <ErrorLine>{err}</ErrorLine>
      <div className={card}>
        <div className="flex flex-wrap gap-2 border-b border-divider p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, employee code or department" className={`${input} max-w-sm`} />
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setOnly(k)} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${only === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-700"}`}>{l}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-line bg-brand-50/60"><tr><th className={th}>Name</th><th className={th}>Department</th><th className={th}>Access</th><th className={th}>Drawing admin</th><th className={th}>On Email List</th></tr></thead>
            <tbody className="divide-y divide-divider">
              {shown.map((u) => (
                <tr key={u.id} className={u.is_active ? "" : "opacity-50"}>
                  <td className={td}><b className="text-ink-900">{u.name}</b><div className="text-[11px] text-ink-400">{u.email}{u.employee_code ? ` · ${u.employee_code}` : ""}{u.is_active ? "" : " · inactive"}</div></td>
                  <td className={td}>{u.department ?? "—"}</td>
                  <td className={td}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill s={u.status === "approved" ? "approved" : u.status === "rejected" ? "denied" : "pending"} />
                      {u.status !== "approved" && <button className="rounded-md bg-brand-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-brand-700" onClick={() => act(dc.setStatus(u.id, "approved"))}>Approve</button>}
                      {u.status !== "rejected" && <button className="rounded-md border border-line bg-white px-2.5 py-1 text-[12px] font-semibold text-ink-700 hover:border-danger/40 hover:text-danger" onClick={() => act(dc.setStatus(u.id, "rejected"))}>Reject</button>}
                    </div>
                  </td>
                  <td className={td}><Toggle label="Drawing admin" on={u.role === "admin"} disabled={u.status !== "approved"} onChange={(v) => act(dc.setRole(u.id, v ? "admin" : "user"))} /></td>
                  <td className={td}><Toggle label="On Email List" on={u.on_email_list} disabled={u.status !== "approved" || !u.is_active} onChange={(v) => act(dc.setOnList(u.id, v))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <Empty title="No users match" />}
        </div>
      </div>
      <p className="mt-3 text-[12px] text-ink-400">People register once on the NIBL portal. Approval here only affects AI Drawing Control.</p>
    </div>
  );
}

function usePaged<T>(fetcher: (p: Record<string, unknown>) => Promise<Page<T>>, extra: Record<string, unknown>) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<T> | null>(null);
  const [err, setErr] = useState("");
  const key = JSON.stringify(extra);
  useEffect(() => { setPage(1); }, [key]);
  useEffect(() => { fetcher({ ...extra, page, size: 25 }).then(setData).catch((e) => setErr(apiError(e))); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);
  return { page, setPage, data, err };
}

function RecordsTable({ rows, locked }: { rows: RecordRow[]; locked?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px]">
        <thead className="border-b border-line bg-brand-50/60"><tr>
          <th className={th}>Drawing no.</th><th className={th}>Rev</th><th className={th}>Part description</th><th className={th}>Uploaded</th>
          <th className={th}>{locked ? "Locked" : "Status"}</th><th className={th}>Responses</th>
        </tr></thead>
        <tbody className="divide-y divide-divider">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className={td}><Link to={`/view/${r.drawing_id}`} className="font-mono font-semibold text-ink-900 hover:text-brand-600">{r.drawing_no}</Link><div className="text-[11px] text-ink-400">{r.folder_path}</div></td>
              <td className={`${td} font-mono`}>{r.rev_label}</td>
              <td className={td}>{r.description}<div className="text-[11px] text-ink-400">{r.change_note}</div></td>
              <td className={`${td} whitespace-nowrap`}>{fmtDate(r.uploaded_at, true)}<div className="text-[11px] text-ink-400">{r.uploaded_by_name}</div></td>
              <td className={td}>{locked ? <>{fmtDate(r.locked_at, true)}<div className="text-[11px] text-ink-400">by {r.locked_by_name} · was <Pill s={r.review_status} /></div></> : <><Pill s={r.review_status} />{r.decided_at && <div className="mt-1 text-[11px] text-ink-400">{fmtDate(r.decided_at, true)}</div>}</>}</td>
              <td className={td}>
                <div className="space-y-0.5 text-[12px]">
                  {r.reviews?.map((v) => (
                    <div key={v.user_id}><b className="text-ink-900">{v.user_name}</b> — <span className={v.decision === "confirmed" ? "text-ok" : v.decision === "denied" ? "text-danger" : "text-ink-400"}>{v.decision === "cancelled" ? "not needed" : v.decision}</span>
                      {v.decided_at && <span className="text-ink-400"> · {fmtDate(v.decided_at, true)}</span>}{v.reason && <span className="text-danger"> · “{v.reason}”</span>}</div>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <Empty title="Nothing to show" />}
    </div>
  );
}

function RecordsInner({ locked }: { locked?: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const dq = useDebounced(q);
  const { page, setPage, data, err } = usePaged(locked ? dc.locked : dc.records, locked ? { q: dq } : { q: dq, status });
  return (
    <div>
      <PageHead title={locked ? "Locked Versions" : "Approval Records"} sub={locked ? "Superseded revisions — kept for the record, visible to the drawing admin only" : "Who confirmed or denied each current revision, and when"} />
      <ErrorLine>{err}</ErrorLine>
      <div className={card}>
        <div className="flex flex-wrap gap-2 border-b border-divider p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drawing no., item code or description" className={`${input} max-w-sm`} />
          {!locked && ["all", "under_review", "approved", "denied"].map((k) => (
            <button key={k} onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${status === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-700"}`}>{k === "all" ? "All" : k === "under_review" ? "Under review" : k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
        {data && <RecordsTable rows={data.items} locked={locked} />}
        {data && <Pager page={page} size={25} total={data.total} onPage={setPage} />}
      </div>
    </div>
  );
}

function DownloadsInner() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const dq = useDebounced(q);
  const { page, setPage, data, err } = usePaged<AccessRow>(dc.downloads, { q: dq, action: action || undefined, from: from || undefined, to: to || undefined });
  return (
    <div>
      <PageHead title="Download Log" sub="Every on-screen view and every download, by user, drawing and date" />
      <ErrorLine>{err}</ErrorLine>
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2 border-b border-divider p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="User or drawing no." className={`${input} max-w-xs`} />
          <select value={action} onChange={(e) => setAction(e.target.value)} className={field}><option value="">Views and downloads</option><option value="view">Views only</option><option value="download">Downloads only</option></select>
          <label className="text-[12px] text-ink-500">From <DateInput value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
          <label className="text-[12px] text-ink-500">To <DateInput value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line bg-brand-50/60"><tr><th className={th}>When</th><th className={th}>User</th><th className={th}>Drawing no.</th><th className={th}>Rev</th><th className={th}>Action</th><th className={th}>Computer</th></tr></thead>
            <tbody className="divide-y divide-divider">
              {data?.items.map((r) => (
                <tr key={r.id}><td className={`${td} whitespace-nowrap`}>{fmtDate(r.at, true)}</td><td className={td}>{r.user_name}</td>
                  <td className={td}><Link to={`/view/${r.drawing_id}`} className="font-mono font-semibold text-ink-900 hover:text-brand-600">{r.drawing_no}</Link></td>
                  <td className={`${td} font-mono`}>{r.rev_label}</td><td className={td}>{r.action === "download" ? <b className="text-brand-700">Download</b> : "Viewed"}</td><td className={`${td} text-ink-400`}>{r.ip ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && <Empty title="No entries" />}
        </div>
        {data && <Pager page={page} size={25} total={data.total} onPage={setPage} />}
      </div>
    </div>
  );
}

const ACTION: Record<string, string> = {
  dc_folder_created: "Created folder", dc_folder_renamed: "Renamed folder", dc_folder_deleted: "Deleted folder",
  dc_drawing_uploaded: "Uploaded drawing", dc_drawing_revised: "Revised drawing", dc_drawing_edited: "Edited drawing details",
  dc_drawing_deleted: "Deleted drawing", dc_drawing_imported: "Imported drawing", dc_drawing_restored: "Restored drawing",
  dc_drawing_confirmed: "Confirmed", dc_drawing_denied: "Denied", dc_drawing_approved: "Drawing approved",
  dc_reminder_sent: "Sent reminder", dc_email_list_added: "Added to Email List", dc_email_list_removed: "Removed from Email List",
  dc_access_changed: "Changed drawing access",
};

function AuditInner() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const { page, setPage, data, err } = usePaged<AuditRow>(dc.audit, { q: dq });
  return (
    <div>
      <PageHead title="Audit History" sub="Permanent record of every upload, revision, decision and setting change" />
      <ErrorLine>{err}</ErrorLine>
      <div className={card}>
        <div className="border-b border-divider p-4"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search person, drawing or note" className={`${input} max-w-sm`} /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line bg-brand-50/60"><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>What</th><th className={th}>On</th><th className={th}>Note</th></tr></thead>
            <tbody className="divide-y divide-divider">
              {data?.items.map((a) => (
                <tr key={a.id}><td className={`${td} whitespace-nowrap`}>{fmtDate(a.created_at, true)}</td><td className={td}>{a.actor_name}</td>
                  <td className={`${td} font-semibold text-ink-900`}>{ACTION[a.action] ?? a.action}</td>
                  <td className={td}>{a.target_type === "drawing" && a.target_id ? <Link to={`/view/${a.target_id}`} className="font-mono hover:text-brand-600">{a.target_label}</Link> : a.target_label}</td>
                  <td className={`${td} text-ink-500`}>{a.note ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && <Empty title="No entries yet" />}
        </div>
        {data && <Pager page={page} size={25} total={data.total} onPage={setPage} />}
      </div>
    </div>
  );
}

export const UsersPage = () => <AdminOnly><UsersInner /></AdminOnly>;
export const RecordsPage = () => <AdminOnly><RecordsInner /></AdminOnly>;
export const LockedPage = () => <AdminOnly><RecordsInner locked /></AdminOnly>;
export const DownloadsPage = () => <AdminOnly><DownloadsInner /></AdminOnly>;
export const AuditPage = () => <AdminOnly><AuditInner /></AdminOnly>;
