// Module API / SEC — contract & security checks done directly against the backend (no UI)
import { expect, test } from "@playwright/test";
import { apiGet, auth, token } from "./support/api";
import { ACCOUNTS, API } from "./support/env";

const PROTECTED = ["/auth/me", "/projects", "/web-explorer", "/web-history", "/web-library", "/settings", "/users", "/audit-logs",
  "/web-recorder-active"];

test.describe("API · สัญญาของ API", () => {
  test("WQA-API-01 /api/health เปิดได้โดยไม่ต้อง Login และบอกสถานะ ok", async ({ request }) => {
    const r = await request.get(`${API}/health`);
    expect(r.status()).toBe(200);
    expect((await r.json()).status).toBe("ok");
  });

  test("WQA-API-02 ทุก Endpoint ภายในต้อง Login (401 เมื่อไม่มี / Token ปลอม)", async ({ request }) => {
    for (const p of PROTECTED) {
      expect((await request.get(`${API}${p}`)).status(), p).toBe(401);
      expect((await request.get(`${API}${p}`, { headers: { Authorization: "Bearer not.a.real.token" } })).status(), p).toBe(401);
    }
  });

  test("WQA-API-03 รูปแบบ Error มาตรฐาน: code / user_message / timestamp / retryable / suggested_action / correlation_id + Header X-Correlation-Id", async ({ request }) => {
    const r = await request.get(`${API}/projects`);
    const body = await r.json();
    for (const k of ["code", "user_message", "timestamp", "retryable", "suggested_action", "correlation_id"]) expect(body.error, k).toHaveProperty(k);
    expect(r.headers()["x-correlation-id"]).toBeTruthy();
    expect(body.error.technical).toBeUndefined();                          // technical detail = Admin only
  });

  test("WQA-API-04 Validation: ส่งข้อมูลผิดรูปแบบ → 422 พร้อมข้อความ (ไม่ใช่ 500)", async ({ request }) => {
    expect((await request.post(`${API}/auth/login`, { data: {} })).status()).toBe(422);
    const h = await auth(request);
    expect((await request.post(`${API}/projects`, { headers: h, data: { code: "", name: "" } })).status()).toBe(422);
    expect((await request.post(`${API}/web-explorer`, { headers: h, data: { url: "javascript:alert(1)" } })).status()).toBe(422);
  });

  test("WQA-API-05 Session ต่ออายุอัตโนมัติ: ทุก Request ที่ Login แล้วได้ Header X-Refreshed-Token", async ({ request }) => {
    const r = await request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${await token(request)}` } });
    expect(r.status()).toBe(200);
    expect(r.headers()["x-refreshed-token"]).toBeTruthy();
  });

  test("WQA-API-06 ข้อมูลผู้ใช้ไม่มี password_hash / token ของคนอื่น", async ({ request }) => {
    const users = await apiGet(request, "/users");
    const raw = JSON.stringify(users);
    expect(raw).not.toMatch(/password_hash|\$2[aby]\$|access_token/);
  });
});

test.describe("SEC · ความปลอดภัย", () => {
  test("WQA-SEC-01 Path traversal ใน Web History / Screenshot ถูกปฏิเสธ (404) ไม่หลุดไฟล์ระบบ", async ({ request }) => {
    const h = await auth(request);
    for (const p of ["/web-history/..%2F..%2Fsecrets", "/web-history/x/case/..%2F..", "/web-explorer/..%2F..%2Fsecrets/screenshot/before",
      "/web-explorer/x/screenshot/..%2F..%2Fsecret"]) {
      const r = await request.get(`${API}${p}`, { headers: h });
      expect([404, 422], p).toContain(r.status());
    }
  });

  test("WQA-SEC-02 Header ความปลอดภัยของหน้าเว็บ: X-Frame-Options / nosniff / CSP / no-referrer", async ({ request, baseURL }) => {
    const r = await request.get(`${baseURL}/login`);
    const h = r.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("WQA-SEC-03 Token อยู่ใน sessionStorage ไม่ใช่ Cookie / localStorage (ปิดแท็บ = ออกจากระบบ)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(ACCOUNTS.admin.username);
    await page.getByLabel("Password").fill("Website-E2e!Pass1");
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    const store = await page.evaluate(() => ({ s: sessionStorage.getItem("brsqa.token"), l: JSON.stringify(localStorage) }));
    expect(store.s).toBeTruthy();
    expect(store.l).not.toContain(store.s!);
    expect((await page.context().cookies()).some(c => c.value === store.s)).toBeFalsy();
  });

  test("WQA-SEC-04 ข้อความ Error ฝั่งผู้ใช้ไม่เผยรายละเอียดทางเทคนิค (stack trace / path)", async ({ request }) => {
    const h = await auth(request, ACCOUNTS.qaAuto);
    const r = await request.get(`${API}/web-explorer/does-not-exist`, { headers: h });
    expect(r.status()).toBe(404);
    expect(await r.text()).not.toMatch(/Traceback|\.py|C:\\\\|\/home\//);
  });
});
