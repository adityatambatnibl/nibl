// /profile - my details and change password (the password works for every application).
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { changePassword } from "../../services/authService";
import Navbar from "../../components/Navbar/Navbar";

export default function ProfilePage() {
    const { user, token } = useAuth();
    const [f, setF] = useState({ current: "", next: "", confirm: "" });
    const [msg, setMsg] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setMsg(""); setError("");
        if (f.next.length < 8) return setError("The new password must have at least 8 characters.");
        if (f.next !== f.confirm) return setError("The new passwords do not match.");
        setBusy(true);
        try {
            const r = await changePassword(token, f.current, f.next);
            setMsg(r.message); setF({ current: "", next: "", confirm: "" });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="module-page portal-page">
            <Navbar />
            <main className="portal-main">
                <h1>My profile</h1>
                <div className="portal-panel">
                    <dl className="portal-dl">
                        <dt>Name</dt><dd>{user?.full_name}</dd>
                        <dt>Email</dt><dd>{user?.email}</dd>
                        <dt>Employee code</dt><dd>{user?.employee_code}</dd>
                        {user?.department && (<><dt>Department</dt><dd>{user.department}</dd></>)}
                    </dl>
                </div>
                <div className="portal-panel">
                    <h2>Change password</h2>
                    <p className="portal-muted">One password for every NIBL application.</p>
                    {error && <div className="error-message">{error}</div>}
                    {msg && <div className="portal-ok">{msg}</div>}
                    <form onSubmit={submit} className="portal-form">
                        <div className="form-group"><label>Current password</label>
                            <input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></div>
                        <div className="form-group"><label>New password</label>
                            <input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></div>
                        <div className="form-group"><label>Confirm new password</label>
                            <input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></div>
                        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving..." : "Change password"}</button>
                    </form>
                </div>
            </main>
        </div>
    );
}
