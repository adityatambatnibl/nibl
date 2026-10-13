// Upload: new drawing, or revise an existing one (select the drawing first).
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiError } from "../apiClient";
import { dc, type DcUser, type DrawingRow, type Folder } from "../api";
import { AdminOnly, useDc } from "../DrawingLayout";
import ReviseModal from "../ReviseModal";
import { btn, btnPrimary, btnPrimarySm, card, ErrorLine, FolderSelect, input, PageHead, Pill, ReviewerPicker, td, th, useDebounced } from "../ui";

function UploadInner() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { refresh } = useDc();
  const [tab, setTab] = useState<"new" | "revise">("new");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [users, setUsers] = useState<DcUser[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [folder, setFolder] = useState(params.get("folder") ?? "");
  const [file, setFile] = useState<File | null>(null);
  const name = file ? file.name.replace(/\.pdf$/i, "").trim() : "";
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // revise tab
  const [rq, setRq] = useState("");
  const drq = useDebounced(rq);
  const [found, setFound] = useState<DrawingRow[]>([]);
  const [revise, setRevise] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([dc.folders(), dc.users(), dc.emailList()])
      .then(([fo, u, list]) => { setFolders(fo); setUsers(u.filter((x) => x.is_active)); setIds(list.map((x) => x.id)); })
      .catch((e) => setErr(apiError(e)));
  }, []);
  useEffect(() => {
    if (tab !== "revise") return;
    dc.search({ q: drq, size: 10, sort: drq ? "drawing_no" : "updated", dir: drq ? "asc" : "desc" }).then((r) => setFound(r.items)).catch(() => {});
  }, [drq, tab]);

  async function submit() {
    setErr("");
    if (!folder) return setErr("Choose the folder for this drawing.");
    if (!file) return setErr("Choose the PDF file.");
    if (!file.name.toLowerCase().endsWith(".pdf")) return setErr("Only controlled PDF copies can be uploaded — this file is not a .pdf.");
    if (!name) return setErr("The PDF file name is empty.");
    if (!ids.length) return setErr("Choose at least one person to confirm the drawing.");
    const fd = new FormData();
    fd.append("file", file); fd.append("folder_id", folder); fd.append("reviewer_ids", ids.join(","));
    setBusy(true);
    try { const r = await dc.upload(fd); refresh(); nav(`/view/${r.id}`); }
    catch (e) { setErr(apiError(e, "Upload failed.")); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHead title="Upload Drawing" sub="Controlled PDF copies only — any other format is rejected" />
      <div className="mb-4 inline-flex rounded-lg border border-line bg-white p-1">
        {(["new", "revise"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-4 py-1.5 text-[13px] font-semibold ${tab === k ? "bg-brand-600 text-white" : "text-ink-700"}`}>{k === "new" ? "New drawing" : "Revise existing drawing"}</button>
        ))}
      </div>
      <ErrorLine>{err}</ErrorLine>
      {tab === "new" ? (
        <div className={`${card} space-y-4 p-5`}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-[12px] font-semibold text-ink-700">Folder<div className="mt-1"><FolderSelect folders={folders} value={folder} onChange={setFolder} /></div></label>
            <label className="block text-[12px] font-semibold text-ink-700">PDF file (controlled copy)<input type="file" accept=".pdf,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${input} mt-1`} /></label>
          </div>
          <div className="rounded-lg border border-line bg-page px-3 py-2 text-[13px] text-ink-700">
            Drawing name: <b className="font-mono">{name || "— taken from the PDF file name —"}</b>
            <span className="text-ink-400"> · Revision 1 · released at once</span>
          </div>
          <div>
            <p className="mb-1 text-[12px] font-semibold text-ink-700">Mail for confirmation to <b>{ids.length}</b> person{ids.length === 1 ? "" : "s"}</p>
            <ReviewerPicker all={users} selected={ids} onChange={setIds} />
            <p className="mt-1 text-[11px] text-ink-400">Starts with everyone on the Email List. They confirm, or deny with a reason; reminders stop once they answer.</p>
          </div>
          <p className="text-[11px] text-ink-400">
            Already-approved drawings can also be copied straight into the <b>data\inbox</b> folder on the server
            (sub-folders = product tree). They appear here, approved, the next time the drawing list is refreshed.
          </p>
          <div className="flex justify-end gap-2 border-t border-divider pt-4">
            <button className={btn} onClick={() => nav("/")}>Cancel</button>
            <button className={btnPrimary} disabled={busy} onClick={submit}>{busy ? "Uploading…" : "Upload and mail for confirmation"}</button>
          </div>
        </div>
      ) : (
        <div className={card}>
          <div className="border-b border-divider p-4">
            <p className="mb-2 text-[13px] text-ink-500">First select the drawing you want to revise.</p>
            <input value={rq} onChange={(e) => setRq(e.target.value)} placeholder="Search by drawing name" className={input} autoFocus />
          </div>
          <table className="w-full">
            <thead className="border-b border-line bg-brand-50/60"><tr><th className={th}>Drawing</th><th className={th}>Rev</th><th className={th}>Status</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-divider">
              {found.map((d) => (
                <tr key={d.id} className="hover:bg-hover">
                  <td className={`${td} font-mono font-semibold text-ink-900`}>{d.drawing_no}</td><td className={`${td} font-mono`}>{d.rev_label}</td><td className={td}><Pill s={d.status} /></td>
                  <td className={`${td} text-right`}><button className={btnPrimarySm} onClick={() => setRevise(d.id)}>Revise</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {found.length === 0 && <p className="p-6 text-center text-sm text-ink-500">No drawings match.</p>}
        </div>
      )}
      {revise && <ReviseModal drawingId={revise} onClose={() => setRevise(null)} onDone={() => { const id = revise; setRevise(null); refresh(); nav(`/view/${id}`); }} />}
    </div>
  );
}

export default function Upload() { return <AdminOnly><UploadInner /></AdminOnly>; }
