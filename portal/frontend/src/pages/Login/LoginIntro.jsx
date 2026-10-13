// Login screen intro (approved 13 Oct 2026 - options 1 + 2 + 3 of the preview):
//   0.0-1.0 s  white screen, a bearing spins in the middle
//   1.0-1.7 s  the bearing flies into the logo, the page uncovers
//   1.0-2.0 s  the bottom-left bearing assembles (rings, balls, hub)
//   1.6-2.2 s  headline and sign-in card come in
//   2.2 s ->   ring / ball / roller travel along the red process line
// Styles: LoginIntro.css. Everything is skipped for "reduce motion" users.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./LoginIntro.css";

const reduced = () =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const BALLS = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return [60 + 30 * Math.cos(a), 60 + 30 * Math.sin(a)];
});

function BigBearing() {
    return (
        <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
            <circle cx="60" cy="60" r="56" fill="#f6f6f6" stroke="#9a9a9a" strokeWidth="2" />
            <circle cx="60" cy="60" r="48" fill="none" stroke="#c9c9c9" strokeWidth="1.5" />
            <circle cx="60" cy="60" r="38" fill="none" stroke="#b51212" strokeOpacity=".45" strokeWidth="3" />
            {BALLS.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="6.2" fill="#d6d6d6" stroke="#8a8a8a" strokeWidth="1" />
            ))}
            <circle cx="60" cy="60" r="20" fill="#fff" stroke="#8a8a8a" strokeWidth="2" />
            <circle cx="60" cy="60" r="9" fill="#fff" stroke="#b51212" strokeWidth="2.5" />
        </svg>
    );
}

/* Spinning bearing that flies into the logo's place. */
function FlyingBearing() {
    const [done, setDone] = useState(false);

    useEffect(() => {
        const node = document.querySelector(".li-fly");
        const logo = document.querySelector(".auth-brand-content");
        if (!node || !node.animate) { setDone(true); return undefined; }
        const r = logo?.getBoundingClientRect();
        const tx = r ? r.left + r.width / 2 - window.innerWidth / 2 : -window.innerWidth / 3;
        const ty = r ? r.top + r.height / 2 - window.innerHeight / 2 : -window.innerHeight / 3;
        const anim = node.animate(
            [
                { transform: "translate(0,0) scale(.2) rotate(0deg)", opacity: 0 },
                { transform: "translate(0,0) scale(1) rotate(200deg)", opacity: 1, offset: 0.3 },
                { transform: "translate(0,0) scale(1) rotate(520deg)", opacity: 1, offset: 0.6 },
                { transform: `translate(${tx}px,${ty}px) scale(.24) rotate(900deg)`, opacity: 0 },
            ],
            { duration: 1700, easing: "cubic-bezier(.5,0,.25,1)", fill: "forwards" },
        );
        anim.onfinish = () => setDone(true);
        return () => anim.cancel();
    }, []);

    if (done) return null;
    return (
        <div className="li-cover" aria-hidden="true">
            <div className="li-fly"><BigBearing /></div>
        </div>
    );
}

/* Ring, ball and roller travelling along the process line. */
function LineParts() {
    const [line, setLine] = useState(null);
    useEffect(() => { setLine(document.querySelector(".premium-auth-login .premium-process-line")); }, []);
    if (!line) return null;
    return createPortal(
        <>
            <span className="li-part" style={{ animationDelay: "2.2s" }}>
                <svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8" fill="#fff" stroke="#8a8a8a" strokeWidth="2" /><circle cx="10" cy="10" r="4" fill="#fff" stroke="#b51212" strokeWidth="2" /></svg>
            </span>
            <span className="li-part" style={{ animationDelay: "5.2s" }}>
                <svg viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="6.5" fill="#d0d0d0" stroke="#7a7a7a" strokeWidth="1.2" /><circle cx="6" cy="5.5" r="2" fill="#fff" /></svg>
            </span>
            <span className="li-part" style={{ animationDelay: "8.2s" }}>
                <svg viewBox="0 0 24 12" width="22" height="11"><rect x="1" y="1" width="22" height="10" rx="3" fill="#d6d6d6" stroke="#7a7a7a" strokeWidth="1.2" /></svg>
            </span>
        </>,
        line,
    );
}

export default function LoginIntro() {
    if (reduced()) return null;
    return (
        <>
            <FlyingBearing />
            <LineParts />
        </>
    );
}
