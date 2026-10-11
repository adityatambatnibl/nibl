const STYLES: Record<string, string> = {
  pending:  "bg-warn-bg text-warn border-warn/25",
  approved: "bg-ok-bg text-ok border-ok/25",
  rejected: "bg-danger-bg text-danger border-danger/25",
  admin:    "bg-brand-600 text-white border-brand-700",
  user:     "bg-page text-ink-700 border-line",
  active:   "bg-ok-bg text-ok border-ok/25",
  inactive: "bg-page text-ink-400 border-line",
};

export function StatusBadge({ value }: { value: string }) {
  const style = STYLES[value] ?? "bg-page text-ink-700 border-line";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-[3px] text-[10px] font-bold capitalize tracking-wide ${style}`}
    >
      {value}
    </span>
  );
}