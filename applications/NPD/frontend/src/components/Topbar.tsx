import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { NotificationBell } from "./NotificationBell";

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // The NIBL portal: "/" = project cards, "/logout" = sign out of everything
  // and land on the portal login page.
  const portal = (import.meta.env.VITE_WORKSPACE_URL ?? "http://nibl").replace(/\/+$/, "");

  function handleLogout() {
    logout();
    window.location.href = `${portal}/logout`;
  }

  return (
    <header className="sticky top-0 z-10 flex h-[68px] shrink-0 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="rounded-lg p-2 text-ink-700 transition-colors hover:bg-page lg:invisible"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className="flex items-center gap-2 lg:gap-3">
        {user?.role === "admin" && <NotificationBell />}

        <button
          onClick={() => navigate("/account")}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-page"
        >
          <span className="grid h-[38px] w-[38px] place-items-center rounded-full border border-brand-200 bg-brand-50 text-[13px] font-extrabold text-brand-600">
            {initials(user?.name)}
          </span>
          <span className="hidden flex-col items-start leading-tight sm:flex">
            <strong className="text-[12px] font-semibold text-ink-900">{user?.name}</strong>
            <span className="text-[10px] capitalize text-ink-400">{user?.role}</span>
          </span>
        </button>

        <button
          onClick={() => { window.location.href = `${portal}/`; }}
          className="rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-ink-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
        >
          Workspace
        </button>

        <button
          onClick={handleLogout}
          className="rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-ink-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
