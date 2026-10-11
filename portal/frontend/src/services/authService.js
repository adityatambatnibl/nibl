// Portal sign-in API: /portal-api/auth/*  (one identity for every NIBL application)
const PORTAL_API = import.meta.env.VITE_PORTAL_API_URL || "/portal-api";
// OIPM keeps its own HOD list (an OIPM sign-up answer).
const OIPM_API = import.meta.env.VITE_OIPM_API_URL || "/api/v1";

export function formatApiError(data) {
    if (!data) return "Something went wrong. Please try again.";
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
        return data.detail.map((item) => {
            if (typeof item === "string") return item;
            if (item?.msg) {
                const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : "";
                return field ? `${field}: ${item.msg}` : item.msg;
            }
            return JSON.stringify(item);
        }).join("\n");
    }
    if (typeof data.message === "string") return data.message;
    return "Something went wrong. Please try again.";
}

export async function request(path, { method = "GET", body, token, base = PORTAL_API } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${base}${path}`, {
        method,
        headers,
        credentials: "include",
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await response.json(); } catch { /* empty body */ }
    if (!response.ok) {
        const err = new Error(formatApiError(data));
        err.status = response.status;
        throw err;
    }
    return data;
}

export const registerUser = (payload) => request("/auth/register", { method: "POST", body: payload });
export const loginUser = (credentials) => request("/auth/login", { method: "POST", body: credentials });
export const refreshSession = () => request("/auth/refresh", { method: "POST" });
export const logoutUser = () => request("/auth/logout", { method: "POST" }).catch(() => null);
export const getMe = (token) => request("/auth/me", { token });
export const changePassword = (token, current_password, new_password) =>
    request("/auth/change-password", { method: "POST", token, body: { current_password, new_password } });

export async function forgotPassword(email, employeeCode) {
    if (!email || !email.trim()) throw new Error("Please enter your email address.");
    if (!employeeCode || !employeeCode.trim()) throw new Error("Please enter your employee code.");
    return request("/auth/forgot-password", {
        method: "POST",
        body: { email: email.trim(), employee_code: employeeCode.trim() },
    });
}

export async function getHods() {
    try {
        return await request("/auth/hods", { base: OIPM_API });
    } catch {
        return [];      // OIPM not reachable: sign-up still works with "I do not have an HOD"
    }
}
