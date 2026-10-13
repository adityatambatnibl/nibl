// Admin: see the confirmation mail and who gets it - before uploading. Nothing is sent from here.
// Side panel (design A, chosen 13 Oct 2026): 1 Subject · 2 who gets it · 3 reminder, and the full mail.
// Plain CSS (not Tailwind classes) so it looks right however the screens were built.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiError } from "./apiClient";
import { dc, type MailPreview } from "./api";

const MAIL_W = 680; // mail is 600 px wide + its grey margin

const initials = (n: string) => n.trim().split(/\s+/).map((x) => x[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

/* The mail, scaled down just enough to fit the space (never up). */
function MailFrame({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const [mailH, setMailH] = useState(900);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const m = () => setSize({ w: el.clientWidth - 36, h: el.clientHeight - 36 });   // 18 px padding
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measure = useCallback(() => {
    const h = frame.current?.contentDocument?.body?.scrollHeight;     // the mail itself
    if (h) setMailH(h);
  }, []);
  const onLoad = useCallback(() => {
    measure();
    frame.current?.contentDocument?.querySelectorAll("img").forEach((i) => i.addEventListener("load", measure));
  }, [measure]);

  const scale = Math.max(0.4, Math.min(1, size.w / MAIL_W, size.h / mailH));
  return (
    <div ref={box} className="mpa-mail">
      <div style={{ width: MAIL_W * scale, height: mailH * scale, margin: "0 auto" }}>
        <iframe ref={frame} title="Mail preview" srcDoc={html} onLoad={onLoad} sandbox="allow-same-origin" scrolling="no"
          style={{ width: MAIL_W, height: mailH, border: 0, display: "block", transform: `scale(${scale})`, transformOrigin: "top left" }} />
      </div>
    </div>
  );
}

export default function MailPreviewModal({ fileName, drawingId, reviewerIds, onClose }: {
  fileName: string; drawingId?: string; reviewerIds: string[]; onClose: () => void;
}) {
  const [p, setP] = useState<MailPreview | null>(null);
  const [err, setErr] = useState("");
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    dc.mailPreview({ file_name: fileName, drawing_id: drawingId, reviewer_ids: reviewerIds })
      .then(setP)
      .catch((e) => setErr(apiError(e, "Could not build the preview.")));
  }, [fileName, drawingId, reviewerIds]);

  // Escape closes only this panel (capture phase, so a dialog underneath stays open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); close.current(); } };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey, true); document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="mpa-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <aside role="dialog" aria-modal="true" aria-label="Mail preview" className="mpa-panel">
        <header className="mpa-head">
          <div>
            <p className="mpa-eye">Mail preview · nothing is sent from here</p>
            <h2>{p ? "What people will receive" : err ? "Preview not available" : "Building the preview…"}</h2>
          </div>
          <button type="button" className="mpa-x" onClick={onClose} aria-label="Close preview">✕</button>
        </header>

        {err && <p role="alert" className="mpa-err">{err}</p>}

        {p && (
          <>
            <div className="mpa-steps">
              <div className="mpa-step">
                <span>1</span>
                <div><b>Subject</b><p>{p.subject}</p></div>
              </div>
              <div className="mpa-step">
                <span>2</span>
                <div>
                  <b>Sent to {p.recipients.length} {p.recipients.length === 1 ? "person" : "people"} · one mail each</b>
                  <div className="mpa-people">
                    {p.recipients.map((r) => (
                      <div key={r.email} className="mpa-person" title={r.email}>
                        <i>{initials(r.name)}</i>
                        <div><strong>{r.name}</strong><small>{r.email}</small>{r.department && <small>{r.department}</small>}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mpa-hint">Everyone gets the same mail shown here.</p>
                </div>
              </div>
              <div className="mpa-step">
                <span>3</span>
                <div><b>Reminder</b><p>Daily at 9:00 until they confirm or deny. Once they answer, reminders stop.</p></div>
              </div>
            </div>
            <MailFrame html={p.html} />
          </>
        )}
      </aside>
    </div>
  );
}

const CSS = `
.mpa-back{position:fixed;inset:0;z-index:1000;display:flex;justify-content:flex-end;background:rgba(15,23,42,.45);
  animation:mpa-fade .2s ease}
.mpa-panel{width:min(1080px,100%);height:100%;display:grid;grid-template-columns:330px minmax(0,1fr);grid-template-rows:auto auto 1fr;
  background:#fff;box-shadow:-20px 0 60px rgba(0,0,0,.25);animation:mpa-in .28s cubic-bezier(.2,.8,.2,1);font-family:inherit}
.mpa-head{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px;border-bottom:1px solid #eceff3}
.mpa-eye{margin:0;font-size:10px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:#B51212}
.mpa-head h2{margin:3px 0 0;font-size:18px;font-weight:700;color:#111827}
.mpa-x{flex:0 0 36px;height:36px;display:grid;place-items:center;border:1px solid #e3e6ea;border-radius:9px;background:#fff;color:#6b7280;font-size:15px;cursor:pointer}
.mpa-x:hover{border-color:#FBD7D4;background:#FFF7F6;color:#B51212}
.mpa-err{grid-column:1/-1;margin:16px 22px 0;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;padding:10px 14px;font-size:13px}
.mpa-steps{grid-row:3;min-height:0;overflow:auto;padding:20px;border-right:1px solid #eceff3;background:#fcfcfd}
.mpa-step{display:flex;gap:12px;margin-bottom:22px}
.mpa-step>span{flex:0 0 26px;height:26px;border-radius:50%;background:#B51212;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:800}
.mpa-step>div{min-width:0;flex:1}
.mpa-step b{font-size:12px;color:#111827}
.mpa-step p{margin:3px 0 0;font-size:13px;line-height:1.45;color:#374151;overflow-wrap:anywhere}
.mpa-people{margin-top:8px;display:flex;flex-direction:column;gap:6px}
.mpa-person{display:flex;align-items:center;gap:9px;padding:7px 9px;border:1px solid #eef0f3;border-radius:10px;background:#fff}
.mpa-person i{font-style:normal;flex:0 0 30px;height:30px;border-radius:50%;background:#FFF0EE;color:#A50F0F;display:grid;place-items:center;font-size:11px;font-weight:800}
.mpa-person>div{min-width:0}
.mpa-person strong{display:block;font-size:12px;color:#111827}
.mpa-person small{display:block;font-size:11px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mpa-step .mpa-hint{margin-top:8px;font-size:11px;color:#9ca3af}
.mpa-mail{grid-row:3;position:relative;min-height:0;overflow:hidden;padding:18px;background:#F1F5F9}
@keyframes mpa-in{from{translate:60px 0;opacity:0}to{translate:0 0;opacity:1}}
@keyframes mpa-fade{from{opacity:0}to{opacity:1}}
@media (max-width:760px){
  .mpa-panel{grid-template-columns:1fr;grid-template-rows:auto auto auto 1fr}
  .mpa-steps{grid-row:3;max-height:38vh;border-right:0;border-bottom:1px solid #eceff3}
  .mpa-mail{grid-row:4}
}
@media (prefers-reduced-motion:reduce){.mpa-back,.mpa-panel{animation:none}}
`;
