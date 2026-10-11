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

// Line-drawn padlock in the same white stroke style as the "open" arrow.
function LockIcon() {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2.5" />
            <path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" />
            <circle cx="12" cy="16" r="1.2" fill="currentColor" stroke="none" />
        </svg>
    );
}

export default function ProjectCard({ project, index, onOpen }) {
    const theme = themeFor(project.id);
    const locked = !project.can_open;
    const access = project.access || "approved";
    return (
        <button
            className={`project-card ${theme.className}${locked ? " is-locked" : ""}`}
            onClick={() => onOpen(project)}
            type="button"
            title={project.description || project.name}
        >
            <div className="card-top">
                <span>PROJECT {String(index + 1).padStart(2, "0")}</span>
                {locked
                    ? <span className="lock-badge" aria-label="Locked"><LockIcon /></span>
                    : <span className="arrow">→</span>}
            </div>
            <div className="card-body">
                <div className="card-title">{project.name}</div>
                <div className="card-subtitle">{project.subtitle}</div>
            </div>
            {locked
                ? <div className="card-footer">
                      <span className={`status-pill status-${access}`}>
                          <span className="status-dot" />{FOOTER[access] || "NOT AVAILABLE"}
                      </span>
                  </div>
                : <div className="card-footer">{FOOTER[access] || "OPEN PROJECT"}</div>}
        </button>
    );
}
