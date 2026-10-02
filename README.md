# WebQA2026 — BRS to QA Automation Platform

ระบบแปลงเอกสาร BRS (DOCX/XLSX/CSV/PDF/TXT/Paste) → Requirement → Clarification/Conflict → Test Scenario →
Test Case (Given/When/Then) → Automation (Python, Pytest, Postman, MySQL, Playwright, JMeter, GitHub Actions) →
Run Test → Dashboard โดย QA อนุมัติทุกขั้น · Local-first บน Windows 11

ตำแหน่งโฟลเดอร์: `C:\Cludaemek\WebQA2026` · ไฟล์ทั้งหมดของระบบเก็บที่ `C:\Cludaemek\WebQA2026\storage`

## เริ่มระบบตั้งแต่เครื่องว่าง (Docker — วิธีหลัก)

1. **ติดตั้ง Docker Desktop** for Windows (เปิด WSL 2 backend) แล้วเปิด Docker Desktop ให้สถานะเป็น Running
2. **Copy `.env.example` เป็น `.env`**
   ```powershell
   cd C:\Cludaemek\WebQA2026
   copy .env.example .env
   ```
3. **กำหนด `CLAUDE_API_KEY`** (และ `CLAUDE_MODEL`) ใน `.env` — ถ้าเว้นว่าง ระบบใช้ Rule Engine แบบ Offline ได้ทันที
4. **Run**
   ```powershell
   docker compose up -d
   ```
   ครั้งแรกจะ Build Image ~5–10 นาที · ตรวจสถานะ `docker compose ps` (ทุก Service ต้อง healthy)
5. **เปิด Browser** ไปที่ <http://localhost:3000>
6. **Login ด้วย Seed Admin**: `admin` / `Admin@12345` (เปลี่ยนค่าได้ที่ `SEED_ADMIN_PASSWORD` ก่อน up ครั้งแรก)
7. **เปลี่ยน Password ทันที** — ระบบบังคับไปหน้าเปลี่ยนรหัสผ่านก่อนใช้งาน (อย่างน้อย 10 ตัว มีพิมพ์ใหญ่/เล็ก/ตัวเลข/อักขระพิเศษ)

Project ตัวอย่าง `CAM` (Synthetic) ถูก Seed และวิเคราะห์ไว้แล้ว พร้อมผู้ใช้ Demo `qa_manual`, `qa_auto`, `ba` (รหัสเดียวกับ Seed Admin และต้องเปลี่ยนเมื่อ Login)

คำสั่งที่ใช้บ่อย:

```powershell
docker compose up -d        # เริ่ม
docker compose down         # หยุด (ข้อมูลยังอยู่)
docker compose logs -f      # ดู Log
docker compose restart      # Restart
```

ไม่ใช้ Docker → ดู [DEVELOPMENT.md](DEVELOPMENT.md) (SQLite + Background thread + Local runner)

## เปิดด้วย VS Code

```powershell
code C:\Cludaemek\WebQA2026\WebQA2026.code-workspace
```

ไฟล์ Workspace มีทุกอย่างในตัว: Extensions ที่แนะนำ, Launch (Debug Backend / Frontend / Worker / Runner / Full stack), Tasks (Setup, Migrate, Seed, Test, Docker) — รายละเอียดใน [DEVELOPMENT.md](DEVELOPMENT.md#vs-code)

ถ้าต้องการให้เปิดแบบโฟลเดอร์ (`code .`) หรือใช้ GitHub Actions ให้ติดตั้ง `.vscode\` และ `.github\workflows\ci.yml` จาก `tools\` ครั้งเดียว:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-vscode-and-ci.ps1
```

## โครงสร้าง Repository

```
WebQA2026/
  frontend/            Next.js 15 + TypeScript + Tailwind + shadcn-style (Radix) + TanStack Query + RHF/Zod + Monaco
  backend/             FastAPI + SQLAlchemy 2 + Alembic + Pydantic  (app/services/engine = Port จาก 04_source/p3_engine.js,
                       app/services/testdesign.py + generators/ = Port จาก 04_source/p4_gen.js)
  worker/              Celery worker (Redis) — Document Processing / Test Run jobs
  automation-runner/   Sandbox รัน Pytest (จำกัด CPU/RAM/Time/Output) + Headed Exploration CLI
  docker-compose.yml   postgres, redis, backend, worker, runner, frontend
  .env.example
  storage/             uploads/ images/ artifacts/ runs/ exports/ secrets/ (Mount เข้า Container)
  samples/             Sample BRS (Synthetic): CAM_BRS_v1.txt, CAM_BRS_v2.txt, sample.docx/xlsx/csv/pdf
  scripts/             stack_smoke.py, run-stack-smoke.sh
  tools/               vscode/*.json + github/workflows/ci.yml → ติดตั้งด้วย scripts\setup-vscode-and-ci.ps1
  WebQA2026.code-workspace  VS Code workspace (settings + launch + tasks + extensions)
  docs/STAGE1_ANALYSIS.md
  ARCHITECTURE.md  SECURITY.md  API.md  DATABASE.md  DEVELOPMENT.md  DEPLOYMENT_WINDOWS.md
  USER_GUIDE_TH.md  TESTING.md  CHANGELOG.md  PROGRESS.md  ASSUMPTIONS.md
  01_conversation/ 02_specification/ 03_web_app/ 04_source/ 05_docs/   ← ประวัติ, Spec, ต้นแบบ HTML (ใช้อ้างอิง)
```

## ที่เก็บข้อมูล

| ข้อมูล | ตำแหน่ง |
|---|---|
| Database (Docker) | PostgreSQL volume `brs-qa_pgdata` (ไม่หายเมื่อ Restart/down — หายเฉพาะ `docker compose down -v`) |
| ไฟล์ BRS ต้นฉบับ | `storage\uploads\{PROJECT}\{document_id}\v{n}\` |
| รูปหน้าจอจาก BRS | `storage\images\{document_id}\v{n}\` |
| Code ที่ Generate (AI + Draft) | `storage\artifacts\{PROJECT}\{artifact_id}\ai\` และ `current\` |
| ผล Run (junit.xml, report.html, screenshot, log) | `storage\runs\{run_id}\` |
| Excel Export | `storage\exports\` (และดาวน์โหลดผ่าน Browser) |
| Secret ที่ระบบสร้างเอง | `storage\secrets\` (ห้ามแชร์/ห้าม Commit) |

## สถานะงาน

ดู [PROGRESS.md](PROGRESS.md) — Stage 1–9, ผล Test และ Acceptance Criteria 40 ข้อ
