import { useRef } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/* Icons kept inline and tiny — 16px stroke paths, no icon library. */
const ICONS: Record<string, string> = {
  dashboard: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  orders: "M3 7h18M3 12h18M3 17h12",
  apqp: "M9 3v18M3 9h18M3 3h18v18H3z",
  analytics: "M4 20V10m6 10V4m6 16v-7m4 7V8",
  reports: "M14 3v5h5M14 3H6v18h12V8M9 13h6M9 17h6",
  users: "M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  approvals: "m5 12 5 5L20 7",
  audit: "M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z",
  stages: "M4 6h16M4 12h10M4 18h6",
  email: "m3 7 9 6 9-6M3 5h18v14H3V5Z",
};

const NAV = [
  { to: "/dashboard", label: "DASHBOARD", icon: "dashboard", permission: "dashboard_view" },
  { to: "/apqp", label: "APQP TIMELINE", icon: "apqp", permission: "apqp_view" },
  { to: "/orders", label: "TRACKING", icon: "orders", permission: "tracking_view" },
  { to: "/analytics", label: "ANALYTICS", icon: "analytics", permission: "analytics_view" },
  { to: "/reports", label: "REPORTS", icon: "reports", permission: "excel_export" },
];

const ADMIN_NAV = [
  { to: "/admin/approvals", label: "Approvals", icon: "approvals" },
  { to: "/admin/users", label: "Users", icon: "users" },
  { to: "/admin/audit", label: "Audit History", icon: "audit" },
];

// Set-up screens: changed rarely, so they sit in their own group.
const SETTINGS_NAV = [
  { to: "/admin/email-settings", label: "Email Settings", icon: "email" },
  { to: "/admin/bearing-plans", label: "Bearing Plans", icon: "stages" },
];

function NavIcon({ name }: { name: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, hasPermission } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  /* The spotlight follows the pointer. Writing straight to the DOM keeps this
     off React's render path — no state, no re-render on every mouse move. */
  function trackPointer(e: React.MouseEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-item group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 ${
      isActive
        ? "bg-white/[0.16] text-white shadow-[inset_3px_0_0_#ffffff]"
        : "text-white/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-white"
    }`;

  const visibleNav = NAV.filter((i) => hasPermission(i.permission));

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/55 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        style={{
          background:
            "linear-gradient(180deg, #B51212 0%, #8F0B0B 60%, #730808 100%)",
        }}
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand mark — the animated logo panel */}
        <div className="flex items-start justify-between border-b border-white/[0.14] px-5 py-5">
          <div className="logo-panel rounded-lg bg-white px-3.5 py-3 shadow-lg shadow-black/25 ring-1 ring-white/40 transition-transform duration-300 hover:scale-[1.03]">
            <img
              src="/npd/nrb-logo.jpg"
              alt="NRB Industrial Bearings"
              className="h-10 w-auto"
            />
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded p-1 text-white/70 hover:text-white lg:hidden"
          >
            ✕
          </button>
        </div>

        <div
          ref={scrollRef}
          onMouseMove={trackPointer}
          className="nav-spotlight flex-1 overflow-y-auto px-2.5 py-4"
        >
          <nav className="space-y-1.5" onClick={onClose}>
            {visibleNav.map((i, idx) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={linkClass}
                style={{ ["--i" as string]: idx }}
              >
                <NavIcon name={i.icon} />
                {i.label}
              </NavLink>
            ))}
          </nav>

          {user?.role === "admin" && (
            <>
              <p className="nav-heading mb-2 mt-7 px-3 text-[8px] font-extrabold uppercase tracking-[1.4px] text-white/45">
                Administration
              </p>
              <nav className="space-y-1.5" onClick={onClose}>
                {ADMIN_NAV.map((i, idx) => (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    className={linkClass}
                    style={{ ["--i" as string]: visibleNav.length + idx + 1 }}
                  >
                    <NavIcon name={i.icon} />
                    {i.label}
                  </NavLink>
                ))}
              </nav>

              <p className="nav-heading mb-2 mt-7 px-3 text-[8px] font-extrabold uppercase tracking-[1.4px] text-white/45">
                Settings
              </p>
              <nav className="space-y-1.5" onClick={onClose}>
                {SETTINGS_NAV.map((i, idx) => (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    className={linkClass}
                    style={{ ["--i" as string]: visibleNav.length + ADMIN_NAV.length + idx + 2 }}
                  >
                    <NavIcon name={i.icon} />
                    {i.label}
                  </NavLink>
                ))}
              </nav>
            </>
          )}
        </div>

        <div className="border-t border-white/[0.12] px-6 py-4">
          <p className="text-[9px] font-semibold uppercase tracking-[1.5px] text-white/45">
            NEW PRODUCT DEVELOPMENT
          </p>
        </div>
      </aside>
    </>
  );
}
