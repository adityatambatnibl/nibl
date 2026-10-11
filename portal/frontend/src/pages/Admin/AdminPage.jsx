// /admin - portal admin: people (identities), passwords and their status in every application.
// Approving someone FOR an application is done inside that application by its own admin.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { request } from "../../services/authService";
import Navbar from "../../components/Navbar/Navbar";
import Sidebar from "../../components/Sidebar/Sidebar";

const LABEL = { approved: "Approved", pending: "Pending", rejected: "Rejected", inactive: "Inactive", missing: "Not created", unavailable: "Not reachable", coming_soon: "—" };

export default function AdminPage() {
    const { token, user: me } = useAuth();
    const [q, setQ] = useState("");
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState({});
    const [msg, setMsg] = useState("");
    const [error, setError] = useState("");

    const load = useCallback(() => {
        request(`/users?q=${encodeURIComponent(q)}&page=${page}&size=25`, { token })
            .then(setData).catch((e) => setError(e.message));
    }, [q, page, token]);
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

    async function act(path, method = "POST", body) {
        setMsg(""); setError("");
        try { const r = await request(path, { method, body, token }); if (r?.message) setMsg(r.message); load(); }
        catch (e) { setError(e.message); }
    }
    async function showAccess(id) {
        if (open[id]) return setOpen((o) => ({ ...o, [id]: null }));
        try { setOpen((o) => ({ ...o, [id]: "loading" })); const a = await request(`/users/${id}/access`, { token }); setOpen((o) => ({ ...o, [id]: a })); }
        catch (e) { setError(e.message); }
    }

    const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

    return (
        <div className="module-page portal-page">
            <Navbar />
            <div className="portal-layout">
                <Sidebar />
                <main className="portal-main">
                    <h1>Users</h1>
                    <p className="portal-muted">One account per person. Each application's administrator approves access inside that application.</p>
                    {error && <div className="error-message">{error}</div>}
                    {msg && <div className="portal-ok">{msg}</div>}
                    <input className="portal-search" placeholder="Search name, email or employee code" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
                    <div className="portal-panel portal-table-wrap">
                        <table className="portal-table">
                            <thead><tr><th>Name</th><th>Employee code</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
                            <tbody>
                                {data?.items.map((u) => (
                                    <FragmentRow key={u.id} u={u} me={me} access={open[u.id]} onAccess={() => showAccess(u.id)} act={act} />
                                ))}
                            </tbody>
                        </table>
                        {data && data.items.length === 0 && <p className="portal-muted" style={{ padding: 16 }}>No users match.</p>}
                    </div>
                    {data && (
                        <div className="portal-pager">
                            <span>{data.total} user(s)</span>
                            <button className="logout-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                            <span>Page {page} of {pages}</span>
                            <button className="logout-button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function FragmentRow({ u, me, access, onAccess, act }) {
    return (
        <>
            <tr className={u.is_active ? "" : "portal-row-off"}>
                <td><b>{u.full_name}</b>{u.is_admin && <span className="portal-tag">Portal admin</span>}<div className="portal-muted">{u.email}</div></td>
                <td>{u.employee_code}</td>
                <td>{u.is_active ? "Active" : "Deactivated"}</td>
                <td>{u.last_login ? new Date(u.last_login).toLocaleString() : "—"}</td>
                <td className="portal-actions">
                    <button onClick={onAccess}>{access ? "Hide access" : "Application access"}</button>
                    <button onClick={() => act(`/users/${u.id}/reset-password`)}>Email new password</button>
                    {u.id !== me?.id && <button onClick={() => act(`/users/${u.id}/active`, "PUT", { is_active: !u.is_active })}>{u.is_active ? "Deactivate" : "Activate"}</button>}
                    {u.id !== me?.id && <button onClick={() => act(`/users/${u.id}/admin`, "PUT", { is_admin: !u.is_admin })}>{u.is_admin ? "Remove admin" : "Make admin"}</button>}
                </td>
            </tr>
            {access && (
                <tr className="portal-subrow"><td colSpan={5}>
                    {access === "loading" ? "Checking..." : (
                        <div className="portal-access">
                            {Object.entries(access).map(([pid, st]) => <span key={pid} className={`portal-pill ${st}`}>{pid}: {LABEL[st] || st}</span>)}
                            <button onClick={() => act(`/users/${u.id}/sync`)}>Create in missing applications</button>
                        </div>
                    )}
                </td></tr>
            )}
        </>
    );
}
