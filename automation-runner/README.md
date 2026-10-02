# automation-runner

Restricted executor for generated Pytest projects (หัวข้อ 20) + user-controlled website exploration (หัวข้อ 23).

| ไฟล์ | หน้าที่ |
|---|---|
| `runner/validate.py` | ตรวจไฟล์ก่อน Run: ชนิดไฟล์, Path, ขนาด, Secret, AST deny-list (subprocess/socket/ctypes/os.system/eval…), Node ID whitelist |
| `runner/sandbox.py` | Workspace ชั่วคราว → `python -m pytest` (argv คงที่) + rlimit CPU/RAM/FSIZE/NPROC, Timeout, Output cap, Clean env, Cancel, เก็บ junit/html/screenshot |
| `runner/results.py` | Parser JUnit XML / Newman JSON → PASSED / FAILED / BLOCKED + Test Case ID |
| `runner/service.py` | HTTP service ภายใน (Docker `runner:8100`) ป้องกันด้วย `X-Runner-Token` |
| `runner/explore.py` | CLI เปิด Browser แบบ Headed ให้ผู้ใช้ Login เอง แล้วบันทึกเฉพาะ DOM/Accessibility tree ของหน้าที่อนุญาต |

## ใช้งาน

- Docker: Backend เรียก `RUNNER_URL=http://runner:8100` (ตั้งไว้ใน docker-compose.yml)
- Dev Mode: `RUNNER_URL=` ว่าง → Backend import `runner/` จากโฟลเดอร์นี้และรันในเครื่อง

## Exploration (Headed, บนเครื่องผู้ใช้)

```powershell
cd C:\Cludaemek\WebQA2026\automation-runner
..\.venv\Scripts\pip install playwright
..\.venv\Scripts\python -m playwright install chromium
..\.venv\Scripts\python -m runner.explore --url https://sit.example.test --browser msedge
```

Login เอง (รวม OTP/CAPTCHA) → ไปหน้าที่ต้องการ → กด Enter → ได้ `storage\runs\explore\dom_*.html` → วางใน Playwright Generator → Locator Advisor → อนุมัติ Locator → Generate

## Test

```powershell
..\.venv\Scripts\python -m pytest -q
```
