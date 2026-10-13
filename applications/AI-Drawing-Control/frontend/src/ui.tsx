// Small shared pieces for Drawing Control screens (NPD look: Tailwind + brand tokens).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DcUser, DStatus, Folder } from "./api";

export const nf = (n: number) => n.toLocaleString("en-IN");

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(v?: string | null, time = false) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const s = `${String(d.getDate()).padStart(2, "0")}-${MON[d.getMonth()]}-${d.getFullYear()}`;
  return time ? `${s} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : s;
}

const PILL: Record<string, [string, string]> = {
  deleted: ["Deleted", "bg-page text-ink-500 border-line line-through"],
  under_review: ["Under review", "bg-info-bg text-info border-info/25"],
  approved: ["Released", "bg-ok-bg text-ok border-ok/25"],
  denied: ["Denied", "bg-danger-bg text-danger border-danger/25"],
  locked: ["Locked", "bg-page text-ink-500 border-line"],
  pending: ["Pending", "bg-alert-bg text-alert border-alert/25"],
  confirmed: ["Confirmed", "bg-ok-bg text-ok border-ok/25"],
  cancelled: ["Not needed", "bg-page text-ink-400 border-line"],
};
export function Pill({ s }: { s: DStatus | string }) {
  const [label, cls] = PILL[s] ?? [s, "bg-page text-ink-500 border-line"];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

export const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-[12px] font-semibold text-ink-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
export const btnSm = "inline-flex items-center justify-center rounded-md border border-line bg-white px-2.5 py-1 text-[12px] font-semibold text-ink-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50";
export const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-brand-500 to-brand-700 px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimarySm = "inline-flex items-center justify-center rounded-md bg-brand-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50";
export const btnDanger = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-white px-3 py-2 text-[12px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-50";
export const field = "rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100";
export const input = `${field} w-full`;
export const card = "rounded-xl border border-line bg-white shadow-card";
export const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500";
export const td = "px-4 py-2.5 text-[13px] text-ink-700";

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-bold text-ink-900">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-500">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function ErrorLine({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</div>;
}

export function Pager({ page, size, total, onPage, onSize, sizes = [10, 50, 100] }: {
  page: number; size: number; total: number; onPage: (p: number) => void; onSize?: (s: number) => void; sizes?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const a = total ? (page - 1) * size + 1 : 0, b = Math.min(total, page * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-4 py-3 text-[12px] text-ink-500">
      <div className="flex items-center gap-2">
        {onSize && (
          <>
            <span>Show</span>
            <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="rounded-md border border-line bg-white px-2 py-1 text-ink-900" aria-label="Rows per page">
              {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>per page ·</span>
          </>
        )}
        <span><b className="text-ink-900">{nf(a)}–{nf(b)}</b> of <b className="text-ink-900">{nf(total)}</b></span>
      </div>
      <div className="flex items-center gap-1.5">
        <button className={btnSm} disabled={page <= 1} onClick={() => onPage(1)}>First</button>
        <button className={btnSm} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="px-2">Page {nf(page)} of {nf(pages)}</span>
        <button className={btnSm} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        <button className={btnSm} disabled={page >= pages} onClick={() => onPage(pages)}>Last</button>
      </div>
    </div>
  );
}

/** Debounced value - search boxes query the server 300 ms after typing stops. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Folder helpers built once from the flat list. */
export function useFolderTree(folders: Folder[]) {
  return useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const kids = new Map<string | null, Folder[]>();
    folders.forEach((f) => { const k = kids.get(f.parent_id) ?? []; k.push(f); kids.set(f.parent_id, k); });
    kids.forEach((l) => l.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    const total = new Map<string, number>();
    const walk = (f: Folder): number => { let c = f.direct_count; (kids.get(f.id) ?? []).forEach((k) => (c += walk(k))); total.set(f.id, c); return c; };
    (kids.get(null) ?? []).forEach(walk);
    const path = (id: string | null) => { const out: Folder[] = []; let cur = id ? byId.get(id) : undefined; while (cur) { out.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; } return out; };
    const options: { id: string; label: string; depth: number }[] = [];
    const flat = (f: Folder, depth: number) => { options.push({ id: f.id, label: f.name, depth }); (kids.get(f.id) ?? []).forEach((k) => flat(k, depth + 1)); };
    (kids.get(null) ?? []).forEach((f) => flat(f, 0));
    return { byId, kids, total, path, options };
  }, [folders]);
}

export function FolderSelect({ folders, value, onChange, id }: { folders: Folder[]; value: string; onChange: (v: string) => void; id?: string }) {
  const { options, path } = useFolderTree(folders);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">Choose a folder…</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{"   ".repeat(o.depth)}{o.depth ? "└ " : ""}{o.label}{o.depth === 0 ? "" : `  (${path(o.id).map((f) => f.name).join(" › ")})`}</option>
      ))}
    </select>
  );
}

/** Chips of the people who must confirm, with "add a user" search. Starts from the Email List. */
export function ReviewerPicker({ all, selected, onChange }: { all: DcUser[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const byId = new Map(all.map((u) => [u.id, u]));
  const chosen = selected.map((id) => byId.get(id)).filter(Boolean) as DcUser[];
  const term = q.trim().toLowerCase();
  const others = all.filter((u) => u.is_active && !selected.includes(u.id) && (!term || `${u.name} ${u.email} ${u.department ?? ""}`.toLowerCase().includes(term))).slice(0, 8);
  return (
    <div>
      <div className="flex min-h-[44px] flex-wrap gap-1.5 rounded-lg border border-line bg-page/60 p-2">
        {chosen.length === 0 && <span className="px-1 py-1 text-[12px] text-ink-400">Nobody selected yet.</span>}
        {chosen.map((u) => (
          <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white py-1 pl-3 pr-1 text-[12px] font-semibold text-ink-900">
            {u.name}{u.department && <small className="font-normal text-ink-400">{u.department}</small>}
            <button type="button" aria-label={`Remove ${u.name}`} onClick={() => onChange(selected.filter((x) => x !== u.id))} className="grid h-5 w-5 place-items-center rounded-full text-ink-400 hover:bg-brand-50 hover:text-brand-600">×</button>
          </span>
        ))}
      </div>
      <div ref={box} className="relative mt-2">
        <input className={input} placeholder="Add a user manually — type a name or email" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
        {open && others.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lift">
            {others.map((u) => (
              <button type="button" key={u.id} onClick={() => { onChange([...selected, u.id]); setQ(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-brand-50">
                <span><b className="text-ink-900">{u.name}</b> <span className="text-ink-400">{u.email}</span></span>
                <span className="text-[11px] text-ink-400">{u.department}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {children && <p className="mt-1 text-sm text-ink-500">{children}</p>}
    </div>
  );
}
