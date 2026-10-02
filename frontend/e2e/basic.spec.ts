import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

const NEW_PW = "E2e-Strong!Pass1";
const SAMPLES = resolve(__dirname, "..", "..", "samples");

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("Admin@12345");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
}

test.describe.serial("BRS → QA basic flow", () => {
  test("login rejects wrong password with generic message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page.locator(".err-box")).toHaveText("Username หรือ Password ไม่ถูกต้อง");
  });

  test("seed admin must change password, then sees demo project", async ({ page }) => {
    await loginAdmin(page);
    await expect(page).toHaveURL(/change-password/);
    await page.getByLabel("รหัสผ่านปัจจุบัน").fill("Admin@12345");
    await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill(NEW_PW);
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(NEW_PW);
    await page.getByRole("button", { name: "บันทึก" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("link", { name: "CAM" })).toBeVisible();
  });

  test("dashboard, requirement explorer, conflict and upload", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill(NEW_PW);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await page.getByRole("link", { name: "CAM" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.locator(".kpi").filter({ hasText: "Requirement" }).first()).toContainText("9");
    await page.screenshot({ path: "../storage/e2e/screens/dashboard.png", fullPage: true });

    await page.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: "Requirement Explorer" }).click();
    await expect(page.getByRole("cell", { name: "REQ-CAM-RULE3-001", exact: true })).toBeVisible();
    await page.getByRole("cell", { name: "REQ-CAM-RULE4-003", exact: true }).click();
    await expect(page.getByLabel("AI Analysis")).toContainText("ไม่มี Expected Result");
    await expect(page.getByLabel("AI Analysis")).toContainText("ไม่ระบุ Role");
    await page.screenshot({ path: "../storage/e2e/screens/requirements.png", fullPage: true });

    await page.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: "Clarification & Conflict" }).click();
    await page.getByRole("tab", { name: /Conflicts/ }).click();
    await expect(page.getByText("Operator (> vs >=)").first()).toBeVisible();
    await page.screenshot({ path: "../storage/e2e/screens/conflicts.png", fullPage: true });

    await page.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: "Upload" }).click();
    await page.getByTestId("file-input").setInputFiles(resolve(SAMPLES, "sample.docx"));
    await expect(page.locator(".badge", { hasText: "สำเร็จ" })).toBeVisible();
    await page.getByRole("link", { name: "ดู Processing" }).click();
    await expect(page.locator(".badge").filter({ hasText: "READY_FOR_REVIEW" }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("NEEDS_VISUAL_REVIEW").first()).toBeVisible();
  });

  test("BA cannot see upload menu (role restriction)", async ({ page, request }) => {
    // admin creates a BA user via API
    const login = await request.post("http://127.0.0.1:8001/api/auth/login", { data: { username: "admin", password: NEW_PW } });
    const tok = (await login.json()).access_token;
    await request.post("http://127.0.0.1:8001/api/users", { headers: { Authorization: `Bearer ${tok}` }, data: { username: "ba_e2e", name: "BA", roles: ["BA"], password: "Ba-Temp!Pass123" } });
    await page.goto("/login");
    await page.getByLabel("Username").fill("ba_e2e");
    await page.getByLabel("Password").fill("Ba-Temp!Pass123");
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await page.getByLabel("รหัสผ่านปัจจุบัน").fill("Ba-Temp!Pass123");
    await page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill("Ba-New!Pass1234");
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill("Ba-New!Pass1234");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await page.getByRole("link", { name: "CAM" }).click();
    const nav = page.getByRole("navigation", { name: "เมนูหลัก" });
    await expect(nav.getByRole("link", { name: "Requirement Explorer" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Upload" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  });
});

test.describe.serial("Automation → Run", () => {
  test("approve, generate pytest in UI, run it and see PASSED", async ({ page, request }) => {
    const api = "http://127.0.0.1:8001/api";
    const tok = (await (await request.post(`${api}/auth/login`, { data: { username: "admin", password: NEW_PW } })).json()).access_token;
    const H = { Authorization: `Bearer ${tok}` };
    const pid = (await (await request.get(`${api}/projects`, { headers: H })).json())[0].id;
    const reqs = (await (await request.get(`${api}/projects/${pid}/requirements`, { headers: H })).json()).items;
    for (const r of reqs.filter((x: { status: string }) => x.status === "WAITING_FOR_REVIEW")) await request.post(`${api}/requirements/${r.id}/approve`, { headers: H });

    await page.goto("/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill(NEW_PW);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.goto(`/projects/${pid}/test-scenarios`);
    await page.getByRole("button", { name: /Generate Scenarios/ }).click();
    await expect(page.getByText(/^TS-CAM-/).first()).toBeVisible();
    await page.getByRole("button", { name: "เลือกทั้งหมดที่ยังไม่มี Test Case" }).click();
    await page.getByRole("button", { name: /สร้าง Test Case จาก Scenario/ }).click();
    await expect(page).toHaveURL(/test-cases$/);
    await page.getByLabel("เลือกทั้งหมด").check();
    await page.getByRole("button", { name: /^Approve \(/ }).click();
    await page.getByRole("button", { name: "ยืนยัน" }).click();
    await expect(page.getByText("🔒 Locked").first()).toBeVisible();
    await page.screenshot({ path: "../storage/e2e/screens/test-cases.png", fullPage: true });

    await page.goto(`/projects/${pid}/automation/pytest`);
    await page.getByRole("button", { name: "เลือกทั้งหมด" }).click();
    await page.getByRole("button", { name: /^Generate \(/ }).click();
    await expect(page.getByTestId("code-editor")).toBeVisible();
    await expect(page.locator(".tip").first()).toBeVisible();
    await page.locator(".tree div", { hasText: "app/services/rule_service.py" }).click();
    await expect(page.locator(".tip b").first()).toContainText("Decimal");
    await page.screenshot({ path: "../storage/e2e/screens/pytest-generator.png", fullPage: true });
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page).toHaveURL(/test-runs\//);
    await expect(page.locator(".pagehead .badge").filter({ hasText: "PASSED" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("cell", { name: /TC-CAM-RULE5-/ }).first()).toBeVisible();
    await page.screenshot({ path: "../storage/e2e/screens/test-run.png", fullPage: true });
  });
});
