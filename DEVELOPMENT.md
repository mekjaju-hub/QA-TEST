# DEVELOPMENT

## Development Mode (ไม่ใช้ Docker) — Windows 11

ต้องมี: Python 3.11/3.12, Node.js 20/22, Git, VS Code

```powershell
cd C:\Cludaemek\WebQA2026
copy .env.example .env

# Python (ใช้ venv เดียวที่ root ครอบคลุม backend / worker / automation-runner)
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend\requirements-dev.txt -r automation-runner\requirements.txt

# Database (SQLite ใน .\storage) + Seed
cd backend
$env:DATABASE_URL = "sqlite:///C:/Cludaemek/WebQA2026/storage/dev.sqlite3"
$env:TASK_MODE = "inline"     # งานเบื้องหลังรันเป็น Thread ใน API (ไม่ต้องมี Redis)
$env:RUNNER_URL = ""          # Run Pytest ด้วย automation-runner แบบ Local
alembic upgrade head
python -m app.seed
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

อีก Terminal:

```powershell
cd C:\Cludaemek\WebQA2026\frontend
npm install            # postinstall คัดลอก Monaco ไป public\monaco (ใช้ Offline ได้)
npm run dev            # http://localhost:3000  (/api/* → http://127.0.0.1:8000)
```

ใช้ Celery จริงโดยไม่ใช้ Docker: ติดตั้ง Redis (เช่น Memurai หรือ Redis ใน WSL) แล้ว
`$env:TASK_MODE="celery"` + `celery -A worker.celery_app worker --pool=solo` ในโฟลเดอร์ `worker` (ตั้ง `PYTHONPATH=..\backend;.`)

## VS Code

เปิด `WebQA2026.code-workspace` (File → Open Workspace from File…) — Settings/Launch/Tasks/Extensions อยู่ในไฟล์นี้แล้ว · ถ้าจะเปิดเป็นโฟลเดอร์ ให้รัน `scripts\setup-vscode-and-ci.ps1` เพื่อสร้าง `.vscode\` ก่อน แล้ว:

- Extensions: กด *Install All* ที่ Recommended (`.vscode/extensions.json`): Python/Pylance/Debugpy, ESLint, Tailwind, Playwright, Vitest, Docker, SQLTools (PostgreSQL), Mermaid preview, GitHub Actions
- Interpreter: `.venv\Scripts\python.exe` (ตั้งไว้ใน Workspace settings)
- **Run and Debug** (`Ctrl+Shift+D`):
  - `Full stack (dev): Backend + Frontend` — Debug FastAPI (breakpoint ได้) + Next.js dev พร้อมกัน
  - `Worker: Celery`, `Runner: automation-runner service`, `Runner: Headed exploration (Playwright)`
  - `Backend: pytest current file`, `Seed database`
- **Tasks** (`Ctrl+Shift+P` → *Tasks: Run Task*): Setup venv, npm install, Migrate, Seed, Test backend/runner/frontend/E2E, Docker up/logs/restart/down
- Testing panel: Pytest ค้นหา `backend/tests` อัตโนมัติ; Vitest/Playwright ผ่าน Extension

## โครงสร้าง Backend

```
backend/app/
  main.py config.py db.py seed.py
  core/        security (bcrypt, token) · rbac · masking · errors · ratelimit
  models/      SQLAlchemy 41 tables
  api/         auth projects documents requirements testdesign automation runs github admin
  services/
    engine/    text.py (normalize/section/chunk) · parsers.py · analysis.py   ← p3_engine.js
    testdesign.py                                                           ← p4_gen.js (test design)
    generators/ python_gen pytest_gen postman sql playwright jmeter github_actions secret_scan  ← p4_gen.js
    processing.py compare.py excel_export.py ai_provider.py storage.py tasks.py
    automation_service.py run_service.py github_service.py
  repositories/ (ID sequences, audit, ORM↔engine mapping)
backend/alembic/versions/  0001_initial · 0002_test_data_text
```

ความเท่ากันของ Logic กับต้นแบบ JS ตรวจด้วย `backend/tests/test_engine_parity.py` (Golden file สร้างจาก `04_source/*.js` ด้วย Node: `node backend/tests/golden/make_golden.js`)

## Migration ใหม่

```powershell
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

ใช้ `op.batch_alter_table` เมื่อแก้ Column เพื่อให้ทำงานได้ทั้ง PostgreSQL และ SQLite

## Coding conventions

- ค่าไม่พบใน BRS = `NOT_FOUND`; ค่าที่ต้องตั้งค่า = `NEEDS_CONFIGURATION`; Assumption = `AI ASSUMPTION - NOT FOUND IN BRS`
- ข้อความผู้ใช้ภาษาไทย, ศัพท์ Technical อังกฤษ
- ทุก Action สำคัญเรียก `audit()`; ทุก Error เป็น `AppError(code, user_message, ...)`
