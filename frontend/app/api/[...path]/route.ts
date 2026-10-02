// Runtime reverse proxy: browser → Next.js (/api/*) → FastAPI (BACKEND_INTERNAL_URL).
// Done at runtime (not next.config rewrites) so the backend address can change without rebuilding,
// and only the frontend port needs to be exposed on the LAN.
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "host", "content-length"]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const backend = (process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const url = `${backend}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) headers.set(k, v); });
  const fwd = req.headers.get("x-forwarded-for");
  headers.set("x-forwarded-for", fwd ?? "client");
  const init: RequestInit & { duplex?: string } = { method: req.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(req.method)) { init.body = req.body; init.duplex = "half"; }
  let res: Response;
  try { res = await fetch(url, init); }
  catch (e) {
    return Response.json({ error: { code: "BACKEND_UNAVAILABLE", user_message: "เชื่อมต่อ Backend ไม่ได้", timestamp: new Date().toISOString(), retryable: true,
      suggested_action: "ตรวจว่า Backend ทำงานอยู่ (docker compose ps)", correlation_id: "-" } }, { status: 502 });
  }
  const out = new Headers();
  res.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase()) && k.toLowerCase() !== "content-encoding") out.set(k, v); });
  return new Response(res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
