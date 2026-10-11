// Revise a drawing: the admin has already picked the drawing; upload the new PDF,
// say what changed, choose who must confirm (Email List + anyone added by hand).
import { useEffect, useState } from "react";
import { Modal, ModalError } from "./components/Modal";
import { apiError } from "./apiClient";
import { dc, type DcUser, type Detail } from "./api";
import { btn, btnPrimary, input, Pill, ReviewerPicker } from "./ui";

function nextLabel(cur: string) {
  if (/^\d+$/.test(cur)) return String(Number(cur) + 1).padStart(cur.length, "0");
  if (/^[A-Y]$/i.test(cur)) return String.fromCharCode(cur.toUpperCase().charCodeAt(0) + 1);
  return "";
}

export default function ReviseModal({ drawingId, onClose, onDone }: { drawingId: string; onClose: () => void; onDone: () => void }) {
  const [det, setDet] = useState<Detail | null>(null);
  const [users, setUsers] = useState<DcUser[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rev, setRev] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([dc.detail(drawingId), dc.users(), dc.emailList()])
      .then(([d, u, list]) => {
        setDet(d); setUsers(u.filter((x) => x.is_active));
        setIds(list.map((x) => x.id)); setRev(nextLabel(d.drawing.rev_label));
      })
      .catch((e) => setErr(apiError(e, "Could not load the drawing.")));
  }, [drawingId]);

  const denies = det?.shown?.reviews?.filter((r) => r.decision === "denied") ?? [];

  async function send() {
    setErr("");
    if (!file) return setErr("Choose the revised PDF.");
    if (!file.name.toLowerCase().endsWith(".pdf")) return setErr("Only controlled PDF copies can be uploaded.");
    if (!rev.trim()) return setErr("Enter the new revision.");
    if (!note.trim()) return setErr("Say what changed in this revision.");
    if (!ids.length) return setErr("Choose at least one user to confirm the drawing.");
    const f = new FormData();
    f.append("file", file); f.append("rev_label", rev.trim()); f.append("change_note", note.trim()); f.append("reviewer_ids", ids.join(","));
    setBusy(true);
    try { await dc.revise(drawingId, f); onDone(); }
    catch (e) { setErr(apiError(e, "Upload failed.")); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={det ? `Revise ${det.drawing.drawing_no}` : "Revise drawing"} subtitle={det ? `Rev ${det.drawing.rev_label} → Rev ${rev || "?"}` : undefined} onClose={onClose} width="max-w-2xl">
      {det && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-700">
            <Pill s={det.drawing.status} /><b className="font-mono">{det.drawing.item_code}</b> · {det.drawing.description} · <span className="text-ink-400">{det.drawing.folder_path}</span>
          </div>
          {denies.length > 0 && (
            <div className="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-[13px] text-danger">
              {denies.map((r) => <div key={r.user_id}><b>To fix — denied by {r.user_name}:</b> {r.reason}</div>)}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[12px] font-semibold text-ink-700">Revised PDF (controlled copy)
              <input type="file" accept=".pdf,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${input} mt-1`} />
            </label>
            <label className="block text-[12px] font-semibold text-ink-700">New revision
              <input value={rev} onChange={(e) => setRev(e.target.value)} maxLength={20} placeholder="e.g. 02" className={`${input} mt-1`} />
            </label>
          </div>
          <label className="block text-[12px] font-semibold text-ink-700">What changed (required)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Raceway radius tolerance ±0.05 added" className={`${input} mt-1`} />
          </label>
          <div>
            <p className="mb-1 text-[12px] font-semibold text-ink-700">Send for confirmation to <b>{ids.length}</b> user{ids.length === 1 ? "" : "s"}</p>
            <ReviewerPicker all={users} selected={ids} onChange={setIds} />
            <p className="mt-1 text-[11px] text-ink-400">Starts with everyone on the Email List. Changes here apply to this revision only.</p>
          </div>
          <div className="rounded-lg border border-alert/25 bg-alert-bg px-3 py-2 text-[12px] text-alert">
            Rev {det.drawing.rev_label} will be <b>locked</b> — kept, visible to the drawing admin only. Users see only the new revision.
          </div>
        </div>
      )}
      <ModalError>{err}</ModalError>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btn} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} disabled={!det || busy} onClick={send}>{busy ? "Uploading…" : `Send Rev ${rev || ""} for confirmation`}</button>
      </div>
    </Modal>
  );
}
