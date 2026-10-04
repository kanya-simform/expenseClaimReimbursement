import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient } from "./api-client";
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
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setIsLoading(false);
      return;
    }

    apiClient
      .get<{ user: User }>("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem("accessToken"))
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    function applySession(data: { accessToken: string; user: User }) {
      localStorage.setItem("accessToken", data.accessToken);
      setUser(data.user);
      return data.user;
    }

    return {
      user,
      isLoading,
      login: async (email: string, password: string) => {
        const res = await apiClient.post<{ accessToken: string; user: User }>("/auth/login", {
          email,
          password,
        });
        return applySession(res.data);
      },
      register: async (input: RegisterInput) => {
        const res = await apiClient.post<{ accessToken: string; user: User }>(
          "/auth/register",
          input,
        );
        return applySession(res.data);
      },
      logout: () => {
        localStorage.removeItem("accessToken");
        setUser(null);
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
