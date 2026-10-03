# คู่มือการใช้งาน (ภาษาไทย)

## ภาพรวม Workflow

```
อัปโหลด BRS → ระบบแยก Section/Requirement → QA Review → (Needs Clarification ↔ BA ตอบ) / (Conflict ↔ Resolve)
→ Approve Requirement → Test Scenario → Test Case → QA Approve (Lock) → Generate Automation → Run → Dashboard
```

ห้ามสร้าง Automation จาก Test Case ที่ยังไม่ Approved (ยกเว้นเลือก **Generate Draft Code** ซึ่งจะติดป้าย DRAFT)

## บทบาท (Role)

| Role | ทำอะไรได้ |
|---|---|
| Admin | ทุกอย่าง + จัดการผู้ใช้, Settings, Audit Log |
| QA Manual | อัปโหลด BRS, แก้/Approve Requirement, ตอบ Assumption, สร้าง/แก้/Approve Test Case, Export Excel, อ่าน Code + Tips |
| QA Automation | ใช้ Test Case ที่ Approved สร้าง Python/Pytest/Postman/SQL/Playwright/JMeter, Run Test, GitHub Proposal |
| Business Analyst | อ่าน Requirement/Test Case, ตอบและ Resolve Clarification, Resolve Conflict, Comment, ดู Traceability |

เมนูที่ไม่มีสิทธิ์จะถูกซ่อน และ Backend ตรวจสิทธิ์ซ้ำทุกครั้ง

## 1. เข้าสู่ระบบ

เปิด <http://localhost:3000> → Username/Password → ครั้งแรกต้องเปลี่ยนรหัสผ่าน · ระบบ Logout อัตโนมัติเมื่อไม่ใช้งานเกิน 30 นาที

## 2. Project

เมนู **Projects** → *Create Project* (Admin) · Project Code (ตัวพิมพ์ใหญ่) เป็นส่วนหนึ่งของทุก ID เช่น `REQ-CAM-RULE3-001` และแก้ไม่ได้หลังมี Requirement

## 3. อัปโหลด BRS (เมนู เอกสาร → Upload)

- ลากไฟล์ DOCX / XLSX / CSV / PDF (เลือกข้อความได้) / TXT ได้หลายไฟล์ หรือแท็บ **Paste Text**
- เลือก *เอกสารใหม่* หรือ *Version ใหม่ของเอกสารเดิม* (ใช้เปรียบเทียบ Version)
- เลือกวิธีวิเคราะห์: Rule Engine (Offline) หรือ Claude AI (ถ้า Admin ตั้งค่า)
- ไฟล์ผิดชนิด/ใหญ่เกิน/เสีย จะแสดง Error เฉพาะไฟล์นั้น ไฟล์อื่นยังอัปโหลดต่อ

## 4. Processing

แสดงขั้นตอน Uploaded → Extracting → … → Ready for Review พร้อม Progress ราย Section
- **Retry Section** / **Retry Failed Only** — ทำซ้ำเฉพาะ Section ที่ Fail (ไม่เริ่มใหม่ทั้งเล่ม)
- **Cancel Job** / **Resume Job** — Resume ทำต่อจาก Section ที่ยังไม่เสร็จ
- **Download Processing Log**
- รูปหน้าจอในเอกสารถูกเก็บเป็น Evidence สถานะ *NEEDS_VISUAL_REVIEW* (ระบบไม่เดาข้อความในรูป)
- DOCX ไม่มีเลขหน้า → Source Page = NOT_FOUND (ใช้ Section แทน)

## 5. Requirement Explorer

- Filter: Type, Status, Score, Conflict, Needs Clarification, แสดง Version เก่า · Search
- ซ้าย = Source (Highlight ค่าที่ใช้), กลาง = Requirement, ขวา = AI Analysis (Completeness/Clarity พร้อมเหตุผล ✓/✗)
- ปุ่ม: ดู Source Section/Table, ดู Screenshot, Traceability, **Edit** (สร้าง Version ใหม่ + เหตุผล), Review, **Approve**, Comment
- เลือก 2 รายการแล้วกด **Compare** เพื่อดูจุดที่ต่างกัน
- Approve ไม่ได้ถ้ายังมี Clarification ค้างหรือ Conflict

## 6. Clarification & Conflict Center

- **Questions**: BA กด *ตอบ* (อัปเดตฟิลด์ได้ เช่น Role) → *Resolve Clarification*
- **Assumptions**: ป้าย `AI ASSUMPTION - NOT FOUND IN BRS` — QA แก้ไข/ยอมรับ/ปฏิเสธ (Assumption ที่ยอมรับจะติดไปใน Test Case แต่ไม่ถือเป็น Requirement)
- **Conflicts**: เทียบ 2 ฝั่งพร้อม Highlight → เลือกฝั่งที่ถูก หรือ "ไม่ขัดแย้ง" พร้อม **เหตุผลบังคับ** (ระบบไม่เลือกฝั่งล่าสุดเอง)

## 7. Test Scenario → Test Case

- Test Scenarios → **Generate Scenarios** (จาก Requirement ที่ Approved; ไม่สร้างซ้ำ) → เลือก → **สร้าง Test Case**
- Test Cases: Search/Filter/Sort, **แก้ไขในตาราง** (บันทึกพร้อมเหตุผล), **Approve** หลายรายการ, Needs Clarification, **Export Excel** (10 Sheet)
- Test Case Detail: Business Explanation, Given/When/Then, Steps (แก้ได้ก่อน Approve), Test Data (ค่าขอบ), Priority/Risk พร้อมเหตุผล, Version History, Comments & Approvals
- Approved = 🔒 Lock · ต้องกด **Create New Version** (เก็บ Version เดิมไว้อ่าน) และ Approve ใหม่

## 8. Automation (Python / Pytest / Postman / SQL / Playwright / JMeter)

1. เลือก Test Case (Approved) → ตั้งค่า → **Generate**
2. ดู Code ใน Editor (Monaco) + **Code Tips ภาษาไทย** ด้านขวา (จุดประสงค์, Input, Output, เหตุผล, อธิบาย, Test Case, ข้อควรระวัง, สิ่งที่ต้องแก้ก่อน Run)
3. Copy · Download File · **Download Project ZIP** · แก้ Code Draft → บันทึก · **Code Diff** · **Reset กลับ AI Version**
4. Pytest/Python: กด **Run** → ไปหน้า Test Run

- Postman: Auth ไม่ทราบให้เลือก NEEDS_CONFIGURATION · SQL: MySQL Read-only + Placeholder
- Playwright: Page Object Model; OTP/CAPTCHA เป็น Manual Checkpoint; **Locator Advisor** (วาง DOM ที่อนุญาต) / **แปลง Recorded Flow**; สำรวจเว็บแบบ Headed บนเครื่อง: `python -m runner.explore --url https://sit…`
- JMeter: ต้องอยู่ใน Allowlist, ไม่ใช่ Production, ไม่เกิน Limit, ยืนยัน URL และ Approve Plan

## 9. Test Runs

- รายการ Run + **Import Result** (JUnit XML จาก pytest, Newman JSON จาก Postman)
- รายละเอียด: Pass/Fail/Blocked (Blocked = Test ที่ต้องตั้งค่าระบบจริง), Results เชื่อม Test Case, **Logs** (สด), Evidence (junit.xml, report.html, screenshot), **Cancel**, **Re-run**, **Retry Failed Only**

## 10. Version Compare & Impact

เมนู Version Compare → เลือกเอกสาร v1 → v2 → แท็บ Section Diff และ **Impact Proposals** (No Impact / Review Required / Update Required / New Test Required / Deprecation Candidate) → QA อนุมัติ/ปฏิเสธ · Test Case ที่ Approved จะไม่ถูกแก้อัตโนมัติ

## 11. GitHub

Connect Repository → สร้าง Proposal (Branch + Commit + PR หรือ สร้าง Repository) → ดู Preview (Files, Diff, Commit message) → **Approve** → **Execute** · ไม่มี Merge อัตโนมัติ · ไฟล์ Secret ถูก Block

## 12. Traceability

เปิดจาก Requirement หรือ Test Case → Document → Version → Section → Requirement → Scenario → Test Case → Artifacts → Run → Result

## 13. Admin

- **Settings**: ผู้ใช้/Role, AI Provider, Runner Limits, GitHub, Environment Allowlist, Network Sharing (มีคำเตือน), Session
- **Audit Log**: ค้นหา/กรอง/Export CSV (ข้อมูลลับถูก Mask)

## 14. Web Explorer (โหมดฝึก Automation)

เมนู **ฝึก Automation → Web Explorer** ใช้ฝึกการสังเกตหน้าเว็บและเขียน Automation Test โดยไม่ต้องมี BRS

1. ใส่ URL เช่น `https://www.example.com/login` (ใส่ Username/Password ของ **บัญชีทดสอบ** ถ้าอยากให้ลอง Login และดูหน้าหลัง Login)
2. กด **สำรวจหน้าเว็บ** ระบบเปิด browser อัตโนมัติ ถ่ายภาพ และสรุปสิ่งที่เห็น
3. แท็บ ① **สิ่งที่เห็น**: เปิด "โหมดฝึก" ไว้ แล้วจดสิ่งที่สังเกตและ Test Case ที่คิดได้ก่อน → กด **ดูเฉลย**
4. แท็บ ② **Test Cases**: เทียบกับที่คิดไว้ ทุกข้อมีชื่อฟังก์ชัน pytest คู่กัน
5. แท็บ ③ **pytest + รัน**: อ่านโค้ด กด **Run pytest** เพื่อรันจริง (headless) หรือดาวน์โหลด ZIP ไปเปิดใน VS Code
6. แท็บ ④ **เรียนรู้ pytest**: อธิบาย pytest, Arrange-Act-Assert, Locator, expect, fixture, Page Object และแบบฝึกหัด

**ประวัติและ Test Case ไม่ซ้ำ (Web History)**

- ทุกครั้งที่สำรวจ ระบบเก็บ Test Case เข้าประวัติของหน้านั้น และให้รหัสถาวร WP-xxx
- สำรวจหน้าเดิมซ้ำ ระบบจะออกแบบ Test Case **แบบใหม่ที่หน้านั้นยังไม่เคยมี** เพิ่มให้ตามจำนวนที่ตั้ง (ช่อง "ออกแบบ Test Case ใหม่เพิ่ม") ตารางจะมีป้าย "ใหม่" หรือ "เคยมีแล้ว"
- เมนู **Web History** ดู Test Case สะสมทั้งหมดของแต่ละหน้า ผลรันล่าสุด ไทม์ไลน์การสำรวจ ดาวน์โหลด pytest รวมทุกข้อ (ZIP) หรือ Export CSV ไปเปิดใน Excel

**กดสำรวจ (Click Explore)**

- ติ๊ก "กดสำรวจ" ระบบจะกดปุ่ม/ลิงก์ที่ปลอดภัยทีละอัน (สูงสุดตามจำนวนที่ตั้ง) แล้วบอกว่ากดแล้วเกิดอะไรขึ้น พร้อมภาพหลังกด และสร้าง Test Case พฤติกรรม (TC-CLICK) ให้
- ไม่กดปุ่มชำระเงิน/ซื้อ/Checkout, ลบ, ส่ง/ยืนยัน/บันทึก, ออกจากระบบ, สร้าง/อนุมัติ และไม่ไปเว็บอื่น · ระหว่างกดระบบยกเลิกการส่งข้อมูลไป server ทั้งหมด — แต่ยังควรใช้กับเว็บทดสอบเท่านั้น

**คลัง Test Case รวม (ทุกเว็บไซต์)**

- Web History → แท็บ "คลัง Test Case รวม": Test Case จากทุกเว็บต่อกันเป็นรายการเดียว ไม่มีข้อซ้ำ (รหัส TL-xxx) แต่ละข้อบอกว่าพบในหน้าไหน (WP-xxx) กดชื่อหน้าเพื่อไปดูรายละเอียด
- กรองตามหมวด Login / หลัง Login / กดปุ่ม/ลิงก์ / กรอกข้อมูล / Dropdown / หน้าเว็บ, ค้นหาข้อความ, เลือกเว็บไซต์, ผลรัน
- ส่งเข้า Google Sheets: กด "คัดลอกไปวางใน Google Sheets" → ชีตใหม่จะเปิดขึ้น → คลิกช่อง A1 → Ctrl+V · หรือดาวน์โหลด .xlsx แล้วใน Google Sheets เลือก File → Import → Upload

**บันทึกการใช้งานเป็น Test Case (Record)**

1. Web Explorer → ปุ่ม **บันทึกการใช้งาน (Record)** → ใส่ URL หน้าเริ่มต้น → **เริ่มบันทึก** — หน้าต่าง browser จะเปิดขึ้นบนเครื่อง
2. ใช้งานเว็บในหน้าต่างนั้นตามปกติ เช่น กดปุ่มลงทะเบียน → กรอกแต่ละช่อง → กด Submit → เจอ popup — ขั้นตอนจะขึ้นในหน้า WebQA แบบสด
3. กด **หยุดบันทึกและสร้าง Test Case** → ได้สถานการณ์ทดสอบ (TC-REC-01) + กรณีไม่กรอกข้อมูล (TC-REC-02) + pytest กด Run เพื่อเล่นซ้ำได้ทันที
4. รหัสผ่านไม่ถูกบันทึก · Test ที่ได้ **ทำรายการจริงซ้ำ** ตอนรัน — ใช้กับเว็บทดสอบเท่านั้น

**Record แบบควบคุมได้ + Test Automation**

- ระหว่างบันทึก: **⏸ หยุด** (ทำอะไรก็ไม่ถูกบันทึก) → **▶ เริ่มต่อ** · **+ Add Test Case** เริ่ม Test Case ใหม่ต่อจากจุดเดิม · **ตรวจสอบข้อความ** พิมพ์คำแล้วเลือก "ต้องเห็น/ต้องไม่เห็น" · **บันทึก** เพื่อสร้าง Test Case
- แท็บ **Script ทีละขั้น**: แต่ละขั้นบอกว่าปุ่ม/ช่องอยู่ตรงไหน ใช้คำสั่งอะไร และคำสั่งนั้นหมายความว่าอะไร
- แท็บ **Test Automation (เล่นซ้ำ)**: กด ▶ เล่นซ้ำ แล้ว browser จะทำตามที่บันทึกครบทุกขั้นให้ดู พร้อมกรอบแดงบอกตำแหน่งและผลตรวจทุกขั้น

ข้อควรรู้: ระบบไม่บันทึกรหัสผ่าน ไม่แก้ CAPTCHA/OTP ให้ ลอง Login เพียง 1 ครั้งต่อการสำรวจ และควรใช้กับเว็บที่ได้รับอนุญาตให้ทดสอบเท่านั้น
ลองกับระบบนี้เองได้: `http://127.0.0.1:3000/login`

## สีสถานะ

ฟ้า = ข้อมูล · เขียว = Approved/Passed · ส้ม = รอ Review/Assumption · แดง = Conflict/Failed · ม่วง = AI-generated · เทา = Draft/Inactive
