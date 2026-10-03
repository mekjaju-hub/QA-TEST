// Module REQ / CLR / DASH / TRC — Requirement Explorer, Clarification & Conflict Center, Dashboard, Traceability (CAM demo)
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, type Account } from "./support/env";
import { loginAs, mainNav, openProject } from "./support/ui";

const reqRows = (page: Page) => page.locator("main table tbody tr");

async function openRequirements(page: Page, who: Account = ACCOUNTS.admin) {
  await loginAs(page, who);
  await openProject(page);
  await mainNav(page).getByRole("link", { name: "Requirement Explorer" }).click();
  await expect(page.getByRole("heading", { name: "Requirement Explorer" })).toBeVisible();
}

test.describe.serial("REQ · Requirement Explorer", () => {
  test("WQA-REQ-01 แสดง Requirement ทั้งหมด 9 รายการ พร้อมคะแนน Complete / Clarity", async ({ page }) => {
    await openRequirements(page);
    await expect(page.getByText("9 รายการ")).toBeVisible();
    await expect(reqRows(page)).toHaveCount(9);
  });

  test("WQA-REQ-02 ค้นหาด้วย Requirement ID เหลือ 1 รายการ", async ({ page }) => {
    await openRequirements(page);
    await page.getByRole("textbox", { name: "ค้นหา" }).fill("RULE4-003");
    await expect(reqRows(page)).toHaveCount(1);
    await expect(reqRows(page).first()).toContainText("REQ-CAM-RULE4-003");
  });

  test("WQA-REQ-03 กรอง Status = CONFLICT แสดงเฉพาะที่ขัดแย้ง", async ({ page }) => {
    await openRequirements(page);
    await page.getByRole("combobox", { name: "Status" }).selectOption("CONFLICT");
    await expect(reqRows(page).first()).toContainText("CONFLICT");
    await expect(page.getByText(/^[1-8] รายการ$/)).toBeVisible();
    const n = await reqRows(page).count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(reqRows(page).nth(i)).toContainText("CONFLICT");
  });

  test("WQA-REQ-04 เลือก Requirement → AI Analysis บอกจุดที่ขาด (ไม่มี Expected Result / ไม่ระบุ Role)", async ({ page }) => {
    await openRequirements(page);
    await page.getByRole("cell", { name: "REQ-CAM-RULE4-003", exact: true }).click();
    const ai = page.getByRole("region", { name: "AI Analysis" }).or(page.getByLabel("AI Analysis"));
    await expect(ai).toContainText("ไม่มี Expected Result");
    await expect(ai).toContainText("ไม่ระบุ Role");
    await expect(page.getByLabel("Source")).toBeVisible();
  });

  test("WQA-REQ-05 Approve Requirement ที่รอ Review → สถานะ APPROVED", async ({ page }) => {
    await openRequirements(page);
    await page.getByRole("combobox", { name: "Status" }).selectOption("WAITING_FOR_REVIEW");
    await expect(reqRows(page).first()).toContainText("WAITING_FOR_REVIEW");
    const id = (await reqRows(page).first().getByRole("cell").nth(1).innerText()).trim();
    await reqRows(page).first().getByRole("cell").nth(1).click();
    const panel = page.getByLabel("Requirement", { exact: true });
    await panel.getByRole("button", { name: "Approve" }).click();
    const dlg = page.getByRole("dialog");
    if (await dlg.isVisible().catch(() => false)) await dlg.getByRole("button", { name: "ยืนยัน" }).click();   // SOURCE_UNVERIFIED confirm
    await expect(page.getByText(`Approve ${id} แล้ว`)).toBeVisible();
    await expect(panel).toContainText("APPROVED");
  });

  test("WQA-REQ-06 เพิ่ม Comment ที่ Requirement (ข้อความบังคับ)", async ({ page }) => {
    await openRequirements(page);
    await page.getByRole("cell", { name: "REQ-CAM-RULE3-001", exact: true }).click();
    const panel = page.getByLabel("Requirement", { exact: true });
    await panel.getByRole("button", { name: /Comment/ }).click();
    const dlg = page.getByRole("dialog", { name: "เพิ่ม Comment" });
    await expect(dlg.getByRole("button", { name: "ยืนยัน" })).toBeDisabled();
    await dlg.getByLabel("ข้อความ").fill("E2E: ขอให้ BA ยืนยันช่วงเวลา 14 วัน");
    await dlg.getByRole("button", { name: "ยืนยัน" }).click();
    await expect(panel).toContainText("E2E: ขอให้ BA ยืนยันช่วงเวลา 14 วัน");
  });

  test("WQA-REQ-07 BA ดู Requirement ได้แต่ไม่มีปุ่ม Approve / Edit", async ({ page }) => {
    await openRequirements(page, ACCOUNTS.ba);
    await page.getByRole("cell", { name: "REQ-CAM-RULE3-002", exact: true }).click();
    const panel = page.getByLabel("Requirement", { exact: true });
    await expect(panel).toContainText("REQ-CAM-RULE3-002");
    await expect(panel.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /Edit/ })).toHaveCount(0);
  });
});

test.describe.serial("CLR · Clarification & Conflict", () => {
  async function openCenter(page: Page, who: Account = ACCOUNTS.admin) {
    await loginAs(page, who);
    await openProject(page);
    await mainNav(page).getByRole("link", { name: /Clarification & Conflict/ }).click();
    await expect(page.getByRole("heading", { name: "Clarification & Conflict Center" })).toBeVisible();
  }

  test("WQA-CLR-01 BA ตอบคำถาม (คำตอบบังคับ) → คำตอบแสดงในตารางพร้อมชื่อผู้ตอบ", async ({ page }) => {
    await openCenter(page, ACCOUNTS.ba);
    const row = page.getByRole("tabpanel").getByRole("row").filter({ has: page.getByRole("button", { name: "ตอบ" }) }).first();
    await row.getByRole("button", { name: "ตอบ" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByRole("button", { name: "บันทึกคำตอบ" })).toBeDisabled();
    await dlg.getByLabel("คำตอบ").fill("E2E: Role ที่ทำรายการได้คือ Compliance Officer");
    await dlg.getByRole("button", { name: "บันทึกคำตอบ" }).click();
    await expect(page.getByText("บันทึกคำตอบแล้ว")).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText("E2E: Role ที่ทำรายการได้คือ Compliance Officer");
    await expect(page.getByRole("tabpanel")).toContainText("โดย ba");
  });

  test("WQA-CLR-02 Resolve Conflict ต้องมีเหตุผล ≥ 3 ตัวอักษร แล้วบันทึกลงประวัติ", async ({ page }) => {
    await openCenter(page);
    await page.getByRole("tab", { name: /Conflicts/ }).click();
    const card = page.locator(".card").filter({ hasText: "OPEN" }).first();
    await card.getByRole("button", { name: "ไม่ขัดแย้ง — ใช้ทั้งสอง" }).click();
    const dlg = page.getByRole("dialog", { name: "Resolve Conflict" });
    await dlg.getByLabel(/เหตุผลในการเลือก/).fill("ok");
    await expect(dlg.getByRole("button", { name: "ยืนยัน" })).toBeDisabled();
    await dlg.getByLabel(/เหตุผลในการเลือก/).fill("E2E: BA ยืนยันว่าเงื่อนไขสองข้อใช้คนละรายงาน");
    await dlg.getByRole("button", { name: "ยืนยัน" }).click();
    await expect(page.getByText("Resolve Conflict แล้ว")).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText("RESOLVED");
    await expect(page.getByRole("tabpanel")).toContainText("E2E: BA ยืนยันว่าเงื่อนไขสองข้อใช้คนละรายงาน");
  });

  test("WQA-CLR-03 แท็บ Assumptions ติดป้าย 'AI ASSUMPTION - NOT FOUND IN BRS'", async ({ page }) => {
    await openCenter(page);
    await page.getByRole("tab", { name: /Assumptions/ }).click();
    await expect(page.getByText("AI ASSUMPTION - NOT FOUND IN BRS").first()).toBeVisible();
  });
});

test.describe("DASH / TRC · ภาพรวม", () => {
  test("WQA-DASH-01 Dashboard: KPI Requirement = 9 และลิงก์ Workflow พาไปหน้าที่เกี่ยวข้อง", async ({ page }) => {
    await loginAs(page);
    await openProject(page);
    await expect(page.getByRole("link", { name: /^9 Requirement$/ })).toBeVisible();
    await page.getByRole("navigation", { name: "Workflow" }).getByRole("link", { name: /Requirement \(AI Draft\)/ }).click();
    await expect(page).toHaveURL(/\/requirements/);
  });

  test("WQA-TRC-01 Traceability แสดงสาย Document → Section → Requirement และลิงก์กลับ Requirement", async ({ page }) => {
    await loginAs(page);
    await openProject(page);
    await page.goto(page.url().replace(/\/dashboard$/, "/traceability"));
    await expect(page.getByRole("heading", { name: "Traceability Viewer" })).toBeVisible();
    await expect(page.getByText("CAM_BRS_v1.txt · v1").first()).toBeVisible();
    await page.getByRole("link", { name: /REQ-CAM-RULE3-001/ }).first().click();
    await expect(page).toHaveURL(/requirements/);
  });
});
