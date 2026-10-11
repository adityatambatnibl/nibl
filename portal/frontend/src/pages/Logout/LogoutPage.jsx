// /logout - applications send people here to sign out of everything.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Loading from "../../components/Loading/Loading";

export default function LogoutPage() {
    const { logout } = useAuth();
    const navigate = useNavigate();
    useEffect(() => {
        logout().finally(() => navigate("/login", { replace: true }));
    }, [logout, navigate]);
    return <Loading label="Signing out..." />;
}
