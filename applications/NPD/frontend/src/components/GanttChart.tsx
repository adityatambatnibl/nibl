import { formatDate } from "../utils/formatters";
import type { TimelineBar } from "../types";

const DAY = 86_400_000;

const DOT: Record<string, string> = {
  not_started: "bg-slate-300",
  in_progress: "bg-blue-500",
  overdue: "bg-red-500",
  completed: "bg-green-600",
  completed_late: "bg-amber-500",
};

export function GanttChart({
  bars,
  today,
  rangeStart,
  rangeEnd,
}: {
  bars: TimelineBar[];
  today: string;
  rangeStart: string;
  rangeEnd: string;
}) {
  const start = new Date(rangeStart).getTime();
  const end = new Date(rangeEnd).getTime();
  const span = Math.max(end - start, DAY);

  const pct = (iso: string) => ((new Date(iso).getTime() - start) / span) * 100;

  // Month gridlines
  const months: { label: string; left: number }[] = [];
  const cursor = new Date(rangeStart);
  cursor.setDate(1);
  while (cursor.getTime() <= end) {
    if (cursor.getTime() >= start) {
      months.push({
        label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        left: pct(cursor.toISOString().slice(0, 10)),
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const todayLeft = pct(today);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-3xl">
        <div className="relative mb-1 ml-56 h-6 border-b border-slate-200">
          {months.map((m) => (
            <span
              key={m.label}
              className="absolute top-0 text-[10px] font-medium text-slate-500"
              style={{ left: `${m.left}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {bars.map((b) => {
          const planLeft = b.plan_date ? pct(b.plan_date) : null;
          const actualLeft = b.actual_date ? pct(b.actual_date) : null;

          return (
            <div key={`${b.schedule_group}-${b.stage_code}`} className="flex items-center border-b border-slate-50 py-1">
              <div className="flex w-56 shrink-0 items-center gap-2 pr-3">
                <span className="w-8 font-mono text-xs font-medium text-slate-900">{b.stage_code}</span>
                <span className="truncate text-xs text-slate-600" title={b.stage_name}>
                  {b.stage_name}
                </span>
              </div>

              <div className="relative h-6 flex-1">
                {months.map((m) => (
                  <div key={m.label} className="absolute top-0 h-full w-px bg-slate-100" style={{ left: `${m.left}%` }} />
                ))}

                <div
                  className="absolute top-0 h-full w-px bg-red-400"
                  style={{ left: `${todayLeft}%` }}
                  title={`Today — ${formatDate(today)}`}
                />

                                {planLeft !== null && (
                  <div
                    className="group absolute top-0.5 h-3 w-3 -translate-x-1/2 rounded-full bg-red-500 ring-2 ring-white"
                    style={{ left: `${planLeft}%` }}
                  >
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white group-hover:block">
                      Plan: {formatDate(b.plan_date)}
                    </span>
                  </div>
                )}

                                {actualLeft !== null && (
                  <div
                    className={`group absolute top-3 h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-white ${DOT[b.status] ?? "bg-slate-400"}`}
                    style={{ left: `${actualLeft}%` }}
                  >
                    <span className="pointer-events-none absolute top-full left-1/2 z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white group-hover:block">
                      Actual: {formatDate(b.actual_date)}
                      {b.delay_days != null && b.delay_days > 0 && ` (+${b.delay_days}d)`}
                    </span>
                  </div>
                )}

                {planLeft !== null && actualLeft !== null && Math.abs(actualLeft - planLeft) > 0.1 && (
                  <div
                    className={`absolute top-2.5 h-0.5 ${b.delay_days && b.delay_days > 0 ? "bg-amber-400" : "bg-green-400"}`}
                    style={{
                      left: `${Math.min(planLeft, actualLeft)}%`,
                      width: `${Math.abs(actualLeft - planLeft)}%`,
                    }}
                  />
                )}
              </div>

              <div className="w-20 shrink-0 pl-2 text-right">
                {b.delay_days != null && b.delay_days > 0 && (
                  <span className="text-xs font-medium text-red-600">+{b.delay_days}d</span>
                )}
              </div>
            </div>
          );
        })}

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Plan
          </span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-green-600" /> Completed</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-amber-500" /> Completed late</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500" /> Overdue</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-red-400" /> Today</span>
        </div>
      </div>
    </div>
  );
}