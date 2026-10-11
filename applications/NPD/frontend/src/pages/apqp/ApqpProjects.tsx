


import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apqpApi } from "../../services/apqpApi";
import { useFetch } from "../../hooks/useFetch";
import { useProgressiveList } from "../../hooks/useProgressiveList";
import { Loading } from "../../components/Loading";
import { StageBadge } from "../../components/StageBadge";
import { apqpPath } from "../../utils/links";

const EMPTY: never[] = [];

export default function ApqpProjects() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const { data, loading, error } = useFetch(() => apqpApi.list({ search: applied || undefined }), [applied], { key: `apqp-list:${applied}` });

  const projects = data ?? EMPTY;
  // Long lists appear at once and fill in over the next frames.
  const shown = useProgressiveList(projects);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.8px] text-ink-900">APQP TIMELINE - NPD</h1>
          <p className="mt-1 text-sm text-ink-400">{projects.length} TIMELINE</p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setApplied(search)}
          placeholder="Search product, order no, customer or part no..."
          className="w-72 rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600"
        />
        <button onClick={() => setApplied(search)}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          SEARCH
        </button>
        {applied && (
          <button onClick={() => { setSearch(""); setApplied(""); }}
            className="rounded px-3 py-2 text-sm text-slate-500 hover:text-slate-900">
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <Loading />
      ) : projects.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No APQP TIMELINE found</p>
          <p className="mt-1 text-sm text-slate-500">
            {applied ? "Try a different search term." : "Create your first project to get started."}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Part No.</th>
                  <th className="px-4 py-3 font-medium">Current phase</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((p) => (
                  <tr
                    key={p.project_id}
                    // The product name is the link now, falling back to the
                    // project id for anything created before the change.
                    onClick={() =>
                      navigate(apqpPath(p))
                    }
                    className="cursor-pointer transition-colors hover:bg-brand-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                      {p.product_name ?? "—"}
                    </td>

                    <td className="px-4 py-3 text-slate-700">{p.customer}</td>
                    <td className="px-4 py-3 text-slate-600">{p.customer_part_no || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{p.current_phase || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full bg-brand-600" style={{ width: `${p.percent}%` }} />
                        </div>
                        <span className="text-xs text-slate-500">
                          {p.completed}/{p.total_activities}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StageBadge status={p.status} />
                      {p.overdue > 0 && <span className="ml-2 text-xs text-red-600">{p.overdue} overdue</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}