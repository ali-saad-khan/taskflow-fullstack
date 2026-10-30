import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, type Api } from "./api/types";
import { DEMO_CREDENTIALS } from "./api/demo";
import type { User } from "./types";

const ApiContext = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside <AuthProvider>");
  return api;
}

interface AuthValue {
  user: User | null;
  booting: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: { name: string; email: string; password: string; password_confirmation: string }): Promise<void>;
  logout(): Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

const NOAUTO = "taskflow.noauto";
const flag = {
  get: () => { try { return sessionStorage.getItem(NOAUTO) !== null; } catch { return false; } },
  set: () => { try { sessionStorage.setItem(NOAUTO, "1"); } catch { /* ignore */ } },
  clear: () => { try { sessionStorage.removeItem(NOAUTO); } catch { /* ignore */ } },
};

export function AuthProvider({ api, children }: { api: Api; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let u: User | null = null;
      try {
        if (api.auth.hasSession()) u = await api.auth.me();
        else if (api.mode === "mock" && !flag.get()) u = (await api.auth.login(DEMO_CREDENTIALS)).user;
      } catch (e) {
        if (!(e instanceof ApiError)) console.error(e);
      }
      if (!cancelled) {
        setUser(u);
        setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  const value: AuthValue = {
    user,
    booting,
    async login(email, password) {
      const r = await api.auth.login({ email, password });
      flag.clear();
      setUser(r.user);
    },
    async register(input) {
      const r = await api.auth.register(input);
      flag.clear();
      setUser(r.user);
    },
    async logout() {
      try {
        await api.auth.logout();
      } catch {
        /* token already invalid server-side: treat as signed out */
      }
      flag.set();
      setUser(null);
    },
  };

  return (
    <ApiContext.Provider value={api}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </ApiContext.Provider>
  );
}

/** Minimal hash router so deep links work on any static host without rewrites. */
export function useHashPath(): string {
  const read = () => window.location.hash.replace(/^#/, "") || "/";
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path;
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function messageOf(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "network_error") return `${e.message} Changes were rolled back.`;
    return e.message;
  }
  return "Something went wrong.";
}
