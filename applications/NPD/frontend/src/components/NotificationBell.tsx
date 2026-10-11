import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationApi } from "../services/userApi";
import { formatDateTime } from "../utils/formatters";
import type { Notification } from "../types";

const POLL_MS = 60_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      notificationApi
        .unreadCount()
        .then((c) => !cancelled && setUnread(c))
        .catch(() => {});
    };

    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener("focus", load);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setBusy(true);
    try {
      setItems(await notificationApi.list());
    } catch {
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.is_read) {
      try {
        await notificationApi.markRead(n.id);
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        // non-fatal
      }
    }
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    try {
      await notificationApi.markAllRead();
      setUnread(0);
      setItems((list) => list.map((n) => ({ ...n, is_read: true })));
    } catch {
      // non-fatal
    }
  }

  async function deleteAll() {
    try {
      await notificationApi.deleteAll();
      setItems([]);
      setUnread(0);
    } catch {
      // non-fatal
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative rounded p-2 text-slate-600 hover:bg-slate-100"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 rounded-lg border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-1 sm:w-80">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-slate-500 hover:text-slate-900">
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button onClick={deleteAll} className="text-xs text-red-600 hover:text-red-800">
                  Delete
                </button>
              )}
            </div>
          </div>

          {busy ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Loading...</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${
                      n.is_read ? "" : "bg-blue-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{n.title}</p>
                        <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(n.created_at)}</p>
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