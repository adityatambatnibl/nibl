// Drawing admin: bulk import of existing drawings dropped into data/import/.
import { useCallback, useEffect, useState } from "react";
import { apiError } from "../apiClient";
import { dc, type ImportPreview, type ImportResult } from "../api";
import { AdminOnly, useDc } from "../DrawingLayout";
import { btn, btnPrimary, card, ErrorLine, PageHead, td, th } from "../ui";

const TONE: Record<string, string> = {
  ready: "bg-ok-bg text-ok border-ok/25",
  exists: "bg-page text-ink-500 border-line",
  invalid: "bg-danger-bg text-danger border-danger/25",
};

function Inner() {
  const { refresh } = useDc();
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const check = useCallback(() => {
    setErr("");
    dc.importPreview().then(setPv).catch((e) => setErr(apiError(e, "Could not read the import folder.")));
  }, []);
  useEffect(check, [check]);

  async function runImport() {
    if (!pv?.ready) return;
    setBusy(true); setErr(""); setResult(null);
    const all: ImportResult = { imported: [], failed: [], remaining: 0, skipped_existing: 0, skipped_invalid: 0 };
    try {
      // 100 files per request; keep going until nothing is left.
      for (let round = 0; round < 500; round++) {
        const r = await dc.importRun(100);
        all.imported.push(...r.imported); all.failed.push(...r.failed);
        all.skipped_existing = r.skipped_existing; all.skipped_invalid = r.skipped_invalid; all.remaining = r.remaining;
        setProgress(`${all.imported.length} imported${r.remaining ? `, ${r.remaining} to go…` : ""}`);
        if (!r.remaining || (!r.imported.length && r.failed.length)) break;
      }
      setResult(all);
      refresh();
    } catch (e) {
      setErr(apiError(e, "The import stopped. Drawings imported so far are saved - press Import again to continue."));
      setResult(all);
    } finally {
      setBusy(false); setProgress(""); check();
    }
  }

  return (
    <div>
      <PageHead
        title="Bulk Import"
        sub="Upload many drawings at once. Each goes Under review to everyone on the Email List: one email per person for the whole batch, then a reminder every day at 9:00 until they confirm or deny."
        right={<>
          <button className={btn} onClick={check} disabled={busy}>Check folder again</button>
          <button className={btnPrimary} onClick={runImport} disabled={busy || !pv?.ready}>
            {busy ? progress || "Importing…" : `Import ${pv?.ready ?? 0} drawing${pv?.ready === 1 ? "" : "s"}`}
          </button>
        </>}
      />
      <ErrorLine>{err}</ErrorLine>

      <div className={`${card} mb-4 p-4 text-[13px] text-ink-700`}>
        <p className="font-semibold text-ink-900">How to use</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Copy the PDFs into this folder on the server / your computer:<br />
            <code className="mt-1 inline-block break-all rounded bg-page px-2 py-1 text-[12px]">{pv?.folder ?? "…"}</code></li>
          <li>Make sub-folders for the Product Tree, e.g. <code>GBD\Rings\</code>. Missing folders are created. PDFs left directly in the folder go to <b>Unsorted</b>.</li>
          <li>The file name is the drawing no. (<code>NBD-NA-4905-02.pdf</code>).</li>
          <li>Optional: put an Excel or CSV in the same folder with columns <code>drawing_no, item_code, description, rev</code>. Without it, item code and description = drawing no., rev = A (fix later with Edit).</li>
          <li>Press <b>Check folder again</b>, review the list, then <b>Import</b>. Imported files move to <code>import\_done\</code>.</li>
        </ol>
      </div>

      {result && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-[13px] ${result.failed.length ? "border-warn/30 bg-warn-bg text-ink-900" : "border-ok/25 bg-ok-bg text-ok"}`}>
          <b>{result.imported.length} drawing(s) imported.</b>
          {result.failed.length > 0 && <> {result.failed.length} failed:
            <ul className="mt-1 list-disc pl-5">{result.failed.slice(0, 20).map((f) => <li key={f.file}><code>{f.file}</code> — {f.reason}</li>)}</ul></>}
        </div>
      )}

      {pv && pv.index_notes.length > 0 && (
        <div className="mb-4 text-[12px] text-ink-500">{pv.index_notes.map((n) => <div key={n}>Details file: {n}</div>)}</div>
      )}

      {pv && (
        <div className={card}>
          <div className="flex flex-wrap gap-4 border-b border-divider px-4 py-3 text-[13px]">
            <span><b>{pv.total}</b> PDF(s) found</span>
            <span className="text-ok"><b>{pv.ready}</b> ready</span>
            <span className="text-ink-500"><b>{pv.exists}</b> already in the system</span>
            <span className="text-danger"><b>{pv.invalid}</b> with problems</span>
            {pv.ready > 0 && <span className="text-ink-500">{pv.with_details} with details from Excel/CSV</span>}
          </div>
          {pv.total === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-400">The import folder is empty. Copy PDFs into it, then press <b>Check folder again</b>.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-divider bg-page"><tr>
                  <th className={th}>Drawing no.</th><th className={th}>Folder</th><th className={th}>Item code</th>
                  <th className={th}>Description</th><th className={th}>Rev</th><th className={th}>Status</th>
                </tr></thead>
                <tbody className="divide-y divide-divider">
                  {pv.files.map((f) => (
                    <tr key={f.file}>
                      <td className={`${td} font-mono`}>{f.drawing_no}</td>
                      <td className={td}>{f.folder}</td>
                      <td className={`${td} text-ink-500`}>{f.item_code || "—"}</td>
                      <td className={`${td} text-ink-500`}>{f.description || "—"}</td>
                      <td className={`${td} font-mono`}>{f.rev}</td>
                      <td className={td}>
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE[f.status]}`}>
                          {f.status === "ready" ? "Ready" : f.status === "exists" ? "Already exists" : "Problem"}
                        </span>
                        {f.reason && <div className="mt-0.5 text-[11px] text-ink-400">{f.reason}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pv.total > pv.files.length && <p className="px-4 py-2 text-[12px] text-ink-400">Showing the first {pv.files.length} of {pv.total}.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BulkImport() {
  return <AdminOnly><Inner /></AdminOnly>;
}
