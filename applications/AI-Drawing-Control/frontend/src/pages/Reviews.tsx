// My Reviews: drawings waiting for my Confirm / Deny, oldest first.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiError } from "../apiClient";
import { dc, type MyReview } from "../api";
import { btnPrimarySm, card, Empty, ErrorLine, fmtDate, PageHead, td, th } from "../ui";

export default function Reviews() {
  const nav = useNavigate();
  const [rows, setRows] = useState<MyReview[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { dc.myReviews().then(setRows).catch((e) => setErr(apiError(e))); }, []);
  return (
    <div>
      <PageHead title="My Reviews" sub="Drawings waiting for your Confirm or Deny — oldest first" />
      <ErrorLine>{err}</ErrorLine>
      <div className={card}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-line bg-brand-50/60"><tr><th className={th}>Drawing no.</th><th className={th}>Part description</th><th className={th}>Rev</th><th className={th}>What changed</th><th className={th}>Folder</th><th className={th}>Sent</th><th className={th}>Reminders</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-divider">
              {rows?.map((r) => (
                <tr key={r.revision_id} className="hover:bg-hover">
                  <td className={`${td} font-mono font-semibold text-ink-900`}>{r.drawing_no}</td><td className={td}>{r.description}</td><td className={`${td} font-mono`}>{r.rev_label}</td>
                  <td className={td}>{r.change_note}</td><td className={`${td} text-ink-400`}>{r.folder_path}</td><td className={`${td} whitespace-nowrap`}>{fmtDate(r.sent_at, true)}</td>
                  <td className={td}>{r.reminders_sent ? <span className="rounded bg-alert-bg px-2 py-0.5 text-[11px] font-semibold text-alert">{r.reminders_sent} sent</span> : "—"}</td>
                  <td className={`${td} text-right`}><button className={btnPrimarySm} onClick={() => nav(`/view/${r.id}`)}>Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows && rows.length === 0 && <Empty title="Nothing waiting for you">New drawings arrive here and by email.</Empty>}
        </div>
      </div>
    </div>
  );
}
