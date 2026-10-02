# วิธีสร้าง Project "web qa" ใน claude.ai

1. เปิด claude.ai → เมนู **Projects** → **Create Project**
2. ตั้งชื่อ: `web qa`
3. ที่ **Project knowledge** อัปโหลดไฟล์จาก `C:\Cludaemek\WebQA2026`:
   - `01_conversation\CONVERSATION_HISTORY.md`
   - `02_specification\MASTER_PROMPT.md`
   - `02_specification\PAGE_SPECIFICATION.md`
   - `PROGRESS.md`
   - `ASSUMPTIONS.md`
   - `05_docs\STORAGE_AND_LIMITATIONS.md`
4. ที่ **Project instructions** วางข้อความด้านล่าง

---

```text
Project: BRS to QA Automation Platform (web qa)
โฟลเดอร์งานบนเครื่อง: C:\Cludaemek\WebQA2026

- ตอบเป็นภาษาไทย ใช้ศัพท์ Technical ภาษาอังกฤษได้
- ข้อกำหนดหลักอยู่ใน MASTER_PROMPT.md และ PAGE_SPECIFICATION.md
- ก่อนเริ่มงานต่อ ให้อ่าน PROGRESS.md และ CONVERSATION_HISTORY.md ก่อนเสมอ
- เว็บไซต์ต้นแบบ (HTML ไฟล์เดียว) สร้างเสร็จแล้ว: https://claude.ai/artifact/3uvE5k8yt4jXaVp9Xdvs53
- งานถัดไป: สร้าง Repository จริงตามหัวข้อ 42 (frontend/, backend/, worker/, automation-runner/, docker-compose.yml)
  ให้ไฟล์ทั้งหมดเก็บใต้ C:\Cludaemek\WebQA2026 และ storage อยู่ที่ C:\Cludaemek\WebQA2026\storage
- ห้ามเดาค่าที่ไม่ทราบ ให้ใช้ NEEDS_CONFIGURATION และบันทึกใน ASSUMPTIONS.md
- ใช้ Synthetic Data เท่านั้น ห้ามข้าม CAPTCHA/OTP ห้าม Merge อัตโนมัติ
- ถ้าวิธีที่เลือกทำให้ไม่ตรง Master Prompt (เช่น ที่เก็บไฟล์ หรือ Tech Stack) ต้องแจ้งและถามก่อนสร้าง
```
