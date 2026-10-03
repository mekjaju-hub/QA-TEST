# WebQA2026 — Test Plan และผลทดสอบของหน้าเว็บ (Website Test Suite)

> ทดสอบ "ตัวเว็บ WebQA2026 เอง" แบบผู้ใช้จริง ตั้งแต่ Login จนถึง Web Recorder / Web History
> รายการ Test Case ทั้งหมด: **`docs/qa/WEBQA2026_TEST_CASES.xlsx`** (ชีต สรุป · Test Cases · Defects · วิธีรัน) และ `webqa2026_test_cases.csv`

## 1. ขอบเขต

| Module | หน้าจอ / Feature | TC | อัตโนมัติด้วย |
|---|---|---|---|
| AUTH | Login, เปลี่ยนรหัสผ่านครั้งแรก, Logout, Session | 10 | Playwright `01-auth.spec.ts` |
| NAV / RBAC | เมนูตาม Role (Admin / QA Manual / QA Automation / BA) + Backend 403 | 9 | `02-navigation-rbac.spec.ts` |
| PRJ / DOC | Projects, Upload (ไฟล์/หลายไฟล์/ไฟล์เสีย), Paste Text, Processing, Version Compare | 10 | `03-projects-documents.spec.ts` |
| REQ / CLR / DASH / TRC | Requirement Explorer, Clarification & Conflict, Dashboard, Traceability | 12 | `04-requirements.spec.ts` |
| TD / AUTO / RUN | Scenario → Test Case → Approve/Lock → Export → Pytest → Run | 9 | `05-test-design-automation.spec.ts` |
| WEX | Web Explorer (สำรวจ, Login, Run pytest, ZIP, ลบ) | 7 | `06-web-explorer.spec.ts` |
| REC | Web Recorder (รอบ/Cycle, Add Test Case, ตรวจข้อความ, หยุด/รอบใหม่, ปิดหน้าต่าง, เล่นซ้ำ) | 14 | `07-web-recorder.spec.ts` + pytest |
| HIS / LIB | Web History, หน้ารายละเอียด Test Case (ก่อนหน้า/ถัดไป), คลังรวม, Export | 11 | `08-web-history.spec.ts` |
| ADM / AUD | Settings, Users & Roles, Audit Log | 10 | `09-admin.spec.ts` |
| API / SEC | API contract, 401/403/422, Error model, Security headers, Path traversal, Token storage | 10 | `10-api-security.spec.ts` |
| PERF | Load / Stress / Spike / Rate limit / Concurrency | 7 | `perf/webqa_perf.py` + pytest |
| MAN | Windows passkey prompt, จอแคบ, Session timeout, Exploratory | 4 | Manual |
| **รวม** | | **113** | อัตโนมัติ 109 · Manual 4 |

นอกขอบเขต: GitHub ของจริง (ใช้ Mock ใน backend pytest), Claude AI (ต้องมี API key), Docker / PostgreSQL stack (มีชุด `scripts/run-stack-smoke.sh` อยู่แล้ว)

## 2. สภาพแวดล้อม

- Backend แยก (port **8002**, ฐานข้อมูลใหม่ทุกครั้งที่ `storage/e2e-website`) + seed CAM demo + ผู้ใช้ 4 Role (global-setup เปลี่ยนรหัสเป็น `Website-E2e!Pass1`)
- Practice site (port **8765**) จาก `backend/tests/web_fixture` — หน้า Login ฝึก, register, SPA, tricky, `shop.html` (เมนูตัวใหญ่จาก CSS + ไอคอน Font Awesome แบบ automationexercise.com)
- หน้าเว็บ production build (port **3200**) · Web Recorder รันแบบ headless + CDP port 9339 ให้ Test "เป็นผู้ใช้" ในหน้าต่างบันทึก
- ไม่แตะข้อมูลจริงใน `storage\` ที่ใช้งานอยู่ · ข้อมูลทดสอบทั้งหมดเป็น Synthetic

## 3. วิธีรัน

ดับเบิลคลิก **`RUN-WEBSITE-TESTS.bat`** (ครั้งแรกเลือกเมนู 9) หรือ:

```powershell
cd C:\Cludaemek\WebQA2026\frontend
npx playwright test -c playwright.website.config.ts            # ทั้งหมด
npx playwright test -c playwright.website.config.ts --grep WQA-REC   # เฉพาะ Recorder
npx playwright show-report ..\storage\e2e-website\report
cd ..; python perf\webqa_perf.py --mode stress --password <รหัสบัญชีทดสอบ>    # ต้องเปิด RUN-DEV.bat ไว้
```

## 4. เกณฑ์ผ่าน

- E2E/API: ผ่านทุกข้อ (ข้อที่เป็น Known defect ถูกทำเครื่องหมาย `test.fail` และขึ้นเป็น "Fail (Known defect)" ใน Excel)
- Performance: p95 < 2,000 ms และ error < 2% ที่ 50 ผู้ใช้พร้อมกัน · Server ต้องไม่ค้างหลังโหลดเกิน · ฟื้นตัวหลัง Spike

## 5. ผลรัน (3 ต.ค. 2026 · เครื่องทดสอบ Linux)

| ชุด | ผล |
|---|---|
| Playwright website suite | **101 tests: 100 ผ่าน + 1 Known defect (DEF-WQA-01)** · 3.8 นาที |
| Backend pytest (`test_web_explorer.py`) | **24 passed** (รวม REC-14, PERF-07 ใหม่) |
| Load 50 ผู้ใช้ 20 วินาที | **114 req/s · p95 1,027 ms · error 0%** ✓ |
| Stress 10 → 400 | 10: p95 170 ms · 25: 498 ms · 50: 1,058 ms · **100: 2,735 ms (Breaking point ≈ 100 ผู้ใช้)** · error 0% |
| Spike 5 → 300 → 5 | ช่วง spike p95 9.2 s (error 0.62% connection reset) → **ฟื้นตัว** p95 73 ms |
| Rate limit | Login: 401×4 แล้ว 429 ✓ · API: 429 ที่ request #592 ✓ |

> ตัวเลขเป็นของเครื่องทดสอบเครื่องเดียว (ตัวยิงโหลดกับ Server อยู่เครื่องเดียวกัน) ใช้เทียบก่อน/หลังแก้ ไม่ใช่ Capacity จริงของเครื่องคุณ

## 6. Defect ที่พบ

| ID | Severity | สถานะ | อาการ | สาเหตุ / การแก้ |
|---|---|---|---|---|
| DEF-WQA-03 | **Critical** | แก้แล้ว | ~50 คำขอพร้อมกัน → **Backend ค้างถาวร** (/api/health ไม่ตอบ ต้อง restart) | DB connection pool (5+10) เล็กกว่า worker thread (40) → deadlock · SQLite ใช้ NullPool, DB อื่น pool 10+50 · ก่อนแก้ 7 req/s + timeout 21% → หลังแก้ 114 req/s error 0% |
| DEF-WQA-02 | **Critical** | แก้แล้ว | ปิดหน้าต่าง Recorder เอง → `RECORDER_FAILED … has been closed` และ **ขั้นตอนหายหมด** | `wait_for_timeout` โยน error ตอนหน้าต่างถูกปิด → ตอนนี้จบแบบ stopped เก็บขั้นตอนไว้ |
| DEF-WQA-04 | High | แก้แล้ว | เปิดคลัง Test Case พร้อมกัน → HTTP 500 `Expecting value` | เขียน `library_index.json` ใหม่ทุกครั้งแบบไม่ atomic → เขียนแบบ atomic + lock + เขียนเฉพาะเมื่อมี TL-ID ใหม่ |
| DEF-WQA-01 | Medium | Open | เปิดลิงก์ภายในตอนยังไม่ Login → หลัง Login ไป /projects แทนหน้าเดิม | `lib/auth.tsx` 401 handler ไม่ใส่ `next=` |
| DEF-WQA-06 | Medium | ข้อเสนอแนะ | `/web-history` อ่าน result.json ทุกไฟล์ทุกครั้ง (backfill) | ช้าลงตามจำนวนผลสำรวจ → ทำครั้งเดียวตอน startup |
| DEF-WQA-05 | Low | Open | เริ่ม Recorder ด้วย URL ผิดระหว่างมีการบันทึกค้าง → 409 แทน 422 | ตรวจ URL ก่อนตรวจ busy |
| DEF-WQA-07 | Low | ข้อสังเกต | Rate limit 600/นาที คิดต่อ IP — แชร์ LAN/NAT หลายคนอาจโดน 429 (หน้า Record poll ทุก 1 วินาที) | คิดต่อผู้ใช้แทน |

## 7. โครงสร้างไฟล์

```
frontend/playwright.website.config.ts      config (3 server + global setup + รายงาน HTML/JUnit)
frontend/e2e/website/
  global-setup.ts                          เปลี่ยนรหัสผ่านบัญชี seed ให้ทุก Role
  start-backend.mjs / practice-site.mjs    backend ทดสอบ (8002) / เว็บฝึก (8765)
  support/env.ts api.ts ui.ts recorder.ts  บัญชีทดสอบ · API helper · Page Object (Login, ChangePassword, RecordPanel)
  01-auth … 10-api-security.spec.ts        Test Case ตาม ID ใน Excel (ชื่อ test ขึ้นต้นด้วย WQA-xxx-nn)
perf/webqa_perf.py                         Load / Stress / Spike / Rate limit → storage/perf/*.html
docs/qa/catalog_data.py, build_catalog.py  แหล่งข้อมูล + ตัวสร้าง Excel/CSV (อ่านผลจาก JUnit ล่าสุด)
RUN-WEBSITE-TESTS.bat                      เมนูรันทั้งหมด
```
