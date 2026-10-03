// Module ADM / AUD — Settings (users & roles, configuration without secrets) and Audit Log
import { expect, test } from "@playwright/test";
import { apiGet, auth } from "./support/api";
import { ACCOUNTS, API, unique } from "./support/env";
import { LoginPage, loginAs, mainNav } from "./support/ui";

test.describe.serial("ADM · Settings / Users & Roles", () => {
  const username = unique("e2e_user_").toLowerCase();

  test("WQA-ADM-01 เพิ่มผู้ใช้ใหม่ (Role QA Automation) → อยู่ในตาราง และต้องเปลี่ยนรหัสผ่านเมื่อ Login ครั้งแรก", async ({ page }) => {
    await loginAs(page);
    await mainNav(page).getByRole("link", { name: "Settings" }).click();
    await page.getByRole("button", { name: "เพิ่มผู้ใช้" }).click();
    const dlg = page.getByRole("dialog", { name: "เพิ่มผู้ใช้" });
    await dlg.getByLabel("username", { exact: true }).fill(username);
    await dlg.getByLabel("name", { exact: true }).fill("E2E Created User");
    await dlg.getByLabel("password", { exact: true }).fill("Temp-Pass!12345");
    await dlg.getByLabel("Role").selectOption("QA_AUTOMATION");
    await dlg.getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByText("เพิ่มผู้ใช้แล้ว")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: username })).toContainText("QA Automation");
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    await new LoginPage(page).login(username, "Temp-Pass!12345");
    await expect(page).toHaveURL(/change-password/);
  });

  test("WQA-ADM-02 รหัสผ่านเริ่มต้นสั้นกว่า 10 ตัว → Server ปฏิเสธ ไม่สร้างผู้ใช้", async ({ page, request }) => {
    const bad = unique("e2e_bad_").toLowerCase();
    await loginAs(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "เพิ่มผู้ใช้" }).click();
    const dlg = page.getByRole("dialog", { name: "เพิ่มผู้ใช้" });
    await dlg.getByLabel("username", { exact: true }).fill(bad);
    await dlg.getByLabel("password", { exact: true }).fill("short");
    await dlg.getByRole("button", { name: "บันทึก" }).click();
    await expect(dlg).toBeVisible();
    const users = await apiGet<{ username: string }[]>(request, "/users");
    expect(users.some(u => u.username === bad)).toBeFalsy();
  });

  test("WQA-ADM-03 เปลี่ยน Role ในตาราง → มีผลกับสิทธิ์ทันที", async ({ page, request }) => {
    await loginAs(page);
    await page.goto("/settings");
    await page.getByLabel(`role ${username}`).selectOption("BA");
    await expect(page.getByText("เปลี่ยน Role แล้ว")).toBeVisible();
    const users = await apiGet<{ username: string; roles: string[] }[]>(request, "/users");
    expect(users.find(u => u.username === username)!.roles).toEqual(["BA"]);
  });

  test("WQA-ADM-04 ปิดบัญชี → Login ไม่ได้ (ข้อความกลาง ๆ) · เปิดคืนได้", async ({ page }) => {
    await loginAs(page);
    await page.goto("/settings");
    const row = page.getByRole("row").filter({ hasText: username });
    await row.getByRole("button", { name: "ปิด" }).click();
    await expect(page.getByText("ปิดบัญชีแล้ว")).toBeVisible();
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    const lp = new LoginPage(page);
    await lp.login(username, "Temp-Pass!12345");
    await expect(lp.error()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("WQA-ADM-05 หน้า Settings ไม่แสดงค่า Secret (แสดงแค่สถานะ Configured / NEEDS_CONFIGURATION)", async ({ page, request }) => {
    await loginAs(page);
    await page.goto("/settings");
    for (const t of ["AI Provider", "GitHub", "Network Sharing", "Session"]) {
      await page.getByRole("tab", { name: t }).click();
      await expect(page.getByRole("tabpanel")).not.toContainText(/sk-ant-|ghp_|SECRET_KEY=/);
    }
    const body = JSON.stringify(await apiGet(request, "/settings"));
    expect(body).not.toMatch(/e2e-website-secret-key|sk-ant-|ghp_/);
  });

  test("WQA-ADM-06 แก้ค่า Settings (Runner Timeout) → ปุ่มบันทึกแสดงจำนวนที่แก้ และบันทึกได้", async ({ page }) => {
    await loginAs(page);
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Test Runner" }).click();
    await page.getByLabel("Timeout (วินาที)").fill("150");
    await page.getByRole("button", { name: "บันทึก (1)" }).click();
    await expect(page.getByText("บันทึก Settings แล้ว")).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Test Runner" }).click();
    await expect(page.getByLabel("Timeout (วินาที)")).toHaveValue("150");
  });
});

test.describe("AUD · Audit Log", () => {
  test("WQA-AUD-01 บันทึก LOGIN_FAILED และกรองด้วย Action / User ได้", async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.open();
    await lp.login("admin", "Wrong-For-Audit!1");
    await loginAs(page);
    await mainNav(page).getByRole("link", { name: "Audit Log" }).click();
    await page.getByRole("combobox", { name: "Action" }).selectOption("LOGIN_FAILED");
    const rows = page.locator("main table tbody tr");
    await expect(rows.first()).toContainText("LOGIN_FAILED");
    await page.getByRole("textbox", { name: "User" }).fill("admin");
    await expect(rows.first()).toContainText("admin");
  });

  test("WQA-AUD-02 Audit Log ไม่เก็บรหัสผ่าน (ทั้งที่ถูกและผิด) และ Export CSV ได้", async ({ page, request }) => {
    await loginAs(page);
    await page.goto("/audit-log");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
    expect(dl.suggestedFilename()).toBe("audit_log.csv");
    const csv = await (await request.get(`${API}/audit-logs/export`, { headers: await auth(request) })).text();
    expect(csv).toContain("LOGIN");
    for (const secret of ["Wrong-For-Audit!1", "Website-E2e!Pass1", "Temp-Pass!12345"]) expect(csv).not.toContain(secret);
  });

  test("WQA-AUD-03 ทุกรายการมี Correlation ID 8 หลัก และมี LOGIN / PASSWORD_CHANGED", async ({ request }) => {
    const logs = await apiGet<{ action: string; correlation_id: string }[]>(request, "/audit-logs?limit=500");
    const actions = new Set(logs.map(l => l.action));
    for (const a of ["LOGIN", "PASSWORD_CHANGED"]) expect(actions, a).toContain(a);
    expect(logs.every(l => l.correlation_id === null || /^[0-9a-f]{8}$/.test(l.correlation_id))).toBeTruthy();
  });

  test("WQA-AUD-04 ผู้ใช้ที่ไม่ใช่ Admin เปิด /audit-log และ /settings ไม่ได้", async ({ page }) => {
    await loginAs(page, ACCOUNTS.qaAuto);
    await page.goto("/audit-log");
    await expect(page.getByText("เฉพาะ Admin")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByText("เฉพาะ Admin")).toBeVisible();
    await expect(page.getByRole("button", { name: "เพิ่มผู้ใช้" })).toHaveCount(0);
  });
});
