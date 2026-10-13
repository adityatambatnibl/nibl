// Revise a drawing: the admin picks the new PDF and who gets the mail. The revision number
// counts on by itself; the new revision is released at once.
import { useEffect, useState } from "react";
import { Modal, ModalError } from "./components/Modal";
import { apiError } from "./apiClient";
import { dc, type DcUser, type Detail } from "./api";
import { btn, btnPrimary, input, Pill, ReviewerPicker } from "./ui";

// Same rule as the server: A, B ... Z, AA, AB; an old numeric label n continues as letter n+1.
function letters(n: number) {
  let out = "";
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out || "A";
}
function nextLabel(cur: string) {
  if (/^\d+$/.test(cur)) return letters(Number(cur) + 1);
  if (/^[A-Z]{1,3}$/i.test(cur)) return letters([...cur.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) + 1);
  return "";
}

export default function ReviseModal({ drawingId, onClose, onDone }: { drawingId: string; onClose: () => void; onDone: () => void }) {
  const [det, setDet] = useState<Detail | null>(null);
  const [users, setUsers] = useState<DcUser[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rev, setRev] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([dc.detail(drawingId), dc.users(), dc.emailList()])
      .then(([d, u, list]) => {
        setDet(d); setUsers(u.filter((x) => x.is_active)); setIds(list.map((x) => x.id));
        setRev(nextLabel(d.drawing.rev_label));
      })
      .catch((e) => setErr(apiError(e, "Could not load the drawing.")));
  }, [drawingId]);

  const denies = det?.shown?.reviews?.filter((r) => r.decision === "denied") ?? [];

  async function send() {
    setErr("");
    if (!file) return setErr("Choose the revised PDF.");
    if (!file.name.toLowerCase().endsWith(".pdf")) return setErr("Only controlled PDF copies can be uploaded.");
    if (!ids.length) return setErr("Choose at least one person to confirm the drawing.");
    const f = new FormData();
    f.append("file", file); f.append("reviewer_ids", ids.join(","));
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
            <Pill s={det.drawing.status} /><span className="text-ink-400">{det.drawing.folder_path}</span>
          </div>
          {denies.length > 0 && (
            <div className="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-[13px] text-danger">
              {denies.map((r) => <div key={r.user_id}><b>To fix — denied by {r.user_name}:</b> {r.reason}</div>)}
            </div>
          )}
          <label className="block text-[12px] font-semibold text-ink-700">Revised PDF (controlled copy)
            <input type="file" accept=".pdf,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${input} mt-1`} />
          </label>
          <div>
            <p className="mb-1 text-[12px] font-semibold text-ink-700">Mail for confirmation to <b>{ids.length}</b> person{ids.length === 1 ? "" : "s"}</p>
            <ReviewerPicker all={users} selected={ids} onChange={setIds} />
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
