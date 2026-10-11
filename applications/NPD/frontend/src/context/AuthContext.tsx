import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { authApi } from "../services/authApi";
import { clearFetchCache } from "../services/fetchCache";
import type { User } from "../types";

export interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithOipm: (oipmAccessToken: string) => Promise<void>;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(
    () => !!sessionStorage.getItem("npd_access_token"),
  );

  useEffect(() => {
    if (!sessionStorage.getItem("npd_access_token")) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    authApi.me()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
        }
      })
      .catch(() => {
        sessionStorage.removeItem("npd_access_token");
        clearFetchCache();
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    const res = await authApi.login(email, password);

    sessionStorage.setItem("npd_access_token", res.access_token);
    setUser(res.user);
    setLoading(false);
  }

  const loginWithOipm = useCallback(async (oipmAccessToken: string) => {
    const res = await authApi.sso(oipmAccessToken);

    sessionStorage.setItem("npd_access_token", res.access_token);
    setUser(res.user);
    setLoading(false);
  }, []);

  function logout() {
    sessionStorage.removeItem("npd_access_token");
    clearFetchCache();
    setUser(null);
    setLoading(false);
  }

  function hasPermission(perm: string) {
    if (!user) {
      return false;
    }

    if (user.role === "admin") {
      return true;
    }

    return user.permissions?.includes(perm) ?? false;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginWithOipm,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

