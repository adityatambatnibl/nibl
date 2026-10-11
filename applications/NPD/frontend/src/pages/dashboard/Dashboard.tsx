import { plural } from "../../utils/formatters";



//   // const worstOrder = [...(recent ?? [])]
//   //   .map((o) => ({ ...o, late: lateBy[o.order_no]?.days ?? 0 }))
//   //   .sort((a, b) => b.late - a.late)[0];
//   // const worstApqp = [...(apqp_recent ?? [])]
//   //   .map((p) => ({ ...p, late: lateBy[p.project_id]?.days ?? 0 }))
//   //   .sort((a, b) => b.late - a.late)[0];


      


        


import { useState } from "react";
import { Link } from "react-router-dom";
import { PermissionGuard } from "../../components/PermissionGuard";
import { dashboardApi } from "../../services/dashboardApi";
import { useFetch } from "../../hooks/useFetch";
import { CountUp } from "../../components/Ring";
import { Loading } from "../../components/Loading";
import { orderPath, apqpPath } from "../../utils/links";

function Panel({
  title,
  subtitle,
  badge,
  conclusion,
  delay = 0,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: number;
  conclusion?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rise lift overflow-hidden rounded-xl border border-line bg-white shadow-[0_3px_14px_rgba(20,20,20,0.045)]"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3 border-b border-divider px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-ink-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
        </div>
        {badge != null && badge > 0 && (
          <span className="shrink-0 rounded-md bg-danger-bg px-2 py-0.5 text-xs font-bold text-danger">
            {badge}
          </span>
        )}
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

function Metric({
  label,
  value,
  note,
  tone = "slate",
  delay = 0,
  to,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "slate" | "red" | "amber" | "green";
  delay?: number;
  to?: string;
}) {
  const colours = {
    slate: "text-ink-900",
    red: "text-danger",
    amber: "text-warn",
    green: "text-ok",
  };
  const body = (
    <div
      className="rise lift h-full rounded-xl border border-line bg-white p-4 shadow-[0_3px_14px_rgba(20,20,20,0.045)]"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <p className="text-[10px] font-bold uppercase tracking-[1.1px] text-ink-400">{label}</p>
      <p className={`mt-1.5 text-[33px] font-bold leading-none tabular-nums ${colours[tone]}`}>
        <CountUp value={value} duration={850} delay={delay + 120} />
      </p>
      {note && <p className="mt-1.5 text-xs text-ink-400">{note}</p>}
    </div>
  );

  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

type LateInfo = { days: number; count: number; what: string } | undefined;

const MS_PER_DAY = 86_400_000;

/** Whole days from today until an ISO date. Read once per module load, not per render. */
function daysUntil(iso: string | null, now: number) {
  if (!iso) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / MS_PER_DAY));
}

function Workstream({
  kind,
  title,
  total,
  delayed,
  href,
  worst,
  rows,
  delay = 0,
}: {
  kind: "order" | "apqp";
  title: string;
  total: number;
  delayed: number;
  href: string;
  worst?: string;
  rows: { id: string; sub: string; percent: number; to: string; late: LateInfo }[];
  delay?: number;
}) {
  const accent = kind === "order" ? "bg-brand-600" : "bg-info";
  const tag = kind === "order" ? "bg-brand-50 text-brand-600" : "bg-info-bg text-info";

  return (
    <section
      className="rise lift flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_3px_14px_rgba(20,20,20,0.045)]"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <div className="flex items-end justify-between gap-3 border-b border-divider px-4 py-3.5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[1.1px] text-ink-400">{title}</p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[32px] font-bold leading-none tabular-nums text-ink-900">
              <CountUp value={total} delay={delay + 100} />
            </span>
            <span className="text-xs text-ink-400">total</span>
          </p>
        </div>
        <span
          className={`rounded-md px-2 py-1 text-[11px] font-bold ${
            delayed > 0 ? "bg-danger-bg text-danger" : "bg-ok-bg text-ok"
          }`}
        >
          {delayed > 0 ? `${delayed} delayed` : "all on plan"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="flex-1 px-4 py-10 text-center text-sm text-ink-400">
          Nothing here yet.
        </p>
      ) : (
        <div className="flex-1 divide-y divide-divider">
          {rows.map((r, i) => (
            <Link
              key={r.id}
              to={r.to}
              className="rise nudge block px-4 py-3"
              style={{ "--d": `${delay + 180 + i * 60}ms` } as React.CSSProperties}
            >
              <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${tag}`}>
                  {kind === "order" ? "TRACKING" : "APQP TIMELINE"}
                </span>
                <span className="truncate text-[13px] font-bold text-ink-900">{r.id}</span>
                <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums text-ink-900">
                  <CountUp value={r.percent} delay={delay + 240 + i * 60} />%
                </span>
              </div>

              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`bar-x h-full rounded-full ${r.late ? "bg-danger" : accent}`}
                  style={
                    {
                      width: `${Math.max(r.percent, 2)}%`,
                      "--d": `${delay + 240 + i * 60}ms`,
                    } as React.CSSProperties
                  }
                />
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <span className="truncate text-[11px] text-ink-400">{r.sub}</span>
                {r.late && (
                  <span
                    className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                      r.late.days >= 7 ? "bg-danger-bg text-danger" : "bg-alert-bg text-alert"
                    }`}
                    title={`${r.late.what} is ${plural(r.late.days, "day")} past plan`}
                  >
                    {r.late.days}d late
                    {r.late.count > 1 && ` · ${plural(r.late.count, "item")}`}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Link
        to={href}
        className="border-t border-divider bg-slate-50 px-4 py-2.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50"
      >
        View all {total} {title.toLowerCase()} &rarr;
      </Link>

      {worst && (
        <p className="border-t border-divider px-4 py-2.5 text-xs text-ink-500">{worst}</p>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { data, loading, error } = useFetch(() => dashboardApi.summary(), [], { key: "dashboard" });
  // Captured once so render stays pure and the output is stable.
  const [nowMs] = useState(() => Date.now());

  if (loading) return <Loading label="Loading dashboard..." />;
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  if (!data) return null;

  const {
    orders,
    apqp,
    combined_attention,
    combined_attention_stats: stats,
    week_load,
    due_next_7_days,
    recent,
    apqp_recent,
    upcoming_deliveries,
  } = data as typeof data & {
    apqp_recent?: {
      project_id: string;
      customer: string;
      customer_part_no: string | null;
      current_phase: string | null;
      percent: number;
      status: string;
    }[];
    upcoming_deliveries?: {
      order_no: string;
      customer_name: string;
      delivery_date: string | null;
      status: string;
      progress_percent: number;
    }[];
  };

  // Totals come from the server (they cover every overdue item); the list
  // itself only carries the worst rows. Falls back to counting the list.
  const totalAttention = stats?.total ?? combined_attention.length;
  const thisWeek = week_load[0];
  const busiestWeek = [...week_load].sort((a, b) => b.count - a.count)[0];
  // Highlight a peak only when one week really stands out (no ties).
  const peakIsUnique = !!busiestWeek && busiestWeek.count > 0 &&
    week_load.filter((w) => w.count === busiestWeek.count).length === 1;
  const weekTotal = week_load.reduce((s, w) => s + w.count, 0);
  const weekConclusion = weekTotal === 0 ? undefined
    : peakIsUnique
      ? `${plural(weekTotal, "stage")} due in the next 4 weeks. Busiest: ${busiestWeek.label.toLowerCase()} (${busiestWeek.count}) — plan people for it.`
      : `${plural(weekTotal, "stage")} due in the next 4 weeks, spread evenly. ${thisWeek?.count ?? 0} this week.`;

  const orderAttention = stats?.orders ?? combined_attention.filter((a) => a.kind === "order").length;
  const apqpAttention = stats?.apqp ?? combined_attention.filter((a) => a.kind === "apqp").length;

  const lateBy: Record<string, { days: number; count: number; what: string }> = {};
  if (stats) {
    Object.assign(lateBy, stats.late_by);
  } else for (const a of combined_attention) {
    const key = `${a.kind}:${a.record_id}`;
    const cur = lateBy[key];
    if (!cur || a.days_overdue > cur.days) {
      lateBy[key] = { days: a.days_overdue, count: (cur?.count ?? 0) + 1, what: a.name };
    } else {
      cur.count += 1;
    }
  }


  // const worstOrder = [...(recent ?? [])]
  //   .map((o) => ({ ...o, late: lateBy[o.order_no]?.days ?? 0 }))
  //   .sort((a, b) => b.late - a.late)[0];
  // const worstApqp = [...(apqp_recent ?? [])]
  //   .map((p) => ({ ...p, late: lateBy[p.project_id]?.days ?? 0 }))
  //   .sort((a, b) => b.late - a.late)[0];


    const worstOrder = [...(recent ?? [])]
    .map((o) => ({ ...o, late: lateBy[`order:${o.order_no}`]?.days ?? 0 }))
    .sort((a, b) => b.late - a.late)[0];
  const worstApqp = [...(apqp_recent ?? [])]
    .map((p) => ({ ...p, late: lateBy[`apqp:${p.project_id}`]?.days ?? 0 }))
    .sort((a, b) => b.late - a.late)[0];

  // ── Overdue backlog, bucketed by how late ──────────────────────────
  const maxOverdue = stats?.max_days ?? combined_attention.reduce((m, a) => Math.max(m, a.days_overdue), 0);
  const buckets = [
    { label: "1-3 days", tone: "bg-alert", items: 0 },
    { label: "4-7 days", tone: "bg-warn", items: 0 },
    { label: "8-14 days", tone: "bg-danger", items: 0 },
    { label: "15+ days", tone: "bg-brand-900", items: 0 },
  ];
  if (stats) stats.buckets.forEach((n, i) => { if (buckets[i]) buckets[i].items = n; });
  else for (const a of combined_attention) {
    const d = a.days_overdue;
    const i = d <= 3 ? 0 : d <= 7 ? 1 : d <= 14 ? 2 : 3;
    buckets[i].items += 1;
  }
  const maxBucket = Math.max(1, ...buckets.map((b) => b.items));

  // ── Delivery commitments, with a crude at-risk test ────────────────
  // If less than half the remaining work is done and the date is close, flag it.
  const deliveries = (upcoming_deliveries ?? []).map((d) => {
    const days = daysUntil(d.delivery_date, nowMs);
    const risk = d.progress_percent < 100 - days * 2;
    return { ...d, days, risk };
  });
  const atRisk = deliveries.filter((d) => d.risk).length;

  const ownerCounts: Record<string, number> = {};
  if (!stats) for (const a of combined_attention) {
    if (a.owner) ownerCounts[a.owner] = (ownerCounts[a.owner] ?? 0) + 1;
  }
  const topOwner: [string, number] | undefined = stats
    ? (stats.top_owner ? [stats.top_owner, stats.top_owner_count] : undefined)
    : Object.entries(ownerCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="pb-10">
      <div className="rise flex flex-wrap items-start justify-between gap-3" style={{ "--d": "0ms" } as React.CSSProperties}>
        <div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600 shadow-[0_0_0_4px_var(--color-brand-50)]" />
          <span className="text-[8px] font-extrabold uppercase tracking-[1.4px] text-brand-600">
            Live overview
          </span>
        </div>
        <h1 className="mt-1.5 text-[26px] font-bold tracking-[-0.8px] text-ink-900">DASHBOARD - NEW PRODUCT DEVELOPMENT</h1>
        <p className="mt-1 text-xs text-ink-400">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        </div>
        {/* Moved here from the APQP Timeline page. Same rule as the server:
            needs APQP edit AND Create new timeline (admins always). */}
        <PermissionGuard permission="apqp_edit">
        <PermissionGuard permission="timeline_create">
          <Link to="/apqp/new" className="shrink-0 rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
            NEW PRODUCT
          </Link>
        </PermissionGuard>
        </PermissionGuard>
      </div>

      {/* ── Live register: every order and project, with real progress ── */}
      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">

        <Workstream
          kind="apqp"
          title="APQP TIMELINE"
          total={apqp.total}
          delayed={apqp.delayed}
          href="/apqp"
          delay={20}
          worst={
            worstApqp && worstApqp.late > 0
              ? `${worstApqp.product_name ?? worstApqp.project_id} is the furthest behind — ${lateBy[`apqp:${worstApqp.project_id}`].what} is ${plural(worstApqp.late, "day")} past plan.`
              : apqp.total > 0
                ? "Every APQP Timeline is on plan."
                : undefined
          }
          rows={(apqp_recent ?? []).map((p) => ({
            id: p.product_name ?? p.project_id,
            sub: p.current_phase ? `${p.customer} · ${p.current_phase}` : p.customer,
            percent: p.percent,
            to: apqpPath(p),
            late: lateBy[`apqp:${p.project_id}`],
          }))}
        />
      

        <Workstream
          kind="order"
          title="TRACKING"
          total={orders.total}
          delayed={orders.delayed}
          href="/orders"
          delay={40}
          worst={
            worstOrder && worstOrder.late > 0
              ? `${worstOrder.product_name ?? worstOrder.order_no} is the furthest behind — ${lateBy[`order:${worstOrder.order_no}`].what} is ${plural(worstOrder.late, "day")} past plan.`
              : orders.total > 0
                ? "Every TRACKING is on plan."
                : undefined
          }
          rows={(recent ?? []).map((o) => ({
            id: o.product_name ?? o.order_no,
            sub: o.customer_name,
            percent: o.progress_percent,
            to: orderPath(o),
            late: lateBy[`order:${o.order_no}`],
          }))}
        />
      </div>

        

      {/* ── Four headline numbers ── */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
          label="Active APQP Timeline"
          value={apqp.total - apqp.completed}
          note={
            apqp.active_activities
              ? `${apqp.active_activities - (apqp.active_activities_done ?? 0)} of ${apqp.active_activities} steps remaining`
              : "no steps outstanding"
          }
          delay={180}
          to="/apqp"
        />
        <Metric
          label="Active Tracking"
          value={orders.total - orders.completed}
          note={
            orders.active_stages
              ? `${orders.active_stages - (orders.active_stages_done ?? 0)} of ${orders.active_stages} steps remaining`
              : "no steps outstanding"
          }
          delay={120}
          to="/orders"
        />

        <Metric
          label="Needs attention"
          value={totalAttention}
          note={`${plural(orderAttention, "stage")} · ${plural(apqpAttention, "activity", "activities")}`}
          tone={totalAttention > 0 ? "red" : "green"}
          delay={240}
        />
        <Metric
          label="Due next 7 days"
          value={due_next_7_days}
          note="stages falling due"
          tone={due_next_7_days > 0 ? "amber" : "slate"}
          delay={300}
        />
      </div>

      {/* ── Attention list ── */}
      <div className="mt-3">
        <Panel
          title="Needs attention now"
          subtitle="TRACKING and APQP Timelines together, worst first"
          badge={totalAttention}
          delay={360}
          conclusion={
            topOwner
              ? `${topOwner[1]} of ${totalAttention} are waiting on ${topOwner[0]}.`
              : totalAttention > 0
                ? "No owner is configured for these stages — set them in Email Settings."
                : undefined
          }
        >
          {combined_attention.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-400">
              Nothing overdue. Everything is on plan.
            </p>
          ) : (
            <div className="divide-y divide-divider">
              {combined_attention.slice(0, 8).map((a, i) => (
                <Link
                  key={`${a.kind}-${a.record_id}-${a.code}`}
                  to={a.kind === "order" ? `/orders/${a.record_id}` : `/apqp/${a.record_id}`}
                  className="rise nudge flex items-center gap-3 px-4 py-2.5"
                  style={{ "--d": `${420 + i * 45}ms` } as React.CSSProperties}
                >
                  <span
                    className={`w-11 shrink-0 rounded-md px-1.5 py-1 text-center text-[11px] font-bold tabular-nums ${
                      a.days_overdue >= 7
                        ? "bg-danger-bg text-danger pulse-soft"
                        : "bg-alert-bg text-alert"
                    }`}
                  >
                    {a.days_overdue}d
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      a.kind === "order"
                        ? "bg-brand-50 text-brand-600"
                        : "bg-info-bg text-info"
                    }`}
                  >
                    {a.kind === "order" ? "TRACKING" : "APQP TIMELINE"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-900">
                      <span className="font-semibold underline decoration-line underline-offset-2">
                        {a.display_name ?? a.record_id}
                      </span>
                      <span className="mx-1.5 text-ink-300">·</span>
                      <span className="font-mono text-xs">{a.code}</span>
                      <span className="ml-1.5 text-ink-700">{a.name}</span>
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {a.customer}
                      {a.owner && ` · ${a.owner}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── How bad is the backlog, and what do we owe ── */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel
          title="Overdue backlog"
          subtitle="How far past plan, grouped by age"
          badge={totalAttention}
          delay={440}
          conclusion={
            buckets[3].items > 0
              ? `${plural(buckets[3].items, "item")} ${buckets[3].items === 1 ? "is" : "are"} more than two weeks late — escalate first.`
              : totalAttention > 0
                ? `Worst item is ${plural(maxOverdue, "day")} past plan.`
                : "Nothing is overdue."
          }
        >
          {totalAttention === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-400">
              No overdue work. Everything is on plan.
            </p>
          ) : (
            <div className="space-y-3 px-4 py-4">
              {buckets.map((b, i) => (
                <div key={b.label} className="flex items-center gap-2.5">
                  <span className="w-24 shrink-0 text-xs text-ink-700">{b.label}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                    <div
                      className={`bar-x h-full rounded-md ${b.tone}`}
                      style={
                        {
                          width: `${(b.items / maxBucket) * 100}%`,
                          "--d": `${520 + i * 70}ms`,
                        } as React.CSSProperties
                      }
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-ink-900">
                    {b.items}
                  </span>
                </div>
              ))}

              {topOwner && (
                <div className="mt-4 flex items-center gap-2 border-t border-divider pt-3">
                  <span className="text-[10px] font-bold uppercase tracking-[1px] text-ink-400">
                    Worst owner
                  </span>
                  <span className="text-xs font-bold text-ink-900">{topOwner[0]}</span>
                  <span className="ml-auto rounded bg-danger-bg px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-danger">
                    {plural(topOwner[1], "item")}
                  </span>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title="Delivery commitments"
          subtitle="Sample deliveries promised, soonest first"
          delay={500}
          conclusion={
            atRisk > 0
              ? `${atRisk} delivery look unlikely to be met at the current rate.`
              : deliveries.length > 0
                ? "Every upcoming delivery is on track."
                : undefined
          }
        >
          {deliveries.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-400">
              No sample deliveries scheduled.
            </p>
          ) : (
            <div className="divide-y divide-divider">
              {deliveries.map((d, i) => (
                <Link
                  key={d.order_no}
                  to={orderPath(d)}
                  className="rise nudge block px-4 py-3"
                  style={{ "--d": `${560 + i * 55}ms` } as React.CSSProperties}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-bold ${
                        d.days <= 7
                          ? "bg-danger-bg text-danger"
                          : d.days <= 21
                            ? "bg-alert-bg text-alert"
                            : "bg-slate-100 text-ink-500"
                      }`}
                    >
                      {d.days === 0 ? "today" : `in ${d.days}d`}
                    </span>
                    <span className="truncate text-[13px] font-bold text-ink-900">
                      {d.product_name ?? d.order_no}
                    </span>
                    <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums text-ink-900">
                      {d.progress_percent}%
                    </span>
                  </div>

                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`bar-x h-full rounded-full ${d.risk ? "bg-danger" : "bg-ok"}`}
                      style={
                        {
                          width: `${Math.max(d.progress_percent, 2)}%`,
                          "--d": `${620 + i * 55}ms`,
                        } as React.CSSProperties
                      }
                    />
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="truncate text-[11px] text-ink-400">{d.customer_name}</span>
                    {d.risk && (
                      <span className="ml-auto shrink-0 rounded bg-danger-bg px-1.5 py-0.5 text-[10px] font-bold text-danger">
                        at risk
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Coming up: what has to be finished in each of the next 4 weeks ── */}
      <div className="mt-3">
        <Panel
          title="Coming up — next 4 weeks"
          subtitle="Stages that must be finished each week (by plan date). Click one to open the order."
          delay={560}
          conclusion={weekConclusion}
        >
          {week_load.every((w) => w.count === 0) ? (
            <p className="px-4 py-10 text-center text-sm text-ink-400">
              Nothing is planned to finish in the next four weeks.
            </p>
          ) : (
            <div className="grid grid-cols-1 divide-y divide-divider sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
              {week_load.map((w, i) => {
                const start = new Date(w.starts + "T00:00:00");
                const end = new Date(start); end.setDate(start.getDate() + 6);
                const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                const busy = peakIsUnique && w === busiestWeek;
                const extra = w.count - (w.items?.length ?? 0);
                return (
                  <div key={w.label} className="rise flex flex-col px-4 py-3" style={{ "--d": `${600 + i * 70}ms` } as React.CSSProperties}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <div>
                        <p className={`text-[13px] font-bold ${i === 0 ? "text-brand-700" : "text-ink-900"}`}>{w.label}</p>
                        <p className="text-[11px] text-ink-400">{fmt(start)} – {fmt(end)}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                          w.count === 0 ? "bg-slate-100 text-ink-400"
                            : busy ? "bg-warn-bg text-warn"
                            : i === 0 ? "bg-brand-50 text-brand-700"
                            : "bg-slate-100 text-ink-700"
                        }`}
                        title={busy ? "Busiest week" : undefined}
                      >
                        {w.count} due{busy ? " · busiest" : ""}
                      </span>
                    </div>
                    {w.count === 0 ? (
                      <p className="py-3 text-[12px] text-ink-400">Nothing due.</p>
                    ) : (
                      <ul className="space-y-1">
                        {(w.items ?? []).map((it, k) => {
                          const d = new Date(it.plan_date + "T00:00:00");
                          return (
                            <li key={`${it.order_no}-${it.stage_name}-${k}`}>
                              <Link
                                to={orderPath(it)}
                                className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50"
                                title={`${it.product_name || it.order_no} · ${it.customer_name} · ${it.stage_name}`}
                              >
                                <span className="w-11 shrink-0 pt-px text-[10px] font-semibold uppercase leading-tight text-ink-400">
                                  {d.toLocaleDateString("en-GB", { weekday: "short" })}
                                  <span className="block text-[12px] font-bold text-ink-700">{d.getDate()}</span>
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[12px] font-semibold text-ink-900">{it.product_name || it.order_no}</span>
                                  <span className="block truncate text-[11px] text-ink-500">{it.stage_name}</span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                        {extra > 0 && (
                          <li>
                            <Link to="/orders" className="block px-1.5 py-1 text-[11px] font-semibold text-brand-700 hover:underline">
                              + {extra} more in Tracking
                            </Link>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}