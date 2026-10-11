
export function WeekGrid({
  columns,
  flags,
  onToggle,
  readOnly = false,
  tone = "plan",
}: {
  columns: string[];
  flags: Record<string, boolean>;
  onToggle: (col: string) => void;
  readOnly?: boolean;
  tone?: "plan" | "actual";
}) {
  const fill = tone === "actual" ? "bg-green-600" : "bg-amber-500";
  return (
    <div className="flex gap-px">
      {columns.map((col) => {
        const on = !!flags[col];
        const week = col.split("-")[2]?.replace("W", "") ?? "";
        return (
          <button
            key={col}
            disabled={readOnly}
            onClick={() => onToggle(col)}
            title={col}
            className={`h-5 w-5 shrink-0 text-[9px] leading-none ${
              on ? `${fill} text-white` : "border border-slate-200 bg-white text-slate-300"
            } ${readOnly ? "cursor-default" : "hover:opacity-70"}`}
          >
            {on ? "" : week}
          </button>
        );
      })}
    </div>
  );
}

export function WeekGridHeader({ columns }: { columns: string[] }) {
  const months: { name: string; span: number }[] = [];
  for (const col of columns) {
    const [y, m] = col.split("-");
    const name = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
    });
    const last = months[months.length - 1];
    if (last && last.name === name) last.span += 1;
    else months.push({ name, span: 1 });
  }

  return (
    <div className="flex gap-px">
      {months.map((m) => (
        <div
          key={m.name}
          className="shrink-0 border-b border-slate-200 text-center text-[10px] font-medium text-slate-500"
          style={{ width: `${m.span * 21 - 1}px` }}
        >
          {m.name}
        </div>
      ))}
    </div>
  );
}