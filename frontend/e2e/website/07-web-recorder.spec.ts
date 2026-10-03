// Module REC — Web Recorder: record what a person does → Test Cases (cycles) → save → visible replay (Test Automation)
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { auth } from "./support/api";
import { ACCOUNTS, API, PRACTICE } from "./support/env";
import { RecordPanel, recorderWindow } from "./support/recorder";
import { loginAs, openSaved } from "./support/ui";

const SHOP = `${PRACTICE}/shop.html`;
const REGISTER = `${PRACTICE}/register.html`;

test.describe.serial("REC · บันทึกการใช้งาน (one recording, step by step)", () => {
  let page: Page;
  let rec: RecordPanel;
  let win: { browser: Browser; page: () => Page };

  test.beforeAll(async ({ browser, request }) => {
    await stopActive(request);
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await loginAs(page);
    rec = new RecordPanel(page);
  });
  test.afterAll(async ({ request }) => { await stopActive(request); await page.close(); });

  test("WQA-REC-01 เริ่มบันทึก → เปิดหน้าต่าง browser และแสดงสถานะ 'กำลังบันทึก รอบที่ 1'", async () => {
    await rec.open();
    await rec.start(SHOP, "เมนูหมวดสินค้า");
    win = await recorderWindow();
    await expect.poll(() => win.page().url()).toContain("/shop.html");
  });

  test("WQA-REC-02 บันทึกได้ครั้งละ 1 รายการ: เริ่มซ้ำผ่าน API → 409 RECORDER_BUSY", async ({ request }) => {
    const r = await request.post(`${API}/web-recorder/start`, { headers: await auth(request), data: { url: SHOP } });
    expect(r.status()).toBe(409);
    expect((await r.json()).error.code).toBe("RECORDER_BUSY");
  });

  test("WQA-REC-03 คลิกในหน้าต่าง → ขั้นตอนขึ้นทันที ใช้ชื่อจริงของเมนู (ไม่ใช่ตัวพิมพ์ใหญ่จาก CSS / ไอคอน)", async () => {
    await win.page().getByText("Women").click();
    await win.page().getByText("Dress").click();
    await expect(page.getByRole("cell", { name: /กดลิงก์ "Women"/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: /กดลิงก์ "Dress" → ไปหน้า \/register\.html/ })).toBeVisible();
    await expect(page.getByText('page.get_by_role("link", name=NAME("Women")).click()')).toBeVisible();
  });

  test("WQA-REC-04 ตรวจสอบข้อความ (ต้องเห็น) + Add Test Case ต่อจากจุดเดิม", async () => {
    await rec.addCheck("สมัครสมาชิก");
    await expect(page.getByRole("cell", { name: 'ตรวจว่าเห็นข้อความ "สมัครสมาชิก"' })).toBeVisible();
    await rec.addTestCase("กรอกชื่อสมัครสมาชิก");
    await expect(rec.badges()).toContainText("Test Case 2: กรอกชื่อสมัครสมาชิก — กำลังรอขั้นตอนแรก");
    await win.page().getByRole("button", { name: "ลงทะเบียน" }).click();
    await win.page().getByLabel("ชื่อ-นามสกุล").fill("สมหญิง ทดสอบ");
    await expect(rec.badges()).toContainText("Test Case 2: กรอกชื่อสมัครสมาชิก — 2 ขั้นตอน");
  });

  test("WQA-REC-05 ⏸ หยุดบันทึก = จบรอบ: สิ่งที่ทำระหว่างหยุดไม่ถูกบันทึก และมีฟอร์มเริ่มรอบใหม่ (URL = หน้าปัจจุบัน)", async () => {
    await page.getByRole("button", { name: "⏸ หยุดบันทึก (จบรอบนี้)" }).click();
    await expect(page.getByText(/หยุดบันทึกแล้ว \(จบรอบที่ 1\)/)).toBeVisible();
    await expect(page.getByLabel("URL เริ่มต้นของรอบใหม่")).toHaveValue(/register\.html/);
    await win.page().getByLabel("อีเมล").fill("paused@example.test");            // not recorded
    await page.waitForTimeout(1500);
    await expect(page.getByText("paused@example.test")).toHaveCount(0);
  });

  test("WQA-REC-06 ▶ เริ่มรอบใหม่ที่ URL อื่น → Test Case ใหม่แบบอิสระ (⟳) และหน้าต่างเปิด URL นั้น", async () => {
    await page.getByLabel("ชื่อ Test Case รอบใหม่").fill("หน้า Login");
    await page.getByLabel("URL เริ่มต้นของรอบใหม่").fill(`${PRACTICE}/index.html`);
    await page.getByRole("button", { name: "▶ เริ่มรอบใหม่ (Test Case ใหม่)" }).click();
    await expect(page.getByText(/กำลังบันทึก รอบที่ 2/)).toBeVisible();
    await expect.poll(() => win.page().url()).toContain("/index.html");
    await win.page().getByLabel("ชื่อผู้ใช้").fill("demo");
    await expect(rec.badges()).toContainText("⟳ Test Case 3: หน้า Login — 1 ขั้นตอน");
    await expect(page.getByRole("cell", { name: /เปิดหน้า .*index\.html \(เริ่ม Test Case ใหม่\)/ })).toBeVisible();
  });

  test("WQA-REC-07 บันทึกตอน Test Case ล่าสุดยังว่าง → เตือนก่อน และกลับไปบันทึกต่อได้", async () => {
    await rec.addTestCase("ยังไม่ได้ทำอะไร");
    await rec.saveButton().click();
    const warn = page.getByRole("alert").filter({ hasText: "ยังไม่มีขั้นตอน" });
    await expect(warn).toContainText("จะไม่ถูกสร้าง");
    await warn.getByRole("button", { name: "กลับไปบันทึกต่อ" }).click();
    await expect(warn).toBeHidden();
    await win.page().getByRole("button", { name: "เข้าสู่ระบบ" }).click();     // now the last test case has a step
    await expect(rec.badges()).toContainText(/Test Case 4: ยังไม่ได้ทำอะไร — \d+ ขั้นตอน/);
  });

  test("WQA-REC-08 บันทึกเป็น Test Case → ปิดหน้าต่าง, สร้าง 4 Test Case และหน้า Record กลับสู่สถานะเริ่มต้น", async () => {
    await rec.saveButton().click();
    await expect(page.getByText(/บันทึกแล้ว: \d+ ขั้นตอน · 4 Test Case/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("tab", { name: /② Test Cases \(\d+\)/ })).toBeVisible();
    await page.getByRole("tab", { name: /② Test Cases/ }).click();
    for (const n of ["เมนูหมวดสินค้า", "กรอกชื่อสมัครสมาชิก", "หน้า Login", "ยังไม่ได้ทำอะไร"])
      await expect(page.getByRole("tabpanel")).toContainText(`สถานการณ์: ${n}`);
    await page.getByRole("button", { name: "บันทึกการใช้งาน (Record)" }).click();
    await expect(page.locator("#rec-url")).toHaveValue(/index\.html/);         // reset, last URL kept for the next round
  });

  test("WQA-REC-09 ⑤ Script ทีละขั้น: ทุกขั้นบอก เหตุการณ์ / อยู่ตรงไหน / คำสั่ง Playwright / ความหมาย", async () => {
    await openSaved(page, SHOP);
    await page.getByRole("tab", { name: "⑤ Script ทีละขั้น" }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("cell", { name: "อยู่ตรงไหน", exact: true })).toBeVisible();
    await expect(panel).toContainText("ของหน้าจอ");
    await expect(panel).toContainText("page.goto(");
  });

  test("WQA-REC-10 ④ Test Automation (เล่นซ้ำ) → ผ่านทุกขั้น พร้อมภาพประกอบ", async () => {
    test.setTimeout(180_000);
    await page.getByRole("tab", { name: "④ Test Automation (เล่นซ้ำ)" }).click();
    await page.getByLabel("ความเร็ว").selectOption("200");
    await page.getByRole("button", { name: /เล่นซ้ำ \(Test Automation\)/ }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText("PASSED", { exact: true })).toBeVisible({ timeout: 150_000 });
    await expect(panel).toContainText(/ผ่าน (\d+)\/\1(?!\d)/);
    await expect(panel.getByRole("img", { name: "ขั้นที่ 1" })).toBeVisible();
  });
});

test.describe("REC · กรณีพิเศษ", () => {
  test("WQA-REC-11 ปิดหน้าต่าง browser ทั้งที่ยังไม่ได้ทำอะไร แล้วกดบันทึก → ไม่ค้าง ระบบจบรอบและพร้อมเริ่มใหม่", async ({ page, request }) => {
    await stopActive(request);
    await loginAs(page);
    const rec = new RecordPanel(page);
    await rec.open();
    await rec.start(REGISTER);
    await expect(rec.saveButton()).toBeDisabled();                               // nothing to save yet
    const win = await recorderWindow();
    await win.page().close();                                                    // the person closes the window
    await expect(page.getByText(/หน้าต่าง browser ถูกปิดแล้ว/)).toBeVisible();
    await expect(page.getByRole("button", { name: "เริ่มรอบใหม่ (ไม่บันทึกรอบนี้)" })).toBeVisible();
    await rec.saveButton().click();
    await expect(page.getByText(/ยังไม่ได้บันทึกขั้นตอนใด|ไม่มีขั้นตอนให้บันทึก/)).toBeVisible();
    await expect(page.getByRole("button", { name: "▶ เริ่มบันทึก" })).toBeVisible();
    await expect(page.locator("#rec-url")).toHaveValue(/register\.html/);
  });

  test("WQA-REC-13 ทำขั้นตอนแล้วปิดหน้าต่าง browser (ไม่ได้กดบันทึกก่อน) → ขั้นตอนไม่หาย กดบันทึกได้ Test Case", async ({ page, request }) => {
    // DEF-WQA-02 (แก้แล้ว): เดิมปิดหน้าต่างแล้วขึ้น RECORDER_FAILED 'Target page … has been closed' และขั้นตอนหายหมด
    await stopActive(request);
    await loginAs(page);
    const rec = new RecordPanel(page);
    await rec.open();
    await rec.start(REGISTER, "ปิดหน้าต่างเอง");
    const win = await recorderWindow();
    await win.page().getByRole("button", { name: "ลงทะเบียน" }).click();
    await expect(rec.badges()).toContainText("Test Case 1: ปิดหน้าต่างเอง — 1 ขั้นตอน");
    await win.page().close();
    await expect(page.getByText(/หน้าต่าง browser ถูกปิดแล้ว/)).toBeVisible();
    await expect(page.locator(".err-box")).toHaveCount(0);
    await rec.saveButton().click();
    await expect(page.getByText(/บันทึกแล้ว: 1 ขั้นตอน · 1 Test Case/)).toBeVisible();
  });

  test("WQA-REC-12 URL เริ่มต้นไม่ถูกต้อง / ไม่มีสิทธิ์ → Server ปฏิเสธ (422 / 403)", async ({ request }) => {
    await stopActive(request);
    const bad = await request.post(`${API}/web-recorder/start`, { headers: await auth(request), data: { url: "ftp://x.test" } });
    expect(bad.status()).toBe(422);
    const ba = await request.post(`${API}/web-recorder/start`, { headers: await auth(request, ACCOUNTS.ba), data: { url: REGISTER } });
    expect(ba.status()).toBe(403);
  });
});

/** Clean state: end a recording left open by an earlier (failed) test. */
async function stopActive(request: APIRequestContext) {
  const h = await auth(request);
  const r = await (await request.get(`${API}/web-recorder-active`, { headers: h })).json();
  if (r?.id) await request.post(`${API}/web-recorder/${r.id}/stop`, { headers: h });
}
