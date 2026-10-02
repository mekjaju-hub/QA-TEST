// API client — all calls go to same-origin /api (proxied to FastAPI by next.config.mjs).
// The session token lives in sessionStorage (tab-scoped) and is refreshed from X-Refreshed-Token
// on every response (sliding idle timeout). No secret ever reaches the browser.

export type ErrorBody = {
  code: string;
  user_message: string;
  timestamp: string;
  retryable: boolean;
  suggested_action: string;
  correlation_id: string;
  technical?: string;
  fields?: { loc: string; msg: string }[];
};

export class ApiError extends Error {
  status: number;
  body: ErrorBody;
  constructor(status: number, body: ErrorBody) {
    super(body.user_message);
    this.status = status;
    this.body = body;
  }
}

const TOKEN_KEY = "brsqa.token";

export const tokenStore = {
  get(): string | null {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(t: string) {
    try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked */ }
  },
  clear() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
  },
};

type Listener = (e: ApiError) => void;
const authListeners = new Set<Listener>();
export function onAuthError(fn: Listener) { authListeners.add(fn); return () => { authListeners.delete(fn); }; }

async function request<T>(method: string, path: string, body?: unknown, opts: { raw?: boolean; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const tok = tokenStore.get();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let payload: BodyInit | undefined;
  if (opts.form) payload = opts.form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload, cache: "no-store" });
  } catch (e) {
    throw new ApiError(0, { code: "NETWORK_ERROR", user_message: "เชื่อมต่อ Backend ไม่ได้", timestamp: new Date().toISOString(), retryable: true, suggested_action: "ตรวจว่า Backend ทำงานอยู่ (docker compose ps)", correlation_id: "-", technical: String(e) });
  }
  const refreshed = res.headers.get("X-Refreshed-Token");
  if (refreshed) tokenStore.set(refreshed);
  if (!res.ok) {
    let err: ErrorBody;
    try { err = (await res.json()).error; } catch { err = { code: `HTTP_${res.status}`, user_message: res.statusText || "เกิดข้อผิดพลาด", timestamp: new Date().toISOString(), retryable: res.status >= 500, suggested_action: "", correlation_id: res.headers.get("X-Correlation-Id") || "-" }; }
    const e = new ApiError(res.status, err);
    if (res.status === 401 || err.code === "PASSWORD_CHANGE_REQUIRED") authListeners.forEach(fn => fn(e));
    throw e;
  }
  if (opts.raw) return res as unknown as T;
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  patch: <T>(p: string, b: unknown) => request<T>("PATCH", p, b),
  put: <T>(p: string, b: unknown) => request<T>("PUT", p, b),
  upload: <T>(p: string, form: FormData) => request<T>("POST", p, undefined, { form }),
  raw: (p: string, method = "GET", b?: unknown) => request<Response>(method, p, b, { raw: true }),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "" && v !== false) u.set(k, String(v)); });
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Download a file returned by the API (Excel, ZIP, logs) using the auth header. */
export async function download(path: string, fallbackName: string, method = "GET", body?: unknown) {
  const res = await api.raw(path, method, body);
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = m ? m[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
