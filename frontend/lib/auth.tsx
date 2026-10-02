"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, onAuthError, tokenStore } from "./api";
import type { PublicSettings, User } from "./types";

type AuthState = {
  user: User | null; settings: PublicSettings | null; loading: boolean;
  can: (perm: string) => boolean; refresh: () => Promise<void>; logout: (reason?: string) => Promise<void>;
  setSession: (token: string) => Promise<void>;
};
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setLoading(false); return; }
    try {
      const me = await api.get<{ user: User; settings: PublicSettings }>("/api/auth/me");
      setUser(me.user); setSettings(me.settings);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  const logout = useCallback(async (reason?: string) => {
    try { if (tokenStore.get()) await api.post("/api/auth/logout"); } catch { /* already expired */ }
    tokenStore.clear(); setUser(null);
    const next = pathname && pathname !== "/login" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}${reason ? (next ? "&" : "?") + "reason=" + encodeURIComponent(reason) : ""}`);
  }, [router, pathname]);

  const setSession = useCallback(async (token: string) => { tokenStore.set(token); await refresh(); }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => onAuthError(e => {
    if (e.body.code === "PASSWORD_CHANGE_REQUIRED") router.replace("/change-password");
    else { tokenStore.clear(); setUser(null); router.replace(`/login?reason=${encodeURIComponent(e.body.user_message)}`); }
  }), [router]);

  // Idle session timeout (หัวข้อ 3) — mirrors SESSION_MINUTES on the server
  useEffect(() => {
    if (!user || !settings) return;
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    window.addEventListener("click", touch, true); window.addEventListener("keydown", touch, true);
    const t = setInterval(() => { if (Date.now() - last > settings.session_minutes * 60000) void logout("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่"); }, 15000);
    return () => { clearInterval(t); window.removeEventListener("click", touch, true); window.removeEventListener("keydown", touch, true); };
  }, [user, settings, logout]);

  const can = useCallback((perm: string) => !!user && user.permissions.includes(perm), [user]);
  const value = useMemo(() => ({ user, settings, loading, can, refresh, logout, setSession }), [user, settings, loading, can, refresh, logout, setSession]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
