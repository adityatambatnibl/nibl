import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import DrawingLayout from "./DrawingLayout";

const Home = lazy(() => import("./pages/Home"));
const Tree = lazy(() => import("./pages/Tree"));
const Reviews = lazy(() => import("./pages/Reviews"));
const Viewer = lazy(() => import("./pages/Viewer"));
const Upload = lazy(() => import("./pages/Upload"));
const Profile = lazy(() => import("./pages/Profile"));
const UsersPage = lazy(() => import("./pages/Admin").then((m) => ({ default: m.UsersPage })));
const RecordsPage = lazy(() => import("./pages/Admin").then((m) => ({ default: m.RecordsPage })));
const LockedPage = lazy(() => import("./pages/Admin").then((m) => ({ default: m.LockedPage })));
const DownloadsPage = lazy(() => import("./pages/Admin").then((m) => ({ default: m.DownloadsPage })));
const AuditPage = lazy(() => import("./pages/Admin").then((m) => ({ default: m.AuditPage })));

export default function App() {
  return (
    <BrowserRouter basename="/drawing-control">
      <Routes>
        <Route element={<DrawingLayout />}>
          <Route index element={<Home />} />
          <Route path="tree" element={<Tree />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="view/:id" element={<Viewer />} />
          <Route path="upload" element={<Upload />} />
          <Route path="account" element={<Profile />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="locked" element={<LockedPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
