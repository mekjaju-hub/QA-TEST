// Module NAV/RBAC — menus by role (UI) + the same rule enforced by the backend (API 403)
import { expect, test } from "@playwright/test";
import { auth, camProjectId } from "./support/api";
import { ACCOUNTS, API, PRACTICE } from "./support/env";
import { loginAs, mainNav, openProject } from "./support/ui";

const PROJECT_MENUS = ["Dashboard", "Project Detail", "Processing", "Version Compare", "Requirement Explorer", "Test Scenarios", "Test Cases",
  "Python", "Pytest", "Test Runs", "Web Explorer", "Web History"];

test.describe("NAV · เมนูตามสิทธิ์ (Role)", () => {
  test("WQA-NAV-01 Admin เห็นเมนูครบทุกกลุ่ม รวม Settings / Audit Log และปุ่ม Create Project", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await expect(page.getByRole("button", { name: "Create Project" })).toBeVisible();
    await openProject(page);
    const nav = mainNav(page);
    for (const m of [...PROJECT_MENUS, "Upload", "Postman", "SQL (MySQL)", "Playwright", "JMeter", "GitHub", "Settings", "Audit Log"])
      await expect(nav.getByRole("link", { name: m, exact: false }).first(), m).toBeVisible();
  });

  test("WQA-NAV-02 Business Analyst: ไม่มี Upload / Generator / GitHub / Settings / Audit Log / Create Project", async ({ page }) => {
    await loginAs(page, ACCOUNTS.ba);
    await expect(page.getByRole("button", { name: "Create Project" })).toHaveCount(0);
    await openProject(page);
    const nav = mainNav(page);
    await expect(nav.getByRole("link", { name: "Requirement Explorer" })).toBeVisible();
    for (const m of ["Upload", "Postman", "Playwright", "JMeter", "GitHub", "Settings", "Audit Log"])
      await expect(nav.getByRole("link", { name: m, exact: true }), m).toHaveCount(0);
  });

  test("WQA-NAV-03 QA Manual: Upload ได้ แต่ไม่มี Generator (Postman/SQL/Playwright/JMeter) และ GitHub", async ({ page }) => {
    await loginAs(page, ACCOUNTS.qaManual);
    await openProject(page);
    const nav = mainNav(page);
    await expect(nav.getByRole("link", { name: "Upload" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Pytest" })).toBeVisible();
    for (const m of ["Postman", "SQL (MySQL)", "Playwright", "JMeter", "GitHub", "Settings"])
      await expect(nav.getByRole("link", { name: m, exact: true }), m).toHaveCount(0);
  });

  test("WQA-NAV-04 QA Automation: Generator + GitHub ได้ แต่ Upload เอกสารไม่ได้", async ({ page }) => {
    await loginAs(page, ACCOUNTS.qaAuto);
    await openProject(page);
    const nav = mainNav(page);
    for (const m of ["Postman", "Playwright", "JMeter", "GitHub", "Test Runs"]) await expect(nav.getByRole("link", { name: m, exact: true }), m).toBeVisible();
    await expect(nav.getByRole("link", { name: "Upload", exact: true })).toHaveCount(0);
  });

  test("WQA-NAV-05 พิมพ์ URL หน้าที่ไม่มีสิทธิ์ตรง ๆ (BA → Upload) → แสดง 'ไม่มีสิทธิ์' ไม่แสดงฟอร์ม", async ({ page, request }) => {
    const pid = await camProjectId(request);
    await loginAs(page, ACCOUNTS.ba);
    await page.goto(`/projects/${pid}/documents/upload`);
    await expect(page.getByText(/ไม่มีสิทธิ์/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /ลากไฟล์มาวาง/ })).toHaveCount(0);
  });

  test("WQA-NAV-06 Breadcrumb และตัวเลือก Project ที่แถบบน พาไปหน้า Dashboard ของ Project", async ({ page }) => {
    await loginAs(page);
    await page.getByRole("combobox", { name: "Project" }).selectOption({ label: "CAM · Customer Activity Monitoring (Synthetic Demo)" });
    await expect(page).toHaveURL(/\/projects\/[^/]+(\/dashboard)?$/);
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects$/);
  });
});

test.describe("RBAC · Backend ปฏิเสธเองแม้เรียก API ตรง", () => {
  test("WQA-RBAC-01 BA สร้าง Project / อัปโหลด / เริ่ม Recorder / ดู Audit ไม่ได้ (403)", async ({ request }) => {
    const pid = await camProjectId(request);
    const h = await auth(request, ACCOUNTS.ba);
    expect((await request.post(`${API}/projects`, { headers: h, data: { code: "BAX", name: "x" } })).status()).toBe(403);
    expect((await request.post(`${API}/projects/${pid}/paste-text`, { headers: h, data: { title: "x", text: "y".repeat(20) } })).status()).toBe(403);
    expect((await request.post(`${API}/web-recorder/start`, { headers: h, data: { url: `${PRACTICE}/index.html` } })).status()).toBe(403);
    expect((await request.get(`${API}/audit-logs`, { headers: h })).status()).toBe(403);
    expect((await request.get(`${API}/users`, { headers: h })).status()).toBe(403);
  });

  test("WQA-RBAC-02 QA Manual รัน Test (run.execute) ไม่ได้ แต่ดูประวัติ Web ได้", async ({ request }) => {
    const h = await auth(request, ACCOUNTS.qaManual);
    expect((await request.get(`${API}/web-history`, { headers: h })).status()).toBe(200);
    const r = await request.post(`${API}/web-explorer/does-not-matter/run`, { headers: h, data: {} });
    expect(r.status()).toBe(403);
  });

  test("WQA-RBAC-03 ทุก Role อ่าน /auth/me ได้ และได้รายการสิทธิ์ตรงกับ Role", async ({ request }) => {
    for (const a of Object.values(ACCOUNTS)) {
      const me = await (await request.get(`${API}/auth/me`, { headers: await auth(request, a) })).json();
      const perms: string[] = me.permissions ?? me.user?.permissions ?? [];
      expect(perms.length, a.username).toBeGreaterThan(0);
      expect(perms.includes("settings"), a.username).toBe(a.role === "ADMIN");
    }
  });
});
