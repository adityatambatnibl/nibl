// My profile - same look as the NPD "My profile" page: red banner, then white cards.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { dc, type Me } from "../api";
import { useDc } from "../DrawingLayout";
import { ErrorLine, fmtDate } from "../ui";
import { apiError } from "../apiClient";

function initials(name?: string) {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

const cap = (s?: string | null) => (s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-");

const ic = "dcp-i";
const Icons = {
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={ic} width="17" height="17"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.5 18.5c1.4-2 3.3-3 5.5-3s4.1 1 5.5 3" strokeLinecap="round" /></svg>,
  mail: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={ic} width="17" height="17"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={ic} width="17" height="17"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  badge: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={ic} width="17" height="17"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  building: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={ic} width="17" height="17"><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4" strokeLinecap="round" /></svg>,
  id: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={ic} width="17" height="17"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M14 10h4M14 13h4M6 16c.6-1.2 1.7-2 3-2s2.4.8 3 2" strokeLinecap="round" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={ic} width="17" height="17"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  list: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" width="22" height="22"><path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  doc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" width="22" height="22"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" /><path d="M14 3v5h5M9 13h6M9 17h4" strokeLinecap="round" /></svg>,
};

// Plain CSS (not Tailwind classes) so the page looks the same whatever the build picked up.
const CSS = `
.dcp{max-width:1024px;margin:0 auto;padding-bottom:40px;font-family:inherit}
.dcp-banner{display:flex;align-items:center;gap:22px;padding:28px;border-radius:16px;color:#fff;
  background:linear-gradient(135deg,#B51212 0%,#8F0B0B 55%,#730808 100%);box-shadow:0 16px 34px rgba(143,11,11,.18)}
.dcp-avatar{width:72px;height:72px;flex:0 0 72px;display:grid;place-items:center;border-radius:20px;background:#fff;
  color:#A50F0F;font-size:24px;font-weight:800;box-shadow:0 8px 20px rgba(0,0,0,.14)}
.dcp-eyebrow{font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin:0}
.dcp-banner .dcp-eyebrow{color:rgba(255,255,255,.72)}
.dcp-name{margin:4px 0 0;font-size:30px;font-weight:700;line-height:1.15;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcp-tags{margin-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:14px;font-weight:600;color:rgba(255,255,255,.85)}
.dcp-pill{border-radius:999px;background:rgba(255,255,255,.16);padding:2px 10px;font-size:12px;color:#fff;text-transform:capitalize}
.dcp-card{margin-top:20px;border:1px solid #e2e8f0;border-radius:16px;background:#fff;padding:24px;box-shadow:0 8px 24px rgba(15,23,42,.05)}
.dcp-head{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #f1f5f9;padding-bottom:16px}
.dcp-card .dcp-eyebrow{color:#A50F0F}
.dcp-title{margin:4px 0 0;font-size:18px;font-weight:700;color:#0f172a}
.dcp-headicons{display:flex;align-items:center;gap:12px;color:#A50F0F}
.dcp-grid{margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.dcp-grid3{margin-top:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.dcp-field{display:flex;align-items:center;gap:12px;min-width:0;border:1px solid #f1f5f9;border-radius:12px;background:rgba(248,250,252,.7);padding:16px}
.dcp-ficon{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border-radius:8px;background:#FFF7F6;color:#A50F0F}
.dcp-flabel{margin:0;font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#64748b}
.dcp-fval{margin:2px 0 0;font-size:14px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcp-stat{display:block;border:1px solid #f1f5f9;border-radius:12px;background:rgba(248,250,252,.7);padding:16px;text-decoration:none}
a.dcp-stat:hover{border-color:#FBD7D4}
.dcp-num{margin:4px 0 0;font-size:26px;font-weight:800}
.dcp-note{margin:16px 0 0;font-size:12px;color:#64748b}
.dcp-badge{border:1px solid #FBD7D4;background:#FFF7F6;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600}
.dcp-admin{margin-top:20px;border:1px solid #FBD7D4;background:#FFF7F6;border-radius:8px;padding:10px 16px;font-size:14px;color:#8F0B0B}
.dcp-perm{display:flex;align-items:center;gap:12px;border-radius:12px;padding:12px 16px;font-size:14px}
.dcp-perm.on{border:1px solid #f1f5f9;background:rgba(248,250,252,.7);color:#1e293b;font-weight:500}
.dcp-perm.off{border:1px dashed #e2e8f0;background:#fff;color:#94a3b8}
.dcp-tick{width:20px;height:20px;flex:0 0 20px;display:grid;place-items:center;border-radius:999px;font-size:11px;font-weight:700}
.dcp-perm.on .dcp-tick{background:#dcfce7;color:#15803d}
.dcp-perm.off .dcp-tick{background:#f1f5f9;color:#94a3b8}
.dcp-perms{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:760px){.dcp-banner{flex-direction:column;align-items:flex-start}.dcp-grid,.dcp-grid3,.dcp-perms{grid-template-columns:1fr}.dcp-name{font-size:24px}}
`;

function Card({ eyebrow, title, icon, aside, children }: { eyebrow: string; title: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="dcp-card">
      <div className="dcp-head">
        <div><p className="dcp-eyebrow">{eyebrow}</p><h2 className="dcp-title">{title}</h2></div>
        <div className="dcp-headicons">{aside}{icon}</div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, icon }: { label: string; value?: ReactNode; icon: ReactNode }) {
  return (
    <div className="dcp-field">
      <span className="dcp-ficon">{icon}</span>
      <div style={{ minWidth: 0 }}><p className="dcp-flabel">{label}</p><p className="dcp-fval">{value || "-"}</p></div>
    </div>
  );
}

function Stat({ label, value, color, to }: { label: string; value: number; color: string; to?: string }) {
  const body = <><p className="dcp-flabel">{label}</p><p className="dcp-num" style={{ color }}>{value}</p></>;
  return to ? <Link to={to} className="dcp-stat">{body}</Link> : <div className="dcp-stat">{body}</div>;
}

const USER_CAN = [
  "Open and read every released drawing",
  "Confirm or deny drawings sent to you (deny needs a reason)",
  "Change a deny to Confirm later",
];
const ADMIN_CAN = [
  "Upload new drawings and revise existing ones",
  "Choose who gets the confirmation mail",
  "Create, rename and delete folders; move drawings",
  "Delete and restore drawings",
  "See locked (old) revisions, records, downloads and the audit trail",
  "Approve users and keep the Email List",
];

export default function Profile() {
  const { isAdmin } = useDc();
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { dc.me().then(setMe).catch((e) => setErr(apiError(e, "Could not load your profile."))); }, []);

  const role = isAdmin ? "Drawing admin" : "Reviewer";
  const all = [...USER_CAN, ...ADMIN_CAN];

  return (
    <div className="dcp">
      <style>{CSS}</style>
      <ErrorLine>{err}</ErrorLine>

      <section className="dcp-banner">
        <span className="dcp-avatar">{initials(me?.name)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="dcp-eyebrow">My profile</p>
          <h1 className="dcp-name">{me?.name ?? "…"}</h1>
          <div className="dcp-tags">
            <span>{role}</span>
            {me?.status && <span className="dcp-pill">{me.status}</span>}
            {me?.on_email_list && <span className="dcp-pill" style={{ textTransform: "none" }}>On the Email List</span>}
          </div>
        </div>
      </section>

      <Card eyebrow="Account information" title="Personal Details" icon={Icons.user}>
        <div className="dcp-grid">
          <Field label="Full name" value={me?.name} icon={Icons.user} />
          <Field label="Email address" value={me?.email} icon={Icons.mail} />
          <Field label="Role in Drawing Control" value={role} icon={Icons.shield} />
          <Field label="Status" value={cap(me?.status)} icon={Icons.badge} />
          {me?.employee_code && <Field label="Employee code" value={me.employee_code} icon={Icons.id} />}
          {me?.department && <Field label="Department" value={me.department} icon={Icons.building} />}
          {me?.member_since && <Field label="Using Drawing Control since" value={fmtDate(me.member_since)} icon={Icons.clock} />}
        </div>
        <p className="dcp-note">Your name and email come from your portal account. Ask an administrator if either needs changing — your email is also where confirmation mails are sent.</p>
      </Card>

      <Card eyebrow="Confirmations" title="My drawings to confirm" icon={Icons.doc}>
        <div className="dcp-grid3">
          <Stat label="Waiting for me" value={me?.waiting ?? 0} color={me?.waiting ? "#B51212" : "#0f172a"} to="/reviews" />
          <Stat label="Confirmed" value={me?.confirmed ?? 0} color="#15803d" />
          <Stat label="Denied" value={me?.denied ?? 0} color="#0f172a" />
        </div>
        <p className="dcp-note">
          {me?.on_email_list
            ? "You are on the Email List, so you are asked to confirm new drawings when the uploader does not pick people by name."
            : "You are not on the Email List. You are asked to confirm a drawing only when the uploader picks you by name."}
        </p>
      </Card>

      <Card eyebrow="Access" title="What you can do" icon={Icons.list}
        aside={<span className="dcp-badge">{isAdmin ? "Full access" : `${USER_CAN.length} of ${all.length}`}</span>}>
        {isAdmin
          ? <p className="dcp-admin">You are the drawing administrator, so everything below applies to you.</p>
          : <p className="dcp-note" style={{ marginTop: 20, fontSize: 14 }}>Set by the drawing administrator. Ask them if you need something you do not have.</p>}
        <div className="dcp-perms">
          {all.map((p) => {
            const on = isAdmin || USER_CAN.includes(p);
            return <div key={p} className={`dcp-perm ${on ? "on" : "off"}`}><span className="dcp-tick">{on ? "✓" : "–"}</span><span>{p}</span></div>;
          })}
        </div>
      </Card>
    </div>
  );
}
