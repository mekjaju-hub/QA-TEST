# SECURITY

## สรุปการควบคุม (หัวข้อ 33, 45)

| หัวข้อ | การทำงาน | ที่อยู่ใน Code |
|---|---|---|
| Login / Password Hashing | bcrypt (cost 12), Policy ≥10 ตัว พิมพ์ใหญ่/เล็ก/ตัวเลข/อักขระพิเศษ, Seed Admin ต้องเปลี่ยนรหัสก่อนใช้งาน (`PASSWORD_CHANGE_REQUIRED`) | `backend/app/core/security.py`, `api/auth.py` |
| Session Timeout | Token HS256 อายุ = `SESSION_MINUTES` (30) ต่ออายุแบบ Sliding ผ่าน `X-Refreshed-Token`; Frontend Logout เมื่อ Idle | `api/deps.py`, `frontend/lib/auth.tsx` |
| RBAC | 4 Role, 29 Permission; Backend ตรวจทุก Endpoint (Frontend ซ่อนเมนูเพื่อ UX เท่านั้น); ถูกปฏิเสธ → Audit `PERMISSION_DENIED` | `core/rbac.py`, `api/deps.py` |
| CSRF | ไม่ใช้ Cookie Session (Bearer Token ใน sessionStorage) จึงไม่มีช่องทาง CSRF | — |
| Rate Limit | Login 5 ครั้ง/นาที/IP+user, API 600 ครั้ง/นาที/IP | `core/ratelimit.py`, `main.py` |
| Input Validation | Pydantic ทุก Body, Zod ฝั่ง Frontend | `api/*.py`, `frontend/lib/schemas` |
| File Upload | ตรวจนามสกุล + Magic bytes, ขนาด `MAX_UPLOAD_MB`, SHA-256, Safe filename (รวมชื่อสงวน Windows), ไฟล์เสีย → `CORRUPT_FILE` | `api/documents.py`, `services/storage.py` |
| Path Traversal | Storage resolve ทุก key ต้องอยู่ใต้ `STORAGE_ROOT`; Artifact/Runner ปฏิเสธ `..`, absolute path | `services/storage.py`, `automation-runner/runner/validate.py` |
| SQL Injection | SQLAlchemy ORM/Bound parameters ทั้งหมด; SQL Template ที่ Generate เป็น Read-only + Placeholder | `models`, `generators/sql.py` |
| XSS | React escape โดยค่าเริ่มต้น (ไม่มี `dangerouslySetInnerHTML`); ไฟล์ Report ที่ดาวน์โหลดใส่ `Content-Security-Policy: sandbox` | `frontend/**`, `api/runs.py` |
| CSP / Security headers | Frontend: CSP, X-Frame-Options DENY, nosniff, no-referrer; API: `default-src 'none'` | `frontend/next.config.mjs`, `backend/app/main.py` |
| CORS | ปิดโดยปริยาย — Browser เรียก API ผ่าน Proxy origin เดียวกัน (`/api/*`) ; `CORS_ORIGINS` ใช้เฉพาะ Dev | `frontend/app/api/[...path]/route.ts` |
| Secret ไม่ถึง Frontend | `CLAUDE_API_KEY`, `GITHUB_TOKEN`, `SECRET_KEY`, `RUNNER_TOKEN` อยู่ใน Backend env เท่านั้น; `/api/auth/me` คืนเพียงสถานะ `*_configured` | `config.py: public_settings()` |
| Secret อัตโนมัติ | ถ้า `SECRET_KEY`/`RUNNER_TOKEN` ว่าง ระบบสุ่ม 48 bytes เก็บที่ `storage/secrets/` (ไม่ใช้ค่า Default ที่เดาได้) | `config.py: ensure_secret()` |
| Masking | Password, Token, API Key, Bearer, `ghp_`, `sk-`, Connection String, OTP, Cookie, เลขบัตร 13 หลัก, Customer ID → Mask ใน Log, Audit, Error, Run Log, ก่อนส่ง Claude | `core/masking.py` |
| Secure Error | Error Code + User Message + Correlation ID; Technical Detail แสดงเฉพาะ Admin | `core/errors.py`, `main.py` |
| Audit Log | Login/Logout/Failed, Upload, Process/Retry/Cancel, Requirement Edit/Approve, Conflict Resolve, Test Case Approve, Automation Generate/Edit, Test Run, GitHub Action, Download, Export, Settings, Permission denied | `repositories.audit()` |
| Dependency Lock | Python pinned (`requirements.txt`), Node `package-lock.json` | — |

## Network Sharing (เปิดให้เครื่องอื่นใน LAN)

ค่าเริ่มต้น `BIND_HOST=127.0.0.1` = เข้าได้เฉพาะเครื่องนี้ ถ้าต้องการให้คนใน LAN ดู:

1. เปลี่ยนรหัสผ่าน Seed Admin และผู้ใช้ Demo ทั้งหมดแล้ว (หรือปิดบัญชี Demo ใน Settings)
2. แก้ `.env`: `BIND_HOST=0.0.0.0` และ `ALLOW_NETWORK_SHARING=true` (ถ้าไม่ตั้งค่าที่สอง Backend จะไม่ Start)
3. `docker compose up -d` แล้วเปิด Windows Firewall เฉพาะ Port `APP_PORT` (3000) สำหรับ Private network
4. เปิดจากเครื่องอื่น: `http://<IP เครื่องนี้>:3000` — การเชื่อมต่อเป็น HTTP ภายใน LAN; ถ้าต้องการ HTTPS ให้วาง Reverse Proxy (Caddy/IIS) หน้า Port 3000

Backend (8000), PostgreSQL, Redis และ Runner ไม่ถูกเปิดออก LAN (Backend ผูก 127.0.0.1 สำหรับ `/api/docs` เท่านั้น)

## Test Runner Isolation

- ไม่รับคำสั่งจากผู้ใช้: Command line คงที่ `python -m pytest ...`; Node ID สำหรับ Retry ผ่าน Regex whitelist
- Code ที่ผู้ใช้แก้ถูกตรวจ AST: ห้าม `subprocess`, `ctypes`, `socket`, `shutil`, `os.system/popen/remove/kill/environ`, `eval/exec/compile/__import__` ฯลฯ, ห้ามไฟล์ `.env`, ห้าม Token
- Workspace ชั่วคราวใหม่ทุก Run แล้วลบทิ้ง; Environment ถูกล้าง (ส่งเฉพาะ `BASE_URL`, `AUTH_TYPE`, `TEST_ENV`, `API_TIMEOUT`)
- Linux/Docker: `RLIMIT_CPU`, `RLIMIT_AS` (RAM), `RLIMIT_FSIZE`, `RLIMIT_NPROC`, Timeout (kill ทั้ง Process group), Output cap
- Container `runner`: non-root, `read_only`, `cap_drop: ALL`, `no-new-privileges`, `pids_limit`, `mem_limit 2g`, `cpus 2`, ไม่ Mount Storage/Secret ของแอป (ยกเว้น runner token แบบ read-only)
- Windows Dev Mode (ไม่ใช้ Docker): บังคับ Timeout, Output cap และ Kill process tree ได้ แต่ **ไม่มี CPU/RAM rlimit** → ใช้ Docker เมื่อ Run Code ที่ไม่ไว้ใจ

## AI / Claude

- ส่งเฉพาะข้อความ Section ที่ผ่าน Masking แล้ว; ห้ามส่ง Secret
- Hallucination control: `original_text` ต้องเป็น Substring ของ Section, ตัวเลข Threshold ต้องอยู่ใน `original_text`, ถ้าไม่ผ่าน → `source_unverified` (-20 Clarity) และต้องยืนยันก่อน Approve
- บันทึก Model, Prompt Version, Input Hash, Token Usage ใน `requirements.ai_meta`

## GitHub

- Token ที่ Backend เท่านั้น; Proposal → Approve → Execute; ห้าม Commit ตรง `main/master`, ห้าม Branch ซ้ำ (ไม่มี Force Push), ไม่มี Merge, ไม่มีการลบ Branch
- Secret scan ซ้ำตอน Execute (กันการแก้ไฟล์หลังอนุมัติ); ไฟล์ `.env`, `.auth/`, `*.session`, `*.har`, storage_state, Token, Password literal, เลข 13 หลัก → BLOCKED

## Playwright / CAPTCHA / OTP

- ไม่มีฟังก์ชันใดอ่าน/ถอดรหัส/ข้าม CAPTCHA หรือเก็บ OTP — เป็น Manual Checkpoint (`page.pause()`) ใน Headed Mode
- Session (`storage_state`) เก็บเฉพาะใน `.auth/` (git-ignored) และเมื่อผู้ใช้สั่ง `--save-session`

## JMeter

- Allowlist Environment, Block URL ที่ดูเหมือน Production, จำกัด Users/Duration, ต้องยืนยัน Target URL และต้อง Approve Plan ก่อน Run; Run จริงทำผ่าน Runner Interface ภายนอก (Emergency Stop = ยกเลิก Process)

## รายงานช่องโหว่

แจ้ง Admin ของระบบพร้อม Correlation ID จากหน้าจอ Error
