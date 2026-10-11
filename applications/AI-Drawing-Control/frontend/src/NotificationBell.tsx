// The bell: drawings waiting for you, denials / approvals, access requests (admins).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dc, type Notice } from "./api";
import { fmtDate } from "./ui";

const POLL_MS = 60_000;

export default function NotificationBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => { dc.unreadCount().then((c) => !cancelled && setUnread(c)).catch(() => {}); };
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener("focus", load);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", load); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true); setBusy(true);
    try { setItems(await dc.notifications()); } catch { setItems([]); } finally { setBusy(false); }
  }

  async function openItem(n: Notice) {
    setOpen(false);
    if (!n.is_read) {
      dc.markRead(n.id).then(() => setUnread((u) => Math.max(0, u - 1))).catch(() => {});
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    if (n.link) nav(n.link);
  }

  async function markAll() {
    try { await dc.markAllRead(); setUnread(0); setItems((l) => l.map((n) => ({ ...n, is_read: true }))); } catch { /* non-fatal */ }
  }

  async function clearAll() {
    try { await dc.deleteNotifications(); setItems([]); setUnread(0); } catch { /* non-fatal */ }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label="Notifications" title="Notifications"
        className="relative rounded-lg p-2 text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-600">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 rounded-xl border border-line bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-1 sm:w-80">
          <div className="flex items-center justify-between border-b border-divider px-4 py-2.5">
            <span className="text-[13px] font-bold text-ink-900">Notifications</span>
            <div className="flex items-center gap-3">
              {unread > 0 && <button onClick={markAll} className="text-[11px] font-semibold text-ink-500 hover:text-ink-900">Mark all read</button>}
              {items.length > 0 && <button onClick={clearAll} className="text-[11px] font-semibold text-danger hover:opacity-80">Clear</button>}
            </div>
          </div>
          {busy ? <p className="px-4 py-8 text-center text-sm text-ink-400">Loading…</p>
            : items.length === 0 ? <p className="px-4 py-8 text-center text-sm text-ink-400">No notifications.</p>
            : (
              <ul className="max-h-80 divide-y divide-divider overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => openItem(n)} className={`w-full px-4 py-3 text-left hover:bg-page ${n.is_read ? "" : "bg-brand-50/50"}`}>
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />}
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink-900">{n.title}</p>
                          <p className="mt-0.5 text-[12px] text-ink-500">{n.message}</p>
                          <p className="mt-1 text-[10px] text-ink-400">{fmtDate(n.created_at, true)}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
