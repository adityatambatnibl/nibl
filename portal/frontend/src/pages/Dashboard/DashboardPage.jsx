// / - the application cards for the signed-in user (same look as the old OIPM workspace).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthContext";
import { getProjects, openProject } from "../../services/projectService";
import Navbar from "../../components/Navbar/Navbar";
import ProjectCard from "../../components/ProjectCard/ProjectCard";
import ProjectAccessModal from "../../components/ProjectCard/ProjectAccessModal";
import BearingBackground from "../../components/Brand/BearingBackground";
import BearingSpinner from "../../components/Loading/BearingSpinner";

const TONE = { pending: "pending", missing: "pending", coming_soon: "pending" };

export default function DashboardPage() {
    const { token, refresh } = useAuth();
    const [projects, setProjects] = useState(null);
    const [error, setError] = useState("");
    const [popup, setPopup] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const list = await getProjects(token);
                if (alive) setProjects(list);
            } catch (err) {
                if (err.status === 401) {
                    const t = await refresh();
                    if (t && alive) { setProjects(await getProjects(t)); return; }
                }
                if (alive) setError(err.message || "Could not load your applications.");
            }
        })();
        return () => { alive = false; };
    }, [token, refresh]);

    async function open(project) {
        if (!project.can_open) {
            setPopup({ project: project.name, message: project.message, tone: TONE[project.access] || "error" });
            return;
        }
        // A fresh token, so the application receives at least a few minutes of validity.
        const fresh = (await refresh()) || token;
        openProject(project, fresh);
    }

    const count = projects?.length || 0;

    return (
        <div className="module-page">
            <BearingBackground variant="landing" />
            <Navbar />
            <main className="module-content">
                {error && <div className="error-message" style={{ maxWidth: 640 }}>{error}</div>}
                {!projects && !error && <BearingSpinner size={64} />}
                {projects && (
                    <div className={`project-cards${count >= 3 ? " has-three" : ""}`}>
                        {projects.map((p, i) => <ProjectCard key={p.id} project={p} index={i} onOpen={open} />)}
                    </div>
                )}
                {projects && projects.length === 0 && <p>No applications are registered yet.</p>}
            </main>
            {popup && createPortal(
                <ProjectAccessModal project={popup.project} message={popup.message} tone={popup.tone} onClose={() => setPopup(null)} />,
                document.body,
            )}
        </div>
    );
}
