// Module HIS / LIB — Web History per page, Test Case detail page (navigation), Test Case Library across all sites
import { expect, test, type Page } from "@playwright/test";
import { apiGet, auth } from "./support/api";
import { ACCOUNTS, API, PRACTICE } from "./support/env";
import { loginAs, mainNav } from "./support/ui";

const PAGE_LABEL = "127.0.0.1:8765/index.html";
let pageKey = "";

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  // pre-condition: the practice login page has been explored at least once (independent of the other spec files)
  let pages = await apiGet<{ key: string; page: string }[]>(request, "/web-history");
  if (!pages.some(p => p.page === PAGE_LABEL)) {
    const r = await request.post(`${API}/web-explorer`, { headers: await auth(request), data: { url: `${PRACTICE}/index.html`, extra: 3 }, timeout: 110_000 });
    expect(r.ok()).toBeTruthy();
    pages = await apiGet(request, "/web-history");
  }
  pageKey = pages.find(p => p.page === PAGE_LABEL)!.key;
});

async function openPageHistory(page: Page) {
  await page.goto(`/web-explorer/history?key=${pageKey}`);
  await expect(page.getByRole("heading", { name: "Test Case ทั้งหมดของหน้านี้" })).toBeVisible();
}

test.describe("HIS · ประวัติ Test Case รายหน้าเว็บ", () => {
  test("WQA-HIS-01 เมนู Web History → แท็บรายหน้าเว็บแสดงหน้าที่เคยสำรวจ พร้อมจำนวน Test Case สะสม", async ({ page }) => {
    await loginAs(page);
    await mainNav(page).getByRole("link", { name: "Web History" }).click();
    await page.getByRole("tab", { name: "รายหน้าเว็บ" }).click();
    const row = page.getByRole("row").filter({ hasText: PAGE_LABEL });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByRole("heading", { name: "Test Case ทั้งหมดของหน้านี้" })).toBeVisible();
    await expect(page.locator(".kpi").first()).toContainText("Test Case สะสม");
  });

  test("WQA-HIS-02 ค้นหา / กรองกลุ่ม Test Case ในหน้าประวัติ", async ({ page }) => {
    await loginAs(page);
    await openPageHistory(page);
    const rows = page.locator("tr.row-link");
    const all = await rows.count();
    await page.getByLabel("กลุ่ม").selectOption("login");
    await expect(rows.first()).toContainText("Login");
    expect(await rows.count()).toBeLessThan(all);
    await page.getByLabel("กลุ่ม").selectOption("");
    await page.getByLabel("ค้นหา Test Case").fill("WP-001");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("WP-001");
  });

  test("WQA-HIS-03 คลิกแถว Test Case → หน้ารายละเอียด: เงื่อนไขก่อนเริ่ม / ขั้นตอน / ผลที่คาดหวัง / ที่มา / โค้ด", async ({ page }) => {
    await loginAs(page);
    await openPageHistory(page);
    const first = page.locator("tr.row-link").first();
    const hid = (await first.locator("td").first().innerText()).trim();
    await first.locator("td").nth(3).click();                                  // click on the steps cell (not a link)
    await expect(page).toHaveURL(new RegExp(`/web-explorer/history/case\\?key=${pageKey}&hid=${hid}`));
    const write = page.getByLabel("การเขียน Test Case");
    for (const h of ["Test Case ID", "เงื่อนไขก่อนเริ่ม (Pre-condition)", "ขั้นตอน (Steps)", "ผลที่คาดหวัง (Expected)"])
      await expect(write.getByRole("cell", { name: h })).toBeVisible();
    await expect(page.getByLabel("ที่มาของ Test Case")).toContainText("ออกแบบครั้งแรก");
    await expect(page.getByLabel("โค้ดทดสอบ").locator("pre")).toContainText("def test_");
  });

  test("WQA-HIS-04 ปุ่ม ‹ ก่อนหน้า / ถัดไป › เลื่อนทีละ Test Case และปุ่ม Back ของ browser กลับได้", async ({ page }) => {
    await loginAs(page);
    await page.goto(`/web-explorer/history/case?key=${pageKey}&hid=WP-001`);
    await expect(page.getByText(/ข้อที่ 1 จาก \d+/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Test Case ก่อนหน้า" })).toBeDisabled();
    await page.getByRole("button", { name: "Test Case ถัดไป" }).click();
    await expect(page).toHaveURL(/hid=WP-002/);
    await expect(page.getByText(/ข้อที่ 2 จาก \d+/)).toBeVisible();
    await page.goBack();
    await expect(page.getByText(/ข้อที่ 1 จาก \d+/)).toBeVisible();
    await page.getByRole("link", { name: "← กลับไปรายการ Test Case" }).click();
    await expect(page.getByRole("heading", { name: "Test Case ทั้งหมดของหน้านี้" })).toBeVisible();
  });

  test("WQA-HIS-05 คัดลอกเป็นข้อความ (Clipboard) มี ID / ขั้นตอน / ผลที่คาดหวัง", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loginAs(page);
    await page.goto(`/web-explorer/history/case?key=${pageKey}&hid=WP-001`);
    await page.getByRole("button", { name: "คัดลอกเป็นข้อความ" }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("WP-001");
    expect(text).toContain("ขั้นตอน:");
    expect(text).toContain("ผลที่คาดหวัง:");
  });

  test("WQA-HIS-06 Test Case ID ที่ไม่มี → แจ้ง 'ไม่พบ Test Case' (ไม่ใช่หน้าว่าง)", async ({ page }) => {
    await loginAs(page);
    await page.goto(`/web-explorer/history/case?key=${pageKey}&hid=WP-999`);
    await expect(page.getByText(/ไม่พบ Test Case WP-999/)).toBeVisible();
  });

  test("WQA-HIS-07 Export CSV และ pytest รวมทุก TC (ZIP) ของหน้า", async ({ page }) => {
    await loginAs(page);
    await openPageHistory(page);
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV (Excel)" }).click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "pytest รวมทุก TC (ZIP)" }).click()]);
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);
  });

  test("WQA-HIS-08 QA Manual / BA อ่านประวัติและรายละเอียด Test Case ได้ (สิทธิ์ auto.view)", async ({ page }) => {
    await loginAs(page, ACCOUNTS.ba);
    await page.goto(`/web-explorer/history/case?key=${pageKey}&hid=WP-001`);
    await expect(page.getByLabel("การเขียน Test Case")).toBeVisible();
  });
});

test.describe("LIB · คลัง Test Case รวม (ทุกเว็บไซต์)", () => {
  test("WQA-LIB-01 คลังรวมแสดง TL-ID ไม่ซ้ำ และกรองตามหมวด", async ({ page }) => {
    await loginAs(page);
    await page.goto("/web-explorer/history");
    await expect(page.getByText(/คลัง Test Case รวม/).first()).toBeVisible();
    const ids = await page.locator("main table tbody tr td:first-child").allInnerTexts();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(i => /^TL-\d+/.test(i.trim()))).toBeTruthy();
    const loginCat = page.getByRole("group", { name: "หมวด" }).getByRole("button", { name: /Login/ }).first();
    await loginCat.click();
    await expect(page.locator("main table tbody tr").first()).toContainText(/Login/);
  });

  test("WQA-LIB-02 คลิก WP-ID ในคอลัมน์ 'พบในเว็บ' → เปิดรายละเอียด Test Case ของหน้านั้น", async ({ page }) => {
    await loginAs(page);
    await page.goto("/web-explorer/history");
    await page.locator("main table tbody tr").first().getByRole("link", { name: /^WP-\d+$/ }).first().click();
    await expect(page).toHaveURL(/history\/case\?key=.+&hid=WP-\d+/);
    await expect(page.getByLabel("การเขียน Test Case")).toBeVisible();
  });

  test("WQA-LIB-03 ดาวน์โหลด Excel (.xlsx) ตามตัวกรอง", async ({ page }) => {
    await loginAs(page);
    await page.goto("/web-explorer/history");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ดาวน์โหลด Excel (.xlsx)" }).click()]);
    expect(dl.suggestedFilename()).toBe("web_test_case_library.xlsx");
  });
});
