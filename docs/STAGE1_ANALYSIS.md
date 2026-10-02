# Stage 1 — Requirement Summary, Assumptions, Risks

อ้างอิง: `02_specification/MASTER_PROMPT.md` (หัวข้อ 1–46), `02_specification/PAGE_SPECIFICATION.md` (P01–P24)

## 1. Understanding Summary

ระบบ **BRS to QA Automation Platform** แปลงเอกสาร BRS (DOCX/XLSX/CSV/PDF/TXT/Paste) เป็น
Requirement → Clarification/Conflict → Test Scenario → Test Case (Given/When/Then) → Automation
(Python, Pytest, Postman, MySQL SQL, Playwright, JMeter, GitHub Actions) → Test Run → Dashboard
โดยมี QA เป็นผู้อนุมัติทุกขั้น และทุก Artifact ย้อนกลับไปหา Requirement/Source Page ได้ (Traceability)

Workflow หลัก: `AI Draft → QA Review → Needs Clarification | Approved → Generate Automation → Run Test → Review Result`

## 2. Architecture Decision (สรุป — รายละเอียดใน ARCHITECTURE.md)

| ส่วน | ตัดสินใจ | เหตุผล |
|---|---|---|
| Repository | Monorepo ที่ `C:\Cludaemek\WebQA2026` (โฟลเดอร์เดิม ไม่สร้างทับ) | ตาม PROJECT_INSTRUCTIONS และหัวข้อ 44 |
| Backend | FastAPI + SQLAlchemy 2 + Alembic + Pydantic 2 | ตามหัวข้อ 4 |
| Logic เดิม | Port `04_source/p3_engine.js` → `backend/app/services/engine/`, `p4_gen.js` → `backend/app/services/testdesign.py` + `generators/` | รักษาพฤติกรรมที่ทดสอบแล้วในต้นแบบ |
| Database | PostgreSQL 16 (Docker); Dev/Test ใช้ SQLite ได้ผ่าน `DATABASE_URL` | Local-first, ทดสอบเร็ว |
| Background | Celery + Redis; `TASK_MODE=inline` สำหรับ Dev ไม่ใช้ Docker | หัวข้อ 3 "Development Mode ที่ไม่ใช้ Docker" |
| Storage | `StorageBackend` Interface + `LocalStorage` ที่ `./storage` (Mount เข้า Container ที่ `/data/storage`) | หัวข้อ 4 + คำสั่งผู้ใช้ |
| Runner | Service แยก `automation-runner/` รัน Pytest ใน subprocess + จำกัด CPU/RAM/Time/Output, Env ถูกล้าง | หัวข้อ 20 |
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui-style components + TanStack Query + RHF + Zod + Monaco | หัวข้อ 4; ใช้ Design Token/Layout จาก `03_web_app` |
| AI | `AIProvider` Interface: `RuleBasedProvider` (ค่าเริ่มต้น), `ClaudeProvider` (ใช้ `CLAUDE_API_KEY` ฝั่ง Backend เท่านั้น) | หัวข้อ 4, 32 |

## 3. Assumptions (เพิ่มเติมจาก ASSUMPTIONS.md)

- Seed Admin: `admin` / `Admin@12345` บังคับเปลี่ยนรหัสผ่านเมื่อ Login ครั้งแรก (เหมือนต้นแบบ)
- Session ใช้ Bearer Token (JWT แบบ HS256 ที่ลงนามด้วย `SECRET_KEY`) เก็บใน `sessionStorage` ของ Frontend — ไม่ใช้ Cookie จึงไม่ต้อง CSRF Token (หัวข้อ 33 "CSRF หากใช้ Cookie")
- Session Timeout = Idle 30 นาที (ตั้งได้ `SESSION_MINUTES`) — Token มีอายุสั้นและต่ออายุทุก Request
- DOCX ไม่มีเลขหน้าในตัว → Source Page = `NOT_FOUND` และใช้ Section แทน (Known Issue เดิม)
- Claude Model ตั้งผ่าน `CLAUDE_MODEL` (ค่าเริ่มต้น `NEEDS_CONFIGURATION` ถ้าไม่ได้ตั้ง → ใช้ Rule Engine)
- GitHub Execute ใช้ GitHub REST API ด้วย `GITHUB_TOKEN` ฝั่ง Backend; ถ้าไม่ได้ตั้ง → สถานะ `NEEDS_CONFIGURATION` (Proposal/Approve ยังใช้ได้)
- Runner รันได้เฉพาะ Pytest Project ที่ระบบ Generate (ไม่รับคำสั่งจากผู้ใช้โดยตรง)
- JMeter/Newman/Playwright Headed: สร้างไฟล์และ Interface ไว้; การ Run จริงขึ้นกับเครื่องที่ติดตั้ง Tool (Optional ตามหัวข้อ 4)

## 4. Risks

| Risk | ผลกระทบ | การลดความเสี่ยง |
|---|---|---|
| Rule Engine ดึง Requirement พลาด/เกิน | Requirement ผิด | ทุก Requirement มี Original Text + Source; QA Review ก่อน Approve |
| AI Hallucination | ค่าที่ไม่มีใน BRS | ตรวจ `original_text` ต้องเป็น Substring ของ Section, ตัวเลขต้องอยู่ใน Original Text, ไม่งั้นติด `sourceUnverified` (-20 Clarity) |
| เอกสาร 100–200 หน้า | Timeout | Background Job ราย Section, Retry เฉพาะ Section, Resume, Cancel |
| Runner รัน Code อันตราย | ความปลอดภัยเครื่อง | รันเฉพาะไฟล์ที่ Generate + Secret Scan, subprocess + rlimit, Env ล้าง Secret, Timeout, Output cap |
| เปิด 0.0.0.0 | คนใน LAN เข้าถึง | ค่าเริ่มต้น 127.0.0.1, ต้องตั้ง `ALLOW_NETWORK_SHARING=true` และแสดงคำเตือน |
| Windows path/encoding | ไฟล์ภาษาไทยเสีย | Safe filename + UTF-8 ทั้งระบบ, Docker Volume `./storage` |
| Conflict ใช้ Bigram | จับคู่ผิด | ไม่ Resolve อัตโนมัติ ต้องให้ QA/BA ยืนยันพร้อมเหตุผล |

## 5. สิ่งที่ไม่ควรเดา (ใช้ NEEDS_CONFIGURATION / NOT_FOUND)

- API Authentication ของระบบที่ทดสอบ, Endpoint, HTTP Method
- ชื่อ Table/Column ใน MySQL
- Base URL / Production URL (Production ถูก Block โดยค่าเริ่มต้น)
- Error Message ที่ BRS ไม่ได้เขียน
- Timezone / Rounding / Calendar vs Business Day → เป็น `AI ASSUMPTION - NOT FOUND IN BRS` จนกว่า BA ยืนยัน
- เนื้อหาในรูปภาพหน้าจอ → `NEEDS_VISUAL_REVIEW` ห้ามเดาข้อความ
