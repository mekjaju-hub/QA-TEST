// Starts a throw-away backend for E2E: fresh SQLite DB + storage under storage/e2e, seeded with the demo project.
import { spawn, spawnSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const backend = join(repo, "backend");
const data = join(repo, "storage", "e2e");
rmSync(data, { recursive: true, force: true });
mkdirSync(data, { recursive: true });
const py = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const env = { ...process.env, DATABASE_URL: `sqlite:///${join(data, "e2e.sqlite3").replace(/\\/g, "/")}`, STORAGE_ROOT: join(data, "files"),
  TASK_MODE: "inline", SECRET_KEY: "e2e-secret-key-0123456789abcdef0123", LOGIN_RATE_PER_MINUTE: "100", RUNNER_URL: "" };
for (const args of [["-m", "alembic", "upgrade", "head"], ["-m", "app.seed"]]) {
  const r = spawnSync(py, args, { cwd: backend, env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const srv = spawn(py, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", process.env.E2E_API_PORT || "8001"], { cwd: backend, env, stdio: "inherit" });
process.on("SIGTERM", () => srv.kill()); process.on("SIGINT", () => srv.kill());
srv.on("exit", c => process.exit(c ?? 0));
