import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Loading from "../Loading/Loading";

export default function ProtectedRoute({ children, adminOnly = false }) {
    const { isAuthenticated, loading, user } = useAuth();
    const location = useLocation();
    if (loading) return <Loading />;
    if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    if (adminOnly && !user?.is_admin) return <Navigate to="/" replace />;
    return children;
}
