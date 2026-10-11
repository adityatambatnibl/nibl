import { PermissionGuard } from "./components/PermissionGuard";
import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";

// Each page is its own download, fetched the first time it is opened, so
// the app starts without loading every screen up front.

const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const UserApproval = lazy(() => import("./pages/admin/UserApproval"));
const AuditHistory = lazy(() => import("./pages/admin/AuditHistory"));
const BearingPlans = lazy(() => import("./pages/admin/BearingPlans"));
const Orders = lazy(() => import("./pages/orders/Orders"));
const OrderDetails = lazy(() => import("./pages/orders/OrderDetails"));
const ExcelReports = lazy(() => import("./pages/excel/ExcelReports"));
const ApqpProjects = lazy(() => import("./pages/apqp/ApqpProjects"));
const ApqpDetails = lazy(() => import("./pages/apqp/ApqpDetails"));
const EditOrder = lazy(() => import("./pages/orders/EditOrder"));
const EmailSettings = lazy(() => import("./pages/admin/EmailSettings"));
const Analytics = lazy(() => import("./pages/analytics/Analytics"));
const ChangePassword = lazy(() => import("./pages/user/ChangePassword"));
const EditApqp = lazy(() => import("./pages/apqp/EditApqp"));
const CreateProject = lazy(() => import("./pages/projects/CreateProject"));
const ProjectEmails = lazy(() => import("./pages/apqp/ProjectEmails"));
import Sso from "./pages/auth/Sso";

export default function App() {
  return (
    <BrowserRouter basename="/npd">
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/sso" replace />} />
          <Route path="/sso" element={<Sso />} />

          {/* Legacy auth URLs now enter the single-sign-on handoff. */}
          <Route path="/login" element={<Navigate to="/sso" replace />} />
          <Route path="/signup" element={<Navigate to="/sso" replace />} />
          <Route path="/forgot-password" element={<Navigate to="/sso" replace />} />
          <Route path="/reset-password" element={<Navigate to="/sso" replace />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/new" element={<Navigate to="/projects/new" replace />} />
              <Route path="/orders/:orderNo" element={<OrderDetails />} />
              <Route path="/reports" element={<ExcelReports />} />
              <Route path="/apqp/new" element={<Navigate to="/projects/new" replace />} />
              <Route path="/projects/new" element={
                <PermissionGuard permission="apqp_edit" fallback={<Navigate to="/apqp" replace />}>
                  <PermissionGuard permission="timeline_create" fallback={<Navigate to="/apqp" replace />}>
                    <CreateProject />
                  </PermissionGuard>
                </PermissionGuard>} />
              <Route path="/apqp" element={<ApqpProjects />} />
              <Route path="/apqp/:projectId" element={<ApqpDetails />} />
              <Route path="/orders/:orderNo/edit" element={<EditOrder />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/account" element={<ChangePassword />} />
              <Route path="/apqp/:projectId/edit" element={<EditApqp />} />
              <Route path="/apqp/:projectId/emails" element={<ProjectEmails />} />
              <Route path="/orders/:orderNo/emails" element={<ProjectEmails />} />

              <Route element={<ProtectedRoute adminOnly />}>
                <Route path="/admin/users" element={<UserManagement />} />
                <Route path="/admin/approvals" element={<UserApproval />} />
                {/* old address used by earlier notifications */}
                <Route path="/admin/user-approval" element={<Navigate to="/admin/approvals" replace />} />
                <Route path="/admin/audit" element={<AuditHistory />} />
                <Route path="/admin/bearing-plans" element={<BearingPlans />} />
                <Route path="/admin/stages" element={<Navigate to="/admin/bearing-plans" replace />} />
                <Route path="/admin/email-settings" element={<EmailSettings />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/sso" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}