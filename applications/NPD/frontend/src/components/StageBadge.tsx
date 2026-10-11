import { STATUS_LABELS, STATUS_STYLES } from "../utils/constants";

export function StageBadge({ status, delayDays }: { status: string; delayDays?: number | null }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600 border-slate-300";
  const showDays = delayDays != null && delayDays > 0 && status !== "completed";

  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}>
      {STATUS_LABELS[status] ?? status}
      {showDays && ` +${delayDays}d`}
    </span>
  );
}