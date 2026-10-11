import type { ReactNode } from "react";
import { useAuth } from "../../hooks/useAuth";
import { PERMISSION_LABELS } from "../../utils/constants";
import { formatDateTime } from "../../utils/formatters";

/*
 * My account - same layout as the OIPM "My Profile" page:
 * red profile banner, then white cards with small red section labels.
 * Read-only: your details and what you are allowed to do.
 */

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const capital = (s?: string | null) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";

/* ── small inline icons (stroke = currentColor) ── */
const icon = "h-[17px] w-[17px]";
const Icons = {
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={icon}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5c1.4-2 3.3-3 5.5-3s4.1 1 5.5 3" strokeLinecap="round" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={icon}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={icon}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  badge: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={icon}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={icon}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4" strokeLinecap="round" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={icon}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-[22px] w-[22px]">
      <path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" />
      <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function Card({
  eyebrow,
  title,
  icon: headIcon,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[1.5px] text-brand-700">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <div className="flex items-center gap-3 text-brand-700">
          {aside}
          {headIcon}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, icon: fieldIcon }: { label: string; value?: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
        {fieldIcon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.7px] text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{value || "-"}</p>
      </div>
    </div>
  );
}

export default function ChangePassword() {
  const { user } = useAuth();
  // Everything that can be granted, so a user can see what they do NOT have
  // as well as what they do - "why can't I create an order" answers itself.
  const allPerms = Object.keys(PERMISSION_LABELS);
  const held = new Set(user?.permissions ?? []);
  const isAdmin = user?.role === "admin";

  const lastLogin = (user as typeof user & { last_login?: string | null })?.last_login;
  const department = (user as typeof user & { department?: string | null })?.department;

  return (
    <div className="mx-auto max-w-5xl pb-10">
      {/* ── Profile banner ── */}
      <section className="flex flex-col gap-5 rounded-2xl bg-gradient-to-br from-brand-600 via-brand-800 to-brand-900 p-6 text-white shadow-[0_16px_34px_rgba(143,11,11,0.18)] sm:flex-row sm:items-center sm:p-7">
        <span className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[20px] bg-white text-2xl font-extrabold text-brand-700 shadow-[0_8px_20px_rgba(0,0,0,0.14)]">
          {initials(user?.name)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[1.5px] text-white/70">My profile</p>
          <h1 className="mt-1 truncate text-2xl font-bold leading-tight sm:text-[32px]">{user?.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-white/80">
            <span>{capital(user?.role)}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                user?.status === "approved" ? "bg-white/15 text-white" : "bg-amber-300/25 text-amber-100"
              }`}
            >
              {user?.status}
            </span>
          </div>
        </div>
      </section>

      {/* ── Personal details ── */}
      <Card eyebrow="Account information" title="Personal Details" icon={Icons.user}>
        <div className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <Field label="Full name" value={user?.name} icon={Icons.user} />
          <Field label="Email address" value={user?.email} icon={Icons.mail} />
          <Field label="Role" value={capital(user?.role)} icon={Icons.shield} />
          <Field label="Status" value={capital(user?.status)} icon={Icons.badge} />
          {department && <Field label="Department" value={department} icon={Icons.building} />}
          {lastLogin && <Field label="Last signed in" value={formatDateTime(lastLogin)} icon={Icons.clock} />}
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Your name and email are managed by an administrator. Ask them if either needs
          changing — your email is also how you sign in.
          {lastLogin && " If the last sign-in was not you, tell an administrator."}
        </p>
      </Card>

      {/* ── What you can do ── */}
      <Card
        eyebrow="Access"
        title="What you can do"
        icon={Icons.list}
        aside={
          <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold">
            {isAdmin ? "Full access" : `${held.size} of ${allPerms.length}`}
          </span>
        }
      >
        {isAdmin ? (
          <p className="mt-5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
            You are an administrator, so every permission applies regardless of the
            list below.
          </p>
        ) : (
          <p className="mt-5 text-sm text-slate-500">
            Set by an administrator. Ask them if you need something you do not have.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {allPerms.map((p) => {
            const on = isAdmin || held.has(p);
            return (
              <div
                key={p}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                  on ? "border-slate-100 bg-slate-50/60" : "border-dashed border-slate-200 bg-white"
                }`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    on ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {on ? "✓" : "–"}
                </span>
                <span className={on ? "font-medium text-slate-800" : "text-slate-400"}>
                  {PERMISSION_LABELS[p] ?? p}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

    </div>
  );
}
