// Module TD / AUTO / RUN — Scenario → Test Case → Approve/Lock → Export → Pytest Generator → Run → Run detail (CAM demo)
import { expect, test } from "@playwright/test";
import { apiGet, apiPost, auth, camProjectId } from "./support/api";
import { ACCOUNTS, API } from "./support/env";
import { loginAs } from "./support/ui";

test.describe.serial("TD · Test Design", () => {
  let pid = "";
  test.beforeAll(async ({ request }) => {
    pid = await camProjectId(request);
    // pre-condition: Requirement ที่ยังรอ Review ถูก Approve (Requirement ที่ Approved เท่านั้นจึงสร้าง Scenario ได้)
    const reqs = (await apiGet(request, `/projects/${pid}/requirements`)).items as { id: string; status: string }[];
    for (const r of reqs.filter(x => x.status === "WAITING_FOR_REVIEW")) await apiPost(request, `/requirements/${r.id}/approve`, { confirm_unverified: true });
  });

  test("WQA-TD-01 BA สร้าง Scenario ไม่ได้ (ปุ่มไม่แสดง / API 403)", async ({ page, request }) => {
    const r = await request.post(`${API}/projects/${pid}/test-scenarios/generate`, { headers: await auth(request, ACCOUNTS.ba), data: {} });
    expect(r.status()).toBe(403);
    await loginAs(page, ACCOUNTS.ba);
    await page.goto(`/projects/${pid}/test-scenarios`);
    await expect(page.getByRole("heading", { name: "Test Scenario Review" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate Scenarios/ })).toHaveCount(0);
  });

  test("WQA-TD-02 Generate Scenarios จาก Requirement ที่ Approved → ได้ TS-CAM-xxx และไม่สร้างซ้ำเมื่อกดอีกครั้ง", async ({ page, request }) => {
    await loginAs(page);
    await page.goto(`/projects/${pid}/test-scenarios`);
    await page.getByRole("button", { name: /Generate Scenarios/ }).click();
    await expect(page.getByText(/^TS-CAM-/).first()).toBeVisible();
    const count = async () => { const d = await apiGet(request, `/projects/${pid}/test-scenarios`); return (Array.isArray(d) ? d : d.items).length as number; };
    const before = await count();
    expect(before).toBeGreaterThan(0);
    await request.post(`${API}/projects/${pid}/test-scenarios/generate`, { headers: await auth(request), data: {} });
    expect(await count()).toBe(before);                                   // ป้องกัน Scenario ซ้ำ (Requirement + Test Type)
  });

  test("WQA-TD-03 สร้าง Test Case จาก Scenario ที่เลือก → ไปหน้า Test Cases", async ({ page }) => {
    await loginAs(page);
    await page.goto(`/projects/${pid}/test-scenarios`);
    await page.getByRole("button", { name: "เลือกทั้งหมดที่ยังไม่มี Test Case" }).click();
    await page.getByRole("button", { name: /สร้าง Test Case จาก Scenario/ }).click();
    await expect(page).toHaveURL(/test-cases$/);
    await expect(page.getByText(/^TC-CAM-/).first()).toBeVisible();
  });

  test("WQA-TD-04 ค้นหา / กรอง Test Case และเปิดรายละเอียด (Steps + Expected)", async ({ page }) => {
    await loginAs(page);
    await page.goto(`/projects/${pid}/test-cases`);
    await page.getByRole("combobox", { name: "Test Type" }).selectOption("Negative");
    const first = page.locator("main table tbody tr").first();
    await expect(first).toContainText("Negative");
    await first.getByRole("link").first().click();
    await expect(page).toHaveURL(/test-cases\/[^/]+$/);
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  });

  test("WQA-TD-05 Approve ทั้งหมด (Bulk + ยืนยัน) → Lock แก้ไม่ได้จนสร้าง Version ใหม่", async ({ page }) => {
    await loginAs(page);
    await page.goto(`/projects/${pid}/test-cases`);
    await page.getByLabel("เลือกทั้งหมด").check();
    await page.getByRole("button", { name: /^Approve \(/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ยืนยัน" }).click();
    await expect(page.getByText("🔒 Locked").first()).toBeVisible();
  });

  test("WQA-TD-06 Export Excel ดาวน์โหลดไฟล์ .xlsx", async ({ page }) => {
    await loginAs(page);
    await page.goto(`/projects/${pid}/test-cases`);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export Excel" }).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});

test.describe.serial("AUTO / RUN · Pytest Generator → Run", () => {
  test("WQA-AUTO-01 Generate Pytest จาก Test Case ที่ Approved → เห็นไฟล์ในโปรเจกต์และคำอธิบาย (tip)", async ({ page, request }) => {
    const pid = await camProjectId(request);
    await loginAs(page);
    await page.goto(`/projects/${pid}/automation/pytest`);
    await page.getByRole("button", { name: "เลือกทั้งหมด" }).click();
    await page.getByRole("button", { name: /^Generate \(/ }).click();
    await expect(page.getByTestId("code-editor")).toBeVisible();
    await expect(page.locator(".tree div").filter({ hasText: "app/services/rule_service.py" })).toBeVisible();
  });

  test("WQA-RUN-01 Run pytest ในเครื่อง → สถานะ PASSED และผลราย Test Case", async ({ page, request }) => {
    const pid = await camProjectId(request);
    await loginAs(page);
    await page.goto(`/projects/${pid}/automation/pytest`);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page).toHaveURL(/test-runs\//);
    await expect(page.locator(".pagehead .badge").filter({ hasText: "PASSED" })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("cell", { name: /TC-CAM-/ }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Logs" }).click();
    await expect(page.getByTestId("run-log")).toContainText("passed");
  });

  test("WQA-RUN-02 หน้า Test Runs แสดงรายการ Run และ Dashboard อัปเดตผล Run ล่าสุด", async ({ page, request }) => {
    const pid = await camProjectId(request);
    await loginAs(page);
    await page.goto(`/projects/${pid}/test-runs`);
    await expect(page.locator("main table tbody tr").first()).toContainText("PASSED");
    await page.goto(`/projects/${pid}/dashboard`);
    await expect(page.getByRole("heading", { name: "Test Run ล่าสุด" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workflow" })).not.toContainText("– Run ล่าสุด");
  });
});
