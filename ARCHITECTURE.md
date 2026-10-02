# ARCHITECTURE — BRS to QA Automation Platform

## 1. Component View

```mermaid
flowchart LR
  subgraph Browser["Browser (Windows 11 / LAN)"]
    FE["frontend/ Next.js 14<br/>TypeScript · Tailwind · shadcn-style UI<br/>TanStack Query · RHF+Zod · Monaco"]
  end
  subgraph Host["Docker Compose (หรือ Dev Mode)"]
    API["backend/ FastAPI<br/>REST /api/* · RBAC · Audit · Masking"]
    W["worker/ Celery<br/>Document Processing Jobs"]
    R["automation-runner/<br/>Pytest subprocess + rlimit"]
    DB[("PostgreSQL 16")]
    Q[("Redis 7")]
  end
  ST[["./storage<br/>uploads · images · artifacts · runs · exports"]]
  AI["Claude API (optional)"]
  GH["GitHub REST API (optional)"]

  FE -- "HTTPS/HTTP JSON + Bearer" --> API
  API --> DB
  API -- "enqueue" --> Q --> W
  W --> DB
  W --> ST
  API --> ST
  API -- "POST /run (internal token)" --> R
  R --> ST
  W -. "API Key อยู่ฝั่ง Server เท่านั้น" .-> AI
  API -. "Token ฝั่ง Server" .-> GH
```

- Frontend ไม่เคยได้รับ Secret (Claude Key, GitHub Token, Runner Token)
- Backend เป็นจุดเดียวที่ตรวจสิทธิ์ (RBAC) — Frontend ซ่อนเมนูเพื่อ UX เท่านั้น
- Worker ใช้ Code เดียวกับ Backend (`backend/app`) ผ่าน `PYTHONPATH` จึงไม่มี Logic ซ้ำ

## 2. Backend Layering

```
backend/app/
  main.py            FastAPI app, middleware (CORS, CSP headers, rate limit, correlation id)
  config.py          Settings จาก Environment (.env)
  db.py              Engine/Session
  models/            SQLAlchemy models (38 tables)
  schemas/           Pydantic DTO
  api/               Routers (auth, projects, documents, requirements, scenarios, testcases,
                     automation, runs, github, traceability, settings, audit, dashboard)
  services/
    engine/          Port จาก p3_engine.js: parsers, normalize, sections, extraction, quality,
                     questions, conflicts
    testdesign.py    Port จาก p4_gen.js ส่วน Test Design: boundary, priority/risk, scenario, test case
    generators/      Port จาก p4_gen.js ส่วน Automation: python, pytest, postman, sql, playwright,
                     jmeter, github_actions, secret_scan, diff
    excel_export.py  10 Sheet (openpyxl) + Freeze Header + สีตาม Status
    processing.py    Pipeline ราย Section (Retry/Resume/Cancel)
    compare.py       Version Compare + Impact Proposal
    ai_provider.py   AIProvider Interface: RuleBasedProvider, ClaudeProvider
    storage.py       StorageBackend Interface: LocalStorage (MinIO/Azure ในอนาคต)
    runner_client.py เรียก automation-runner
    github_service.py Proposal → Approve → Execute (ไม่มี Merge/Force Push)
  repositories/      Query helpers (Repository Pattern)
  core/              security (bcrypt, token), rbac, masking, errors, audit, ratelimit
```

## 3. Data Flow

```mermaid
flowchart TD
  U[Upload/Paste] -->|SHA-256, safe filename, type sniff| S1[(storage/uploads)]
  U --> DV[document_versions]
  DV -->|enqueue job| J[processing_jobs]
  J --> X[Extract: DOCX/XLSX/CSV/PDF/TXT]
  X --> N[Normalize Thai/EN, header/footer]
  N --> C[Chunk ราย Section ไม่ตัดกลางแถว]
  C --> SEC[document_sections + processing_job_sections]
  SEC -->|ทีละ Section, บันทึกทันที| A[AI/Rule Analysis]
  A --> REQ[requirements + sources + questions + assumptions]
  REQ --> CF[Conflict Detection]
  CF --> RV{QA Review}
  RV -->|NEEDS_CLARIFICATION / CONFLICT| CL[Clarification & Conflict Center]
  CL --> RV
  RV -->|APPROVED| TS[test_scenarios]
  TS --> TC[test_cases + steps + data]
  TC -->|APPROVED + Lock| GEN[Automation Generators]
  GEN --> ART[(storage/artifacts)]
  ART --> RUN[automation-runner]
  RUN --> RES[test_runs + results + artifacts]
  RES --> DASH[Dashboard / Traceability]
```

## 4. Authentication Flow

```mermaid
sequenceDiagram
  participant B as Browser
  participant API as FastAPI
  participant DB as PostgreSQL
  B->>API: POST /api/auth/login {username,password}
  API->>API: Rate limit (5 ครั้ง/นาที/IP+user)
  API->>DB: users (bcrypt hash)
  alt ถูกต้อง
    API->>DB: audit_logs LOGIN
    API-->>B: {access_token (JWT HS256, exp = SESSION_MINUTES), must_change_password}
  else ผิด
    API->>DB: audit_logs LOGIN_FAILED
    API-->>B: 401 AUTH_INVALID "Username หรือ Password ไม่ถูกต้อง"
  end
  B->>API: GET /api/... Authorization: Bearer
  API->>API: verify + idle timeout + RBAC permission
  API-->>B: data + X-Refreshed-Token (ต่ออายุ Idle Session)
```

- `must_change_password=true` → Frontend บังคับไปหน้าเปลี่ยนรหัสผ่าน และ Backend ปฏิเสธ API อื่น (`PASSWORD_CHANGE_REQUIRED`)
- รองรับ SSO/Entra ID ในอนาคตผ่าน `AuthProvider` (ตอนนี้ `LocalAuthProvider`)

## 5. Document Processing Flow

```mermaid
stateDiagram-v2
  [*] --> UPLOADED
  UPLOADED --> EXTRACTING
  EXTRACTING --> NORMALIZING
  NORMALIZING --> CREATING_SECTIONS
  CREATING_SECTIONS --> ANALYZING_REQUIREMENTS
  ANALYZING_REQUIREMENTS --> DETECTING_CONFLICTS
  DETECTING_CONFLICTS --> GENERATING_QUESTIONS
  GENERATING_QUESTIONS --> READY_FOR_REVIEW
  EXTRACTING --> FAILED
  ANALYZING_REQUIREMENTS --> PARTIAL_FAILED: บาง Section fail
  PARTIAL_FAILED --> ANALYZING_REQUIREMENTS: Retry failed only
  ANALYZING_REQUIREMENTS --> CANCELLED: Cancel
  CANCELLED --> ANALYZING_REQUIREMENTS: Resume (ข้าม Section ที่ DONE)
```

- แต่ละ Section มีสถานะ `PENDING/RUNNING/DONE/FAILED/SKIPPED` และ attempts, error
- Retry ทำเฉพาะ Section ที่ FAILED; Resume ทำเฉพาะ PENDING/FAILED
- Cancel ตั้ง flag `cancel_requested` ที่ Job; Worker ตรวจก่อนทุก Section

## 6. Automation Flow

```mermaid
flowchart LR
  TC[Test Case APPROVED] -->|lock| G[Generate Python/Pytest/...]
  D[Draft toggle] -.->|ติดป้าย DRAFT| G
  G --> SS[Secret Scan + Traceability check]
  SS --> AR[automation_artifacts + files ใน storage]
  AR --> E[Edit Draft / Reset AI Version / Diff]
  AR -->|POST /api/automation/{id}/run| RC[runner_client]
  RC --> RN[automation-runner: copy → workspace ชั่วคราว → pytest subprocess<br/>rlimit CPU/RAM, timeout, output cap, env ล้าง]
  RN --> JX[junit.xml → parser]
  JX --> TR[test_runs/results/artifacts]
  AR -->|Propose| GP[github_action_requests]
  GP -->|Approve| GE[Execute: create branch + commit + PR (ไม่มี merge)]
```

## 7. Deployment

- Docker Compose: `postgres`, `redis`, `backend`, `worker`, `runner`, `frontend`
- Volume: `./storage:/data/storage`, `pgdata` (named volume) → ข้อมูลไม่หายหลัง Restart (AC 40)
- Host Binding: `BIND_HOST=127.0.0.1` (ค่าเริ่มต้น); ต้องตั้ง `0.0.0.0` + `ALLOW_NETWORK_SHARING=true` เพื่อเปิด LAN
- Dev Mode (ไม่ใช้ Docker): SQLite + `TASK_MODE=inline` + runner แบบ local subprocess — ดู DEVELOPMENT.md
