# ที่เก็บข้อมูล และข้อจำกัดของเว็บไซต์ต้นแบบ

## ที่เก็บข้อมูล

| ข้อมูล | ตำแหน่ง |
|---|---|
| Project, Requirement, Test Case, Code, Run, Audit | IndexedDB ของเบราว์เซอร์ `brs-qa-platform` → `kv` → `state` |
| Chrome (Windows 11) | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\IndexedDB\` |
| Edge (Windows 11) | `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\IndexedDB\` |
| ไฟล์ที่ดาวน์โหลด (Excel, ZIP, Log, Backup) | `C:\Users\<ชื่อผู้ใช้>\Downloads` |
| Session | sessionStorage (หายเมื่อปิดแท็บ / Timeout 30 นาที) |
| ไฟล์ BRS ต้นฉบับ | ไม่ได้เก็บทั้งไฟล์ — เก็บข้อความ Section, ตาราง, รูป, SHA-256 |

แนะนำ: Export Backup JSON แล้วเก็บที่ `C:\Cludaemek\WebQA2026\storage\exports\`

## ข้อจำกัดเทียบ Master Prompt

- ไม่มี Backend/PostgreSQL — ใช้ IndexedDB
- Run = Browser Rule Engine; Pytest จริงต้องรันบนเครื่องแล้ว Import JUnit XML
- Claude AI ผ่านบัญชี claude.ai ของผู้ใช้ ไม่มี API Key
- GitHub Execute = ZIP + คำสั่ง git
- Playwright Exploration ใช้ HTML ที่ผู้ใช้วาง
- JMeter ยังไม่มี Run
- Editor แบบเรียบง่ายแทน Monaco
- เขียนไฟล์ลงโฟลเดอร์ที่กำหนดไม่ได้ (Sandbox ของเบราว์เซอร์)
- Network Sharing ต้องใช้ Backend
