import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { RECORDER_CDP } from "./env";

/** The Web Recorder opens its own browser window on the server machine. In the test backend it runs headless with a
 *  CDP port, so the test can "be the user" inside that window (same as a person clicking there). */
export async function recorderWindow(): Promise<{ browser: Browser; page: () => Page }> {
  const browser = await chromium.connectOverCDP(RECORDER_CDP);
  const page = () => { const ps = browser.contexts()[0].pages().filter(p => !p.isClosed()); return ps[ps.length - 1]; };
  await expect.poll(() => browser.contexts()[0]?.pages().length ?? 0).toBeGreaterThan(0);
  return { browser, page };
}

export class RecordPanel {
  constructor(readonly page: Page) {}
  readonly panel = () => this.page.getByLabel("บันทึกการใช้งาน");
  async open() {
    await this.page.goto("/web-explorer");
    await this.page.getByRole("button", { name: "บันทึกการใช้งาน (Record)" }).click();
  }
  async start(url: string, firstName = "", savePassword = true) {
    await this.page.locator("#rec-url").fill(url);
    if (firstName) await this.page.locator("#rec-name").fill(firstName);
    const cb = this.page.getByRole("checkbox", { name: /บันทึกรหัสผ่านจริง/ });
    if ((await cb.isChecked()) !== savePassword) await cb.click();
    await this.page.getByRole("button", { name: "▶ เริ่มบันทึก" }).click();
    await expect(this.page.getByText(/กำลังบันทึก รอบที่ 1/)).toBeVisible({ timeout: 45_000 });
  }
  async addTestCase(name: string, url?: string) {
    await this.page.getByLabel("ชื่อ Test Case ถัดไป").fill(name);
    if (url) {
      await this.page.getByLabel("เริ่มใหม่จาก URL (ไม่อิงหน้าเดิม)").check();
      await this.page.getByLabel("URL ของ Test Case ถัดไป").fill(url);
    }
    await this.page.getByRole("button", { name: /\+ Add Test Case|เปลี่ยนชื่อ Test Case นี้/ }).click();
  }
  async addCheck(text: string, mode: "visible" | "hidden" = "visible") {
    await this.page.getByLabel("ข้อความที่ต้องตรวจ").fill(text);
    await this.page.getByLabel("แบบการตรวจ").selectOption(mode);
    await this.page.getByRole("button", { name: "+ ตรวจ" }).click();
  }
  readonly badges = () => this.page.getByLabel("Test Case ที่กำลังบันทึก");
  readonly saveButton = () => this.page.getByRole("button", { name: /■ บันทึกเป็น Test Case/ });
}
