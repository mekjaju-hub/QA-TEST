import { expect, type Page } from "@playwright/test";
import { ACCOUNTS, PASSWORD, type Account } from "./env";

export class LoginPage {
  constructor(readonly page: Page) {}
  readonly username = () => this.page.getByLabel("Username");
  readonly password = () => this.page.getByLabel("Password");
  readonly submit = () => this.page.getByRole("button", { name: "เข้าสู่ระบบ" });
  readonly error = () => this.page.locator(".err-box");

  async open(next?: string) { await this.page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login"); }
  async login(username: string, password: string) {
    await this.username().fill(username);
    await this.password().fill(password);
    await this.submit().click();
  }
}

export class ChangePasswordPage {
  constructor(readonly page: Page) {}
  async fill(current: string, next: string, confirm = next) {
    await this.page.getByLabel("รหัสผ่านปัจจุบัน").fill(current);
    await this.page.getByLabel("รหัสผ่านใหม่", { exact: true }).fill(next);
    await this.page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(confirm);
    await this.page.getByRole("button", { name: "บันทึก" }).click();
  }
}

/** Log in through the real login form and land on /projects. */
export async function loginAs(page: Page, who: Account = ACCOUNTS.admin, password = PASSWORD) {
  const lp = new LoginPage(page);
  await lp.open();
  await lp.login(who.username, password);
  await expect(page).toHaveURL(/\/projects$/);
}

export const mainNav = (page: Page) => page.getByRole("navigation", { name: "เมนูหลัก" });

export async function openProject(page: Page, code = "CAM") {
  await page.goto("/projects");
  await page.getByRole("link", { name: code, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

/** Web Explorer: open a saved exploration / recording from "ประวัติการสำรวจ" with its answers shown
 *  (practice mode hides Test Cases and code at first). */
export async function openSaved(page: Page, url: string) {
  await page.goto("/web-explorer");
  const row = page.getByRole("row").filter({ hasText: url }).first();
  await expect(row).toBeVisible();
  const practice = page.getByRole("checkbox", { name: /โหมดฝึก/ });
  if (await practice.count()) await practice.uncheck();
  await row.click();
}
