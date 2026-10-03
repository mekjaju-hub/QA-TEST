// Throw-away backend for the WEBSITE test suite: fresh SQLite DB + storage under storage/e2e-website, seeded demo project.
// The Web Recorder runs headless with a CDP port so the tests can "be the user" in the recorder's browser window.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const backend = join(repo, "backend");
const data = join(repo, "storage", "e2e-website");
rmSync(data, { recursive: true, force: true });
mkdirSync(data, { recursive: true });
// Python: $PYTHON → the project's .venv (made by RUN-DEV.bat) → python on PATH
const venvs = [join(repo, ".venv", "Scripts", "python.exe"), join(repo, ".venv", "bin", "python"),
  join(backend, ".venv", "Scripts", "python.exe"), join(backend, ".venv", "bin", "python")];
const py = process.env.PYTHON || venvs.find(p => existsSync(p)) || (process.platform === "win32" ? "python" : "python3");
const env = {
  ...process.env,
  DATABASE_URL: `sqlite:///${join(data, "e2e.sqlite3").replace(/\\/g, "/")}`, STORAGE_ROOT: join(data, "files"),
  TASK_MODE: "inline", SECRET_KEY: "e2e-website-secret-key-0123456789abcdef", RUNNER_URL: "",
  LOGIN_RATE_PER_MINUTE: process.env.LOGIN_RATE_PER_MINUTE || "1000", API_RATE_PER_MINUTE: process.env.API_RATE_PER_MINUTE || "100000",
  WEB_RECORDER_HEADLESS: "1", WEB_RECORDER_CDP_PORT: process.env.WEB_RECORDER_CDP_PORT || "9339",
};
for (const args of [["-m", "alembic", "upgrade", "head"], ["-m", "app.seed"]]) {
  const r = spawnSync(py, args, { cwd: backend, env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const srv = spawn(py, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", process.env.WEBSITE_API_PORT || "8002"],
  { cwd: backend, env, stdio: "inherit" });
process.on("SIGTERM", () => srv.kill()); process.on("SIGINT", () => srv.kill());
srv.on("exit", c => process.exit(c ?? 0));
