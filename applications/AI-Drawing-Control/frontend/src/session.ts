// Sign-in comes from the NIBL portal (same site).
//  * the portal keeps its access token in localStorage("portal_access_token")
//  * when it is missing or expired we ask the portal for a new one with the
//    httpOnly refresh cookie (/portal-api/auth/refresh)
//  * if that fails the person is not signed in -> back to the portal
const PORTAL_API = import.meta.env.VITE_PORTAL_API_URL || "/portal-api";
export const PORTAL_URL = (import.meta.env.VITE_PORTAL_URL || "/").replace(/\/+$/, "");
const KEY = "portal_access_token";

function expiry(token: string): number {
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return (p.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

let pending: Promise<string | null> | null = null;

export async function refreshToken(): Promise<string | null> {
  pending ??= fetch(`${PORTAL_API}/auth/refresh`, { method: "POST", credentials: "include" })
    .then(async (r) => {
      if (!r.ok) return null;
      const data = await r.json();
      localStorage.setItem(KEY, data.access_token);
      localStorage.setItem("portal_user", JSON.stringify(data.user));
      return data.access_token as string;
    })
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}

export async function getToken(): Promise<string | null> {
  const t = localStorage.getItem(KEY);
  if (t && expiry(t) > Date.now() + 30_000) return t;
  return refreshToken();
}

export function goToPortal(path = "/") {
  window.location.replace(`${PORTAL_URL}${path}`);
}
