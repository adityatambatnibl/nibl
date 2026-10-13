// One drawing: the PDF on screen, Confirm / Deny, responses, revisions (locked ones admin-only).
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiError } from "../apiClient";
import { dc, type Detail } from "../api";
import { useDc } from "../DrawingLayout";
import ReviseModal from "../ReviseModal";
import { btn, btnDanger, btnPrimary, card, ErrorLine, field, fmtDate, input, Pill } from "../ui";

/* The drawing on screen, with a small expand button in its top-right corner (full screen; Esc to leave). */
function PdfPane({ url, title }: { url: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);        // real browser full screen
  const [overlay, setOverlay] = useState(false);  // fallback when full screen is not allowed

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (!overlay) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOverlay(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay]);

  const big = full || overlay;
  async function toggle() {
    if (full) { await document.exitFullscreen().catch(() => {}); return; }
    if (overlay) { setOverlay(false); return; }
    try { await box.current!.requestFullscreen(); } catch { setOverlay(true); }
  }

  return (
    <div ref={box} className={`pdfp ${big ? "pdfp-big" : ""} ${overlay ? "pdfp-overlay" : ""}`}>
      <style>{PDF_CSS}</style>
      {big && <div className="pdfp-bar"><b>{title}</b><span>Esc to close</span></div>}
      <iframe src={`${url}#toolbar=0&navpanes=0&view=Fit`} title={title} className="pdfp-frame" />
      <button type="button" className="pdfp-btn" onClick={toggle}
        title={big ? "Close full screen (Esc)" : "Expand drawing to full screen"} aria-label={big ? "Close full screen" : "Expand drawing"}>
        {big ? (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        )}
      </button>
    </div>
  );
}

// Plain CSS so it looks right however the screens were built.
const PDF_CSS = `
.pdfp{position:relative;background:#525659}
.pdfp-frame{display:block;width:100%;height:78vh;border:0}
.pdfp-big{display:flex;flex-direction:column;background:#323639}
.pdfp-big .pdfp-frame{flex:1;height:auto}
.pdfp-overlay{position:fixed;inset:0;z-index:2000}
.pdfp-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 70px 10px 18px;background:#1f2326;color:#fff;font-size:14px}
.pdfp-bar span{font-size:12px;color:rgba(255,255,255,.6)}
.pdfp-btn{position:absolute;top:12px;right:12px;z-index:5;width:38px;height:38px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.35);
  border-radius:10px;background:rgba(17,24,39,.72);color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:background .15s, transform .15s}
.pdfp-btn:hover{background:#B51212;transform:scale(1.06)}
.pdfp-big .pdfp-btn{top:6px;right:12px}
`;

export default function Viewer() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { refresh } = useDc();
  const [rev, setRev] = useState<string | undefined>();
  const [det, setDet] = useState<Detail | null>(null);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [revise, setRevise] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delReason, setDelReason] = useState("");

  const load = useCallback(() => {
    dc.detail(id, rev).then((d) => { setDet(d); setErr(""); }).catch((e) => setErr(apiError(e, "Could not open the drawing.")));
  }, [id, rev]);
  useEffect(load, [load]);

  // The PDF is fetched with the session token and shown from a local blob,
  // so the file never sits at a public address. Each open is logged.
  const shownId = det?.shown?.id;
  useEffect(() => {
    if (!shownId) return;
    let obj = "";
    setUrl("");
    dc.file(shownId).then((r) => { obj = URL.createObjectURL(r.data as Blob); setUrl(obj); })
      .catch(() => setErr("The PDF could not be loaded from the server."));
    return () => { if (obj) URL.revokeObjectURL(obj); };
  }, [shownId]);

  async function download() {
    if (!det?.shown) return;
    const r = await dc.file(det.shown.id, true);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(r.data as Blob);
    a.download = det.shown.original_filename || `${det.drawing.drawing_no}_Rev_${det.shown.rev_label}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function decide(kind: "confirm" | "deny") {
    if (!det?.shown) return;
    if (kind === "deny" && reason.trim().length < 3) return setErr("Please write the reason for denying.");
    setBusy(true); setErr("");
    try {
      const r = await dc.decide(det.shown.id, kind, kind === "deny" ? reason.trim() : undefined);
      setMsg(r.outcome === "approved" ? "Confirmed. Everyone has now confirmed this drawing."
        : r.outcome === "denied" ? "Denied. The drawing admin has your reason and decides whether a new revision is needed."
        : r.changed_mind ? "Confirmed. Your deny has been replaced by Confirm."
        : "Confirmed. Thank you.");
      setDenyOpen(false); setReason(""); load(); refresh();
    } catch (e) { setErr(apiError(e, "Could not save your answer.")); }
    finally { setBusy(false); }
  }

  async function remind() {
    if (!det?.shown) return;
    try { const r = await dc.remind(det.shown.id); setMsg(`Reminder sent to ${r.reminded} user(s).`); load(); }
    catch (e) { setErr(apiError(e, "Could not send the reminder.")); }
  }

  async function removeDrawing() {
    if (delReason.trim().length < 3) return setErr("Please write the reason for deleting.");
    setBusy(true); setErr("");
    try { await dc.remove(id, delReason.trim()); refresh(); nav("/", { replace: true }); }
    catch (e) { setErr(apiError(e, "Could not delete the drawing.")); setBusy(false); }
  }

  async function restoreDrawing() {
    setBusy(true); setErr("");
    try { await dc.restore(id); setMsg("Drawing restored. It is visible to all users again."); refresh(); load(); }
    catch (e) { setErr(apiError(e, "Could not restore the drawing.")); }
    finally { setBusy(false); }
  }

  if (!det) return <div><ErrorLine>{err}</ErrorLine>{!err && <p className="text-sm text-ink-500">Loading…</p>}</div>;
  const s = det.shown;
  const denies = s?.reviews?.filter((r) => r.decision === "denied") ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-400">
        <Link to="/" className="hover:text-brand-600">Drawings</Link>
        {det.folder_names.map((n, i) => <span key={i}>› {n}</span>)}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-[22px] font-bold text-ink-900">{det.drawing.drawing_no}</h1>
        {s && <Pill s={s.status} />}
        <select value={s?.id ?? ""} onChange={(e) => setRev(e.target.value)} className={`${field} py-1.5`} aria-label="Revision">
          {det.revisions.map((r) => <option key={r.id} value={r.id}>Rev {r.rev_label}{r.locked ? " (locked)" : ""}</option>)}
        </select>
        {!det.is_admin && det.hidden_locked > 0 && <span className="text-[11px] text-ink-400">· earlier revisions are admin only</span>}
        <span className="ml-auto flex gap-2">
          {det.is_admin && !det.deleted && <button className={btnPrimary} onClick={() => setRevise(true)}>Revise this drawing</button>}
          <button className={btn} onClick={download} disabled={!s}>Download</button>
          {det.is_admin && !det.deleted && <button className={btnDanger} onClick={() => { setDelOpen(true); setDelReason(""); }}>Delete</button>}
          {det.is_admin && det.deleted && <button className={btnPrimary} disabled={busy} onClick={restoreDrawing}>Restore drawing</button>}
        </span>
      </div>
      {det.deleted && (
        <div className="mb-4 rounded-lg border border-danger/25 bg-danger-bg px-4 py-3 text-[13px] text-danger">
          <b>This drawing is deleted</b>{det.deleted.by && <> by {det.deleted.by}</>}{det.deleted.at && <> on {fmtDate(det.deleted.at, true)}</>}.
          {det.deleted.reason && <> Reason: {det.deleted.reason}</>} Only the drawing admin can see it. Restore it to make it visible again.
        </div>
      )}
      {delOpen && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-white px-4 py-3 text-[13px] shadow-card">
          <p className="font-semibold text-danger">Delete drawing {det.drawing.drawing_no}?</p>
          <p className="mt-1 text-ink-500">It disappears for all users and its open reviews and reminders stop. Nothing is erased: every revision, PDF, review and log is kept, and you can restore it from <b>Drawings → Deleted</b>.</p>
          <label className="mt-3 block font-semibold text-ink-700">Reason for deleting <span className="font-normal text-ink-400">(saved in the Audit History)</span>
            <textarea value={delReason} onChange={(e) => setDelReason(e.target.value)} rows={3} maxLength={500} className={`${input} mt-1`} />
          </label>
          <div className="mt-2 flex gap-2"><button className={btnDanger} disabled={busy} onClick={removeDrawing}>Delete drawing</button><button className={btn} onClick={() => setDelOpen(false)}>Cancel</button></div>
        </div>
      )}
      <ErrorLine>{err}</ErrorLine>
      {msg && <div className="mb-4 rounded-lg border border-ok/25 bg-ok-bg px-3 py-2 text-sm text-ok">{msg}</div>}
      {denies.length > 0 && (
        <div className="mb-4 rounded-lg border border-danger/25 bg-danger-bg px-4 py-3 text-[13px] text-danger">
          {denies.map((r) => <div key={r.user_id}><b>Denied by {r.user_name}</b> ({fmtDate(r.decided_at, true)}): {r.reason}</div>)}
        </div>
      )}
      {s?.locked && <div className="mb-4 rounded-lg border border-line bg-page px-4 py-2 text-[13px] text-ink-500">Rev {s.rev_label} is <b>locked</b> (replaced on {fmtDate(s.locked_at)} by {s.locked_by_name}). Only the drawing admin can see it.</div>}

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className={`${card} overflow-hidden`}>
          {url ? <PdfPane url={url} title={`${det.drawing.drawing_no} Rev ${s?.rev_label}`} />
            : <div className="grid h-[60vh] place-items-center text-sm text-ink-400">Loading the PDF…</div>}
        </div>
        <div className="space-y-4">
          <div className={card}>
            <div className="border-b border-divider px-4 py-3 text-[13px] font-bold text-ink-900">Your decision</div>
            <div className="space-y-3 p-4 text-[13px]">
              {det.can_decide && det.my_review?.decision === "denied" ? (
                <>
                  <p>You <b className="text-danger">denied</b> this revision on {fmtDate(det.my_review.decided_at, true)}{det.my_review.reason ? <> — “{det.my_review.reason}”</> : null}.</p>
                  <p className="text-ink-500">Changed your mind? Confirm it — your deny is replaced and the drawing shows as Released again.</p>
                  <div className="flex gap-2"><button className={btnPrimary} disabled={busy} onClick={() => decide("confirm")}>Confirm now</button></div>
                </>
              ) : det.can_decide ? (
                denyOpen ? (
                  <>
                    <label className="block font-semibold text-ink-700">Reason for denying <span className="font-normal text-ink-400">(sent to the admin, shown to all users)</span>
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={1000} className={`${input} mt-1`} />
                    </label>
                    <div className="flex gap-2"><button className={btnDanger} disabled={busy} onClick={() => decide("deny")}>Send deny</button><button className={btn} onClick={() => setDenyOpen(false)}>Cancel</button></div>
                  </>
                ) : (
                  <>
                    <p className="text-ink-500">This drawing is released. Check it on screen, then confirm it — or deny it with a reason.</p>
                    <div className="flex gap-2"><button className={btnPrimary} disabled={busy} onClick={() => decide("confirm")}>Confirm</button><button className={btnDanger} onClick={() => setDenyOpen(true)}>Deny</button></div>
                  </>
                )
              ) : det.my_review && det.my_review.decision !== "pending" && det.my_review.decision !== "cancelled" ? (
                <p>You <b>{det.my_review.decision}</b> this revision on {fmtDate(det.my_review.decided_at, true)}.</p>
              ) : s?.locked ? <p className="text-ink-500">This revision is locked. Only the latest revision can be reviewed.</p>
                : <p className="text-ink-500">You are not on the list of users for this revision.</p>}
            </div>
          </div>
          <div className={card}>
            <div className="flex items-center justify-between border-b border-divider px-4 py-3">
              <span className="text-[13px] font-bold text-ink-900">Responses</span>
              <span className="font-mono text-[12px] text-ink-500">{s?.confirmed ?? 0}/{s?.reviewer_total ?? 0}</span>
            </div>
            <div className="divide-y divide-divider">
              {s?.reviews?.map((r) => (
                <div key={r.user_id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0 text-[13px]">
                    <div className="font-semibold text-ink-900">{r.user_name}</div>
                    <div className="text-[11px] text-ink-400">{r.decided_at ? fmtDate(r.decided_at, true) : r.reminders_sent ? `${r.reminders_sent} reminders sent` : r.notified_at ? "mail sent" : "mail queued"}</div>
                  </div>
                  <Pill s={r.decision} />
                </div>
              ))}
            </div>
            {det.is_admin && !s?.locked && (s?.reviews ?? []).some((r) => r.decision === "pending") && (
              <div className="border-t border-divider p-3"><button className={`${btn} w-full`} onClick={remind}>Send reminder now</button></div>
            )}
          </div>
          {s && (
            <div className={`${card} space-y-1.5 p-4 text-[13px]`}>
              <div><span className="text-ink-400">Uploaded</span> {fmtDate(s.uploaded_at, true)} by {s.uploaded_by_name}</div>
              <div><span className="text-ink-400">Change</span> {s.change_note || "—"}</div>
              <div><span className="text-ink-400">File</span> {s.original_filename} ({Math.max(1, Math.round(s.size_bytes / 1024))} KB)</div>
              <div><span className="text-ink-400">Folder</span> {det.folder_names.join(" › ")}</div>
            </div>
          )}
        </div>
      </div>
      {revise && <ReviseModal drawingId={id} onClose={() => setRevise(false)} onDone={() => { setRevise(false); setRev(undefined); setMsg("New revision released and mailed for confirmation."); load(); refresh(); nav(`/view/${id}`); }} />}
    </div>
  );
}
