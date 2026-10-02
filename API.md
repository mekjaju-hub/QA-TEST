# API

REST API ของ Backend (FastAPI) — Base path `/api` · OpenAPI/Swagger: `http://127.0.0.1:8000/api/docs` (เปิดเฉพาะ localhost)

## หลักการ

- Authentication: `POST /api/auth/login` → `access_token` (Bearer, อายุ = `SESSION_MINUTES`, ต่ออายุผ่าน Header `X-Refreshed-Token` ทุก Request)
- ทุก Endpoint ตรวจสิทธิ์ที่ Backend (คอลัมน์ Permission อ้าง `backend/app/core/rbac.py`)
- Error Model (หัวข้อ 38): `{"error": {code, user_message, timestamp, retryable, suggested_action, correlation_id, technical (Admin เท่านั้น)}}`
- ทุก Response มี `X-Correlation-Id`; Rate limit: Login 5 ครั้ง/นาที, API 600 ครั้ง/นาที/IP
- Endpoint ตามหัวข้อ 35 ครบทุกตัว (รวม alias `/api/test-cases/{id}/{python|pytest|postman|sql|playwright}/generate`)

## Endpoints (88)


### admin

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| GET | `/api/audit-logs` | audit.view |  |
| GET | `/api/audit-logs/export` | audit.view |  |
| GET | `/api/settings` | settings |  |
| PATCH | `/api/settings` | settings |  |
| GET | `/api/users` | user.manage |  |
| POST | `/api/users` | user.manage |  |
| PATCH | `/api/users/{uid}` | user.manage |  |

### auth

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| POST | `/api/auth/change-password` | login |  |
| POST | `/api/auth/login` | public |  |
| POST | `/api/auth/logout` | login |  |
| GET | `/api/auth/me` | login |  |

### automation

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| GET | `/api/automation/meta` | auto.view |  |
| GET | `/api/automation/{aid}` | auto.view |  |
| GET | `/api/automation/{aid}/diff` | auto.view |  |
| GET | `/api/automation/{aid}/download` | auto.view |  |
| PUT | `/api/automation/{aid}/files` | auto.edit |  |
| POST | `/api/automation/{aid}/jmeter/approve` | github.approve | Approval before run (หัวข้อ 26). The run itself is done outside production via the Runner Interface. |
| POST | `/api/automation/{aid}/reset` | auto.edit |  |
| GET | `/api/automation/{aid}/zip` | auto.view |  |
| POST | `/api/playwright/locators/from-html` | auto.generate | Reads ONLY the DOM the user pasted (permitted DOM) and proposes locators; user approves before script generation. |
| POST | `/api/playwright/locators/from-recording` | auto.generate |  |
| GET | `/api/projects/{project_id}/automation` | auto.view |  |
| POST | `/api/projects/{project_id}/automation/generate` | auto.generate |  |
| POST | `/api/test-cases/{tid}/playwright/generate` | auto.generate |  |
| POST | `/api/test-cases/{tid}/postman/generate` | auto.generate |  |
| POST | `/api/test-cases/{tid}/pytest/generate` | auto.generate |  |
| POST | `/api/test-cases/{tid}/python/generate` | auto.generate |  |
| POST | `/api/test-cases/{tid}/sql/generate` | auto.generate |  |

### documents

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| GET | `/api/documents/{document_id}` | doc.view |  |
| POST | `/api/documents/{document_id}/cancel` | doc.process |  |
| GET | `/api/documents/{document_id}/compare` | doc.view |  |
| GET | `/api/documents/{document_id}/log` | doc.view |  |
| POST | `/api/documents/{document_id}/process` | doc.process |  |
| GET | `/api/documents/{document_id}/progress` | doc.view |  |
| POST | `/api/documents/{document_id}/resume` | doc.process |  |
| POST | `/api/documents/{document_id}/retry-failed` | doc.process |  |
| GET | `/api/images/{image_id}` | doc.view |  |
| POST | `/api/impact/{impact_id}/decide` | impact.approve |  |
| GET | `/api/projects/{project_id}/documents` | doc.view |  |
| POST | `/api/projects/{project_id}/documents` | doc.upload |  |
| POST | `/api/projects/{project_id}/paste-text` | doc.upload |  |
| GET | `/api/sections/{section_id}` | doc.view |  |

### github

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| POST | `/api/github/action/approve` | github.approve |  |
| POST | `/api/github/action/execute` | github.approve |  |
| POST | `/api/github/action/reject` | github.approve |  |
| POST | `/api/github/connect` | github.propose |  |
| POST | `/api/github/repository/propose` | github.propose |  |
| GET | `/api/projects/{project_id}/github` | github.propose |  |

### projects

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| GET | `/api/projects` | project.view |  |
| POST | `/api/projects` | project.manage |  |
| GET | `/api/projects/{project_id}` | project.view |  |
| PATCH | `/api/projects/{project_id}` | project.manage |  |
| GET | `/api/projects/{project_id}/dashboard` | project.view | หัวข้อ 28 Dashboard. |

### requirements

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| GET | `/api/projects/{project_id}/clarifications` | req.view |  |
| GET | `/api/projects/{project_id}/requirements` | req.view |  |
| GET | `/api/requirements/compare/{a_id}/{b_id}` | req.view |  |
| GET | `/api/requirements/{rid}` | req.view |  |
| PATCH | `/api/requirements/{rid}` | req.edit | Edit → keep old values as a version, re-score, require review again. |
| POST | `/api/requirements/{rid}/approve` | req.approve |  |
| POST | `/api/requirements/{rid}/assumption` | assumption.edit |  |
| POST | `/api/requirements/{rid}/comments` | comment |  |
| POST | `/api/requirements/{rid}/resolve-conflict` | conflict.resolve | Never auto-picks the newest side; a reason is mandatory and stored in history (หัวข้อ 10). |
| POST | `/api/requirements/{rid}/resolve-question` | question.answer |  |
| POST | `/api/requirements/{rid}/review` | req.approve |  |

### runs

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| POST | `/api/automation/{aid}/run` | run.execute |  |
| GET | `/api/projects/{project_id}/test-runs` | run.view |  |
| POST | `/api/projects/{project_id}/test-runs/import` | run.execute |  |
| GET | `/api/test-runs/{rid}` | run.view |  |
| GET | `/api/test-runs/{rid}/artifacts/{art_id}` | run.view |  |
| POST | `/api/test-runs/{rid}/cancel` | run.execute |  |
| GET | `/api/test-runs/{rid}/logs` | run.view | Incremental log streaming: client polls with the last offset it received. |
| POST | `/api/test-runs/{rid}/rerun` | run.execute |  |

### system

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| GET | `/api/health` | public |  |

### test-design

| Method | Path | Permission | คำอธิบาย |
|---|---|---|---|
| GET | `/api/projects/{project_id}/test-cases` | tc.view |  |
| GET | `/api/projects/{project_id}/test-cases/export` | tc.export |  |
| POST | `/api/projects/{project_id}/test-cases/generate` | tc.edit |  |
| GET | `/api/projects/{project_id}/test-scenarios` | tc.view |  |
| POST | `/api/projects/{project_id}/test-scenarios/generate` | scenario.edit |  |
| GET | `/api/projects/{project_id}/traceability` | req.view |  |
| POST | `/api/test-cases/bulk-status` | tc.approve |  |
| GET | `/api/test-cases/{tid}` | tc.view |  |
| PATCH | `/api/test-cases/{tid}` | tc.edit |  |
| POST | `/api/test-cases/{tid}/approve` | tc.approve |  |
| POST | `/api/test-cases/{tid}/comments` | comment |  |
| POST | `/api/test-cases/{tid}/new-version` | tc.edit | Approved test case stays readable; v+1 is unlocked as REVISED and must be re-approved (หัวข้อ 16). |
| POST | `/api/test-cases/{tid}/status` | tc.approve | Reject (→ WAITING_FOR_REVIEW), NEEDS_CLARIFICATION, READY_FOR_AUTOMATION, DEPRECATED. |
| PATCH | `/api/test-scenarios/{sid}` | scenario.edit |  |
| POST | `/api/test-scenarios/{sid}/test-cases/generate` | tc.edit |  |

## ตัวอย่าง (PowerShell)

```powershell
$r = Invoke-RestMethod -Method Post http://localhost:3000/api/auth/login -ContentType 'application/json' -Body '{"username":"admin","password":"<password>"}'
$h = @{ Authorization = "Bearer $($r.access_token)" }
Invoke-RestMethod http://localhost:3000/api/projects -Headers $h
```
