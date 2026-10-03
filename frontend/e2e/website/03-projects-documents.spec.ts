// Module PRJ / DOC — Project list & creation, document upload (file / paste), processing, version compare
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiGet } from "./support/api";
import { unique } from "./support/env";
import { loginAs, mainNav } from "./support/ui";

const SAMPLES = resolve(__dirname, "..", "..", "..", "samples");
const CODE = unique("E2E");                       // new project for this run (keeps the CAM demo untouched)

async function openOwnProject(page: Page) {
  await page.goto("/projects");
  await page.getByRole("link", { name: CODE, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test.describe.serial("PRJ · Projects", () => {
  test("WQA-PRJ-01 รายการ Project แสดง CAM พร้อมจำนวนเอกสาร / Requirement", async ({ page }) => {
    await loginAs(page);
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "CAM", exact: true }) });
    await expect(row).toContainText("Customer Activity Monitoring (Synthetic Demo)");
    await expect(row.getByRole("cell").nth(4)).toHaveText("9");        // Requirements
  });

  test("WQA-PRJ-02 Create Project: ตรวจรูปแบบ Code และชื่อบังคับ", async ({ page }) => {
    await loginAs(page);
    await page.getByRole("button", { name: "Create Project" }).click();
    const dlg = page.getByRole("dialog", { name: "Create Project" });
    await dlg.getByLabel("Project Code").fill("1ab");
    await dlg.getByRole("button", { name: "สร้าง" }).click();
    await expect(dlg.getByText("ตัวพิมพ์ใหญ่/ตัวเลข 2–16 ตัว เริ่มด้วยตัวอักษร")).toBeVisible();
    await expect(dlg.getByText("กรุณากรอกชื่อ Project")).toBeVisible();
    await dlg.getByRole("button", { name: "ยกเลิก" }).click();
    await expect(dlg).toBeHidden();
  });

  test("WQA-PRJ-03 Create Project สำเร็จ (Code ตัวเล็กถูกแปลงเป็นตัวใหญ่) และขึ้นในรายการ", async ({ page }) => {
    await loginAs(page);
    await page.getByRole("button", { name: "Create Project" }).click();
    const dlg = page.getByRole("dialog", { name: "Create Project" });
    await dlg.getByLabel("Project Code").fill(CODE.toLowerCase());
    await dlg.getByLabel("ชื่อ Project").fill("E2E Website Test Project");
    await dlg.getByLabel("คำอธิบาย").fill("สร้างโดยชุดทดสอบ website (ข้อมูลทดสอบ)");
    await dlg.getByRole("button", { name: "สร้าง" }).click();
    await expect(page.getByText("สร้าง Project แล้ว")).toBeVisible();
    await expect(page.getByRole("link", { name: CODE, exact: true })).toBeVisible();
  });

  test("WQA-PRJ-04 Code ซ้ำ → แจ้งข้อผิดพลาด ไม่สร้างซ้ำ", async ({ page, request }) => {
    await loginAs(page);
    await page.getByRole("button", { name: "Create Project" }).click();
    const dlg = page.getByRole("dialog", { name: "Create Project" });
    await dlg.getByLabel("Project Code").fill(CODE);
    await dlg.getByLabel("ชื่อ Project").fill("ซ้ำ");
    await dlg.getByRole("button", { name: "สร้าง" }).click();
    await expect(dlg).toBeVisible();                                    // dialog stays open with the error toast
    const ps = await apiGet<{ code: string }[]>(request, "/projects");
    expect(ps.filter(p => p.code === CODE)).toHaveLength(1);
  });

  test("WQA-PRJ-05 Project Detail มีแท็บ Documents & Versions / Members / Module Codes", async ({ page }) => {
    await loginAs(page);
    await openOwnProject(page);
    await mainNav(page).getByRole("link", { name: "Project Detail" }).click();
    for (const t of ["Documents & Versions", "Members", "Module Codes"]) await expect(page.getByRole("tab", { name: t })).toBeVisible();
    await page.getByRole("tab", { name: "Members" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("admin");
  });
});

test.describe.serial("DOC · เอกสาร BRS", () => {
  test("WQA-DOC-01 Upload BRS (.txt) → สำเร็จ, มี SHA-256 และประมวลผลจนได้ Requirement", async ({ page }) => {
    await loginAs(page);
    await openOwnProject(page);
    await mainNav(page).getByRole("link", { name: "Upload" }).click();
    await page.getByTestId("file-input").setInputFiles(resolve(SAMPLES, "CAM_BRS_v1.txt"));
    const row = page.getByRole("row").filter({ hasText: "CAM_BRS_v1.txt" });
    await expect(row.getByText("สำเร็จ")).toBeVisible();
    await expect(row).toContainText("SHA-256");
    await mainNav(page).getByRole("link", { name: "Processing" }).click();
    await expect(page.getByRole("row").filter({ hasText: "CAM_BRS_v1.txt" })).toContainText("READY_FOR_REVIEW", { timeout: 60_000 });
  });

  test("WQA-DOC-02 Upload หลายไฟล์พร้อมกัน: DOCX ผ่าน แต่ PDF เสียแจ้งล้มเหลวเฉพาะไฟล์นั้น", async ({ page }) => {
    await loginAs(page);
    await openOwnProject(page);
    await mainNav(page).getByRole("link", { name: "Upload" }).click();
    await page.getByTestId("file-input").setInputFiles([resolve(SAMPLES, "sample.docx"), resolve(SAMPLES, "bad.pdf")]);
    await expect(page.getByRole("row").filter({ hasText: "sample.docx" }).getByText("สำเร็จ")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "bad.pdf" }).getByText("ล้มเหลว")).toBeVisible();
  });

  test("WQA-DOC-03 Paste Text: ตรวจช่องบังคับ แล้วบันทึกข้อความได้", async ({ page }) => {
    await loginAs(page);
    await openOwnProject(page);
    await mainNav(page).getByRole("link", { name: "Upload" }).click();
    await page.getByRole("tab", { name: "Paste Text" }).click();
    await page.getByRole("button", { name: "บันทึกและเริ่มวิเคราะห์" }).click();
    await expect(page.getByText("กรุณาตั้งชื่อเอกสาร")).toBeVisible();
    await expect(page.getByText("ข้อความสั้นเกินไป (อย่างน้อย 10 ตัวอักษร)")).toBeVisible();
    await page.getByLabel("ชื่อเอกสาร (Virtual Document)").fill("E2E Paste BRS");
    await page.getByLabel("ข้อความ BRS").fill("1. Rule A\nระบบต้องแสดงยอดคงเหลือของบัญชีเมื่อผู้ใช้เข้าสู่ระบบสำเร็จ ภายใน 3 วินาที");
    await page.getByRole("button", { name: "บันทึกและเริ่มวิเคราะห์" }).click();
    await expect(page).toHaveURL(/\/documents\/[^/]+\/processing\?v=1/);
  });

  test("WQA-DOC-04 Upload Version ใหม่ของเอกสารเดิม → Version Compare แสดงส่วนที่เปลี่ยน", async ({ page }) => {
    await loginAs(page);
    await openOwnProject(page);
    await mainNav(page).getByRole("link", { name: "Upload" }).click();
    await page.getByLabel("เอกสาร").selectOption({ label: "Version ใหม่ของ: CAM_BRS_v1.txt (ปัจจุบัน v1)" });
    await page.getByTestId("file-input").setInputFiles(resolve(SAMPLES, "CAM_BRS_v2.txt"));
    await expect(page.getByRole("row").filter({ hasText: "CAM_BRS_v2.txt" })).toContainText("v2");
    await mainNav(page).getByRole("link", { name: "Version Compare" }).click();
    await expect(page.getByLabel("Version A")).toHaveValue("1");
    await expect(page.getByLabel("Version B")).toHaveValue("2");
    await expect(page.getByRole("tab", { name: "Section Diff" })).toBeVisible();
    await expect(page.locator(".card h3").filter({ hasText: /เปลี่ยน|เพิ่ม|ลบ/ }).first()).toBeVisible();
  });

  test("WQA-DOC-05 Dashboard ของ Project นับเอกสารที่ประมวลผลแล้ว", async ({ page }) => {
    await loginAs(page);
    await openOwnProject(page);
    await expect(page.getByRole("heading", { name: "Document Processing" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "CAM_BRS_v1.txt" }).first()).toBeVisible();
  });
});
