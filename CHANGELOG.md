# CHANGELOG

## [1.2.0] — 2026-10-02 — Web History (ประวัติ Test Case ของแต่ละหน้าเว็บ)

### Added
- ทุกการสำรวจใน Web Explorer ถูกเก็บเข้า **ประวัติของหน้าเว็บนั้น** (host + path; `?query` ต่างกันถือเป็นหน้าเดียวกัน) — `storage/explore/history/<key>.json`
- Test Case แต่ละแบบมี signature คงที่ + รหัสประวัติถาวร **WP-001, WP-002 …** (ไม่ซ้ำ ไม่เปลี่ยน)
- **ออกแบบ Test Case ใหม่ไม่ซ้ำของเดิม**: แคตตาล็อกแบบทดสอบเพิ่ม (Login: ข้อความ error, กรอกช่องเดียว, รหัสไม่อยู่ใน URL, กด Enter, เปิดหน้าหลัง Login ตรงๆ, Refresh แล้วยังอยู่ในระบบ, Back หลัง Logout · หน้าเว็บ: JS error, เวลาโหลด, Refresh, จอมือถือ, HTTPS, lang, alt · ช่องกรอก: กรอกได้, ภาษาไทย, อักขระพิเศษ, ข้อความยาว) — แต่ละรอบเลือกเฉพาะแบบที่หน้านั้นยังไม่เคยมี (ตั้งจำนวนได้ 0–30, ค่าเริ่มต้น 5)
- หน้า **Web History** (`/web-explorer/history`): รายการหน้าเว็บ, Test Case สะสมพร้อมวันที่ออกแบบครั้งแรก/จำนวนครั้ง/ผลรันล่าสุด, ตัวกรอง, ไทม์ไลน์การสำรวจ, ดาวน์โหลด pytest รวมทุก TC (ZIP), Export CSV (เปิดใน Excel ได้)
- Web Explorer แสดงป้าย "ใหม่ / เคยมีแล้ว" และสรุปประวัติของหน้า; ผลรันถูกบันทึกกลับเข้าประวัติ
- API: `GET /api/web-history`, `GET /api/web-history/{key}`, `/zip`, `/csv`; `POST /api/web-explorer` รับ `extra`
- ผลการสำรวจเดิมก่อนมีฟีเจอร์นี้ถูกนำเข้าประวัติอัตโนมัติเมื่อเปิดหน้า Web History ครั้งแรก

## [1.1.0] — 2026-10-02 — Web Explorer (โหมดฝึก) + ใช้งานแบบไม่ใช้ Docker

### Added
- **Web Explorer** (`/web-explorer`, เมนู "ฝึก Automation"): วาง URL → เปิด headless Chromium → ถ่ายภาพและสรุปสิ่งที่เห็น (หัวข้อ, ช่องกรอก, ปุ่ม, ลิงก์, ฟอร์ม Login, CAPTCHA/OTP, alt/lang) → ถ้าใส่ Username/Password จะลอง Login 1 ครั้งและสำรวจหน้าหลัง Login → แตกเป็น Test Case (TC-WEB / TC-LOGIN / TC-HOME) → สร้างโปรเจกต์ pytest-playwright (Page Object, conftest fixture, marker, parametrize, คอมเมนต์ภาษาไทย) → รันใน Sandbox ได้ทันที → ดาวน์โหลด ZIP
  - โหมดฝึก: ซ่อนเฉลยจนกว่าผู้ใช้จะจดสิ่งที่สังเกตเอง + แท็บ "เรียนรู้ pytest"
  - Locator เลือกเฉพาะแบบที่ match element เดียวตอนสำรวจ (role → label → placeholder → id/name)
  - Password ไม่ถูกบันทึก (ใช้ในหน่วยความจำครั้งเดียว), Username ถูก Mask ใน Audit, ไม่แก้/ข้าม CAPTCHA หรือ OTP
  - API: `POST/GET /api/web-explorer`, `GET /api/web-explorer/{id}`, `/screenshot/{before|after}`, `/zip`, `POST /run`, `DELETE`
- `RUN-DEV.bat` / `STOP-DEV.bat`: รันแบบไม่ใช้ Docker (SQLite `storage\webqa.sqlite3`, งานเบื้องหลังแบบ inline, ติดตั้ง package + Chromium ให้อัตโนมัติ)
- `SINGLE_USER_MODE`: ใช้คนเดียว — admin ไม่ถูกบังคับเปลี่ยนรหัส, ปิดบัญชี demo
- `DEPLOY.bat`: deploy ด้วย Docker แบบดับเบิลคลิก

### Fixed
- ชื่อ Test ภาษาไทยในผลรันแสดงเป็นรหัส `\u0e..` → แสดงเป็นตัวอักษรไทย (pytest.ini ที่ generate)
- `requirements-dev.txt` ระบุ pytest คนละเวอร์ชันกับ automation-runner ทำให้ติดตั้งรวมกันไม่ได้ → ใช้ 8.3.3 ทั้งคู่
- Sandbox: ส่งตัวแปรที่ Playwright ต้องใช้ (LOCALAPPDATA ฯลฯ) และไม่จำกัด address space สำหรับ browser test

## [1.0.0] — 2026-10-01 — Repository จริง (หัวข้อ 42)

### Added
- `backend/` FastAPI + SQLAlchemy 2 + Alembic (`0001_initial`, `0002_test_data_text`) + PostgreSQL/SQLite, 88 REST endpoints, RBAC 4 Role, bcrypt, Session timeout, Rate limit, Audit, Masking, Error model + Correlation ID
- Port Logic จากต้นแบบ: `04_source/p3_engine.js` → `backend/app/services/engine/` (Parsers, Normalize, Section/Chunk, Requirement extraction, Quality score + เหตุผล, Clarification/Assumption, Conflict detection) และ `04_source/p4_gen.js` → `services/testdesign.py` + `services/generators/` (Boundary, Priority/Risk, Scenario, Test Case, Python, Pytest, Postman, SQL, Playwright, JMeter, GitHub Actions, Secret scan) — ตรวจความเท่ากันด้วย Golden test
- Document Processing ราย Section: Retry Section / Retry Failed Only / Cancel / Resume / Progress / Log, รูปหน้าจอ → NEEDS_VISUAL_REVIEW
- Version Compare + Impact Proposal (ไม่แก้ Test Case ที่ Approved อัตโนมัติ)
- AI Provider Interface: Rule Engine + Claude API (Hallucination control, Prompt version, Input hash, Token usage)
- Storage Interface (`LocalStorage` ที่ `.\storage`, พร้อมต่อยอด MinIO/Azure Blob)
- `worker/` Celery + Redis (acks_late, retry)
- `automation-runner/` Sandbox (rlimit CPU/RAM/FSIZE/NPROC, timeout, output cap, clean env, AST validation), HTTP service, Headed Exploration CLI
- GitHub Integration: Connect, Proposal + Preview (files/diff), Approve, Execute (branch + commit + PR, ไม่มี merge/force push)
- `frontend/` Next.js 15 + TypeScript + Tailwind + shadcn-style (Radix) + TanStack Query + React Hook Form + Zod + Monaco (offline) — 24 หน้า ตาม PAGE_SPECIFICATION โดยใช้ Design token จาก `03_web_app`
- Excel Export 10 Sheet (openpyxl) พร้อม Freeze Header, Filter, Wrap, สี Status
- Docker Compose (postgres, redis, backend, worker, runner, frontend), `.env.example`, Secret อัตโนมัติ, Network-sharing guard
- VS Code: `.vscode/` (settings, extensions, launch, tasks) + `WebQA2026.code-workspace`
- CI: `.github/workflows/ci.yml` · Docs: ARCHITECTURE, SECURITY, API, DATABASE, DEVELOPMENT, DEPLOYMENT_WINDOWS, USER_GUIDE_TH, TESTING

### Fixed (เทียบต้นแบบ HTML)
- Completeness reason "ระบุ Role" แสดงผิดเป็น "ไม่มี  Role" → "ไม่ระบุ Role"
- คำถาม Clarification ที่ยังไม่ตอบเปลี่ยน ID ทุกครั้งที่ Resolve ข้ออื่น → คง ID เดิม
- Length Boundary (เช่น ไม่เกิน 200 ตัวอักษร) สร้างเป็นตัวเลข → สร้าง String ความยาวจริง + `len()` ใน rule_service
- Excel ไม่มี Freeze Header/สี Status → มีแล้ว
- ข้อมูลอยู่ใน IndexedDB ของเบราว์เซอร์ → PostgreSQL + `.\storage`

## [0.9.0] — 2026-09-30 — ต้นแบบ HTML ไฟล์เดียว
- `03_web_app/brs-qa-platform.html` (ดู `01_conversation/CONVERSATION_HISTORY.md`)
