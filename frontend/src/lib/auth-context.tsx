import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient, clearSession, storeSession, type Session } from "./api-client";
import type { Role, User } from "./types";

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: Role;
  managerEmail?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
    }
    window.addEventListener("auth:session-expired", handleSessionExpired);

    if (!localStorage.getItem("refreshToken")) {
      clearSession();
      setIsLoading(false);
    } else {
      apiClient
        .get<{ user: User }>("/auth/me")
        .then((res) => setUser(res.data.user))
        .catch(() => clearSession())
        .finally(() => setIsLoading(false));
    }

    return () => window.removeEventListener("auth:session-expired", handleSessionExpired);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    function applySession(data: Session) {
      storeSession(data);
      setUser(data.user);
      return data.user;
    }

    return {
      user,
      isLoading,
      login: async (email: string, password: string) => {
        const res = await apiClient.post<Session>("/auth/login", {
          email,
          password,
        });
        return applySession(res.data);
      },
      register: async (input: RegisterInput) => {
        const res = await apiClient.post<Session>("/auth/register", input);
        return applySession(res.data);
      },
      logout: async () => {
        const refreshToken = localStorage.getItem("refreshToken");
        clearSession();
        setUser(null);
        if (refreshToken) {
          await apiClient.post("/auth/logout", { refreshToken }).catch(() => undefined);
        }
      },
    };
  }, [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
