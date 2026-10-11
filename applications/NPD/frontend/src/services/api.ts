import axios from "axios";
import { clearFetchCache } from "./fetchCache";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/npd/api",
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("npd_access_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (res) => {
    const method = (res.config.method ?? "get").toLowerCase();

    if (method !== "get" && method !== "head") {
      clearFetchCache();
    }

    return res;
  },
  (err) => {
    const isSsoRequest = String(err.config?.url ?? "").endsWith("/auth/sso");

    if (
      err.response?.status === 401 &&
      sessionStorage.getItem("npd_access_token") &&
      !isSsoRequest
    ) {
      sessionStorage.removeItem("npd_access_token");
      clearFetchCache();
      window.location.href = "/npd/sso";
    }

    return Promise.reject(err);
  },
);

export function apiError(
  err: unknown,
  fallback = "Something went wrong.",
): string {
  const detail = (
    err as {
      response?: {
        data?: {
          detail?: unknown;
        };
      };
    }
  )?.response?.data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail[0]?.msg ?? fallback;
  }

  return fallback;
}

