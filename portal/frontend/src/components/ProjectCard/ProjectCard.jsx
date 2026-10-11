// One application card (same look as the old OIPM launcher cards).
import { themeFor } from "../../constants/projects";

const FOOTER = {
    approved: "OPEN PROJECT",
    pending: "WAITING FOR APPROVAL",
    rejected: "ACCESS NOT GRANTED",
    inactive: "ACCOUNT INACTIVE",
    missing: "SETTING UP ACCESS...",
    unavailable: "NOT REACHABLE",
    coming_soon: "COMING SOON",
};

export default function ProjectCard({ project, index, onOpen }) {
    const theme = themeFor(project.id);
    const locked = !project.can_open;
    return (
        <button
            className={`project-card ${theme.className}${locked ? " is-locked" : ""}`}
            onClick={() => onOpen(project)}
            type="button"
            title={project.description || project.name}
        >
            <div className="card-top">
                <span>PROJECT {String(index + 1).padStart(2, "0")}</span>
                <span className="arrow">{locked ? "\u{1F512}" : "→"}</span>
            </div>
            <div className="card-body">
                <div className="card-title">{project.name}</div>
                <div className="card-subtitle">{project.subtitle}</div>
            </div>
            <div className="card-footer">{FOOTER[project.access] || "OPEN PROJECT"}</div>
        </button>
    );
}
