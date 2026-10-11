// /projects - the registered applications (from shared/configuration/projects.json).
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { request } from "../../services/authService";
import Navbar from "../../components/Navbar/Navbar";
import Sidebar from "../../components/Sidebar/Sidebar";

export default function ProjectsPage() {
    const { token } = useAuth();
    const [rows, setRows] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => { request("/projects/registry", { token }).then(setRows).catch((e) => setError(e.message)); }, [token]);
    return (
        <div className="module-page portal-page">
            <Navbar />
            <div className="portal-layout">
                <Sidebar />
                <main className="portal-main">
                    <h1>Applications</h1>
                    <p className="portal-muted">To add an application, add it to <code>shared/configuration/projects.json</code> (see README, "Add a new application"). The portal picks the change up automatically.</p>
                    {error && <div className="error-message">{error}</div>}
                    <div className="portal-panel portal-table-wrap">
                        <table className="portal-table">
                            <thead><tr><th>#</th><th>Application</th><th>Opens at</th><th>Backend</th><th>Status</th></tr></thead>
                            <tbody>
                                {rows?.map((p) => (
                                    <tr key={p.id}><td>{p.order}</td><td><b>{p.name}</b><div className="portal-muted">{p.subtitle}</div></td>
                                        <td><code>{p.launch?.url}</code></td><td><code>{p.backend_url || "—"}</code></td><td>{p.status || "active"}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </main>
            </div>
        </div>
    );
}
