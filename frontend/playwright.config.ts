import { defineConfig, devices } from "@playwright/test";

// Basic E2E (หัวข้อ 40): real backend (seeded) + production Next.js build
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "../storage/e2e/report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3100", screenshot: "only-on-failure", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  outputDir: "../storage/e2e/results",
  webServer: [
    { command: "node e2e/start-backend.mjs", url: "http://127.0.0.1:8001/api/health", timeout: 120_000, reuseExistingServer: false },
    { command: "npx next start -p 3100", url: "http://127.0.0.1:3100/login", timeout: 120_000, reuseExistingServer: false,
      env: { BACKEND_INTERNAL_URL: "http://127.0.0.1:8001" } },
  ],
});
