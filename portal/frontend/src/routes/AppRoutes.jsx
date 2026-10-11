import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute/ProtectedRoute";
import Loading from "../components/Loading/Loading";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import ForgotPasswordPage from "../pages/ForgotPassword/ForgotPasswordPage";
import DashboardPage from "../pages/Dashboard/DashboardPage";
import LogoutPage from "../pages/Logout/LogoutPage";

const ProfilePage = lazy(() => import("../pages/Profile/ProfilePage"));

export default function AppRoutes() {
    return (
        <Suspense fallback={<Loading />}>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/logout" element={<LogoutPage />} />
                <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}
