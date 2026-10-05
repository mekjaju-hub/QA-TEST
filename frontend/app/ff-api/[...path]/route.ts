// Runtime reverse proxy: browser → Next.js (/ff-api/*) → FundFlow Express server (FUNDFLOW_API_URL).
// /ff-api/api/funds → {FUNDFLOW_API_URL}/api/funds · /ff-api/health → {FUNDFLOW_API_URL}/health
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "host", "content-length"]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const backend = (process.env.FUNDFLOW_API_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
  const url = `${backend}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) headers.set(k, v); });
  const init: RequestInit & { duplex?: string } = { method: req.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(req.method)) { init.body = req.body; init.duplex = "half"; }
  let res: Response;
  try { res = await fetch(url, init); }
  catch {
    return Response.json({ error: { code: "FUNDFLOW_UNAVAILABLE", message: "เชื่อมต่อ FundFlow API ไม่ได้ — เปิดด้วย RUN-FUNDFLOW.bat ก่อน" } }, { status: 502 });
  }
  const out = new Headers();
  res.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase()) && k.toLowerCase() !== "content-encoding") out.set(k, v); });
  return new Response(res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
