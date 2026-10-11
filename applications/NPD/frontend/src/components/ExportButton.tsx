import { useState, type ReactNode } from "react";
import { apiError } from "../services/api";

/**
 * "Export Excel" button with a calm loading state: while the file is being
 * generated it shows a small spinner and "Exporting...", and cannot be
 * clicked twice. Size and look come from `className` (same as its
 * neighbouring header buttons), so nothing jumps.
 */
export function ExportButton({
  onExport,
  className,
  children = "Export Excel",
}: {
  onExport: () => Promise<unknown>;
  className: string;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  async function click() {
    if (busy) return;
    setBusy(true);
    try {
      await onExport();
    } catch (err) {
      // e.g. no export permission, or the server failed - tell the user.
      window.alert(`Export failed: ${apiError(err, "please try again.")}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={click} disabled={busy} aria-busy={busy} className={className}>
      {busy ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Exporting...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
