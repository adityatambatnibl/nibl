import { BearingSpinner } from "./BearingSpinner";

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-brand-600">
      <BearingSpinner size={36} />
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}