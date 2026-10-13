// Home: pending count → search → drawing list (10 / 50 / 100) with Open and Revise.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiError } from "../apiClient";
import { dc, type DrawingRow, type Folder, type Page } from "../api";
import { useDc } from "../DrawingLayout";
import ReviseModal from "../ReviseModal";
import { btnPrimarySm, btnSm, card, Empty, ErrorLine, field as fieldCls, fmtDate, input, nf, Pager, Pill, td, th, useDebounced } from "../ui";

const STATUSES = [["all", "All"], ["pending", "Needs attention"], ["under_review", "Under review"], ["denied", "Denied"], ["approved", "Released"]];

export default function Home() {
  const nav = useNavigate();
  const { isAdmin, counts, refresh } = useDc();
  const [q, setQ] = useState("");
  const field = "all";
  const [status, setStatus] = useState("all");
  const [division, setDivision] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [sort, setSort] = useState<[string, string]>(["updated", "desc"]);
  const [data, setData] = useState<Page<DrawingRow> | null>(null);
  const [tops, setTops] = useState<Folder[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [revise, setRevise] = useState<string | null>(null);
  const dq = useDebounced(q);

  useEffect(() => { dc.folders().then((f) => setTops(f.filter((x) => !x.parent_id))).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [dq, field, status, division, size, sort]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    dc.search({ q: dq, field, status, folder_id: division || undefined, sort: sort[0], dir: sort[1], page, size })
      .then((r) => { if (live) { setData(r); setErr(""); } })
      .catch((e) => live && setErr(apiError(e, "Could not load drawings.")))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [dq, field, status, division, page, size, sort]);

  const tile = (key: string, n: number | undefined, label: string, color: string) => (
    <button onClick={() => setStatus(key)} aria-pressed={status === key}
      className={`rounded-xl border bg-white px-4 py-3 text-left transition hover:border-brand-200 ${status === key ? "border-brand-300 ring-2 ring-brand-100" : "border-line"}`}>
      <span className={`block text-[26px] font-bold leading-none ${color}`}>{nf(n ?? 0)}</span>
      <span className="mt-1 block text-[12px] text-ink-500">{label}</span>
    </button>
  );
  const sortBtn = (k: string, label: string) => (
    <button onClick={() => setSort(([s, d]) => [k, s === k && d === "asc" ? "desc" : "asc"])} className="inline-flex items-center gap-1 uppercase hover:text-brand-600">
      {label}{sort[0] === k ? (sort[1] === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <div>
      <div className="mb-5 grid gap-3 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <button onClick={() => setStatus("pending")} aria-pressed={status === "pending"}
          className={`rounded-xl px-5 py-4 text-left text-white shadow-card transition hover:brightness-110 ${status === "pending" ? "ring-4 ring-brand-200" : ""}`}
          style={{ background: "linear-gradient(135deg,#C51818,#8F0B0B)" }}>
          <span className="block text-[10px] font-bold uppercase tracking-[1.4px] text-white/80">Needs attention</span>
          <span className="mt-1 block text-[38px] font-extrabold leading-none">{nf(counts?.pending ?? 0)}</span>
          <span className="mt-1 block text-[12px] text-white/85">denied drawings waiting for the admin's decision</span>
        </button>
        {tile("under_review", counts?.under_review, "Under review", "text-info")}
        {tile("denied", counts?.denied, "Denied — needs revision", "text-danger")}
        {tile("mine", counts?.mine, "Waiting for you", "text-alert")}
        {tile("approved", counts?.approved, "Released", "text-ok")}
      </div>

      <div className={card}>
        <div className="flex flex-wrap gap-2 border-b border-divider p-4">
          <div className="relative min-w-[260px] flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} className={`${input} pl-9`} autoComplete="off" aria-label="Search drawings"
              placeholder="Search by drawing name" />
          </div>
          <select value={division} onChange={(e) => setDivision(e.target.value)} className={fieldCls} aria-label="Division">
            <option value="">All divisions</option>
            {tops.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-divider px-4 py-2.5">
          {[...STATUSES, ...(isAdmin ? [["deleted", `Deleted${counts?.deleted ? ` (${counts.deleted})` : ""}`]] : [])].map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} aria-pressed={status === k}
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${status === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-700 hover:border-brand-200"}`}>{l}</button>
          ))}
          {status === "mine" && <span className="rounded-full border border-alert/30 bg-alert-bg px-3 py-1 text-[12px] font-semibold text-alert">Waiting for you</span>}
        </div>
        <div className="p-4 pb-0"><ErrorLine>{err}</ErrorLine></div>
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[960px]">
            <thead className="border-b border-line bg-brand-50/60">
              <tr>
                <th className={th}>{sortBtn("drawing_no", "Drawing no.")}</th>
                <th className={th}>Folder</th>
                <th className={th}>Rev</th>
                <th className={th}>{sortBtn("status", "Status")}</th>
                <th className={th}>{sortBtn("updated", "Updated")}</th>
                <th className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {data?.items.map((d) => (
                <tr key={d.id} className="hover:bg-hover">
                  <td className={`${td} font-mono font-semibold text-ink-900`}>{d.drawing_no}{d.awaiting_me && <span className="ml-2 rounded bg-alert-bg px-1.5 py-0.5 font-sans text-[10px] font-bold text-alert">YOUR REVIEW</span>}</td>
                  <td className={`${td} text-ink-400`}>{d.folder_path}</td>
                  <td className={`${td} font-mono`}>{d.rev_label}</td>
                  <td className={td}><Pill s={d.status} /></td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(d.updated_at)}</td>
                  <td className={`${td} text-right`}>
                    <div className="flex justify-end gap-1.5">
                      <button className={btnSm} onClick={() => nav(`/view/${d.id}`)}>Open</button>
                      {isAdmin && status !== "deleted" && <button className={btnPrimarySm} onClick={() => setRevise(d.id)}>Revise</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && (
            <Empty title={counts?.total ? "No drawings match" : "No drawings yet"}>
              {counts?.total ? "Check the spelling, change “Search in”, or clear the filters." : isAdmin ? "Use Upload Drawing to add the first controlled PDF." : "Drawings appear here once the drawing admin uploads them."}
            </Empty>
          )}
        </div>
        {data && <Pager page={page} size={size} total={data.total} onPage={setPage} onSize={setSize} />}
      </div>

      {revise && <ReviseModal drawingId={revise} onClose={() => setRevise(null)} onDone={() => { setRevise(null); refresh(); setSort((s) => [...s] as [string, string]); }} />}
    </div>
  );
}
