// /forgot-password - a new password is emailed; it works for every application.
// (The same form is also inside the sign-in page, as before.)
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { forgotPassword } from "../../services/authService";
import BrandLogos from "../../components/Brand/BrandLogos";
import BearingBackground from "../../components/Brand/BearingBackground";

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [error, setError] = useState("");

    async function submit(e) {
        e.preventDefault();
        setError(""); setMsg(""); setBusy(true);
        try {
            const r = await forgotPassword(email, code);
            setMsg(r?.message || "A new password has been sent to your registered email.");
        } catch (err) {
            setError(err.message || "Unable to reset the password.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="auth-page">
            <BearingBackground variant="login" />
            <div className="auth-brand"><div className="auth-brand-content"><BrandLogos /></div></div>
            <div className="auth-container">
                <div className="auth-visual">
                    <h1>Forgot password</h1>
                    <p>Enter your NIBL email and employee code. A new password is emailed to you.</p>
                </div>
                <div className="auth-card">
                    <div className="auth-card-heading"><h2>Reset password</h2></div>
                    {error && <div className="error-message">{error}</div>}
                    {msg && <div className="error-message" style={{ background: "#eaf7ed", color: "#2a6e3a", borderColor: "#bce2c6" }}>{msg}</div>}
                    <form onSubmit={submit}>
                        <div className="form-group">
                            <label htmlFor="fp-email">NIBL Email</label>
                            <input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@nibl.in" required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="fp-code">Employee Code</label>
                            <input id="fp-code" value={code} onChange={(e) => setCode(e.target.value)} required />
                        </div>
                        <button className="primary-button full" type="submit" disabled={busy}>{busy ? "Sending..." : "Send new password"}</button>
                    </form>
                    <div className="auth-switch"><span>Remembered it?</span> <button type="button" onClick={() => navigate("/login")}>Sign in</button></div>
                </div>
            </div>
        </div>
    );
}
