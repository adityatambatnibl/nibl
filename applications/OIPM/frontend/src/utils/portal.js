// The NIBL portal (sign-in + project cards). Dev: "/" ; production: same site.
const PORTAL_URL = (import.meta.env.VITE_PORTAL_URL || "/").replace(/\/+$/, "");

/** Leave OIPM and open a portal page: "/" = project cards, "/logout" = sign out of everything. */
export function goToPortal(path = "/") {
    window.location.replace(`${PORTAL_URL}${path}`);
}
