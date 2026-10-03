import { expect, type APIRequestContext } from "@playwright/test";
import { API, ACCOUNTS, PASSWORD, type Account } from "./env";

const tokens = new Map<string, string>();

/** Bearer token for an account (cached per worker). */
export async function token(request: APIRequestContext, who: Account = ACCOUNTS.admin, password = PASSWORD): Promise<string> {
  const key = `${who.username}:${password}`;
  if (tokens.has(key)) return tokens.get(key)!;
  const r = await request.post(`${API}/auth/login`, { data: { username: who.username, password } });
  expect(r.status(), `login ${who.username}`).toBe(200);
  const t = (await r.json()).access_token as string;
  tokens.set(key, t);
  return t;
}

export async function auth(request: APIRequestContext, who: Account = ACCOUNTS.admin) {
  return { Authorization: `Bearer ${await token(request, who)}` };
}

export async function apiGet<T = any>(request: APIRequestContext, path: string, who: Account = ACCOUNTS.admin): Promise<T> {
  const r = await request.get(`${API}${path}`, { headers: await auth(request, who) });
  expect(r.ok(), `GET ${path} → ${r.status()}`).toBeTruthy();
  return r.json();
}

export async function apiPost<T = any>(request: APIRequestContext, path: string, data: unknown = {}, who: Account = ACCOUNTS.admin): Promise<T> {
  const r = await request.post(`${API}${path}`, { headers: await auth(request, who), data });
  expect(r.ok(), `POST ${path} → ${r.status()} ${await r.text()}`).toBeTruthy();
  return r.json();
}

export async function camProjectId(request: APIRequestContext): Promise<string> {
  const ps = await apiGet<{ id: string; code: string }[]>(request, "/projects");
  return ps.find(p => p.code === "CAM")!.id;
}

/** A brand-new user that still has to change the temporary password (for first-login tests). */
export async function newUser(request: APIRequestContext, username: string, role: Account["role"], password: string) {
  await apiPost(request, "/users", { username, name: `E2E ${username}`, roles: [role], password });
  return { username, role, name: `E2E ${username}` } as Account;
}
