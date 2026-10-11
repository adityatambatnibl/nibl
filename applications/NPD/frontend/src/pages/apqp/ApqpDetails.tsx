import { plural } from "../../utils/formatters";


                          


import { Fragment, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { apqpApi, type ActivityUpdate } from "../../services/apqpApi";
import { attachmentApi } from "../../services/attachmentApi";
import { excelApi } from "../../services/excelApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { useAuth } from "../../hooks/useAuth";
import { Loading } from "../../components/Loading";
import { StageBadge } from "../../components/StageBadge";
import { WeekGrid, WeekGridHeader } from "../../components/WeekGrid";
import { AttachmentCell } from "../../components/AttachmentCell";
import { GanttChart } from "../../components/GanttChart";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ApqpSignOffSection } from "./ApqpSignOff";
import { formatDate } from "../../utils/formatters";
import type { ApqpActivity, Attachment } from "../../types";
import { seg } from "../../utils/links";
import { ExportButton } from "../../components/ExportButton";
import { DateInput } from "../../components/DateInput";

const RESPONSIBILITIES = [
  "MKTG",
  "R&D",
  "MKTG & R&D",
  "CFT",
  "QA",
  "TOOL ROOM",
  "MFG GBD",
  "MFG NBD",
  "SOURCING",
  "TL",
];


type Row = {
  check_point: string;
  responsibility: string;
  plan_start: string;
  plan_end: string;
  actual_start: string;
  actual_end: string;
  remark: string;
  week_flags: Record<string, boolean>;
  actual_week_flags: Record<string, boolean>;
};

function toRow(a: ApqpActivity): Row {
  return {
    check_point: a.check_point ?? "",
    responsibility: a.responsibility ?? "",
    plan_start: a.plan_start ?? "",
    plan_end: a.plan_end ?? "",
    actual_start: a.actual_start ?? "",
    actual_end: a.actual_end ?? "",
    remark: a.remark ?? "",
    week_flags: { ...a.week_flags },
    actual_week_flags: { ...a.actual_week_flags },
  };
}

function changed(a: ApqpActivity, r: Row) {
  return (
    r.check_point !== (a.check_point ?? "") ||
    r.responsibility !== (a.responsibility ?? "") ||
    r.plan_start !== (a.plan_start ?? "") ||
    r.plan_end !== (a.plan_end ?? "") ||
    r.actual_start !== (a.actual_start ?? "") ||
    r.actual_end !== (a.actual_end ?? "") ||
    r.remark !== (a.remark ?? "") ||
    JSON.stringify(r.week_flags) !== JSON.stringify(a.week_flags) ||
    JSON.stringify(r.actual_week_flags) !== JSON.stringify(a.actual_week_flags)
  );
}

export default function ApqpDetails() {
  const { projectId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canEdit = hasPermission("apqp_edit");
  // The plan (dates, plan weeks, responsibility) is the schedule: admin only.
  // Users with APQP edit fill in actual dates and remarks.
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<"activities" | "timeline">("activities");
  const { data: timeline } = useFetch(() => apqpApi.timeline(projectId), [projectId], { key: `apqp-timeline:${projectId}` });
  const { data, loading, error, setData, setError } = useFetch(() => apqpApi.get(projectId), [projectId], { key: `apqp:${projectId}` });
  const { data: attachments, reload: reloadAttachments } = useFetch(() => attachmentApi.listForProject(projectId), [projectId], { key: `apqp-files:${projectId}` });
  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    if (!data) return;

    const d: Record<string, Row> = {};
    for (const a of data.activities) {
      d[a.id] = toRow(a);
    }

    setDraft(d);

    setOpen((current) => {
      if (Object.keys(current).length) return current;

      return {
        [data.phases[0]?.phase_code ?? ""]: true,
      };
    });
  }, [data]);


  function edit(id: string, field: keyof Row, value: string) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
    setSaved("");
  }

    function toggleWeek(id: string, col: string, field: "week_flags" | "actual_week_flags") {
    if (!canEdit || (field === "week_flags" && !isAdmin)) return;
    setDraft((d) => {
      const flags = { ...d[id][field] };
      if (flags[col]) delete flags[col];
      else flags[col] = true;
      return { ...d, [id]: { ...d[id], [field]: flags } };
    });
    setSaved("");
  }

  const dirty = data?.activities.some((a) => draft[a.id] && changed(a, draft[a.id]));

  async function save() {
    if (!data) return;
    const updates: ActivityUpdate[] = data.activities
      .filter((a) => draft[a.id] && changed(a, draft[a.id]))
      .map((a) => {
        const r = draft[a.id];
        return {
          id: a.id,
          check_point: r.check_point || null,
          actual_start: r.actual_start || null,
          actual_end: r.actual_end || null,
          remark: r.remark || null,
          actual_week_flags: r.actual_week_flags,
          ...(isAdmin && {
            responsibility: r.responsibility || null,
            plan_start: r.plan_start || null,
            plan_end: r.plan_end || null,
            week_flags: r.week_flags,
          }),
        };
      });

    if (!updates.length) return;

    setBusy(true);
    setError("");
    try {
      await apqpApi.updateActivities(projectId, updates);
      setData(await apqpApi.get(projectId));
      setSaved(`${plural(updates.length, "activity", "activities")} saved.`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }
    async function handleDelete() {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await apqpApi.remove(projectId);
      navigate("/apqp", { replace: true });
    } catch (err) {
      setDeleteError(apiError(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) return <Loading/>;
  if (!data) return <div className="text-sm text-red-700">{error || "Project not found."}</div>;

  // const checkPoints = lookups?.check_point_options ?? [];
  // const responsibilities = lookups?.responsibilities ?? [];
  const cols = data.week_columns;
  const filesByActivity: Record<string, Attachment[]> = {};
  for (const f of attachments ?? []) {
    (filesByActivity[f.entity_id] ??= []).push(f);
  }

  return (
    <div className="pb-10">
      <Link to="/apqp" className="text-sm text-slate-500 hover:text-slate-900">← Back to APQP TIMELINE</Link>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">
            {data.product_name ?? data.project_id}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.customer}
            {data.customer_part_no && ` · ${data.customer_part_no}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <StageBadge status={data.status} />
          {user?.role === "admin" && (
            <Link
              to={`/apqp/${seg(projectId)}/edit`}
              className="btn-action inline-flex h-9 min-w-[128px] items-center justify-center rounded border px-4 text-sm font-medium border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              Edit
            </Link>
          )}
          {hasPermission("timeline_create") && (
            <Link
              to={`/apqp/${seg(projectId)}/emails`}
              className="btn-action inline-flex h-9 min-w-[128px] items-center justify-center rounded border px-4 text-sm font-medium border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              title="Who gets this project's emails"
            >
              Emails
            </Link>
          )}
          <ExportButton onExport={() => excelApi.exportApqp(projectId)} className="btn-action inline-flex h-9 min-w-[128px] items-center justify-center rounded border px-4 text-sm font-medium border-slate-300 bg-white text-slate-700 hover:bg-slate-50" />
          {user?.role === "admin" && (
            <button
              onClick={() => { setConfirmDelete(true); setDeleteError(""); }}
              className="btn-action inline-flex h-9 min-w-[128px] items-center justify-center rounded border px-4 text-sm font-medium border-red-200 bg-white text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 md:grid-cols-6">
        {[
          ["Product", data.product_name || "-"],
          ["Program", data.program_name || "-"],
          ["Application", data.application || "-"],
          ["Supply condition", data.supply_condition || "-"],
          ["Enquiry date", formatDate(data.enquiry_date)],
          ["Order date", formatDate(data.order_date)],
          ["Original date", formatDate(data.original_date)],
          ["PPAP date", formatDate(data.ppap_date)],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-slate-500">{k}</p>
            <p className="mt-0.5 truncate text-sm font-medium text-slate-900" title={v}>{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">Overall progress</p>
          <p className="text-sm text-slate-600">{data.percent}% · {data.overdue_count} overdue</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-brand-600" style={{ width: `${data.percent}%` }} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          {data.phases.map((p) => (
            <button key={p.phase_code} onClick={() => setOpen({ [p.phase_code]: true })}
              className="rounded border border-slate-200 p-3 text-left hover:border-slate-400">
              <p className="text-xs font-medium text-slate-500">{p.phase_code.replace("PHASE", "Phase ")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{p.percent}%</p>
              <p className="mt-0.5 text-xs text-slate-500">{p.completed}/{p.total}</p>
              {p.overdue > 0 && <p className="mt-0.5 text-xs text-red-600">{p.overdue} overdue</p>}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {(["activities", "timeline"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
                tab === t ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "activities" && canEdit && (
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-green-700">{saved}</span>}
            <button
              onClick={save}
              disabled={!dirty || busy}
              className="w-full rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40 sm:w-auto"
            >
              {busy ? "Saving..." : "Save changes"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {tab === "timeline" ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
          {timeline?.range_start && timeline?.range_end ? (
            <GanttChart
              bars={timeline.bars}
              today={timeline.today}
              rangeStart={timeline.range_start}
              rangeEnd={timeline.range_end}
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              No dates entered yet. Add plan dates to the activities to see the timeline.
            </p>
          )}
        </div>
      ) : (
        data.phases.map((phase) => {
        const acts = data.activities.filter((a) => a.phase_code === phase.phase_code);
        const isOpen = !!open[phase.phase_code];

        return (
          <div key={phase.phase_code} className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <button
              onClick={() => setOpen((o) => ({ ...o, [phase.phase_code]: !o[phase.phase_code] }))}
              className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
            >
              <span className="text-sm font-semibold text-slate-900">
                {phase.phase_name}
                <span className="ml-2 font-normal text-slate-500">
                  {phase.completed}/{phase.total} · {formatDate(phase.plan_start)} → {formatDate(phase.plan_end)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {phase.overdue > 0 && <span className="text-xs text-red-600">{phase.overdue} overdue</span>}
                <StageBadge status={phase.status} />
                <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
              </span>
            </button>

                        {isOpen && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-slate-50 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-2">No.</th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-2">Phase or Activity</th>
                      <th rowSpan={2} className="w-[216px] border border-slate-200 px-2 py-2">Check Point</th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-2">Responsibility</th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-2 text-center">Status</th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-2">Start Date</th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-2">End Date</th>
                      <th className="border border-slate-200 px-2 py-1 text-center text-[9px] normal-case text-slate-400">
                        Week
                      </th>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-2">Remark</th>
                    </tr>
                    <tr>
                      <th className="border border-slate-200 px-2 py-1">
                        <WeekGridHeader columns={cols} />
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {acts.map((a) => {
                      const r = draft[a.id];
                      if (!r) return null;

                      const files = filesByActivity[a.id] ?? [];
                      const rowBg = a.is_heading ? "bg-slate-50/80" : "";

                      const merged = "border border-slate-200 px-2 py-1.5 align-top";
                      const plan = "border border-slate-200 bg-amber-50/70 px-2 py-1";
                      const actual = "border border-slate-200 bg-emerald-50/70 px-2 py-1";
                      const dateInput = "w-[116px] rounded border px-1.5 py-1 text-[11px] outline-none disabled:!bg-slate-50 disabled:text-slate-700";

                      return (
                        <Fragment key={a.id}>
                          <tr className={rowBg}>
                            <td rowSpan={2} className={`${merged} whitespace-nowrap font-mono font-medium text-slate-900`}>
                              {a.no_label}
                            </td>

                            {/* <td rowSpan={2} className={`${merged} min-w-56 max-w-72 ${
                              a.is_heading ? "font-semibold text-slate-900" : "text-slate-700"
                            }`}>
                              {a.activity_name}
                            </td> */}
                            <td rowSpan={2} className={`${merged} min-w-56 max-w-72 ${
                              a.is_heading ? "font-semibold text-slate-900" : "text-slate-700"
                            }`}>
                              {a.activity_name}
                              {!a.is_heading && a.status === "overdue" && (
                                <span className="ml-1.5 whitespace-nowrap text-xs font-semibold text-red-600">
                                  {a.delay_days}d late
                                </span>
                              )}
                              {!a.is_heading && a.status === "completed_late" && (
                                <span className="ml-1.5 whitespace-nowrap text-xs text-amber-600">
                                  +{a.delay_days}d
                                </span>
                              )}
                            </td>

                            {/* Check Point is locked at 200px: many or long file names are cut
                                with "..." (hover shows them all; the badge shows how many). */}
                            <td rowSpan={2} className={`${merged} w-[216px]`}>
                              {a.is_heading ? null : (
                                <div className="flex w-[200px]">
                                <AttachmentCell
                                  entityType="apqp_activity"
                                  entityId={a.id}
                                  initial={files}
                                  canEdit={hasPermission("attachment_upload")}
                                  checkpointValue={r.check_point}
                                  onCheckpointChange={(value) =>
                                    edit(a.id, "check_point", value)
                                  }
                                  disabled={!canEdit}
                                  onChange={reloadAttachments}
                                />
                                </div>
                              )}
                            </td>
                          

                            <td rowSpan={2} className={merged}>
                              {a.is_heading ? null : (
                                <select
                                  value={r.responsibility}
                                  disabled={!isAdmin}
                                  onChange={(e) => edit(a.id, "responsibility", e.target.value)}
                                  className={`w-28 rounded border border-slate-300 px-1 py-1 outline-none focus:border-brand-600 disabled:bg-slate-50 ${
                                    r.responsibility ? "text-slate-900" : "text-slate-400"
                                  }`}
                                >
                                  <option value="">-</option>
                                  {RESPONSIBILITIES.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                  ))}
                                  {/* Keep a value that is not on the list, so existing
                                      data is never silently wiped when saving. */}
                                  {r.responsibility && !RESPONSIBILITIES.includes(r.responsibility) && (
                                    <option value={r.responsibility}>{r.responsibility}</option>
                                  )}
                                </select>
                              )}
                            </td>

                            <td className={`${plan} text-center text-[10px] font-semibold uppercase tracking-wide text-amber-800`}>
                              Plan
                            </td>
                            <td className={plan}>
                              <DateInput value={r.plan_start} disabled={!isAdmin}
                                onChange={(e) => edit(a.id, "plan_start", e.target.value)}
                                className={`${dateInput} border-amber-300 bg-white focus:border-amber-500`} />
                            </td>
                            <td className={plan}>
                              <DateInput value={r.plan_end} disabled={!isAdmin}
                                onChange={(e) => edit(a.id, "plan_end", e.target.value)}
                                className={`${dateInput} border-amber-300 bg-white focus:border-amber-500`} />
                            </td>
                            <td className={plan}>
                              <WeekGrid columns={cols} flags={r.week_flags} tone="plan"
                                onToggle={(col) => toggleWeek(a.id, col, "week_flags")} readOnly={!isAdmin} />
                            </td>

                            <td rowSpan={2} className={merged}>
                              <input value={r.remark} disabled={!canEdit}
                                onChange={(e) => edit(a.id, "remark", e.target.value)}
                                className="w-36 rounded border border-slate-300 px-1.5 py-1 outline-none focus:border-brand-600 disabled:bg-slate-50" />
                            </td>
                          </tr>

                          <tr className={rowBg}>
                            <td className={`${actual} text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-800`}>
                              Actual
                            </td>
                            <td className={actual}>
                              <DateInput value={r.actual_start} disabled={!canEdit}
                                onChange={(e) => edit(a.id, "actual_start", e.target.value)}
                                className={`${dateInput} border-emerald-300 bg-white focus:border-emerald-500`} />
                            </td>
                            <td className={actual}>
                              <DateInput value={r.actual_end} disabled={!canEdit}
                                onChange={(e) => edit(a.id, "actual_end", e.target.value)}
                                className={`${dateInput} border-emerald-300 bg-white focus:border-emerald-500`} />
                            </td>
                            <td className={actual}>
                              <WeekGrid columns={cols} flags={r.actual_week_flags} tone="actual"
                                onToggle={(col) => toggleWeek(a.id, col, "actual_week_flags")} readOnly={!canEdit} />
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
                    </div>
        );
        })
      )}

      <ApqpSignOffSection
        projectId={projectId}
        initial={data.sign_off}
        canEdit={canEdit}
      />
      {confirmDelete && (
        <ConfirmDialog
          title="Delete APQP project"
          message={
            <>
              <p>Permanently delete <strong>{data.product_name ?? data.project_id}</strong>?</p>
              <p className="mt-2">
                This removes {plural(data.activities.length, "activity record")}, the sign-off
                block and any attachments.
              </p>
              {data.order_no && (
                <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-red-700">
                  Its Tracking record will also be deleted, along with all its
                  stages and items.
                </p>
              )}
              <p className="mt-2">This cannot be undone.</p>
            </>
          }
          requireText={data.product_name ?? data.project_id}
          busy={deleteBusy}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

