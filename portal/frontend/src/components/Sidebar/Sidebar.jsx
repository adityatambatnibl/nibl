// Side navigation for the portal admin pages.
import { NavLink } from "react-router-dom";

const LINKS = [
    { to: "/admin", label: "Users", end: true },
    { to: "/projects", label: "Applications" },
    { to: "/profile", label: "My profile" },
    { to: "/", label: "Back to applications", end: true },
];

export default function Sidebar() {
    return (
        <nav className="portal-sidebar" aria-label="Portal administration">
            {LINKS.map((l) => (
                <NavLink key={l.to + l.label} to={l.to} end={l.end}
                    className={({ isActive }) => `portal-sidebar-link${isActive ? " active" : ""}`}>
                    {l.label}
                </NavLink>
            ))}
        </nav>
    );
}
