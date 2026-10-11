import { plural } from "../../utils/formatters";



import { useState } from "react";
import { Link } from "react-router-dom";
import { analyticsApi } from "../../services/analyticsApi";
import { templateApi } from "../../services/templateApi";
import { useFetch } from "../../hooks/useFetch";
import { useAuth } from "../../hooks/useAuth";
import { Loading } from "../../components/Loading";
import { BusinessAnalytics } from "./BusinessAnalytics";
import { ApqpAnalytics } from "./ApqpAnalytics";

function Bar({ pct, tone }: { pct: number; tone: string }) {
  const colours: Record<string, string> = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    green: "bg-green-600",
    slate: "bg-slate-800",
  };
  return (
    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
      <div className={`h-full ${colours[tone] ?? colours.slate}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function Panel({
  title,
  subtitle,
  conclusion,
  children,
}: {
  title: string;
  subtitle?: string;
  conclusion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
      {conclusion && (
        <p className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">{conclusion}</p>
      )}
    </section>
  );
}


export default function Analytics() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"business" | "orders" | "apqp">("business");
  const [filters, setFilters] = useState({ month: "", customer: "", bearing_type: "" });
  const [applied, setApplied] = useState(filters);
  // How many months the Business charts show (remembered in this browser).
  const [months, setMonths] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("npd_business_months")); return [3, 6, 12, 24].includes(v) ? v : 6; } catch { return 6; }
  });
  function pickMonths(n: number) {
    setMonths(n);
    try { localStorage.setItem("npd_business_months", String(n)); } catch { /* private window */ }
  }

  const { data, loading, error } = useFetch(() => analyticsApi.get({ ...applied, months }), [applied, months], { key: `analytics:${JSON.stringify(applied)}:${months}` });
  const { data: lookups } = useFetch(() => templateApi.getLookups(), [], { key: "lookups" });

  if (loading && !data) return <Loading label="Calculating..." />;
  if (error) return <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
  if (!data) return null;

  const worst = [...data.bottlenecks]
    .filter((b) => (b.avg_delay_days ?? 0) > 0)
    .sort((a, b) => (b.avg_delay_days ?? 0) - (a.avg_delay_days ?? 0))
    .slice(0, 8);

  const maxDelay = Math.max(1, ...worst.map((b) => b.avg_delay_days ?? 0));
  const totalDelay = worst.reduce((s, b) => s + (b.avg_delay_days ?? 0), 0);
  const topShare = worst.length && totalDelay ? Math.round(((worst[0].avg_delay_days ?? 0) / totalDelay) * 100) : 0;
  const topLead = data.lead_times.find((l) => l.stage_code === worst[0]?.stage_code);

  const reasons = data.delay_reasons.slice(0, 6);
  const maxReason = Math.max(1, ...reasons.map((r) => r.count));

  const drift = [...data.lead_times]
    .filter((l) => l.sample_size > 0 && l.variance !== null && Math.abs(l.variance) >= 2)
    .sort((a, b) => Math.abs(b.variance ?? 0) - Math.abs(a.variance ?? 0))
    .slice(0, 6);

  const trend = data.trend.slice(-6);
  const maxTrendHeight = 90;

  const firstTrend = trend[0];
  const lastTrend = trend[trend.length - 1];

  return (
    <div className="pb-10">
      <h1 className="text-xl font-bold tracking-[-0.5px] text-ink-900 sm:text-2xl lg:text-[26px] lg:tracking-[-0.8px]">
        Analytics - NPD
      </h1>
      <p className="mt-1 text-xs text-ink-400">
        {tab === "business"
          ? "How the business is growing"
          : tab === "orders"
            ? "Where time is being lost"
            : "How APQP projects are progressing"}
      </p>

      <div className="mt-5 rounded-lg border border-line bg-white p-3 sm:mt-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-ink-400">
              Month
            </label>
            <select
              value={filters.month}
              onChange={(e) => setFilters({ ...filters, month: e.target.value })}
              className="w-full rounded border border-slate-300 px-2 py-2.5 text-sm lg:w-auto lg:py-1.5"
            >
              <option value="">All months</option>
              {(data.available_months ?? []).map((m) => (
                <option key={m} value={m}>
                  {new Date(Number(m.split("-")[0]), Number(m.split("-")[1]) - 1, 1)
                    .toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-ink-400">
              Customer
            </label>
            <select
              value={filters.customer}
              onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All customers</option>
              {(data.available_customers ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-ink-400">
              Bearing type
            </label>
            <select
              value={filters.bearing_type}
              onChange={(e) => setFilters({ ...filters, bearing_type: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All types</option>
              {(lookups?.bearing_types ?? []).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* On phones the two buttons share one grid cell so they sit side
              by side; from lg they are separate flex children again. */}
          <div className="flex gap-2 sm:col-span-2 lg:contents">
            <button
              onClick={() => setApplied(filters)}
              className="flex-1 rounded bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 lg:flex-none lg:py-1.5"
            >
              Apply
            </button>

            {(filters.month || filters.customer || filters.bearing_type) && (
              <button
                onClick={() => {
                  const cleared = { month: "", customer: "", bearing_type: "" };
                  setFilters(cleared);
                  setApplied(cleared);
                }}
                className="flex-1 rounded border border-slate-300 px-3 py-2.5 text-sm text-ink-700 hover:bg-slate-50 lg:flex-none lg:py-1.5"
              >
                Clear
              </button>
            )}
          </div>

          <span className="text-sm text-ink-500 sm:col-span-2 lg:ml-auto lg:self-end">
            {loading ? (
              "updating..."
            ) : (
              <>
                <strong className="tabular-nums text-ink-900">{data.order_count}</strong> orders
                {" · "}
                <strong className="tabular-nums text-ink-900">{data.item_count}</strong> items
              </>
            )}
          </span>
        </div>

        {/* Which records the whole page is currently based on */}
        {(data.matched_orders ?? []).length > 0 && (
          <div className="mt-3 border-t border-divider pt-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[1px] text-ink-400">
              Showing {(data.matched_orders ?? []).length}{" "}
              {tab === "apqp" ? "APQP projects" : "orders"}
            </p>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto overscroll-contain sm:max-h-32">
              {(data.matched_orders ?? []).map((no) => (
                <Link
                  key={no}
                  to={tab === "apqp" ? `/apqp/${no}` : `/orders/${no}`}
                  className="rounded border border-line bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-ink-700 transition-colors hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700"
                >
                  {no}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="mt-5 flex gap-2" role="tablist">
        {(["business", "orders", "apqp"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
              tab === t ? "bg-brand-700 text-white" : "text-ink-500 hover:bg-slate-100"
            }`}
          >
            {t === "business" ? "Business" : t === "orders" ? "Tracking" : "APQP"}
          </button>
        ))}
      </div>

      {tab === "business" && (
        <BusinessAnalytics
          intake={data.intake ?? []}
          book={data.order_book ?? null}
          customers={data.customers ?? []}
          cycles={data.cycles ?? []}
          currency={data.currency ?? "\u20b9"}
          isAdmin={user?.role === "admin"}
          months={months}
          onMonths={pickMonths}
          onPickMonth={(m) => {
            const next = { ...filters, month: m };
            setFilters(next);
            setApplied(next);
          }}
        />
      )}

      {tab === "apqp" && (
        <ApqpAnalytics
          phases={data.apqp_phases ?? []}
          projects={data.apqp_projects ?? []}
          departments={data.apqp_departments ?? []}
          projectCount={data.apqp_project_count ?? 0}
          activityCount={data.apqp_activity_count ?? 0}
        />
      )}

      {tab === "orders" && (
        <>

      

      <div className="mt-3">
        <Panel
          title="Slowest stages"
          subtitle="Average days late, across all orders"
          conclusion={
            worst.length
              ? `Stage ${worst[0].stage_code} accounts for ${topShare}% of all lost time.` +
                (topLead?.variance != null
                  ? ` Configured at +${topLead.template_offset}, actual average +${topLead.actual_avg_offset}.`
                  : "")
              : undefined
          }
        >
          {worst.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No delays recorded yet. Enter actual dates to build up this analysis.
            </p>
          ) : (
            <div className="space-y-3 px-4 py-4">
              {worst.map((b) => (
                <div key={b.stage_code} className="flex items-center gap-2.5">
                  <div className="w-32 shrink-0 truncate text-xs">
                    <span className="font-mono font-medium text-slate-900">{b.stage_code}</span>
                    <span className="ml-1.5 text-slate-500">{b.stage_name}</span>
                  </div>
                  <Bar pct={((b.avg_delay_days ?? 0) / maxDelay) * 100}
                    tone={(b.avg_delay_days ?? 0) > maxDelay / 2 ? "red" : "amber"} />
                  <span className={`w-14 shrink-0 text-right text-xs font-medium ${
                    (b.avg_delay_days ?? 0) > maxDelay / 2 ? "text-red-600" : "text-amber-600"
                  }`}>
                    +{b.avg_delay_days}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel
          title="Why it was late"
          subtitle="Recorded delay reasons"
          conclusion={
            reasons.length
              ? `${reasons[0].reason} is the most common cause, on ${plural(reasons[0].count, "stage")}.`
              : undefined
          }
        >
          {reasons.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No delay reasons recorded. Select one when entering a late actual date.
            </p>
          ) : (
            <div className="space-y-2.5 px-4 py-4">
              {reasons.map((r) => (
                <div key={r.reason}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-900">{r.reason}</span>
                    <span className="text-slate-500">
                      {r.count}
                      {r.avg_delay_days != null && ` · avg +${r.avg_delay_days}d`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
                    <div className="h-full bg-amber-500" style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="On-time trend"
          subtitle="Dispatched on plan, by month"
          conclusion={
            trend.length >= 2 && firstTrend && lastTrend
              ? `${lastTrend.on_time_rate >= firstTrend.on_time_rate ? "Improving" : "Declining"} — ${lastTrend.on_time_rate}% latest, from ${firstTrend.on_time_rate}%.`
              : undefined
          }
        >
          {trend.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Not enough dispatched orders to show a trend.
            </p>
          ) : (
            <div className="flex h-32 items-end gap-2.5 px-4 py-4">
              {trend.map((t) => (
                <div key={t.month} className="flex-1 text-center">
                  <div
                    className={`rounded-t ${
                      t.on_time_rate >= 80 ? "bg-green-600" : t.on_time_rate >= 50 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ height: `${Math.max((t.on_time_rate / 100) * maxTrendHeight, 3)}px` }}
                    title={`${t.on_time}/${t.completed} on time`}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    {new Date(`${t.month}-01`).toLocaleDateString("en-GB", { month: "short" })}
                  </p>
                  <p className="text-[10px] font-medium text-slate-700">{t.on_time_rate}%</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-3">
        <Panel
          title="Template drift"
          subtitle="Where the configured offset does not match reality"
          conclusion={
            drift.length
              ? `${plural(drift.length, "stage")} ${drift.length === 1 ? "is" : "are"} more than 2 days out. Update these in Settings → Bearing Plans so new orders plan realistically.`
              : undefined
          }
        >
          {drift.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Not enough completed stages to compare, or the template matches reality.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {drift.map((l) => (
                <div key={l.stage_code} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-10 shrink-0 font-mono text-xs font-medium text-slate-900">{l.stage_code}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{l.stage_name}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    plan +{l.template_offset} · actual +{l.actual_avg_offset}
                  </span>
                  <span className={`w-14 shrink-0 text-right text-xs font-medium ${
                    (l.variance ?? 0) > 0 ? "text-red-600" : "text-green-700"
                  }`}>
                    {(l.variance ?? 0) > 0 ? "+" : ""}{l.variance}d
                  </span>
                  <span className="w-12 shrink-0 text-right text-[10px] text-slate-400">n={l.sample_size}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

        </>
      )}
    </div>
  );
}

