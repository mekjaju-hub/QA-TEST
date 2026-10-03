// Module WEX — Web Explorer (automatic exploration of a practice site → Test Cases → pytest → Run → ZIP → delete)
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, PRACTICE } from "./support/env";
import { loginAs, mainNav, openSaved } from "./support/ui";

const LOGIN_URL = `${PRACTICE}/index.html`;

async function explore(page: Page, url: string, user = "", pass = "") {
  await page.goto("/web-explorer");
  await page.getByLabel("URL หน้าเว็บ").fill(url);
  if (user) await page.getByLabel("Username (ไม่บังคับ)").fill(user);
  if (pass) await page.getByLabel("Password (ไม่บังคับ)").fill(pass);
  await page.getByRole("checkbox", { name: /โหมดฝึก/ }).uncheck();
  await page.getByRole("button", { name: "สำรวจหน้าเว็บ" }).click();
}

test.describe.serial("WEX · Web Explorer", () => {
  test("WQA-WEX-01 URL ไม่ถูกต้อง → แจ้ง 'URL ต้องขึ้นต้นด้วย http:// หรือ https://'", async ({ page }) => {
    await loginAs(page);
    await explore(page, "ftp://example.test/file");
    await expect(page.getByText(/URL ต้องขึ้นต้นด้วย http:\/\/ หรือ https:\/\//).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Practice Login" })).toHaveCount(0);
  });

  test("WQA-WEX-02 สำรวจหน้า Login + ลอง Login → ภาพก่อน/หลัง Login, Test Case และประวัติการสำรวจ", async ({ page }) => {
    await loginAs(page);
    await explore(page, LOGIN_URL, "demo", "demo-pass-1");
    await expect(page.getByRole("heading", { name: "Practice Login", level: 2 })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("img", { name: "ภาพหน้าเว็บตอนเปิด" })).toBeVisible();
    await expect(page.getByRole("img", { name: "ภาพหน้าเว็บหลัง Login" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: LOGIN_URL }).first()).toContainText("สำเร็จ");
    await page.getByRole("tab", { name: /② Test Cases/ }).click();
    await expect(page.getByRole("tabpanel")).toContainText("TC-LOGIN-");
  });

  test("WQA-WEX-03 แท็บ pytest: เห็นไฟล์ในโปรเจกต์ (conftest / tests) และ Run pytest แล้วผ่านทั้งหมด", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAs(page);
    await openSaved(page, LOGIN_URL);
    await page.getByRole("tab", { name: "③ pytest + รัน" }).click();
    const files = page.getByRole("navigation", { name: "ไฟล์ในโปรเจกต์" });
    await expect(files.getByRole("link", { name: "conftest.py" })).toBeVisible();
    await files.getByRole("button", { name: "Run pytest" }).click();
    const result = page.getByRole("heading", { name: /ผลการรันล่าสุด/ });
    await expect(result).toBeVisible({ timeout: 200_000 });
    await expect(result).toContainText("PASSED");
    await expect(result).toContainText("มี Login");
  });

  test("WQA-WEX-04 ดาวน์โหลดโปรเจกต์ pytest (ZIP)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/web-explorer");
    await page.getByRole("row").filter({ hasText: LOGIN_URL }).first().click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ดาวน์โหลดโปรเจกต์ pytest (ZIP)" }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^webtest_.*\.zip$/);
  });

  test("WQA-WEX-05 สำรวจหน้าเดิมซ้ำ → ไม่ได้ Test Case ซ้ำ (ประวัติบอกจำนวนครั้งที่เคยสำรวจ)", async ({ page }) => {
    await loginAs(page);
    await explore(page, LOGIN_URL);
    await expect(page.getByText(/ก่อนรอบนี้สำรวจแล้ว 1 ครั้ง/)).toBeVisible({ timeout: 90_000 });
  });

  test("WQA-WEX-06 QA Manual (ไม่มีสิทธิ์ Generate Automation) เปิดหน้า Web Explorer → แจ้งสิทธิ์ ไม่แสดงฟอร์มสำรวจ", async ({ page }) => {
    await loginAs(page, ACCOUNTS.qaManual);
    await page.goto("/web-explorer");
    await expect(page.getByText("ต้องมีสิทธิ์ Generate Automation")).toBeVisible();
    await expect(page.getByRole("button", { name: "สำรวจหน้าเว็บ" })).toHaveCount(0);
    await expect(mainNav(page).getByRole("link", { name: "Web Explorer" })).toHaveCount(0);
  });

  test("WQA-WEX-07 ลบผลสำรวจ → หายจากรายการ แต่ประวัติ Test Case ของหน้ายังอยู่", async ({ page }) => {
    await loginAs(page);
    await openSaved(page, LOGIN_URL);
    const rows = page.getByRole("row").filter({ hasText: LOGIN_URL });
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);
    await page.getByRole("button", { name: "ลบ", exact: true }).click();
    await expect(rows).toHaveCount(before - 1);
    await page.goto("/web-explorer/history");
    await page.getByRole("tab", { name: "รายหน้าเว็บ" }).click();
    await expect(page.getByRole("row").filter({ hasText: "127.0.0.1:8765/index.html" })).toBeVisible();
  });
});
