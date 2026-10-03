// Seeded accounts must change the default password on first login → do it once via the API so every spec can log in.
import { request } from "@playwright/test";
import { ACCOUNTS, API, PASSWORD, SEED_PASSWORD } from "./support/env";

export default async function globalSetup() {
  const ctx = await request.newContext();
  for (const a of Object.values(ACCOUNTS)) {
    const r = await ctx.post(`${API}/auth/login`, { data: { username: a.username, password: SEED_PASSWORD } });
    if (r.status() !== 200) continue;                       // already changed (re-used server)
    const tok = (await r.json()).access_token;
    const c = await ctx.post(`${API}/auth/change-password`, { headers: { Authorization: `Bearer ${tok}` },
      data: { current_password: SEED_PASSWORD, new_password: PASSWORD } });
    if (!c.ok()) throw new Error(`change-password ${a.username}: ${c.status()} ${await c.text()}`);
  }
  await ctx.dispose();
}
