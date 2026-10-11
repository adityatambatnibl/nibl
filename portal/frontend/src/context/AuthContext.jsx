// Portal session.
//  * access token: memory + localStorage("portal_access_token") so applications on
//    this site (e.g. AI Drawing Control) can read it
//  * refresh: httpOnly cookie "portal_refresh_token" set by the portal backend
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { loginUser, logoutUser, refreshSession } from "../services/authService";

const AuthContext = createContext(null);

const TOKEN_KEY = "portal_access_token";
const USER_KEY = "portal_user";

// Session keys the applications keep in this browser. Cleared on every sign-in
// and sign-out so one person's session never carries over to the next person.
const APP_KEYS_LOCAL = ["oipm_access_token", "oipm_user", "access_token", "oipm_current_screen"];
const APP_KEYS_SESSION = ["npd_access_token", "access_token"];

function clearAppSessions() {
    APP_KEYS_LOCAL.forEach((k) => localStorage.removeItem(k));
    APP_KEYS_SESSION.forEach((k) => sessionStorage.removeItem(k));
}

function tokenExpiry(token) {
    try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return payload.exp ? payload.exp * 1000 : 0;
    } catch {
        return 0;
    }
}

export function AuthProvider({ children }) {
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
    });
    const [loading, setLoading] = useState(true);
    const timer = useRef(null);

    const store = useCallback((data) => {
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setToken(data.access_token);
        setUser(data.user);
    }, []);

    const clear = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
    }, []);

    const refresh = useCallback(async () => {
        try {
            const data = await refreshSession();
            store(data);
            return data.access_token;
        } catch {
            clear();
            return null;
        }
    }, [store, clear]);

    // Keep the session alive: refresh one minute before the access token expires.
    useEffect(() => {
        clearTimeout(timer.current);
        if (!token) return undefined;
        const wait = Math.max(5000, tokenExpiry(token) - Date.now() - 60000);
        timer.current = setTimeout(refresh, wait);
        return () => clearTimeout(timer.current);
    }, [token, refresh]);

    // On page load: a stored token that is still valid is used; otherwise the cookie is tried.
    useEffect(() => {
        let alive = true;
        (async () => {
            const saved = localStorage.getItem(TOKEN_KEY);
            if (!saved || tokenExpiry(saved) < Date.now() + 30000) {
                await refresh();
            }
            if (alive) setLoading(false);
        })();
        return () => { alive = false; };
    }, [refresh]);

    const login = useCallback(async (email, password) => {
        clearAppSessions();
        const data = await loginUser({ email: email.trim().toLowerCase(), password });
        store(data);
        return data.user;
    }, [store]);

    const logout = useCallback(async () => {
        await logoutUser();
        clearAppSessions();
        clear();
    }, [clear]);

    const value = { token, user, loading, isAuthenticated: !!(token && user), login, logout, refresh };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}
