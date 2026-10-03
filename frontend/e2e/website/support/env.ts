// Addresses and test accounts of the WEBSITE test suite (all synthetic — never use real accounts here).
export const API = process.env.WEBSITE_API || "http://127.0.0.1:8002/api";
export const PRACTICE = process.env.PRACTICE_URL || "http://127.0.0.1:8765";   // backend/tests/web_fixture served by practice-site.mjs
export const RECORDER_CDP = `http://127.0.0.1:${process.env.WEB_RECORDER_CDP_PORT || "9339"}`;
export const SEED_PASSWORD = "Admin@12345";            // seed default (must be changed on first login)
export const PASSWORD = "Website-E2e!Pass1";           // set for every seeded account by global-setup.ts

export type Account = { username: string; role: "ADMIN" | "QA_MANUAL" | "QA_AUTOMATION" | "BA"; name: string };
export const ACCOUNTS = {
  admin: { username: "admin", role: "ADMIN", name: "System Admin" },
  qaManual: { username: "qa_manual", role: "QA_MANUAL", name: "QA Manual (Demo)" },
  qaAuto: { username: "qa_auto", role: "QA_AUTOMATION", name: "QA Automation (Demo)" },
  ba: { username: "ba", role: "BA", name: "Business Analyst (Demo)" },
} satisfies Record<string, Account>;

export const unique = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-5).toUpperCase()}`;
