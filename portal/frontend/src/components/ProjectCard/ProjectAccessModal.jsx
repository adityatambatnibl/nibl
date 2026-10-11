import { useEffect } from "react";
import "./ProjectAccessModal.css";

/**
 * Pop-up shown on the project launcher when a user cannot open a project
 * (not approved yet, rejected, inactive, or the project is unreachable).
 * Works for any project - pass its name and the message to show.
 */
export default function ProjectAccessModal({ project, message, tone = "pending", onClose }) {
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="pam-backdrop" onClick={onClose} role="presentation">
            <div
                className="pam-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pam-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`pam-icon pam-icon-${tone}`}>
                    {tone === "error" ? "!" : (
                        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" strokeLinecap="round" />
                        </svg>
                    )}
                </div>

                <h2 id="pam-title" className="pam-title">{project} access</h2>

                <p className="pam-message">{message}</p>

                {tone === "pending" && (
                    <p className="pam-hint">
                        You can open {project} as soon as an administrator approves your access.
                    </p>
                )}

                <button type="button" className="pam-button" onClick={onClose} autoFocus>
                    OK
                </button>
            </div>
        </div>
    );
}
