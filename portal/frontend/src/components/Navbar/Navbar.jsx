// Header of the signed-in portal pages (same look as the old OIPM workspace header).
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import BrandLogos from "../Brand/BrandLogos";

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    async function handleLogout() {
        await logout();
        navigate("/login", { replace: true });
    }

    return (
        <header className="module-header">
            <div className="module-brand" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
                <BrandLogos size="sm" />
            </div>
            <div className="module-header-right">
                <div className="module-user">
                    <span>Welcome</span>
                    <strong>{user?.full_name}</strong>
                </div>
                <button className="logout-button portal-nav-button" type="button" onClick={() => navigate("/profile")}>Profile</button>
                <button className="logout-button" onClick={handleLogout} type="button">Logout</button>
            </div>
        </header>
    );
}
