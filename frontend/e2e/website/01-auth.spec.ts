// Module AUTH — Login, first-login password change, logout, session redirect (WQA-AUTH-xx in the Test Case catalog)
import { expect, test } from "@playwright/test";
import { newUser } from "./support/api";
import { ACCOUNTS, PASSWORD, unique } from "./support/env";
import { ChangePasswordPage, LoginPage, loginAs } from "./support/ui";

test.describe("AUTH · เข้าสู่ระบบ", () => {
  test("WQA-AUTH-01 Login สำเร็จ → ไปหน้า Projects และแสดงชื่อผู้ใช้", async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin);
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("System Admin");
  });

  test("WQA-AUTH-02 รหัสผ่านผิด → ข้อความกลาง ๆ ไม่บอกว่าผิดช่องไหน และยังอยู่หน้า Login", async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.open();
    await lp.login("admin", "Wrong-Pass-123!");
    await expect(lp.error()).toHaveText("Username หรือ Password ไม่ถูกต้อง");
    await expect(page).toHaveURL(/\/login/);
  });

  test("WQA-AUTH-03 ผู้ใช้ที่ไม่มีในระบบ → ข้อความเดียวกับรหัสผิด (ไม่เปิดเผยว่ามี user หรือไม่)", async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.open();
    await lp.login("no_such_user_e2e", "Whatever-123!");
    await expect(lp.error()).toHaveText("Username หรือ Password ไม่ถูกต้อง");
  });

  test("WQA-AUTH-04 เว้นว่าง Username/Password → แจ้งเตือนช่องบังคับ ไม่ส่งไป Server", async ({ page }) => {
    const lp = new LoginPage(page);
    await lp.open();
    let calls = 0;
    page.on("request", r => { if (r.url().includes("/api/auth/login")) calls++; });
    await lp.submit().click();
    await expect(page.getByText("กรุณากรอก Username")).toBeVisible();
    await expect(page.getByText("กรุณากรอก Password")).toBeVisible();
    expect(calls).toBe(0);
  });

  test("WQA-AUTH-05 ช่อง Password ปิดบังตัวอักษร (type=password)", async ({ page }) => {
    await new LoginPage(page).open();
    await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  });
});

test.describe("AUTH · เปลี่ยนรหัสผ่านครั้งแรก", () => {
  test("WQA-AUTH-06 ผู้ใช้ใหม่ถูกบังคับเปลี่ยนรหัสผ่าน · ตรวจกฎรหัสผ่าน · เปลี่ยนแล้วเข้าใช้งานได้", async ({ page, request }) => {
    const temp = "Temp-Pass!12345";
    const u = await newUser(request, unique("e2e_first_").toLowerCase(), "QA_MANUAL", temp);
    const lp = new LoginPage(page);
    await lp.open();
    await lp.login(u.username, temp);
    await expect(page).toHaveURL(/change-password/);

    const cp = new ChangePasswordPage(page);
    await cp.fill(temp, "short1!A");                                   // < 10 ตัว
    await expect(page.getByText("อย่างน้อย 10 ตัวอักษร")).toBeVisible();
    await cp.fill(temp, "alllowercase1!");                             // ไม่มีตัวใหญ่
    await expect(page.getByText("ต้องมีตัวพิมพ์ใหญ่")).toBeVisible();
    await cp.fill(temp, "New-Strong!Pass1", "New-Strong!Pass2");       // ยืนยันไม่ตรง
    await expect(page.getByText("รหัสผ่านใหม่ไม่ตรงกัน")).toBeVisible();
    await cp.fill(temp, temp);                                         // ซ้ำรหัสเดิม
    await expect(page.getByText("รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม")).toBeVisible();
    await cp.fill(temp, "New-Strong!Pass1");
    await expect(page).toHaveURL(/\/projects$/);

    await page.getByRole("button", { name: "ออกจากระบบ" }).click();   // รหัสเดิมใช้ไม่ได้แล้ว
    await lp.login(u.username, temp);
    await expect(lp.error()).toHaveText("Username หรือ Password ไม่ถูกต้อง");
    await lp.login(u.username, "New-Strong!Pass1");
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("WQA-AUTH-07 รหัสผ่านปัจจุบันผิด → Server ปฏิเสธและแสดงข้อความ", async ({ page, request }) => {
    const temp = "Temp-Pass!12345";
    const u = await newUser(request, unique("e2e_cur_").toLowerCase(), "BA", temp);
    const lp = new LoginPage(page);
    await lp.open();
    await lp.login(u.username, temp);
    await new ChangePasswordPage(page).fill("Not-The-Current!1", "New-Strong!Pass1");
    await expect(page.locator(".err-box")).toBeVisible();
    await expect(page).toHaveURL(/change-password/);
  });
});

test.describe("AUTH · Session", () => {
  test("WQA-AUTH-08 ออกจากระบบ → กลับหน้า Login และเปิดหน้าภายในไม่ได้อีก", async ({ page }) => {
    await loginAs(page);
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("Username")).toBeVisible();
  });

  test("WQA-AUTH-09 เปิดลิงก์ภายในตอนยังไม่ Login → Login แล้วกลับไปหน้าเดิม", async ({ page }) => {
    // DEF-WQA-01: lib/auth.tsx (401 จาก /auth/me) ส่งไป /login?reason=… โดยไม่มี next → หลัง Login ไป /projects แทนหน้าเดิม
    test.fail(true, "DEF-WQA-01 — ลิงก์ภายในไม่ถูกจำหลัง Login (รอแก้)");
    await page.goto("/web-explorer/history");
    await expect(page).toHaveURL(/\/login\?next=/);
    await new LoginPage(page).login(ACCOUNTS.admin.username, PASSWORD);
    await expect(page).toHaveURL(/\/web-explorer\/history$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Web History");
  });

  test("WQA-AUTH-10 Session อยู่ใน sessionStorage ของแท็บ — แท็บใหม่ (context ใหม่) ต้อง Login ใหม่", async ({ page, browser }) => {
    await loginAs(page);
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto("/projects");
    await expect(p2).toHaveURL(/\/login/);
    await other.close();
  });
});
