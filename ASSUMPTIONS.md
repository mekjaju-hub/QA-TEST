# ASSUMPTIONS.md

| หัวข้อ | สถานะ | ค่าที่ใช้ตอนนี้ / ที่ตั้งค่า |
|---|---|---|
| API Authentication ของระบบที่ทดสอบ | NEEDS_CONFIGURATION | Postman: เลือก Auth Type ได้ 6 แบบ ค่าเริ่มต้น `none` = NEEDS_CONFIGURATION · Pytest: `.env` (`AUTH_TYPE`, `API_TOKEN`) |
| Endpoint / HTTP Method ของ API | NEEDS_CONFIGURATION | Variable `{{endpoint_tc_...}}`, POST เป็นค่าเริ่มต้นที่ต้องแก้ |
| ชื่อ Table/Column ใน MySQL | NEEDS_CONFIGURATION | Placeholder `{{table_name}}` ฯลฯ (ติดป้าย AI ASSUMPTION ใน SQL) |
| Base URL / Environment | NEEDS_CONFIGURATION | `ENV_ALLOWLIST=https://sit.example.test,https://uat.example.test` (.env / Settings) |
| Production URL | ไม่ทราบ — Block โดยค่าเริ่มต้น | Host ที่มี prod/production/prd/www ถูก Block ใน JMeter |
| Exact BRS Format | ไม่ทราบ | แบ่ง Section จาก Heading style (DOCX), หัวข้อเลข (1., 2.1), Markdown (#), Worksheet (XLSX) |
| เลขหน้าใน DOCX | ไม่มีในไฟล์ | Source Page = NOT_FOUND ใช้ Section แทน |
| Timezone | AI ASSUMPTION - NOT FOUND IN BRS | Asia/Bangkok (UTC+07:00) |
| การปัดเศษเงิน | AI ASSUMPTION - NOT FOUND IN BRS | 2 ตำแหน่ง ROUND_HALF_UP |
| Calendar/Business Day | AI ASSUMPTION - NOT FOUND IN BRS | Calendar Day, Inclusive |
| Claude Model | NEEDS_CONFIGURATION | `CLAUDE_MODEL` ใน .env (ว่าง = Rule Engine) |
| GitHub Owner/Repository/Token | NEEDS_CONFIGURATION | Connect ในหน้า GitHub · `GITHUB_TOKEN` ใน .env |
| Session | ตัดสินใจ | Bearer Token ใน sessionStorage (ไม่ใช้ Cookie → ไม่ต้อง CSRF), Idle 30 นาที |
| Secret ค่าเริ่มต้น | ตัดสินใจ | ถ้า `.env` ว่าง ระบบสุ่ม `SECRET_KEY`/`RUNNER_TOKEN` เก็บที่ `storage\secrets\` |
| Newman / JMeter / Playwright Headed Run | Optional Integration | สร้างไฟล์ + Import ผล (Newman) + Approval (JMeter) + CLI Exploration บนเครื่องผู้ใช้ |
| Vision Model สำหรับรูปหน้าจอ | ปิดโดยค่าเริ่มต้น | รูปเป็น Evidence สถานะ NEEDS_VISUAL_REVIEW |
| ตำแหน่งโฟลเดอร์ | กำหนดโดยผู้ใช้ | `C:\Cludaemek\WebQA2026`, Storage `C:\Cludaemek\WebQA2026\storage` |
