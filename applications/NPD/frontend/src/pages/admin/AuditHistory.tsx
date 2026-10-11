import { useMemo, useState } from "react";
import { auditApi } from "../../services/userApi";
import { useFetch } from "../../hooks/useFetch";
import { Loading } from "../../components/Loading";
import { formatDateTime, plural } from "../../utils/formatters";
import { AUDIT_LABELS, AUDIT_TONE } from "../../utils/constants";
import type { AuditEntry } from "../../types";

/** One short line saying what changed. */
function details(l: AuditEntry): string {
  if (l.note) return l.note;
  const before = l.before ?? {};
  const after = l.after ?? {};
  const key = Object.keys(after).length ? Object.keys(after)[0] : Object.keys(before)[0];
  if (!key) return "";
  const fmt = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join(", ") : "none") : String(v ?? "—"));
  return key in before ? `${fmt(before[key])} → ${fmt(after[key])}` : fmt(after[key]);
}

const label = (action: string) => AUDIT_LABELS[action] ?? action.replace(/_/g, " ");

/** How many of the latest entries to load. "All" is a large number, not unlimited. */
const SIZES = [100, 500, 1000, 5000];
const ALL = 100000;

/** Rows -> CSV that Excel opens directly (BOM keeps ₹, → and Marathi text intact). */
function downloadCsv(rows: AuditEntry[]) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ["Sr. No.", "When", "User", "Action", "Product / item", "Details"].map(cell).join(","),
    ...rows.map((l, i) =>
      [String(i + 1), formatDateTime(l.created_at), l.actor_name, label(l.action), l.target_label ?? "", details(l)]
        .map((v) => cell(String(v ?? "")))
        .join(","),
    ),
  ];
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Audit_History_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AuditHistory() {
  const [limit, setLimit] = useState(100);
  const { data, loading, error } = useFetch(() => auditApi.list({ limit }), [limit], { key: `audit:${limit}` });
  const { data: counts } = useFetch(() => auditApi.count(), [], { key: "audit:count" });
  const logs = useMemo(() => data ?? [], [data]);
  const total = counts?.total ?? 0;
  const hasMore = logs.length >= limit && limit < ALL && (!counts || total > logs.length);
  // +100 while small, then +500 - "Load more" grows with the list.
  const step = limit < 500 ? 100 : 500;

  const [person, setPerson] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [showSignIns, setShowSignIns] = useState(false);

  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of logs) m.set(l.actor_id, l.actor_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [logs]);
  const actions = useMemo(() => [...new Set(logs.map((l) => l.action))].sort(), [logs]);

  const rows = logs.filter((l) => {
    if (!showSignIns && l.action === "signed_in" && action !== "signed_in") return false;
    if (person && l.actor_id !== person) return false;
    if (action && l.action !== action) return false;
    if (search) {
      const hay = `${l.actor_name} ${label(l.action)} ${l.target_label ?? ""} ${details(l)}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const field = "rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600";

  return (
    <div className="pb-10">
      <h1 className="text-xl font-semibold text-slate-900">Audit History</h1>
      <p className="mt-1 text-sm text-slate-500">
        Who did what, and when - every user, every change.
      </p>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select value={person} onChange={(e) => setPerson(e.target.value)} className={field}>
          <option value="">All users</option>
          {people.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} className={field}>
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{label(a)}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, file, change..."
          className={`${field} w-64`}
        />
        <label className="ml-1 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showSignIns} onChange={(e) => setShowSignIns(e.target.checked)} />
          Show sign-ins
        </label>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-slate-600">Show latest</label>
          <select
            value={SIZES.includes(limit) || limit === ALL ? limit : ""}
            onChange={(e) => setLimit(Number(e.target.value))}
            className={field}
          >
            {!SIZES.includes(limit) && limit !== ALL && <option value="">{limit}</option>}
            {SIZES.map((n) => (
              <option key={n} value={n}>{n.toLocaleString("en-IN")}</option>
            ))}
            <option value={ALL}>All</option>
          </select>
          <button
            type="button"
            onClick={() => downloadCsv(rows)}
            disabled={rows.length === 0}
            className="btn-action inline-flex h-9 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Downloads the entries shown below, with your filters, as an Excel-ready CSV file"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
              <path d="M10 3v10m0 0l-4-4m4 4l4-4M4 15v2h12v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download history
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {plural(rows.length, "entry", "entries")} shown
        {counts ? ` · latest ${logs.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} loaded` : ""}
        {loading && logs.length > 0 ? " · loading..." : ""}
      </p>

      {loading && logs.length === 0 ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">Nothing to show</p>
          <p className="mt-1 text-sm text-slate-500">Actions will be recorded here as people use the system.</p>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="mt-4 space-y-3 lg:hidden">
            {rows.map((l, i) => (
              <div key={l.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-900">
                    <span className="mr-2 text-xs text-slate-400">#{i + 1}</span>
                    <span className="font-medium">{l.actor_name}</span> · {label(l.action)}
                  </p>
                  <p className="shrink-0 text-xs text-slate-400">{formatDateTime(l.created_at)}</p>
                </div>
                {l.target_label && <p className="mt-1 text-sm font-medium text-slate-700">{l.target_label}</p>}
                {details(l) && <p className="mt-1 text-xs text-slate-500">{details(l)}</p>}
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="mt-4 hidden overflow-hidden rounded-lg border border-slate-200 bg-white lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-16 px-4 py-3 font-medium">Sr. No.</th>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Product / item</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((l, i) => (
                  <tr key={l.id} className="align-top">
                    <td className="px-4 py-3 tabular-nums text-slate-400">{i + 1}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDateTime(l.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{l.actor_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      <span className={`mr-2 inline-block h-2 w-2 rounded-full ${AUDIT_TONE[l.action] ?? "bg-slate-400"}`} />
                      {label(l.action)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{l.target_label ?? "—"}</td>
                    <td className="max-w-md px-4 py-3 text-slate-500">{details(l) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setLimit((n) => n + step)}
                disabled={loading}
                className="btn-action inline-flex h-9 min-w-[160px] items-center justify-center rounded border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {loading ? "Loading..." : `Load ${step} more`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
