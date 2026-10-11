// Shows the real emails a stage owner / department would get (built, never sent).
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { RecipientPreview } from "../services/recipientApi";

export function RecipientPreviewDialog({ title, data, onClose }: { title: string; data: RecipientPreview; onClose: () => void }) {
  // Esc closes; the page behind does not scroll while the window is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Rendered at the top of the page (portal) so it is a real centred window,
  // not trapped inside the animated card it was opened from.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Email preview - {title}</h3>
            <p className="text-[11px] text-slate-500">
              {data.is_example
                ? <>Shown with example data from <b>{data.example}</b> (this project does not exist yet). Nothing is sent.</>
                : <>Built from this project's real data. Nothing is sent.</>}
            </p>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {data.notes.map((n) => (
            <p key={n} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{n}</p>
          ))}
          {data.mails.map((m, i) => (
            <div key={i} className="overflow-hidden rounded border border-slate-200">
              <div className="space-y-0.5 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <p className="font-semibold uppercase tracking-wide text-brand-700">{m.title}</p>
                <p><span className="text-slate-500">To:</span> {m.to.join(", ")}</p>
                {m.cc.length > 0 && <p><span className="text-slate-500">CC:</span> {m.cc.join(", ")}</p>}
                <p><span className="text-slate-500">Subject:</span> <b>{m.subject}</b></p>
              </div>
              <iframe title={m.title} srcDoc={m.html} className="h-[360px] w-full bg-white" />
            </div>
          ))}
          {!data.mails.length && !data.notes.length && <p className="text-sm text-slate-500">No email would be sent.</p>}
        </div>
      </div>
    </div>
    ,
    document.body,
  );
}
