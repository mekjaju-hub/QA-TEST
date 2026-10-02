// Copy Monaco Editor assets into public/ so the editor works offline (local-first, no CDN).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "monaco-editor", "min", "vs");
const dst = join(root, "public", "monaco", "vs");
if (existsSync(src)) { mkdirSync(dst, { recursive: true }); cpSync(src, dst, { recursive: true }); console.log("monaco assets → public/monaco/vs"); }
else console.warn("monaco-editor not installed; editor will fall back to <textarea>");
