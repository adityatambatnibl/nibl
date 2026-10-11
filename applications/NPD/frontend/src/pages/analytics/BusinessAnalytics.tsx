import { useEffect, useRef } from "react";
import { plural } from "../../utils/formatters";
import { CountUp } from "../../components/Ring";

export type IntakeMonth = { month: string; received: number; completed: number; value?: number };
export type OrderBook = {
  total: number;
  delivered: number;
  in_progress: number;
  not_started: number;
  order_count: number;
};
export type CustomerShare = {
  customer: string;
  value: number;
  orders: number;
  percent: number;
};
export type CycleTime = { month: string; avg_days: number; orders: number };

/** 1840000 -> "18.4 L". Indian lakh/crore shorthand. */
function money(n: number) {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(1)} L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K`;
  return n.toFixed(0);
}

/** "2026-08" -> "Aug" */
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short" });
}

function Panel({
  title,
  subtitle,
  conclusion,
  delay = 0,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  conclusion?: string;
  delay?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rise lift overflow-hidden rounded-xl border border-line bg-white shadow-[0_3px_14px_rgba(20,20,20,0.045)]"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-divider px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-ink-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
        </div>
        {action}
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

export function BusinessAnalytics({
  intake,
  book,
  customers,
  cycles,
  currency,
  isAdmin,
  months = 6,
  onMonths,
  onPickMonth,
}: {
  intake: IntakeMonth[];
  book: OrderBook | null;
  customers: CustomerShare[];
  cycles: CycleTime[];
  currency: string;
  isAdmin: boolean;
  months?: number;
  onMonths?: (n: number) => void;
  onPickMonth?: (month: string) => void;
}) {
  // Long ranges scroll sideways (newest month in view) instead of squeezing the bars.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [intake.length]);
  const wide = intake.length > 8;

  const rangePicker = onMonths && (
    <div className="flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Months shown">
      {[3, 6, 12, 24].map((n) => (
        <button
          key={n}
          onClick={() => onMonths(n)}
          aria-pressed={months === n}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${months === n ? "bg-brand-600 text-white" : "text-ink-500 hover:bg-slate-50"}`}
        >
          {n === 12 ? "1 yr" : n === 24 ? "2 yr" : `${n} mo`}
        </button>
      ))}
    </div>
  );

  const maxIntake = Math.max(
    1,
    ...intake.flatMap((m) => [m.received, m.completed]),
  );
  const totalReceived = intake.reduce((s, m) => s + m.received, 0);
  const totalCompleted = intake.reduce((s, m) => s + m.completed, 0);
  const backlogChange = totalReceived - totalCompleted;

  const firstHalf = intake.slice(0, Math.ceil(intake.length / 2));
  const lastHalf = intake.slice(Math.ceil(intake.length / 2));
  const early = firstHalf.reduce((s, m) => s + m.received, 0);
  const late = lastHalf.reduce((s, m) => s + m.received, 0);
  const growth = early > 0 ? Math.round(((late - early) / early) * 100) : 0;

  const maxCycle = Math.max(1, ...cycles.map((c) => c.avg_days));
  const cycleChange =
    cycles.length >= 2 ? cycles[0].avg_days - cycles[cycles.length - 1].avg_days : 0;

  const topCustomer = customers[0];

  // Sales by month (admin): newest first, value of orders received that month.
  const sales = [...intake].reverse();
  const maxSale = Math.max(1, ...intake.map((m) => m.value ?? 0));
  const salesTotal = intake.reduce((s, m) => s + (m.value ?? 0), 0);
  const salesOrders = intake.reduce((s, m) => s + m.received, 0);
  const best = intake.reduce<IntakeMonth | null>((b, m) => ((m.value ?? 0) > (b?.value ?? 0) ? m : b), null);

  return (
    <div className="mt-4 space-y-3">
      {/* ── Intake vs delivery: the growth question ── */}
      <Panel
        title="Orders received vs completed"
        subtitle="Are we winning work faster than we can ship it?"
        delay={0}
        action={rangePicker}
        conclusion={
          intake.length === 0
            ? undefined
            : `${totalReceived} received, ${totalCompleted} completed. ` +
              (backlogChange > 0
                ? `The backlog grew by ${plural(backlogChange, "order")}.`
                : backlogChange < 0
                  ? `The backlog shrank by ${plural(-backlogChange, "order")}.`
                  : "The backlog is level.") +
              (growth !== 0 ? ` Intake is ${growth > 0 ? "up" : "down"} ${Math.abs(growth)}%.` : "")
        }
      >
        {intake.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-400">No order history yet.</p>
        ) : (
          <>
            <div ref={scroller} className={wide ? "overflow-x-auto" : ""}>
            <div className={`flex h-44 items-end px-4 pt-5 ${wide ? "gap-2" : "gap-3 sm:gap-5"}`}
              style={wide ? { minWidth: intake.length * 58 } : undefined}>
              {intake.map((m, i) => (
                <button
                  key={m.month}
                  onClick={() => onPickMonth?.(m.month)}
                  className={`group flex flex-col items-center ${wide ? "w-[50px] shrink-0 flex-1" : "flex-1"}`}
                  title={`Filter everything to ${m.month}`}
                >
                  <div className="flex h-32 w-full items-end justify-center gap-1">
                    <div
                      className="bar-y w-1/2 rounded-t-md bg-brand-600"
                      style={
                        {
                          height: `${Math.max((m.received / maxIntake) * 100, 2)}%`,
                          "--d": `${120 + i * 70}ms`,
                        } as React.CSSProperties
                      }
                      title={`${m.received} received in ${m.month}`}
                    />
                    <div
                      className="bar-y w-1/2 rounded-t-md bg-slate-300"
                      style={
                        {
                          height: `${Math.max((m.completed / maxIntake) * 100, 2)}%`,
                          "--d": `${160 + i * 70}ms`,
                        } as React.CSSProperties
                      }
                      title={`${m.completed} completed in ${m.month}`}
                    />
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-ink-700">
                    {monthLabel(m.month)}
                    {(i === 0 || m.month.endsWith("-01")) && (
                      <span className="ml-0.5 font-normal text-ink-400">{m.month.slice(2, 4)}</span>
                    )}
                  </p>
                  <p className="text-[10px] tabular-nums text-ink-400">
                    {m.received} / {m.completed}
                  </p>
                </button>
              ))}
            </div>
            </div>
            <div className="flex items-center justify-center gap-5 pb-4 pt-1">
              <span className="flex items-center gap-1.5 text-[11px] text-ink-500">
                <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> received
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-ink-500">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> completed
              </span>
            </div>
          </>
        )}
      </Panel>

      {/* ── Money: admin only ── */}
      {isAdmin && book && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Panel
            title="Order book"
            subtitle="Committed value, by how far each order has progressed"
            delay={60}
            conclusion={
              book.total > 0
                ? `${currency}${money(book.in_progress + book.not_started)} is still to be delivered across ${plural(book.order_count, "order")}.`
                : "No order values recorded."
            }
          >
            <div className="px-4 py-5">
              <p className="text-[30px] font-bold leading-none tabular-nums text-ink-900">
                {currency}
                <CountUp value={Math.round(book.total / 1000)} delay={200} />
                <span className="text-sm font-semibold text-ink-400"> K committed</span>
              </p>

              <div className="mt-5 space-y-3">
                {[
                  ["Delivered", book.delivered, "bg-ok"],
                  ["In progress", book.in_progress, "bg-brand-600"],
                  ["Not started", book.not_started, "bg-slate-300"],
                ].map(([label, val, tone], i) => {
                  const pct = book.total ? ((val as number) / book.total) * 100 : 0;
                  return (
                    <div key={label as string} className="flex items-center gap-2.5">
                      <span className="w-24 shrink-0 text-xs text-ink-700">{label}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                        <div
                          className={`bar-x h-full rounded-md ${tone}`}
                          style={
                            {
                              width: `${Math.max(pct, 1)}%`,
                              "--d": `${260 + i * 70}ms`,
                            } as React.CSSProperties
                          }
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-900">
                        {currency}
                        {money(val as number)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel
            title="Total value by customer"
            subtitle="Order value per customer and share of the order book"
            delay={120}
            conclusion={
              topCustomer && topCustomer.percent >= 30
                ? `${topCustomer.customer} is ${topCustomer.percent}% of the book — concentration risk.`
                : customers.length > 0
                  ? "No single customer dominates the order book."
                  : undefined
            }
          >
            {customers.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-ink-400">No customer data.</p>
            ) : (
              <div className="space-y-3 px-4 py-5">
                {customers.map((c, i) => (
                  <div key={c.customer} className="flex items-center gap-2.5">
                    <span className="w-28 shrink-0 truncate text-xs font-semibold text-ink-900" title={c.customer}>
                      {c.customer}
                      <span className="block text-[10px] font-normal text-ink-400">{plural(c.orders, "order")}</span>
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                      <div
                        className={`bar-x h-full rounded-md ${
                          c.percent >= 30 ? "bg-danger" : "bg-brand-600"
                        }`}
                        style={
                          {
                            width: `${Math.max(c.percent, 1)}%`,
                            "--d": `${320 + i * 60}ms`,
                          } as React.CSSProperties
                        }
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-ink-900"
                      title={`${currency}${c.value.toLocaleString("en-IN")} · ${plural(c.orders, "order")}`}>
                      {currency}{money(c.value)}
                    </span>
                    <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-ink-400">
                      {c.percent}%
                      {c.percent >= 30 && <span className="ml-1 text-danger">!</span>}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2.5 border-t border-divider pt-3">
                  <span className="w-28 shrink-0 text-xs font-bold uppercase tracking-wide text-ink-700">Total</span>
                  <span className="flex-1 text-[11px] text-ink-400">
                    {plural(customers.reduce((s, c) => s + c.orders, 0), "order")}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-ink-900">
                    {currency}{money(customers.reduce((s, c) => s + c.value, 0))}
                  </span>
                  <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-ink-400">100%</span>
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ── Sales by month: admin only ── */}
      {isAdmin && intake.length > 0 && (
        <Panel
          title="Sales by month"
          subtitle="Orders received and their value, by order date"
          delay={150}
          action={rangePicker}
          conclusion={
            salesTotal > 0 && best
              ? `${currency}${money(salesTotal)} from ${plural(salesOrders, "order")} in ${plural(intake.length, "month")}. Best month: ${monthLabel(best.month)} (${currency}${money(best.value ?? 0)}).`
              : "No order values recorded in these months."
          }
        >
          <div className="px-4 py-3">
            <div className="flex items-center gap-2.5 border-b border-divider pb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              <span className="w-16 shrink-0">Month</span>
              <span className="flex-1" />
              <span className="w-16 shrink-0 text-right">Orders</span>
              <span className="w-24 shrink-0 text-right">Value</span>
            </div>
            <div className={sales.length > 8 ? "max-h-72 overflow-y-auto" : ""}>
            {sales.map((m, i) => (
              <button
                key={m.month}
                onClick={() => onPickMonth?.(m.month)}
                className="flex w-full items-center gap-2.5 py-1.5 text-left hover:bg-slate-50"
                title={`${m.month}: ${currency}${(m.value ?? 0).toLocaleString("en-IN")} — click to filter everything to this month`}
              >
                <span className="w-16 shrink-0 text-xs font-semibold text-ink-700">
                  {monthLabel(m.month)} {m.month.slice(2, 4)}
                </span>
                <div className="h-3.5 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="bar-x h-full rounded bg-brand-600"
                    style={{ width: `${Math.max(((m.value ?? 0) / maxSale) * 100, (m.value ?? 0) > 0 ? 2 : 0)}%`, "--d": `${200 + i * 50}ms` } as React.CSSProperties}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-500">{m.received}</span>
                <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-ink-900">
                  {(m.value ?? 0) > 0 ? `${currency}${money(m.value ?? 0)}` : "—"}
                </span>
              </button>
            ))}
            </div>
            <div className="mt-1 flex items-center gap-2.5 border-t border-divider pt-2">
              <span className="w-16 shrink-0 text-xs font-bold uppercase tracking-wide text-ink-700">Total</span>
              <span className="flex-1" />
              <span className="w-16 shrink-0 text-right text-xs font-bold tabular-nums text-ink-900">{salesOrders}</span>
              <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-ink-900">{currency}{money(salesTotal)}</span>
            </div>
          </div>
        </Panel>
      )}

      {/* ── Cycle time: are we getting faster? ── */}
      <Panel
        title="How long an order takes"
        subtitle="Average days from A0 to dispatch, by month completed"
        delay={180}
        conclusion={
          cycles.length < 2
            ? "Not enough completed orders yet to show a trend."
            : cycleChange > 0
              ? `Down ${plural(Math.round(cycleChange), "day")} since ${monthLabel(cycles[0].month)}. You are getting faster.`
              : cycleChange < 0
                ? `Up ${plural(Math.round(-cycleChange), "day")} since ${monthLabel(cycles[0].month)}. Orders are taking longer.`
                : "Cycle time is steady."
        }
      >
        {cycles.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-400">
            No completed orders yet.
          </p>
        ) : (
          <div className="space-y-2.5 px-4 py-5">
            {cycles.map((c, i) => (
              <button
                key={c.month}
                onClick={() => onPickMonth?.(c.month)}
                className="flex w-full items-center gap-2.5 text-left"
                title={`Filter everything to ${c.month}`}
              >
                <span className="w-12 shrink-0 text-xs font-semibold text-ink-700">
                  {monthLabel(c.month)}
                </span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className="bar-x h-full rounded-md bg-info"
                    style={
                      {
                        width: `${(c.avg_days / maxCycle) * 100}%`,
                        "--d": `${240 + i * 70}ms`,
                      } as React.CSSProperties
                    }
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-900">
                  <span className="font-bold">{c.avg_days}</span>
                  <span className="text-ink-400"> days</span>
                </span>
                <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-ink-400">
                  {c.orders} order{c.orders === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}