// FundFlow client — calls same-origin /ff-api (proxied to the FundFlow Express app).
// Customer (OTP) and Staff (RBAC) sessions are separate from the WebQA2026 login; tokens live in sessionStorage.
export type FFKind = "customer" | "staff";
const KEYS: Record<FFKind, string> = { customer: "ff_token", staff: "ff_staff_token" };

export const ffToken = {
  get(k: FFKind): string | null { try { return sessionStorage.getItem(KEYS[k]); } catch { return null; } },
  set(k: FFKind, t: string) { try { sessionStorage.setItem(KEYS[k], t); } catch { /* blocked */ } },
  clear(k: FFKind) { try { sessionStorage.removeItem(KEYS[k]); if (k === "customer") sessionStorage.removeItem("ff_name"); } catch { /* blocked */ } },
};

export class FFError extends Error {
  status: number; code?: string; details?: Record<string, string>;
  constructor(status: number, message: string, code?: string, details?: Record<string, string>) { super(message); this.status = status; this.code = code; this.details = details; }
}

export const fmt = (n: unknown, d = 2) => Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export async function ff<T = unknown>(kind: FFKind | null, path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const tok = kind ? ffToken.get(kind) : null;
  let res: Response;
  try {
    res = await fetch(`/ff-api${path}`, {
      method: opts.method ?? "GET", cache: "no-store",
      headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(opts.headers ?? {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch { throw new FFError(0, "เชื่อมต่อ FundFlow API ไม่ได้", "NETWORK_ERROR"); }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const e = new FFError(res.status, d?.error?.message || `HTTP ${res.status}`, d?.error?.code, d?.error?.details);
    if (res.status === 401 && kind && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ff-auth-expired", { detail: kind }));
    throw e;
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

/** Download a text/binary response with the staff token. */
export async function ffDownload(path: string, fallback: string) {
  const res = await fetch(`/ff-api${path}`, { headers: { Authorization: `Bearer ${ffToken.get("staff") ?? ""}` } });
  if (!res.ok) throw new FFError(res.status, "ดาวน์โหลดไม่สำเร็จ");
  const name = (res.headers.get("Content-Disposition") || "").match(/filename="?([^"]+)"?/)?.[1] || fallback;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await res.blob()); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return name;
}

export type Fund = { code: string; name: string; group: string; shareClass: string; risk: number; nav: number; minBuy: number; status: string };
export type Meta = { groups: { key: string; label: string }[]; shareClasses: Record<string, string> };
export type Order = { id: string; type: string; fundCode: string; toFundCode?: string; amount?: number; units?: number; status: string; customerId?: string; unitholderId?: string; channel?: string; createdBy?: string; riskAcknowledged?: boolean };
export type Holding = { fundCode: string; units: number; nav: number; marketValue: number; unrealizedPL: number; unrealizedPLPct: number };
export type Portfolio = { wallet: number; holdings: Holding[]; totalMarketValue: number };
export type Market = { now: string; isOpen: boolean; tradeDate: string };
export type StaffMe = { username: string; name: string; role: string; permissions: string[] };
export type Account = { id: string; name: string; riskLevel: number; phone?: string; email?: string; wallet?: number; unitholders?: { id: string; amc: string }[] };
