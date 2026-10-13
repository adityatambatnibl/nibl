// Product tree: folders on the left (admin can add / rename / delete empty ones), drawings on the right.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiError } from "../apiClient";
import { dc, type DrawingRow, type Folder, type Page } from "../api";
import { useDc } from "../DrawingLayout";
import { btn, btnDanger, btnPrimary, btnSm, card, Empty, ErrorLine, fmtDate, input, nf, Pager, Pill, td, th, useDebounced, useFolderTree } from "../ui";

export default function Tree() {
  const nav = useNavigate();
  const { isAdmin } = useDc();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<null | { mode: "new" | "rename"; parent: string | null; name: string }>(null);
  const [del, setDel] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sub, setSub] = useState(true);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<DrawingRow> | null>(null);
  const dq = useDebounced(q);
  const t = useFolderTree(folders);

  const loadFolders = useCallback(() => dc.folders().then(setFolders).catch((e) => setErr(apiError(e))), []);
  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { setPage(1); }, [sel, dq, status, sub]);
  useEffect(() => {
    if (!sel) { setData(null); return; }
    dc.search({ folder_id: sel, include_sub: sub, q: dq, status, sort: "drawing_no", dir: "asc", page, size: 25 })
      .then(setData).catch((e) => setErr(apiError(e)));
  }, [sel, dq, status, sub, page]);

  function pick(id: string) {
    setSel(id); setEdit(null); setDel(false); setErr("");
    setOpenIds((s) => { const n = new Set(s); t.path(id).forEach((f) => n.add(f.id)); return n; });
  }
  function toggle(id: string) { setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  async function saveFolder() {
    if (!edit) return;
    try {
      if (edit.mode === "new") await dc.createFolder(edit.name, edit.parent);
      else if (sel) await dc.renameFolder(sel, edit.name);
      setEdit(null); await loadFolders();
    } catch (e) { setErr(apiError(e, "Could not save the folder.")); }
  }
  async function deleteFolder() {
    if (!sel) return;
    try { const parent = t.byId.get(sel)?.parent_id ?? null; await dc.deleteFolder(sel); setDel(false); setSel(parent); await loadFolders(); }
    catch (e) { setErr(apiError(e, "Could not delete the folder.")); setDel(false); }
  }

  const node = (f: Folder) => {
    const kids = t.kids.get(f.id) ?? [];
    const open = openIds.has(f.id);
    return (
      <div key={f.id}>
        <div className={`flex items-center rounded-md ${sel === f.id ? "bg-brand-50 text-brand-700" : "hover:bg-page"}`}>
          <button onClick={() => toggle(f.id)} className={`grid h-7 w-6 place-items-center text-ink-400 ${kids.length ? "" : "invisible"}`} aria-label={open ? "Collapse" : "Expand"}>
            <span style={{ transform: `rotate(${open ? 90 : 0}deg)` }} className="inline-block transition-transform">›</span>
          </button>
          <button onClick={() => pick(f.id)} className="flex flex-1 items-center justify-between gap-2 py-1.5 pr-2 text-left text-[13px] font-semibold">
            <span className="truncate">📁 {f.name}</span><span className="text-[11px] font-normal text-ink-400">{nf(t.total.get(f.id) ?? 0)}</span>
          </button>
        </div>
        {open && kids.length > 0 && <div className="ml-4 border-l border-divider pl-1">{kids.map(node)}</div>}
      </div>
    );
  };

  const cur = sel ? t.byId.get(sel) : undefined;
  const children = sel ? t.kids.get(sel) ?? [] : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <div className={`${card} self-start`}>
        <div className="flex items-center justify-between border-b border-divider px-4 py-3">
          <span className="text-[13px] font-bold text-ink-900">NIBL Drawings</span>
          {isAdmin && <button className={btnSm} onClick={() => { setEdit({ mode: "new", parent: null, name: "" }); setDel(false); }}>+ Top folder</button>}
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-2">{(t.kids.get(null) ?? []).map(node)}</div>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider px-4 py-3">
          <div>
            <div className="text-[11px] text-ink-400">{cur ? t.path(cur.id).slice(0, -1).map((f) => f.name).join(" › ") || "Top level" : ""}</div>
            <div className="text-[18px] font-bold text-ink-900">{cur ? cur.name : "Select a folder"} {cur && <span className="text-[12px] font-normal text-ink-400">{nf(t.total.get(cur.id) ?? 0)} drawings</span>}</div>
          </div>
          {isAdmin && cur && (
            <div className="flex flex-wrap gap-1.5">
              <button className={btnSm} onClick={() => { setEdit({ mode: "new", parent: cur.id, name: "" }); setDel(false); }}>+ Subfolder</button>
              <button className={btnSm} onClick={() => { setEdit({ mode: "rename", parent: cur.parent_id, name: cur.name }); setDel(false); }}>Rename</button>
              <button className={btnSm} onClick={() => { setDel(true); setEdit(null); }}>Delete</button>
              <button className={btnPrimary} onClick={() => nav(`/upload?folder=${cur.id}`)}>Upload drawing here</button>
            </div>
          )}
        </div>
        <div className="px-4 pt-3"><ErrorLine>{err}</ErrorLine></div>
        {edit && (
          <div className="mx-4 mb-3 rounded-lg border border-line bg-page p-3">
            <p className="mb-2 text-[13px] font-semibold text-ink-900">{edit.mode === "new" ? `New folder ${edit.parent ? `inside ${t.path(edit.parent).map((f) => f.name).join(" › ")}` : "at the top level"}` : `Rename “${cur?.name}”`}</p>
            <div className="flex flex-wrap gap-2">
              <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveFolder()} maxLength={60} placeholder="e.g. 22330 or Tapered Roller" className={`${input} flex-1`} />
              <button className={btnPrimary} onClick={saveFolder}>{edit.mode === "new" ? "Create folder" : "Save name"}</button>
              <button className={btn} onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        )}
        {del && cur && (
          <div className="mx-4 mb-3 rounded-lg border border-danger/25 bg-danger-bg p-3 text-[13px] text-danger">
            <b>Delete folder “{cur.name}”?</b> Only empty folders can be deleted. This is recorded in the audit history.
            <div className="mt-2 flex gap-2"><button className={btnDanger} onClick={deleteFolder}>Delete folder</button><button className={btn} onClick={() => setDel(false)}>Cancel</button></div>
          </div>
        )}
        {!cur ? (
          <Empty title="Pick a folder on the left">Open GBD, NBD or Outsourced and choose a folder. To find a known drawing, use search on the Drawings page.</Empty>
        ) : (
          <>
            {children.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 border-b border-divider px-4 pb-4">
                {children.map((k) => (
                  <button key={k.id} onClick={() => pick(k.id)} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5 text-left text-[13px] font-semibold hover:border-brand-200 hover:bg-brand-50">
                    <span className="truncate">📁 {k.name}</span><span className="text-[11px] font-normal text-ink-400">{nf(t.total.get(k.id) ?? 0)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by drawing name" className={`${input} max-w-sm`} />
              {["all", "approved", "under_review", "denied"].map((k) => (
                <button key={k} onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${status === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-700"}`}>{k === "all" ? "All" : k === "under_review" ? "Under review" : k === "approved" ? "Released" : k[0].toUpperCase() + k.slice(1)}</button>
              ))}
              {children.length > 0 && <label className="ml-auto flex items-center gap-2 text-[12px] text-ink-700"><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> Include subfolders</label>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-y border-line bg-brand-50/60"><tr><th className={th}>Drawing no.</th>{sub && <th className={th}>Folder</th>}<th className={th}>Rev</th><th className={th}>Status</th><th className={th}>Updated</th></tr></thead>
                <tbody className="divide-y divide-divider">
                  {data?.items.map((d) => (
                    <tr key={d.id} onClick={() => nav(`/view/${d.id}`)} className="cursor-pointer hover:bg-hover">
                      <td className={`${td} whitespace-nowrap font-mono font-semibold text-ink-900`}>{d.drawing_no}</td>
                      {sub && <td className={`${td} text-ink-400`}>{d.folder_path.split(" › ").slice(-1)[0]}</td>}
                      <td className={`${td} font-mono`}>{d.rev_label}</td><td className={td}><Pill s={d.status} /></td><td className={`${td} whitespace-nowrap`}>{fmtDate(d.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && data.items.length === 0 && <Empty title="No drawings here">{dq || status !== "all" ? "No drawings match the filter." : "This folder has no drawings yet."}</Empty>}
            </div>
            {data && data.total > 25 && <Pager page={page} size={25} total={data.total} onPage={setPage} />}
          </>
        )}
      </div>
    </div>
  );
}
