"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ApiError } from "./api";

type Toast = { id: number; text: string; err: boolean };
const Ctx = createContext<{ toast: (text: string, err?: boolean) => void; toastError: (e: unknown) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((text: string, err = false) => {
    const id = Date.now() + Math.random();
    setItems(x => [...x, { id, text, err }]);
    setTimeout(() => setItems(x => x.filter(t => t.id !== id)), err ? 7000 : 3500);
  }, []);
  const toastError = useCallback((e: unknown) => {
    if (e instanceof ApiError) toast(`${e.body.user_message}${e.body.suggested_action ? " — " + e.body.suggested_action : ""} (${e.body.code} · ${e.body.correlation_id})`, true);
    else toast(String(e), true);
  }, [toast]);
  return (
    <Ctx.Provider value={{ toast, toastError }}>
      {children}
      <div className="toast" role="status" aria-live="polite">{items.map(t => <div key={t.id} className={t.err ? "err" : ""}>{t.text}</div>)}</div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast outside ToastProvider");
  return v;
}
