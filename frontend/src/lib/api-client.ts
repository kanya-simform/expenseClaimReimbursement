import axios, { type InternalAxiosRequestConfig } from "axios";
import type { User } from "./types";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export const apiClient = axios.create({ baseURL });

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export function storeSession(session: Pick<Session, "accessToken" | "refreshToken">) {
  localStorage.setItem("accessToken", session.accessToken);
  localStorage.setItem("refreshToken", session.refreshToken);
}

export function clearSession() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) {
    return Promise.reject(new Error("No refresh token"));
  }

  refreshInFlight ??= axios
    .post<Session>(`${baseURL}/auth/refresh`, { refreshToken })
    .then((res) => {
      storeSession(res.data);
      return res.data.accessToken;
    })
    .catch((error) => {
      clearSession();
      window.dispatchEvent(new Event("auth:session-expired"));
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthEndpoint = original?.url?.startsWith("/auth/");

    if (error.response?.status !== 401 || !original || original._retried || isAuthEndpoint) {
      throw error;
    }

    original._retried = true;
    const accessToken = await refreshAccessToken();
    original.headers.Authorization = `Bearer ${accessToken}`;
    return apiClient(original);
  },
);
