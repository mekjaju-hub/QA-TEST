# TESTING

## สรุปผลล่าสุด (1 ต.ค. 2026)

| ชุดทดสอบ | คำสั่ง | ผล |
|---|---|---|
| Backend (SQLite) — Unit, API, Permission, Parser, Requirement, Conflict, Boundary, Export, Generators, Runner, GitHub (mock), Security, API contract | `cd backend; python -m pytest` | **59 passed, 1 skipped** (skip = PostgreSQL migration เมื่อไม่ได้ตั้ง `TEST_POSTGRES_URL`) |
| Backend บน PostgreSQL 16 + Migration up/down | `TEST_DATABASE_URL=… TEST_POSTGRES_URL=… python -m pytest` | **60 passed** |
| Parity กับต้นแบบ JS (`04_source/p3_engine.js`, `p4_gen.js`) | `tests/test_engine_parity.py` | 4 passed — Section, Requirement ID/Type/Fields/Score/Status/Question, Conflict, Boundary/Priority ตรงกับ Golden file |
| automation-runner — Timeout, Cancel, Memory limit, Output limit, Clean env (ไม่มี Secret), AST validation, Node-ID injection, Parser, HTTP service, Screenshot on failure | `cd automation-runner; python -m pytest` | **18 passed** |
| Worker (Celery eager → pipeline จริง) | `cd worker; python -m pytest` | **1 passed** |
| Frontend type check | `npm run typecheck` | ผ่าน |
| Frontend Component + Form Validation (Vitest + Testing Library) | `npm test` | **13 passed** |
| Frontend production build | `npx next build` | ผ่าน (P01–P24 ครบ) |
| Basic E2E (Playwright + Backend จริง + Seed) | `npx playwright test` | **5 passed** — Login error, Forced password change, Dashboard/Requirement/Conflict/Upload DOCX, Role restriction (BA), Approve → Generate Pytest ใน UI → Run → PASSED |
| Stack smoke แบบ Production (PostgreSQL + Redis + Celery + runner service + backend + Next standalone) + Restart persistence | `SMOKE_DATABASE_URL=… scripts/run-stack-smoke.sh` | **ผ่าน 2 รอบ** (ก่อน/หลัง Restart backend) |
| `docker compose config` | — | ผ่าน |
| `docker compose build/up` | GitHub Actions `docker` job | ⚠️ ยังไม่ได้รันใน Session นี้ (Sandbox เข้าถึง Docker Hub ไม่ได้) — รันบน Docker Desktop หรือ CI |

## โครงสร้าง Test

```
backend/tests/
  conftest.py                  DB/Storage ชั่วคราว, TASK_MODE=sync, ผู้ใช้ 4 Role
  test_stage3_database.py      Migration SQLite/PostgreSQL, models == migration
  test_engine_parity.py        Python port == JS ต้นแบบ (golden/demo_js.json จาก golden/make_golden.js)
  test_parsers.py              DOCX/XLSX/CSV/PDF/TXT, encoding, corrupt, sniff, safe filename, traversal, chunk
  test_stage4_api.py           Auth, Role, Secret exposure, Upload ทุกชนิด, Requirement quality, Conflict, Clarification,
                               Scenario/Test Case/Boundary, Lock/Version, Excel, Traceability, Version compare, Retry section, Cancel/Resume, Audit
  test_stage4_smoke.py
  test_stage6_generators.py    Draft gating, Pytest ที่ Generate ถูก Run จริง, Python layer + Edit/Reset/Diff,
                               Postman/SQL/Playwright/JMeter/GitHub Actions, Locator advisor, Secret scan
  test_stage6_github.py        Propose → Approve → Execute (Mock GitHub), ไม่มี Merge/Force push, Secret block
  test_stage7_runs.py          Run จากเว็บ, Pass/Fail/Blocked, Logs offset, Evidence, Retry failed only, Code อันตราย, Import JUnit/Newman, Remote runner
  test_api_contract.py         Endpoint ตามหัวข้อ 35 ครบ + ทุก Endpoint ต้อง Login
  test_ai_provider.py          Claude (Mock API): Masking ก่อนส่ง, Hallucination control, Rate limit/Timeout/Invalid JSON
automation-runner/tests/test_runner.py
worker/tests/test_worker.py
frontend/tests/components.test.tsx
frontend/e2e/basic.spec.ts     (start-backend.mjs สร้าง DB/Storage ใหม่ที่ storage/e2e)
```

## Security tests (หัวข้อ 40)

| หัวข้อ | Test |
|---|---|
| Unauthorized Access | `test_login_generic_error_and_unauthorized`, `test_all_endpoints_require_auth` |
| Role Restriction | `test_role_restrictions`, BA/QA Manual 403 ใน generators/runs/github, E2E BA menu |
| Unsafe Filename | `test_safe_filename_and_traversal`, `test_upload_invalid_type_and_traversal_name` |
| Path Traversal | Storage + Artifact path + Runner path/Node-ID |
| Invalid File Type | magic-byte sniff (`INVALID_FILE_TYPE`, `UNSUPPORTED_FILE`) |
| Secret Masking | `test_masking`, `test_secret_not_exposed`, `test_secrets_not_visible_to_child`, Audit ไม่มีรหัสผ่าน |

## วิธีรันทั้งหมดบน Windows

```powershell
cd C:\Cludaemek\WebQA2026
.\.venv\Scripts\activate
cd backend; python -m pytest; cd ..
cd automation-runner; python -m pytest; cd ..
cd worker; python -m pytest; cd ..
cd frontend; npm run typecheck; npm test; npx next build; npx playwright install chromium; $env:PYTHON="..\.venv\Scripts\python.exe"; npx playwright test
```

รายงาน E2E: `storage\e2e\report\index.html` · Screenshot: `storage\e2e\screens\`
