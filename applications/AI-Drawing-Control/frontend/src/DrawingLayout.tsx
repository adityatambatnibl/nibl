// Drawing Control shell: its own red sidebar and top bar, same NPD session.
import { createContext, Suspense, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Loading } from "./components/Loading";
import { goToPortal } from "./session";
import NotificationBell from "./NotificationBell";
import { dc, type Counts } from "./api";

interface DcCtx { isAdmin: boolean; counts: Counts | null; refresh: () => void }
const Ctx = createContext<DcCtx>({ isAdmin: false, counts: null, refresh: () => {} });
export const useDc = () => useContext(Ctx);

const ICONS: Record<string, string> = {
  reg: "M4 5h16M4 10h16M4 15h10M4 20h7",
  tree: "M3 7h6l2 2h10v10H3zM3 7V5h6l2 2",
  review: "m5 12 5 5L20 7",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 20h16",
  users: "M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  check: "M9 11l3 3 8-8M20 12v7H4V5h11",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z",
  dl: "M12 4v12m0 0 4-4m-4 4-4-4M4 20h16",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z",
};
function Icon({ n }: { n: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true"><path d={ICONS[n]} /></svg>;
}

const MAIN = [
  { to: "/", label: "DRAWINGS", icon: "reg", end: true },
  { to: "/tree", label: "PRODUCT TREE", icon: "tree" },
  { to: "/reviews", label: "MY REVIEWS", icon: "review", badge: true },
];
const ADMIN = [
  { to: "/upload", label: "Upload Drawing", icon: "upload" },
  { to: "/users", label: "Users & Approvals", icon: "users" },
  { to: "/records", label: "Approval Records", icon: "check" },
  { to: "/locked", label: "Locked Versions", icon: "lock" },
  { to: "/downloads", label: "Download Log", icon: "dl" },
  { to: "/audit", label: "Audit History", icon: "clock" },
];

export default function DrawingLayout() {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");
  const [why, setWhy] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const refresh = useCallback(() => { dc.counts().then(setCounts).catch(() => {}); }, []);

  useEffect(() => {
    dc.me()
      .then((m) => {
        if (!m.can_view) {
          setWhy(m.status === "rejected"
            ? "Your access request for Drawing Control was rejected. Please contact the drawing administrator."
            : "Your access to Drawing Control is waiting for approval by the drawing administrator.");
          setState("denied");
          return;
        }
        setIsAdmin(m.is_admin);
        setName(m.name ?? "");
        setState("ok");
        refresh();
      })
      .catch(() => { setWhy("Drawing Control could not be reached. Please try again later."); setState("denied"); });
  }, [refresh]);

  if (state === "denied") {
    return (
      <div className="grid min-h-screen place-items-center bg-page p-6">
        <div className="max-w-md rounded-xl border border-line bg-white p-8 text-center shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-brand-600">Drawing Control</p>
          <h1 className="mt-2 text-lg font-bold text-ink-900">Access not available yet</h1>
          <p className="mt-2 text-sm text-ink-500">{why}</p>
          <button onClick={() => goToPortal("/")} className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Back to applications</button>
        </div>
      </div>
    );
  }
  if (state !== "ok") return <Loading label="Opening Drawing Control..." />;

  const link = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 ${
      isActive ? "bg-white/[0.16] text-white shadow-[inset_3px_0_0_#ffffff]" : "text-white/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-white"}`;
  const initials = (name || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Ctx.Provider value={{ isAdmin, counts, refresh }}>
      <div className="flex h-screen bg-page">
        {open && <div onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-slate-900/55 lg:hidden" />}
        <aside style={{ background: "linear-gradient(180deg, #B51212 0%, #8F0B0B 60%, #730808 100%)" }}
          className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
          {/* Brand mark - same animated logo panel as NPD */}
          <div className="flex items-start justify-between border-b border-white/[0.14] px-5 py-5">
            <div className="logo-panel rounded-lg bg-white px-3.5 py-3 shadow-lg shadow-black/25 ring-1 ring-white/40 transition-transform duration-300 hover:scale-[1.03]">
              <img src={`${import.meta.env.BASE_URL}nrb-logo.jpg`} alt="NRB Industrial Bearings" className="h-10 w-auto" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2.5 py-4">
            <nav className="space-y-1.5" onClick={() => setOpen(false)}>
              {MAIN.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={link}>
                  <Icon n={i.icon} />{i.label}
                  {i.badge && !!counts?.mine && <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-brand-700">{counts.mine}</span>}
                </NavLink>
              ))}
            </nav>
            {isAdmin && (
              <>
                <p className="mb-2 mt-7 px-3 text-[8px] font-extrabold uppercase tracking-[1.4px] text-white/45">Drawing administration</p>
                <nav className="space-y-1.5" onClick={() => setOpen(false)}>
                  {ADMIN.map((i) => <NavLink key={i.to} to={i.to} className={link}><Icon n={i.icon} />{i.label}</NavLink>)}
                </nav>
              </>
            )}
          </div>
          <div className="border-t border-white/[0.12] px-6 py-4">
            <p className="text-[9px] font-semibold uppercase tracking-[1.5px] text-white/45">DRAWING CONTROL</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-10 flex h-[68px] shrink-0 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur-md lg:px-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-ink-700 hover:bg-page lg:hidden">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              </button>
              <div className="leading-tight">
                <p className="text-[10px] font-bold uppercase tracking-[1.4px] text-brand-600">R&amp;D · Controlled drawings</p>
                <p className="text-[15px] font-bold text-ink-900">Drawing Control</p>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:gap-3">
              <NotificationBell />
              <button onClick={() => nav("/account")} title="My profile" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-page">
                <span className="grid h-[38px] w-[38px] place-items-center rounded-full border border-brand-200 bg-brand-50 text-[13px] font-extrabold text-brand-600">{initials}</span>
                <span className="hidden flex-col items-start leading-tight sm:flex">
                  <strong className="text-[12px] font-semibold text-ink-900">{name}</strong>
                  <span className="text-[10px] text-ink-400">{isAdmin ? "Drawing admin" : "Reviewer"}</span>
                </span>
              </button>
              <button onClick={() => goToPortal("/")} className="rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-ink-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600">Workspace</button>
              <button onClick={() => goToPortal("/logout")} className="rounded-lg border border-line px-3 py-2 text-[12px] font-semibold text-ink-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600">Log out</button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="mx-auto w-full max-w-[1360px]">
              <Suspense fallback={<Loading />}><Outlet /></Suspense>
            </div>
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

/** Wrap admin-only pages. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useDc();
  if (!isAdmin) return <div className="rounded-xl border border-line bg-white p-8 text-sm text-ink-500">Only the drawing administrator can open this page.</div>;
  return <>{children}</>;
}
