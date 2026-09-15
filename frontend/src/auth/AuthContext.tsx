// Auth state for Buddiz. Single source of truth consumed by the root-layout
// gate. Never navigates directly — sets state and the gate reacts.
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, loadToken, setToken } from "@/src/api/client";

export type User = {
  id: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  city?: string;
  avatar_url?: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  identity_verification_status: string;
  rating_avg: number;
  rating_count: number;
  meals_hosted_count: number;
  guests_welcomed_count: number;
  created_at?: string;
  auth_provider?: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  loginWithToken: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

export type RegisterPayload = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  city: string;
  phone: string;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    // On web, pick up an OAuth session_id from the URL first (playbook rule 3).
    if (typeof window !== "undefined" && window.location) {
      try {
        const { processWebSession } = await import("@/src/auth/oauth");
        const handled = await processWebSession(async (token, u) => {
          await setToken(token);
          setUserState(u);
        });
        if (handled) {
          setLoading(false);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    const token = await loadToken();
    if (!token) {
      setUserState(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ user: User }>("/auth/me");
      setUserState(res.user);
    } catch {
      await setToken(null);
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
    await setToken(res.token);
    setUserState(res.user);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await api.post<{ token: string; user: User }>("/auth/register", payload);
    await setToken(res.token);
    setUserState(res.user);
  }, []);

  const loginWithToken = useCallback(async (token: string, u: User) => {
    await setToken(token);
    setUserState(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    await setToken(null);
    setUserState(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user: User }>("/auth/me");
      setUserState(res.user);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, loginWithToken, logout, refresh, setUser: setUserState }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
