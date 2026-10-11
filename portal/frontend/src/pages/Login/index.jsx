// /login - sign in once for every NIBL application.
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoginPage from "./LoginPage";

export default function Login() {
    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [form, setForm] = useState({ email: "", password: "" });
    const [error, setError] = useState(location.state?.message || "");
    const [loading, setLoading] = useState(false);

    if (isAuthenticated) return <Navigate to="/" replace />;

    function onChange(event) {
        const { name, value } = event.target;
        setForm((p) => ({ ...p, [name]: value }));
        setError("");
    }

    async function onSubmit(event) {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            await login(form.email, form.password);
            navigate(location.state?.from && location.state.from !== "/login" ? location.state.from : "/", { replace: true });
        } catch (err) {
            setError(err.message || "Unable to sign in.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <LoginPage
            form={form}
            error={error}
            loading={loading}
            onChange={onChange}
            onSubmit={onSubmit}
            onSignup={() => navigate("/signup")}
        />
    );
}
