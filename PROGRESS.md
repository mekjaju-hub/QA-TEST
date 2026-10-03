# PROGRESS.md — web qa

อัปเดตล่าสุด: 1 ต.ค. 2026 · Repository จริงตามหัวข้อ 42 อยู่ที่ `C:\Cludaemek\WebQA2026` (Storage: `.\storage`)

## Stage Log (หัวข้อ 43)

| Stage | เนื้อหา | สถานะ | Test |
|---|---|---|---|
| 1 | สรุป Requirement, Assumption, Risk, สิ่งที่ไม่ควรเดา → `docs/STAGE1_ANALYSIS.md` | เสร็จ | ตรวจเอกสาร |
| 2 | Architecture, Data/Auth/Processing/Automation Flow (Mermaid) → `ARCHITECTURE.md` | เสร็จ | ตรวจเอกสาร |
| 3 | 41 ตาราง SQLAlchemy, Alembic `0001_initial` (+ `0002_test_data_text`), ER → `DATABASE.md` | เสร็จ | Migration up/down บน SQLite + PostgreSQL 16, models == migration |
| 4 | Backend: Auth/RBAC/Projects/Documents/Requirements/Test design/Admin API · Port `p3_engine.js` → `backend/app/services/engine/` · Test design จาก `p4_gen.js` → `services/testdesign.py` · Pipeline ราย Section (Retry/Resume/Cancel) · Version Compare/Impact · Excel 10 Sheet · AI Provider (Rule/Claude) · Storage Interface · `worker/` Celery · Seed | เสร็จ | Parity กับ JS ต้นแบบ 4 passed · API/Parser/Security tests |
| 5 | Frontend Next.js 15 + TS + Tailwind + shadcn-style (Radix) + TanStack Query + RHF/Zod + Monaco (offline) ใช้ Design token/CSS จาก `03_web_app` · Runtime API proxy | เสร็จ | tsc · next build · Vitest 13 passed · E2E |
| 6 | Generators (Python, Pytest, Postman, SQL MySQL, Playwright POM + Locator Advisor + Recorded Flow, JMeter + Safety, GitHub Actions, Secret scan) · Artifact store (AI/current, Edit/Reset/Diff/ZIP) · GitHub Propose→Approve→Execute · หน้า P13–P18, P21 | เสร็จ | Pytest ที่ Generate ถูก Run จริงใน subprocess · GitHub ด้วย Mock API |
| 7 | `automation-runner/` Sandbox (rlimit CPU/RAM/FSIZE/NPROC, Timeout, Output cap, Clean env, AST validation, process-group kill) + HTTP service + Exploration CLI · Run service (local/remote, Log streaming, Cancel, Re-run, Retry failed only, Evidence, Import JUnit/Newman) · หน้า P19–P20 | เสร็จ | runner 18 passed · Remote runner ผ่าน HTTP · E2E Run → PASSED |
| 8 | `docker-compose.yml` (postgres, redis, backend, worker, runner, frontend) · Dockerfiles · `.env.example` · Secret อัตโนมัติ · Network-sharing guard · CI `.github/workflows/ci.yml` · Docs ครบ · VS Code (`WebQA2026.code-workspace` รวม settings/launch/tasks/extensions + `tools/vscode/`) · `scripts/` smoke | เสร็จ (ดูข้อจำกัด Docker build) | `docker compose config` ผ่าน · Stack smoke แบบ Production (PostgreSQL+Redis+Celery+runner+backend+Next standalone) ผ่านทั้งก่อน/หลัง Restart |
| 9 | ตรวจ Acceptance Criteria 40 ข้อ (ตารางด้านล่าง) | เสร็จ | — |

### ผล Test ล่าสุด

| ชุด | ผล |
|---|---|
| backend (SQLite) | 59 passed, 1 skipped |
| backend (PostgreSQL 16) | 60 passed |
| automation-runner | 18 passed |
| worker | 1 passed |
| frontend Vitest | 13 passed · `tsc` ผ่าน · `next build` ผ่าน |
| Playwright E2E | 5 passed |
| Stack smoke (production-like) | ผ่าน 2 รอบ (รวม Restart persistence) |

## Acceptance Criteria (หัวข้อ 41)

C = Complete (มี Test อัตโนมัติยืนยัน) · C* = Complete แต่ยืนยันบางส่วนด้วยการตรวจ Code/Smoke · P = Partial

| # | เกณฑ์ | ผล | หลักฐาน |
|---|---|---|---|
| 1 | Login ด้วย Local Account | C | `test_login_*`, E2E 1–2 |
| 2 | สร้าง Project | C | conftest `project`, หน้า Projects |
| 3 | Upload DOCX, XLSX, CSV, Text PDF, TXT | C | `test_upload_all_formats`, E2E upload DOCX |
| 4 | Paste Text | C | `test_paste_text` |
| 5 | แสดง Document Processing Progress | C | `/progress`, หน้า Processing, Stack smoke |
| 6 | อ่านเอกสารแยก Section | C | `test_parsers.py`, parity sections |
| 7 | สร้าง Requirement ID ใหม่ | C | `REQ-CAM-RULE3-001` ใน parity/API tests |
| 8 | แสดง Source Page/Section | C | `test_requirement_ids_sources_and_quality`, PDF page 1–3 |
| 9 | ตรวจ Missing Expected Result | C | "ไม่มี Expected Result" |
| 10 | ตรวจ Missing Role | C | "ไม่ระบุ Role" (แก้ Bug ต้นแบบ) |
| 11 | ตรวจ Missing Threshold | C | "ไม่มี Threshold" |
| 12 | ตรวจ Requirement Conflict | C | `test_conflict_blocks_approve_and_resolution` (Operator > vs >=) |
| 13 | ไม่สร้าง Test Case เมื่อมี Conflict | C | Approve ถูกปฏิเสธ `HAS_CONFLICT`; Scenario/TC สร้างเฉพาะ APPROVED |
| 14 | สร้าง Clarification Question | C | questions ใน API test |
| 15 | สร้าง Assumption พร้อม Label | C | `AI ASSUMPTION - NOT FOUND IN BRS` |
| 16 | Positive Test | C | `test_scenarios_and_test_cases` |
| 17 | Negative Test | C | 〃 |
| 18 | Boundary Test | C | 199,999.99 / 200,000.00 / 200,000.01 / 0 / ว่าง / "ABC" |
| 19 | Integration Test | C* | `scenario_types_for` สร้างเมื่อ Type = Integration Requirement (Demo BRS ไม่มี Requirement ชนิดนี้; ตรวจด้วย Code + parity logic) |
| 20 | Data Test | C | 〃 (Report Requirement → Data) |
| 21 | API Test | C | 〃 (RULE6 API) |
| 22 | QA แก้ Test Case ในตาราง | C | PATCH steps/title + E2E หน้าตาราง |
| 23 | QA Approve Test Case | C | approve + bulk + E2E |
| 24 | Test Case Approved ถูก Lock | C | `TEST_CASE_LOCKED`, New Version |
| 25 | Export Excel | C | `test_excel_export` (10 Sheet, Freeze, Filter) |
| 26 | Generate Python | C | `test_python_layer_and_edit_reset_diff` |
| 27 | Code Tips ภาษาไทย | C | Tip 9 ส่วน + E2E แสดงในหน้า Pytest |
| 28 | Generate Pytest | C | `test_pytest_generated_project_really_runs` |
| 29 | Run Pytest ได้ | C | `test_run_pytest_from_web`, E2E, Remote runner, Stack smoke |
| 30 | แสดง Pass/Fail/Blocked | C | summary + หน้า Run/Dashboard |
| 31 | Screenshot Failure จาก Playwright | C* | Generated `tests/ui/conftest.py` hook + Runner เก็บ `screenshots/*.png` เป็น Evidence (`test_failure_screenshot_collected_as_evidence`); รัน UI test จริงต้องมี SIT URL + Browser |
| 32 | Generate Postman Collection | C | collection/env JSON + Auth configurable |
| 33 | Generate MySQL Template | C | Read-only + Placeholder |
| 34 | Generate Playwright Page Object | C | POM + Locator Advisor + compile ผ่าน |
| 35 | GitHub Action ต้องรอ Approval | C | `NOT_APPROVED` ก่อน Approve; ไม่มี Merge/Force push |
| 36 | เปรียบเทียบ BRS Version | C | `test_version_compare_and_impact` |
| 37 | ไม่แก้ Test Case Approved อัตโนมัติ | C | 〃 (status ยัง APPROVED, มีเพียง Proposal) |
| 38 | แสดง Impact Analysis | C | Impact items + หน้า Compare |
| 39 | Retry เฉพาะ Section ที่ Fail | C | `test_retry_failed_section_only` (attempts [1, 2]) |
| 40 | Restart ระบบแล้วข้อมูลไม่หาย | C* | Stack smoke: Restart backend แล้ว Login ด้วยรหัสใหม่/ข้อมูลเดิมครบ (PostgreSQL + `.\storage`); Docker volume `pgdata` ต้องยืนยันบน Docker Desktop |

## ไฟล์ที่เสร็จ (หัวข้อ 42)

`frontend/` `backend/` `worker/` `automation-runner/` `docker-compose.yml` `.env.example` `README.md` `ARCHITECTURE.md` `SECURITY.md` `API.md` `DATABASE.md` `DEVELOPMENT.md` `DEPLOYMENT_WINDOWS.md` `USER_GUIDE_TH.md` `TESTING.md` `CHANGELOG.md` `tools/github/workflows/ci.yml` (ติดตั้งเป็น `.github/workflows/ci.yml` ด้วย `scripts/setup-vscode-and-ci.ps1`) `backend/alembic/versions/*` `backend/app/seed.py` `samples/` (Sample BRS + Synthetic Demo Project CAM) · Unit/Integration/E2E tests · `WebQA2026.code-workspace`

## ยังไม่เสร็จ / ข้อจำกัด

- **`docker compose build/up` ยังไม่ได้รันจริงใน Session นี้** — Sandbox ที่ใช้สร้างเข้าถึง Docker Hub ไม่ได้ (ตรวจได้เฉพาะ `docker compose config` + Stack smoke แบบไม่ใช้ Container) → รันครั้งแรกบน Docker Desktop และดู `docker compose ps` / CI job `docker`
- Windows Dev Mode (ไม่ใช้ Docker): Runner บังคับ Timeout/Output/Kill ได้ แต่ไม่มี CPU/RAM rlimit (ใช้ Docker เมื่อ Run Code ที่ไม่ไว้ใจ)
- Newman / JMeter Run จริงและ Playwright UI Test กับระบบเป้าหมาย ต้องติดตั้ง Tool และตั้งค่า SIT URL/Auth (Optional ตาม Spec) — ระบบสร้างไฟล์, Approval, Import ผล และ Evidence pipeline ให้แล้ว
- Claude API ทดสอบด้วย Mock (ยังไม่ได้เรียก API จริงเพราะไม่มี Key ใน Session)
- Google Fonts (IBM Plex Sans Thai) โหลดจากอินเทอร์เน็ต — ถ้า Offline ใช้ Leelawadee UI แทน
- Log streaming เป็นแบบ Polling ทุก 1 วินาที (ยังไม่ใช่ WebSocket/SSE)

- `.vscode\` และ `.github\` เขียนผ่าน Remote ไม่ได้ (โฟลเดอร์ป้องกัน) จึงส่งเป็น `tools\` + สคริปต์ติดตั้ง

## Known Issues

- DOCX ไม่มีเลขหน้าในตัว → Source Page = NOT_FOUND (ใช้ Section แทน)
- Conflict Detection ใช้ Bigram อาจจับคู่ Requirement ที่ต่าง Section แต่ข้อความคล้ายกันได้ (ต้อง Resolve โดยคน)
- Rate limiter อยู่ในหน่วยความจำ (1 instance) — เหมาะกับ Local-first

## คำสั่งถัดไป (เมื่อกลับมาทำต่อ)

1. บนเครื่อง Windows: `copy .env.example .env` → `docker compose up -d` → ตรวจ `docker compose ps` → เปิด http://localhost:3000
2. ถ้า Build มีปัญหา: ส่ง `docker compose logs` ให้ Claude แก้เฉพาะ Stage 8
3. ตั้ง `CLAUDE_API_KEY`/`CLAUDE_MODEL` แล้วลองอัปโหลด BRS จริง (โหมด Claude)
4. เชื่อม GitHub (`GITHUB_TOKEN`) แล้วทดลอง Proposal → Approve → Execute กับ Repository ทดสอบ
5. งานต่อยอดที่แนะนำ: SSO/Entra ID (`AuthProvider`), MinIO/Azure Blob (`StorageBackend`), OCR Provider, SSE log streaming

## 2026-10-02 — ปรับหลังส่งมอบ

| งาน | สถานะ | Test |
|---|---|---|
| `RUN-DEV.bat` / `STOP-DEV.bat` รันแบบไม่ใช้ Docker (SQLite) — เครื่องผู้ใช้เปิด Virtualization ไม่ได้ | C | ผู้ใช้รันบน Windows สำเร็จ (`/api/health` = ok) |
| `SINGLE_USER_MODE` — admin คนเดียว ไม่บังคับเปลี่ยนรหัส | C | `test_single_user_mode.py` |
| Web Explorer (โหมดฝึก): URL → สังเกต → Test Case → pytest-playwright → Run / ZIP | C | `test_web_explorer.py` (เว็บฝึกจำลองในเครื่อง: Login + หลัง Login + รันใน Sandbox ผ่านครบ), UI E2E: สำรวจหน้า Login ของระบบเอง → 8 TC → Run 8/8 PASSED |
| แก้ชื่อ Test ภาษาไทยแสดงเป็น `\u0e..` | C | pytest.ini ที่ generate |
| แก้ pytest version ชนกัน (requirements-dev vs runner) | C | backend 63 passed / 1 skip, runner 18, vitest 13, E2E 5 |
| Web History: เก็บประวัติ Test Case ต่อหน้าเว็บ (WP-xxx), ออกแบบ TC ใหม่ไม่ซ้ำของเดิม, หน้า History + ZIP/CSV | C | `test_page_history_accumulates_without_duplicates` + UI E2E (สำรวจหน้าเดิม 2 ครั้ง → TC ใหม่ไม่ซ้ำ, 18 TC สะสม, Run 13/13 PASSED) · backend 66 passed / 1 skip, vitest 13, E2E 5 |
| Click Explore: กดปุ่ม/ลิงก์ที่ปลอดภัย (ไม่กดชำระเงิน/ลบ/ส่ง/ออกจากระบบ, ยกเลิก POST ทั้งหมด) → บันทึกผล + TC-CLICK + pytest | C | `test_click_explore_only_safe_clicks_and_behaviour_tests_pass` (Pay now/Checkout/Logout ไม่ถูกกด, POST ถูกยกเลิก, pytest ผ่าน) + UI E2E กับระบบนี้เอง 18/18 PASSED · backend 67 passed / 1 skip, vitest 13, E2E 5 |
| คลัง Test Case รวมทุกเว็บ (TL-xxx, ไม่มีข้อซ้ำ, อ้างอิง WP-ID), ตัวกรองตามหมวด, Dropdown TC, ส่งออก Google Sheets (คัดลอก/xlsx/csv) | C | `test_library_merges_all_websites_without_duplicates`, `test_dropdown_designs_run` + UI E2E (2 เว็บ → 37 TC ไม่ซ้ำ, TL-001 พบใน 2 เว็บ, กรอง Dropdown/Login, ดาวน์โหลด xlsx) · backend 69 passed / 1 skip, vitest 13, E2E 5 |
| Record: บันทึกการใช้งานจริงใน browser (คลิก, ค่าแต่ละช่อง, Dropdown, Checkbox, Submit, popup alert/HTML) → TC-REC-01/02 + pytest เล่นซ้ำ | C | `test_recorder_captures_clicks_fields_submit_and_alert_then_replays` (รหัสผ่านไม่หลุด, replay 2/2 PASSED), `test_recorder_api_headed_browser_driven_like_a_user` (browser แบบมีหน้าต่างบน Xvfb) + UI E2E (บันทึก 8 ขั้น → Run 2/2 PASSED) · backend 71 passed / 1 skip, vitest 13, E2E 5 |
| Record v2: เริ่ม/หยุด/บันทึก, Add Test Case, ตรวจสอบข้อความ, บันทึกรหัสผ่าน (ตัวเลือก), Script อธิบายทีละขั้น (ตำแหน่ง+คำสั่ง+ความหมาย), Test Automation เล่นซ้ำแบบเห็นหน้าจอ | C | `test_recorder_test_cases_checks_pause_saved_password_script_and_replay` + UI E2E (2 Test Case, หยุดแล้วไม่บันทึก, เล่นซ้ำ 8/8, pytest 2/2) · backend 73 passed / 1 skip, runner 18, vitest 13, E2E 5 |
| แก้ Record ได้ Test Case ไม่ครบ: แสดง/เตือน Test Case ว่าง, จับคลิกใน Shadow DOM / เว็บที่กลืน event / ลิงก์เปลี่ยนหน้าตอน pointerdown | C | `test_recorder_captures_shadow_dom_swallowed_clicks_early_navigation_and_many_test_cases` (7 Test Case), `test_shadow_dom_click_gets_a_working_locator_and_replays` · backend 75 passed / 1 skip, vitest 13, E2E 5 |

ข้อจำกัด Web Explorer: ใช้ได้ในโหมด RUN-DEV (ต้องมี Chromium ของ Playwright) — Docker image ยังไม่ได้ติดตั้ง browser; Login อัตโนมัติไม่ทำงานกับเว็บที่มี CAPTCHA/OTP (ตั้งใจไม่ข้าม)
