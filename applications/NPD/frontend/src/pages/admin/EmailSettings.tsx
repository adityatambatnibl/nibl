import { useMemo, useState } from "react";
import {
  notificationConfigApi,
  type EmailSwitch,
  type PreviewKind,
  type PreviewMail,
} from "../../services/notificationConfigApi";
import { apiError } from "../../services/api";
import { useFetch } from "../../hooks/useFetch";
import { Loading } from "../../components/Loading";
import { formatDateTime, plural } from "../../utils/formatters";
import type { NotificationConfig } from "../../types";

/* ══════════════════════════════════════════════════════════════════════
   EMAIL SETTINGS
   1. Which emails are sent (every on/off switch in one place)
   2. Daily time, CC list, run-now buttons
   3. Recent emails     - the log, with a filter
   (Department / stage-owner addresses are chosen per project on
   Create new timeline and the project's Emails page.)
   Every address box is checked as you type; Save stays off while any
   address is wrong. "Preview" shows the real email without sending it.
   ══════════════════════════════════════════════════════════════════════ */

/** The ten departments that can own an APQP activity. */
const APQP_DEPARTMENTS = [
  "MKTG", "R&D", "MKTG & R&D", "CFT", "QA", "TOOL ROOM", "MFG GBD", "MFG NBD", "SOURCING", "TL",
];

type Switches = Record<EmailSwitch | "handoff_enabled" | "overdue_enabled", boolean>;

const SWITCH_GROUPS: { title: string; items: { key: keyof Switches; label: string; help: string }[] }[] = [
  {
    title: "Tracking",
    items: [
      { key: "handoff_enabled", label: "Stage complete - next stage can start", help: "Sent when an actual date is entered." },
      { key: "overdue_enabled", label: "Daily overdue reminder", help: "One email per owner listing their late stages." },
    ],
  },
  {
    title: "APQP Timeline",
    items: [
      { key: "apqp_handoff_enabled", label: "Activity / phase complete - next can start", help: "Sent when an actual end date is entered." },
      { key: "apqp_overdue_enabled", label: "Daily overdue reminder", help: "One email per department listing its late activities." },
    ],
  },
  {
    title: "Management",
    items: [
      { key: "summary_enabled", label: "Daily summary to the CC list", help: "One short overview of everything late, at the daily time." },
    ],
  },
  {
    title: "Accounts",
    items: [
      { key: "signup_alert_enabled", label: "New access request - alert admins", help: "" },
      { key: "password_reset_alert_enabled", label: "Password reset request - alert admins", help: "" },
      { key: "approval_email_enabled", label: "Account approved / rejected - email the user", help: "" },
    ],
  },
];

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

function parse(value: string) {
  return value.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
}

function badAddresses(value: string) {
  return parse(value).filter((e) => !EMAIL_RE.test(e));
}

/* ── small pieces ─────────────────────────────────────────────────────── */

function EmailField({
  value,
  onChange,
  placeholder = "name@nibl.in, other@nibl.in",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const bad = badAddresses(value);
  return (
    <div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded border px-2 py-1.5 text-sm outline-none ${
          bad.length ? "border-red-400 bg-red-50/40 focus:border-red-500" : "border-slate-300 focus:border-brand-600"
        }`}
      />
      {bad.length > 0 && (
        <p className="mt-1 text-xs text-red-600">
          Not a valid address: {bad.join(", ")}
        </p>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-green-600" : "bg-slate-300"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-4.5" : "left-0.5"}`}
      />
    </button>
  );
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  const tone =
    status === "sent"
      ? "border-green-200 bg-green-50 text-green-700"
      : status === "failed"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  const label =
    status === "skipped" ? "not sent (email off)" : status === "duplicate" ? "already sent" : status.replace(/_/g, " ");
  return (
    <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${tone}`} title={error ?? ""}>
      {label}
    </span>
  );
}

function PreviewDialog({
  title,
  mails,
  note,
  onClose,
}: {
  title: string;
  mails: PreviewMail[];
  note: string | null;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const m = mails[i];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-brand-600">Preview - nothing is sent</p>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>

        {!m ? (
          <p className="px-5 py-10 text-center text-sm text-slate-600">{note ?? "No email would be sent right now."}</p>
        ) : (
          <>
            {mails.length > 1 && (
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-2 text-xs text-slate-600">
                <button disabled={i === 0} onClick={() => setI(i - 1)} className="rounded border px-2 py-0.5 disabled:opacity-30">‹</button>
                Email {i + 1} of {mails.length}
                <button disabled={i === mails.length - 1} onClick={() => setI(i + 1)} className="rounded border px-2 py-0.5 disabled:opacity-30">›</button>
              </div>
            )}
            <dl className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-1 border-b border-slate-100 px-5 py-3 text-xs">
              <dt className="font-semibold text-slate-500">Subject</dt><dd className="text-slate-900">{m.subject}</dd>
              <dt className="font-semibold text-slate-500">To</dt><dd className="text-slate-700">{m.to.join(", ")}</dd>
              <dt className="font-semibold text-slate-500">CC</dt><dd className="text-slate-700">{m.cc.join(", ") || "—"}</dd>
            </dl>
            <iframe title="Email preview" srcDoc={m.html} className="min-h-[420px] w-full flex-1 bg-slate-50" />
          </>
        )}
      </div>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default function EmailSettings() {
  const { data, loading, error, setData, setError } = useFetch(() => notificationConfigApi.get());
  const { data: logs, reload: reloadLogs } = useFetch(() => notificationConfigApi.logs());
  const { data: nextRun, reload: reloadNextRun } = useFetch(() => notificationConfigApi.nextRun());

  const [synced, setSynced] = useState<NotificationConfig | null>(null);
  const [rows, setRows] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [cc, setCc] = useState("");
  const [switches, setSwitches] = useState<Switches | null>(null);
  const [time, setTime] = useState("09:00");
  const [apqpRows, setApqpRows] = useState<Record<string, string>>({});
  const [apqpLabels, setApqpLabels] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  const [rowBusy, setRowBusy] = useState("");
  const [runResult, setRunResult] = useState<Record<string, string>>({});

  const [preview, setPreview] = useState<{ title: string; mails: PreviewMail[]; note: string | null } | null>(null);

  const [logsOpen, setLogsOpen] = useState(false);
  const [logFilter, setLogFilter] = useState<"all" | "failed" | "sent" | "not_sent">("all");
  const [logSearch, setLogSearch] = useState("");

  function hydrate(cfg: NotificationConfig) {
    setSynced(cfg);
    setRows(Object.fromEntries(cfg.owners.map((o) => [o.stage_code, o.emails.join(", ")])));
    setLabels(Object.fromEntries(cfg.owners.map((o) => [o.stage_code, o.label ?? ""])));
    setCc(cfg.cc_emails.join(", "));
    setSwitches({
      handoff_enabled: cfg.handoff_enabled,
      overdue_enabled: cfg.overdue_enabled,
      apqp_handoff_enabled: cfg.apqp_handoff_enabled ?? true,
      apqp_overdue_enabled: cfg.apqp_overdue_enabled ?? true,
      signup_alert_enabled: cfg.signup_alert_enabled ?? true,
      password_reset_alert_enabled: cfg.password_reset_alert_enabled ?? true,
      password_email_enabled: cfg.password_email_enabled ?? true,
      approval_email_enabled: cfg.approval_email_enabled ?? true,
      summary_enabled: cfg.summary_enabled ?? false,
    });
    setTime(`${String(cfg.overdue_hour).padStart(2, "0")}:${String(cfg.overdue_minute).padStart(2, "0")}`);
    const byDept = new Map((cfg.apqp_owners ?? []).map((o) => [o.responsibility.trim().toUpperCase(), o]));
    setApqpRows(Object.fromEntries(APQP_DEPARTMENTS.map((d) => [d, (byDept.get(d)?.emails ?? []).join(", ")])));
    setApqpLabels(Object.fromEntries(APQP_DEPARTMENTS.map((d) => [d, byDept.get(d)?.label ?? ""])));
    setDirty(false);
  }

  if (data && data !== synced) hydrate(data);

  function touch() {
    setDirty(true);
    setSaved("");
  }

  // Any wrong address anywhere blocks Save.
  const invalidCount = useMemo(
    () =>
      badAddresses(cc).length +
      Object.values(rows).reduce((n, v) => n + badAddresses(v).length, 0) +
      Object.values(apqpRows).reduce((n, v) => n + badAddresses(v).length, 0),
    [cc, rows, apqpRows],
  );

  async function save() {
    if (!data || !switches || invalidCount) return;
    // An emptied time field would otherwise save 00:00 (midnight).
    const [h, m] = (/^\d{1,2}:\d{2}$/.test(time) ? time : "09:00").split(":").map(Number);
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await notificationConfigApi.update({
        owners: data.owners.map((o) => ({
          stage_code: o.stage_code,
          emails: parse(rows[o.stage_code] ?? ""),
          label: labels[o.stage_code] || null,
        })),
        cc_emails: parse(cc),
        overdue_hour: h,
        overdue_minute: m,
        ...switches,
      });
      await notificationConfigApi.updateApqpOwners(
        APQP_DEPARTMENTS.map((d) => ({
          responsibility: d,
          label: apqpLabels[d] || null,
          emails: parse(apqpRows[d] ?? ""),
        })).filter((o) => o.emails.length > 0),
      );
      const fresh = await notificationConfigApi.get();
      setData(fresh);
      hydrate(fresh);
      setSaved("Saved.");
      reloadNextRun();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function showPreview(title: string, kind: PreviewKind, key?: string) {
    setRowBusy(`preview:${kind}:${key ?? ""}`);
    try {
      const r = await notificationConfigApi.preview(kind, key);
      setPreview({ title, mails: r.mails, note: r.note });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setRowBusy("");
    }
  }

  async function runCheck(which: "tracking" | "apqp" | "summary") {
    setRowBusy(`run:${which}`);
    setRunResult((r) => ({ ...r, [which]: "" }));
    try {
      let msg = "";
      if (which === "tracking") {
        const r = await notificationConfigApi.runOverdueCheck();
        const sent = r.emails_sent ?? 0;
        msg = r.skipped
          ? `Not sent: ${r.skipped}`
          : !r.total_overdue
            ? "Nothing overdue - no emails needed"
            : sent === 0 && !r.emails_failed
              ? `${plural(r.total_overdue, "overdue stage")} · no stage owner addresses set`
              : `${plural(r.total_overdue, "overdue stage")} · ${plural(sent, "email")} sent` +
                (r.emails_failed ? ` · ${r.emails_failed} not sent: ${r.error ?? "see Recent emails"}` : "");
      } else if (which === "apqp") {
        const r = await notificationConfigApi.runApqpOverdueCheck();
        msg = r.reason
          ? r.reason
          : `${plural(r.total_overdue ?? 0, "overdue activity", "overdue activities")} · ${plural(r.sent ?? 0, "email")} sent` +
            (r.failed ? ` · ${r.failed} not sent: ${r.error ?? "see Recent emails"}` : "") +
            (r.departments_without_address ? ` · ${plural(r.departments_without_address, "department")} without an address` : "");
      } else {
        const r = await notificationConfigApi.sendSummary();
        msg = r.sent ? `Summary sent to ${plural(r.recipients ?? 0, "person", "people")}` : r.reason ?? "Not sent";
      }
      setRunResult((r) => ({ ...r, [which]: msg }));
      reloadLogs();
    } catch (err) {
      setRunResult((r) => ({ ...r, [which]: apiError(err) }));
    } finally {
      setRowBusy("");
    }
  }

  if (loading || !switches) return <Loading />;
  if (!data) return <div className="text-sm text-red-700">{error}</div>;

  const allLogs = logs ?? [];
  const failedLogs = allLogs.filter((l) => l.status === "failed").length;
  const shownLogs = allLogs.filter((l) => {
    if (logFilter === "failed" && l.status !== "failed") return false;
    if (logFilter === "sent" && l.status !== "sent") return false;
    if (logFilter === "not_sent" && (l.status === "sent" || l.status === "failed")) return false;
    if (logSearch) {
      const hay = `${l.subject} ${l.to_emails.join(" ")} ${l.email_type}`.toLowerCase();
      if (!hay.includes(logSearch.toLowerCase())) return false;
    }
    return true;
  });

  const saveFirst = dirty ? "Save your changes first" : undefined;

  return (
    <div className="pb-10">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.8px] text-slate-900">Email Settings</h1>
          <p className="mt-1 text-xs text-slate-500">
            Which emails go out, who receives them, and when.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {saved && <span className="text-sm text-green-700">{saved}</span>}
          {invalidCount > 0 && (
            <span className="text-sm text-red-600">
              Fix {plural(invalidCount, "address", "addresses")} to save
            </span>
          )}
          <button
            onClick={save}
            disabled={!dirty || busy || invalidCount > 0}
            className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40"
          >
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {!data.email_sending_live && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Email delivery is <strong>off</strong>. Messages are recorded in the log but not actually sent.
          Set <code>EMAIL_ENABLED=true</code> in the backend <code>.env</code> to go live.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* ── 1. WHICH EMAILS ARE SENT ── */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Which emails are sent</h2>
        <p className="mt-0.5 text-xs text-slate-500">Turn any email off here. Changes apply after Save.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {SWITCH_GROUPS.map((g) => (
            <div key={g.title} className="rounded border border-slate-200 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-brand-600">{g.title}</p>
              <ul className="mt-2 space-y-2.5">
                {g.items.map((it) => (
                  <li key={it.key} className="flex items-start gap-3">
                    <Toggle
                      checked={switches[it.key]}
                      onChange={(v) => { setSwitches({ ...switches, [it.key]: v }); touch(); }}
                    />
                    <div className="min-w-0">
                      <p className={`text-sm ${switches[it.key] ? "text-slate-900" : "text-slate-400"}`}>{it.label}</p>
                      {it.help && <p className="text-xs text-slate-500">{it.help}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── 2. TIME, CC, RUN NOW ── */}
      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Daily time and CC</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
          <div>
            <label className="block text-xs font-medium text-slate-600">Daily email time</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => { setTime(e.target.value); touch(); }}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              {time !== "09:00" && (
                <button
                  type="button"
                  onClick={() => { setTime("09:00"); touch(); }}
                  className="text-xs text-slate-500 underline hover:text-slate-800"
                >
                  Reset to 9:00
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Every day at {time || "09:00"} (India time). Reminders and summary go out together.
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {nextRun ? `Next run: ${formatDateTime(nextRun)}` : "Not scheduled - is the server running?"}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              CC - copied on handoff and alert emails, and receives the daily summary
            </label>
            <div className="mt-1">
              <EmailField value={cc} onChange={(v) => { setCc(v); touch(); }} placeholder="manager@nibl.in, quality@nibl.in" />
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold uppercase tracking-[1px] text-slate-500">Send now</p>
          <p className="mt-1 text-xs text-slate-500">
            Sends immediately instead of waiting for {nextRun ? formatDateTime(nextRun) : "the daily job"}.
            Use Preview to see the email first.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {([
              ["tracking", "Tracking", "Overdue stages, to each owner", "tracking_digest"],
              ["apqp", "APQP Timeline", "Overdue activities, to each department", "apqp_digest"],
              ["summary", "Management", "Daily summary, to the CC list", "summary"],
            ] as const).map(([which, tag, text, kind]) => (
              <div key={which} className="rounded border border-slate-200 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-brand-600">{tag}</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{text}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => runCheck(which)}
                    disabled={rowBusy !== "" || dirty}
                    title={saveFirst}
                    className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {rowBusy === `run:${which}` ? "Sending..." : "Send now"}
                  </button>
                  <button
                    onClick={() => showPreview(text, kind)}
                    disabled={rowBusy !== ""}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Preview
                  </button>
                </div>
                {runResult[which] && <p className="mt-2 text-xs text-slate-600">{runResult[which]}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Department and stage-owner addresses are set per project now:
          Create new timeline -> step 4 "Emails", or the "Emails" button on a project. */}
      <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Who gets each project's emails (APQP departments and Tracking stage owners) is chosen per project:
        on <b>Create new timeline</b> (step 4, Emails) or with the <b>Emails</b> button on a project.
      </p>

      {/* ── 3. RECENT EMAILS ── */}
      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <button
          onClick={() => setLogsOpen((o) => !o)}
          className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left hover:bg-slate-50"
        >
          <span className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Recent emails</h2>
            {allLogs.length > 0 && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{allLogs.length}</span>
            )}
            {failedLogs > 0 && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{failedLogs} failed</span>
            )}
          </span>
          <span className="text-slate-400">{logsOpen ? "▾" : "▸"}</span>
        </button>

        {logsOpen && (
          <div className="border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-2 px-5 py-3">
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="all">All</option>
                <option value="failed">Failed only</option>
                <option value="sent">Sent</option>
                <option value="not_sent">Not sent (off / already sent)</option>
              </select>
              <input
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search subject or address..."
                className="w-64 rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <span className="ml-auto text-xs text-slate-400">{plural(shownLogs.length, "email")}</span>
            </div>

            {shownLogs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">No emails to show.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">When</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">To</th>
                      <th className="px-4 py-2.5 font-medium">Subject</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shownLogs.map((l) => (
                      <tr key={l.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDateTime(l.sent_at)}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-600">{l.email_type.replace(/_/g, " ")}</td>
                        <td className="max-w-48 truncate px-4 py-2 text-slate-600" title={l.to_emails.join(", ")}>{l.to_emails.join(", ")}</td>
                        <td className="max-w-72 px-4 py-2 text-slate-700">
                          <p className="truncate" title={l.subject}>{l.subject}</p>
                          {l.status === "failed" && l.error && <p className="mt-0.5 text-xs text-red-600">{l.error}</p>}
                        </td>
                        <td className="px-4 py-2"><StatusBadge status={l.status} error={l.error} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {preview && (
        <PreviewDialog title={preview.title} mails={preview.mails} note={preview.note} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
