import { api } from "./api";
import type { User } from "../types";

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>("/auth/login", { email, password }).then((r) => r.data),

  sso: (oipm_access_token: string) =>
    api
      .post<LoginResponse>("/auth/sso", { oipm_access_token })
      .then((r) => r.data),

  signup: (name: string, email: string, password: string) =>
    api.post<{ message: string }>("/auth/signup", { name, email, password }).then((r) => r.data),

  me: () => api.get<User>("/auth/me").then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>("/auth/forgot-password", { email }).then((r) => r.data),

  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>("/auth/reset-password", { token, password }).then((r) => r.data),

  changePassword: (current_password: string, new_password: string) =>
    api
      .post<{ message: string }>("/auth/change-password", { current_password, new_password })
      .then((r) => r.data),
};