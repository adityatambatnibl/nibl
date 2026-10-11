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
  const [f, setF] = useState({ drawing_no: "", item_code: "", description: "", rev_label: "0", change_note: "" });
  const [file, setFile] = useState<File | null>(null);
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
    if (!f.drawing_no.trim() || !f.item_code.trim() || !f.description.trim()) return setErr("Drawing no., item code and part description are all required.");
    if (!file) return setErr("Choose the PDF file.");
    if (!file.name.toLowerCase().endsWith(".pdf")) return setErr("Only controlled PDF copies can be uploaded — this file is not a .pdf.");
    if (!ids.length) return setErr("Choose at least one user to confirm the drawing. Add people to the Email List first.");
    const fd = new FormData();
    fd.append("file", file); fd.append("folder_id", folder);
    Object.entries(f).forEach(([k, v]) => fd.append(k, v.trim()));
    fd.append("reviewer_ids", ids.join(","));
    setBusy(true);
    try { const r = await dc.upload(fd); refresh(); nav(`/view/${r.id}`); }
    catch (e) { setErr(apiError(e, "Upload failed.")); }
    finally { setBusy(false); }
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

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
            <label className="block text-[12px] font-semibold text-ink-700">Drawing no.<input value={f.drawing_no} onChange={set("drawing_no")} maxLength={120} className={`${input} mt-1 font-mono`} /></label>
            <label className="block text-[12px] font-semibold text-ink-700">Item code<input value={f.item_code} onChange={set("item_code")} maxLength={120} className={`${input} mt-1 font-mono`} /></label>
            <label className="block text-[12px] font-semibold text-ink-700 md:col-span-2">Part description<input value={f.description} onChange={set("description")} maxLength={300} className={`${input} mt-1`} /></label>
            <label className="block text-[12px] font-semibold text-ink-700">Revision (as printed on the drawing)<input value={f.rev_label} onChange={set("rev_label")} maxLength={20} className={`${input} mt-1`} /></label>
            <label className="block text-[12px] font-semibold text-ink-700">Note (optional)<input value={f.change_note} onChange={set("change_note")} maxLength={500} placeholder="First issue" className={`${input} mt-1`} /></label>
          </div>
          <div>
            <p className="mb-1 text-[12px] font-semibold text-ink-700">Send for confirmation to <b>{ids.length}</b> user{ids.length === 1 ? "" : "s"}</p>
            <ReviewerPicker all={users} selected={ids} onChange={setIds} />
            <p className="mt-1 text-[11px] text-ink-400">Starts with everyone on the Email List. The drawing is approved only when all of them confirm.</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-divider pt-4">
            <button className={btn} onClick={() => nav("/")}>Cancel</button>
            <button className={btnPrimary} disabled={busy} onClick={submit}>{busy ? "Uploading…" : "Upload and send for confirmation"}</button>
          </div>
        </div>
      ) : (
        <div className={card}>
          <div className="border-b border-divider p-4">
            <p className="mb-2 text-[13px] text-ink-500">First select the drawing you want to revise.</p>
            <input value={rq} onChange={(e) => setRq(e.target.value)} placeholder="Search by item code, part description or drawing no." className={input} autoFocus />
          </div>
          <table className="w-full">
            <thead className="border-b border-line bg-brand-50/60"><tr><th className={th}>Drawing no.</th><th className={th}>Item code</th><th className={th}>Part description</th><th className={th}>Rev</th><th className={th}>Status</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-divider">
              {found.map((d) => (
                <tr key={d.id} className="hover:bg-hover">
                  <td className={`${td} font-mono font-semibold text-ink-900`}>{d.drawing_no}</td><td className={`${td} font-mono`}>{d.item_code}</td><td className={td}>{d.description}</td><td className={`${td} font-mono`}>{d.rev_label}</td><td className={td}><Pill s={d.status} /></td>
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
