import axios from "axios";
import { getToken, goToPortal, refreshToken } from "./session";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/ai-drawing-control/api",
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (!token) {
    goToPortal("/login");
    throw new axios.Cancel("Not signed in");
  }
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(undefined, async (err) => {
  const cfg = err.config as (typeof err.config & { _retried?: boolean }) | undefined;
  if (err.response?.status === 401 && cfg && !cfg._retried) {
    cfg._retried = true;
    const token = await refreshToken();
    if (token) {
      cfg.headers.Authorization = `Bearer ${token}`;
      return api.request(cfg);
    }
    goToPortal("/login");
  }
  return Promise.reject(err);
});

export function apiError(err: unknown, fallback = "Something went wrong."): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail[0]?.msg ?? fallback;
  return fallback;
}
