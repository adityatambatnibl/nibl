import { plural } from "../../utils/formatters";

import { Link } from "react-router-dom";
import { CountUp } from "../../components/Ring";
import { apqpPath } from "../../utils/links";

export type PhaseProgress = {
  phase_code: string;
  phase_name: string;
  total: number;
  completed: number;
  overdue: number;
  percent: number;
  avg_delay_days: number | null;
};

export type ApqpProjectProgress = {
  project_id: string;
  customer: string;
  product_name: string | null;
  total: number;
  completed: number;
  overdue: number;
  percent: number;
  current_phase: string | null;
};

export type DepartmentLoad = {
  responsibility: string;
  total: number;
  completed: number;
  overdue: number;
  percent: number;
};

function Panel({
  title,
  subtitle,
  conclusion,
  delay = 0,
  children,
}: {
  title: string;
  subtitle?: string;
  conclusion?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rise lift overflow-hidden rounded-xl border border-line bg-white shadow-[0_3px_14px_rgba(20,20,20,0.045)]"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <div className="border-b border-divider px-4 py-3">
        <h2 className="text-sm font-bold text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
      </div>
      {children}
      {conclusion && (
        <p className="border-t border-divider bg-slate-50 px-4 py-2.5 text-xs text-ink-500">
          {conclusion}
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "ink",
  delay = 0,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "ink" | "danger" | "warn" | "ok";
  delay?: number;
}) {
  const colours = {
    ink: "text-ink-900",
    danger: "text-danger",
    warn: "text-warn",
    ok: "text-ok",
  };
  return (
    <div
      className="rise lift rounded-xl border border-line bg-white p-4 shadow-[0_3px_14px_rgba(20,20,20,0.045)]"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <p className="text-[10px] font-bold uppercase tracking-[1.1px] text-ink-400">{label}</p>
      <p className={`mt-1 text-[30px] font-bold leading-none tabular-nums ${colours[tone]}`}>
        <CountUp value={value} delay={delay + 120} />
      </p>
      {note && <p className="mt-1.5 text-xs text-ink-400">{note}</p>}
    </div>
  );
}

/**
 * The APQP half of the analytics page: phase funnel, per-project progress,
 * and department load. Mirrors the order-side panels so the two read alike.
 */
export function ApqpAnalytics({
  phases,
  projects,
  departments,
  projectCount,
  activityCount,
}: {
  phases: PhaseProgress[];
  projects: ApqpProjectProgress[];
  departments: DepartmentLoad[];
  projectCount: number;
  activityCount: number;
}) {
  if (!activityCount) {
    return (
      <div className="rise mt-4 rounded-xl border border-line bg-white px-4 py-12 text-center">
        <p className="text-sm text-ink-400">
          No APQP activities yet. Create a project to see this analysis.
        </p>
      </div>
    );
  }

  const overdueTotal = phases.reduce((s, p) => s + p.overdue, 0);
  const completedTotal = phases.reduce((s, p) => s + p.completed, 0);
  const overallPercent = activityCount
    ? Math.round((completedTotal / activityCount) * 100)
    : 0;

  const worstPhase = [...phases].sort((a, b) => b.overdue - a.overdue)[0];
  const slowestPhase = [...phases]
    .filter((p) => p.avg_delay_days != null)
    .sort((a, b) => (b.avg_delay_days ?? 0) - (a.avg_delay_days ?? 0))[0];
  const worstDept = [...departments].sort((a, b) => b.overdue - a.overdue)[0];

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="APQP projects" value={projectCount} note="in the system" delay={0} />
        <Stat
          label="Activities"
          value={activityCount}
          note={`${completedTotal} completed`}
          delay={60}
        />
        <Stat
          label="Overall progress"
          value={overallPercent}
          note="percent complete"
          tone={overallPercent >= 60 ? "ok" : "warn"}
          delay={120}
        />
        <Stat
          label="Overdue activities"
          value={overdueTotal}
          note="past their plan date"
          tone={overdueTotal > 0 ? "danger" : "ok"}
          delay={180}
        />
      </div>

      {/* Phase funnel — the shape of an APQP programme, left to right */}
      <div className="mt-3">
        <Panel
          title="Progress by phase"
          subtitle="All projects combined, phase 0 through 5"
          delay={240}
          conclusion={
            slowestPhase && slowestPhase.avg_delay_days
              ? `${slowestPhase.phase_name} takes the longest — activities finish ${plural(slowestPhase.avg_delay_days, "day")} past plan on average.`
              : worstPhase && worstPhase.overdue > 0
                ? `${worstPhase.phase_name} has the most overdue work (${worstPhase.overdue}).`
                : "No phase is behind plan."
          }
        >
          <div className="flex items-end gap-2 px-4 py-5 sm:gap-3">
            {phases.map((p, i) => (
              <div key={p.phase_code} className="group flex-1 text-center">
                <p className="mb-1.5 text-[11px] font-bold tabular-nums text-ink-900">
                  {p.percent}%
                </p>
                <div className="relative mx-auto flex h-32 w-full items-end overflow-hidden rounded-md bg-slate-100">
                  <div
                    className={`bar-y w-full rounded-md transition-colors ${
                      p.overdue > 0 ? "bg-danger" : "bg-info group-hover:bg-brand-600"
                    }`}
                    style={
                      {
                        height: `${Math.max(p.percent, 3)}%`,
                        "--d": `${300 + i * 80}ms`,
                      } as React.CSSProperties
                    }
                    title={`${p.completed} of ${p.total} done${p.overdue ? ` · ${p.overdue} overdue` : ""}`}
                  />
                </div>
                <p className="mt-1.5 text-[10px] font-bold text-ink-700">
                  {p.phase_code.replace("PHASE", "P")}
                </p>
                <p className="text-[9px] leading-tight text-ink-400">{p.phase_name}</p>
                <p className="mt-0.5 text-[10px] tabular-nums text-ink-400">
                  {p.completed}/{p.total}
                  {p.overdue > 0 && (
                    <span className="ml-1 font-bold text-danger">· {p.overdue}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel
          title="Every project"
          subtitle="Completion, current phase, and what is late"
          delay={300}
          conclusion={
            projects.some((p) => p.overdue > 0)
              ? `${projects.filter((p) => p.overdue > 0).length} of ${plural(projects.length, "project")} ${projects.filter((p) => p.overdue > 0).length === 1 ? "has" : "have"} overdue activities.`
              : "No project has overdue activities."
          }
        >
          <div className="divide-y divide-divider">
            {projects.map((p, i) => (
              <div
                key={p.project_id}
                className="rise nudge px-4 py-3"
                style={{ "--d": `${360 + i * 50}ms` } as React.CSSProperties}
              >
                <div className="flex items-center gap-2">
                  <Link
                    to={apqpPath(p)}
                    className="truncate text-[13px] font-bold text-ink-900 underline decoration-line underline-offset-2 hover:text-brand-700 hover:decoration-brand-600"
                    title={`Open APQP project ${p.project_id}`}
                  >
                    {p.product_name || p.project_id}
                  </Link>
                  <span className="shrink-0 rounded bg-info-bg px-1.5 py-0.5 text-[9px] font-bold uppercase text-info">
                    {p.current_phase}
                  </span>
                  <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums text-ink-900">
                    {p.percent}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`bar-x h-full rounded-full ${p.overdue > 0 ? "bg-danger" : "bg-info"}`}
                    style={
                      {
                        width: `${Math.max(p.percent, 2)}%`,
                        "--d": `${420 + i * 50}ms`,
                      } as React.CSSProperties
                    }
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="truncate text-[11px] text-ink-400">
                    {p.customer}
                    {p.product_name && ` · ${p.project_id}`}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-ink-400">
                    {p.completed}/{p.total}
                  </span>
                  {p.overdue > 0 && (
                    <span className="shrink-0 rounded bg-danger-bg px-1.5 py-0.5 text-[10px] font-bold text-danger">
                      {p.overdue} late
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Load by department"
          subtitle="Who owns the work, and who is behind"
          delay={360}
          conclusion={
            worstDept && worstDept.overdue > 0
              ? `${worstDept.responsibility} is holding up progress — ${worstDept.overdue} overdue activities.`
              : "No department has overdue activities."
          }
        >
          <div className="space-y-3 px-4 py-4">
            {departments.map((d, i) => (
              <div key={d.responsibility} className="flex items-center gap-2.5">
                <span className="w-20 shrink-0 truncate text-xs font-semibold text-ink-900">
                  {d.responsibility}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className={`bar-x h-full rounded-md ${d.overdue > 0 ? "bg-danger" : "bg-ok"}`}
                    style={
                      {
                        width: `${Math.max(d.percent, 2)}%`,
                        "--d": `${420 + i * 70}ms`,
                      } as React.CSSProperties
                    }
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-400">
                  {d.completed}/{d.total}
                  {d.overdue > 0 && (
                    <span className="ml-1 font-bold text-danger">· {d.overdue}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}