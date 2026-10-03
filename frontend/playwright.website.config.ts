import { defineConfig, devices } from "@playwright/test";

// WEBSITE test suite of WebQA2026 itself (Test Case catalog: docs/qa/WEBQA2026_TEST_CASES.xlsx).
// Own backend (port 8002, fresh DB under storage/e2e-website) + practice site (8765) + production Next.js build (3200).
const API_PORT = process.env.WEBSITE_API_PORT || "8002";
export default defineConfig({
  testDir: "./e2e/website",
  globalSetup: "./e2e/website/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,                       // one shared backend + one Web Recorder at a time
  reporter: [["list"], ["html", { outputFolder: "../storage/e2e-website/report", open: "never" }],
    ["junit", { outputFile: "../storage/e2e-website/junit.xml" }]],
  use: { baseURL: "http://127.0.0.1:3200", screenshot: "only-on-failure", trace: "retain-on-failure", locale: "th-TH",
    ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
  outputDir: "../storage/e2e-website/results",
  webServer: [
    { command: "node e2e/website/start-backend.mjs", url: `http://127.0.0.1:${API_PORT}/api/health`, timeout: 180_000,
      reuseExistingServer: !process.env.CI },
    { command: "node e2e/website/practice-site.mjs", url: "http://127.0.0.1:8765/index.html", timeout: 30_000, reuseExistingServer: !process.env.CI },
    { command: "npx next start -p 3200", url: "http://127.0.0.1:3200/login", timeout: 120_000, reuseExistingServer: !process.env.CI,
      env: { BACKEND_INTERNAL_URL: `http://127.0.0.1:${API_PORT}` } },
  ],
});
