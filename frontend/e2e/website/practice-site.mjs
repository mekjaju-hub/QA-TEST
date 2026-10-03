// Serves backend/tests/web_fixture (practice pages: login, register, SPA shop, tricky, shop) for Web Explorer / Recorder tests.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backend", "tests", "web_fixture");
const ROUTES = { "/home": "/index.html", "/inventory.html": "/spa.html" };   // like a real server: protected pages show login
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
createServer(async (req, res) => {
  let p = new URL(req.url, "http://x").pathname;
  p = ROUTES[p] || (p === "/" ? "/index.html" : p);
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(Number(process.env.PRACTICE_PORT || 8765), "127.0.0.1");
