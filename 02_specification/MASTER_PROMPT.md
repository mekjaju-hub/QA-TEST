# Master Prompt — BRS to QA Automation Platform

> ต้นฉบับที่ผู้ใช้ส่งมาในข้อความแรกของการสนทนา (30 ก.ย. 2026) — เก็บไว้ตามต้นฉบับ

```text
คุณคือ Principal Software Architect, Senior Full-stack Engineer, QA Automation Architect,
Business Analyst และ AI Document Intelligence Engineer

ภารกิจของคุณคือออกแบบและสร้างระบบ Full-stack ชื่อ:

BRS to QA Automation Platform

ระบบต้องเป็น Production-ready MVP ที่สามารถใช้งานจริงบน Windows 11 แบบ Local-first
โดยผู้ใช้หลักสามารถเปิดระบบผ่าน Browser บนเครื่องตนเอง และสามารถเลือกเปิดให้บุคคลอื่น
ในเครือข่ายเดียวกันเข้ามาดูระบบได้

อย่าสร้างเพียง UI Mockup หรือ Static Prototype
ระบบต้องมี Frontend, Backend, Database, Document Processing, AI Integration,
Background Jobs, Test Runner, File Export, Logging, Error Handling และคู่มือใช้งาน

==================================================
1. เป้าหมายหลักของระบบ
==================================================

สร้างเว็บไซต์ที่รองรับ Workflow ต่อไปนี้:

1. ผู้ใช้อัปโหลดเอกสาร BRS
2. ระบบอ่านและแยกเนื้อหาออกเป็น Section
3. ระบบค้นหาและสร้าง Requirement ID ใหม่
4. ระบบจำแนก Requirement
5. ระบบตรวจสอบ Requirement ที่ไม่ชัดเจน
6. ระบบตรวจสอบ Requirement ที่ขัดแย้งกัน
7. ระบบสร้างคำถามเพื่อส่งให้ Business Analyst
8. ระบบสร้าง Assumption เพื่อให้ QA ตรวจสอบ
9. ระบบสร้าง Test Scenario
10. ระบบสร้าง Test Case แบบ Step-by-step
11. QA Manual ตรวจสอบและแก้ไข Test Case
12. QA อนุมัติ Test Case
13. ระบบแปลง Test Case ที่อนุมัติแล้วเป็น Python
14. ระบบแปลง Test Case เป็น Pytest
15. ระบบแสดงคำอธิบายว่าแต่ละส่วนของ Code ใช้ทำอะไร
16. ระบบ Run Python และ Pytest จากหน้าเว็บไซต์
17. ระบบแสดงผล Test Run บน Dashboard
18. รองรับการสร้าง Postman Test
19. รองรับการสร้าง SQL Template
20. รองรับการสร้าง Playwright Automation
21. รองรับ GitHub Integration
22. รองรับ GitHub Actions
23. รองรับการสร้าง JMeter Test Plan
24. รองรับ BRS Version Comparison และ Impact Analysis

Workflow หลักต้องเป็น:

AI Draft
→ QA Review
→ Needs Clarification หรือ Approved
→ Generate Automation
→ Run Test
→ Review Result

ห้ามสร้าง Automation Code จาก Test Case ที่ยังไม่ได้รับการอนุมัติ
เว้นแต่ผู้ใช้เลือก Generate Draft Code อย่างชัดเจน

==================================================
2. กลุ่มผู้ใช้งาน
==================================================

ระบบต้องรองรับ Role ต่อไปนี้:

1. Admin
2. QA Manual
3. QA Automation
4. Business Analyst

สิทธิ์ของแต่ละ Role:

Admin:
- จัดการผู้ใช้
- จัดการ Project
- ตั้งค่า AI
- ตั้งค่า Test Runner
- ตั้งค่า GitHub
- ตั้งค่า Environment
- ดู Audit Log
- แก้ไขทุกข้อมูล

QA Manual:
- อัปโหลด BRS
- อ่าน Requirement
- ตรวจคำถามและ Assumption
- สร้างและแก้ไข Test Scenario
- สร้างและแก้ไข Test Case
- Review Test Case
- Approve Test Case
- อ่าน Python Code
- อ่าน Code Tips
- Export Excel

QA Automation:
- ใช้งาน Test Case ที่ Approved แล้ว
- สร้าง Python
- สร้าง Pytest
- Run Test
- สร้าง Postman
- สร้าง SQL Template
- สร้าง Playwright
- สร้าง GitHub Repository
- สร้าง JMeter Test Plan
- ดู Test Report และ Evidence

Business Analyst:
- อ่าน Requirement
- อ่านคำอธิบายว่า Test Case แต่ละข้อกำลังตรวจอะไร
- ตอบ Clarification Question
- ตรวจ Assumption
- ดู Conflict
- ดู Traceability
- Comment ได้
- ไม่มีสิทธิ์แก้ Automation Code หากไม่ได้รับสิทธิ์เพิ่ม

ระบบ Version แรกให้ใช้ Local Account สำหรับ Development
แต่ Architecture ต้องรองรับการเปลี่ยนเป็น Microsoft Entra ID หรือ SSO ในอนาคต

==================================================
3. รูปแบบการติดตั้ง
==================================================

ระบบต้องทำงานบน Windows 11

รูปแบบการใช้งาน:

- Local-first
- ใช้งานหลักโดยผู้ใช้หนึ่งคน
- เปิดผ่าน localhost
- สามารถตั้งค่า Host เป็น 0.0.0.0 เพื่อให้บุคคลอื่นใน Local Network เข้ามาดูได้
- ต้องมีคำเตือนด้าน Security ก่อนเปิด Network Sharing
- ต้องกำหนด Port ผ่าน Environment Variable
- ต้องมี Session Timeout
- ต้องมี Login
- ต้องมี Role-based Access Control
- ห้ามเปิดเผย Secret ผ่าน Frontend
- ห้ามเก็บ Password เป็น Plain Text
- ต้อง Hash Password ด้วย Argon2 หรือ bcrypt

รองรับการติดตั้งด้วย Docker Compose เป็นวิธีหลัก

ต้องมีคำสั่งอย่างน้อย:

docker compose up -d
docker compose down
docker compose logs -f
docker compose restart

และต้องมีวิธี Development Mode ที่ไม่ใช้ Docker หากจำเป็น

==================================================
4. Technology Stack
==================================================

ใช้ Technology Stack ต่อไปนี้:

Frontend:
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Query หรือ TanStack Query
- React Hook Form
- Zod
- Monaco Editor สำหรับ Code Preview

Backend:
- Python
- FastAPI
- SQLAlchemy
- Pydantic
- Alembic
- Uvicorn

Database:
- PostgreSQL สำหรับ Application Database
- ออกแบบ SQL Generator ให้สร้าง Template สำหรับ MySQL

Background Processing:
- Redis
- Celery หรือ Dramatiq
- งานอ่านเอกสาร 100-200 หน้า ต้องทำผ่าน Background Job
- รองรับ Job Retry
- รองรับ Retry เฉพาะ Section ที่ล้มเหลว
- รองรับ Resume
- รองรับ Progress Tracking
- รองรับ Cancel Job

Document Storage:
- Local storage สำหรับ Development
- สร้าง Storage Interface เพื่อรองรับ MinIO หรือ Azure Blob ในอนาคต

AI:
- Claude API
- เก็บ API Key ใน Environment Variable
- ห้ามส่ง API Key ไป Frontend
- สร้าง AI Provider Interface เพื่อรองรับ Model อื่นในอนาคต
- บันทึก Model Name, Prompt Version, Input Hash, Output และ Token Usage หาก API รองรับ

Test Runner:
- Python subprocess ภายใน Restricted Workspace
- Pytest
- Playwright
- Newman เป็น Optional Integration
- JMeter เป็น Optional Integration
- จำกัด CPU, RAM, Execution Time และ Output Size
- ห้าม Run Arbitrary Command ที่ผู้ใช้กรอกเองโดยไม่มี Validation

Git:
- GitHub
- GitHub Actions
- ใช้ GitHub Personal Access Token หรือ GitHub App ผ่าน Backend เท่านั้น
- ห้าม Merge อัตโนมัติ
- ทุก Push, Branch, Pull Request หรือ Repository Action ต้องให้ผู้ใช้อนุมัติก่อน

==================================================
5. ประเภทไฟล์ที่ระบบต้องรองรับ
==================================================

รองรับ Input ต่อไปนี้:

- DOCX
- XLSX
- CSV
- PDF ที่เลือกข้อความได้
- TXT
- ข้อความแบบ Copy/Paste

เอกสารหนึ่ง Project อาจมีหลายไฟล์

ขนาด BRS ปกติอยู่ที่ 100-200 หน้า

ระบบต้องอ่านข้อความจาก:

- เนื้อหาปกติ
- Heading
- ตาราง
- หมายเหตุ
- รูปภาพหน้าจอ
- Caption
- Worksheet ใน Excel
- Cell comments หากมี

สำหรับรูปภาพหน้าจอ:

- Extract รูปภาพออกจากเอกสาร
- แสดงเป็น Evidence ของ Requirement
- ใช้ Vision Model วิเคราะห์ได้ถ้าผู้ใช้เปิดใช้งาน
- หากยังไม่ได้เปิด Vision Model ให้บันทึกรูปและสร้างสถานะ Needs Visual Review
- ห้ามเดาข้อความที่มองไม่เห็นจากรูปภาพ
- ต้องแยกข้อมูลที่อ่านข้อความได้ออกจากข้อมูลที่ AI อนุมาน

PDF Version แรกไม่จำเป็นต้องรองรับ PDF Scan หรือ OCR
แต่ Architecture ต้องสามารถเพิ่ม OCR Provider ในอนาคต

==================================================
6. Document Processing Pipeline
==================================================

สร้าง Pipeline ดังนี้:

Step 1: Upload
- ตรวจชนิดไฟล์
- ตรวจขนาดไฟล์
- สร้าง SHA-256 checksum
- ป้องกันชื่อไฟล์อันตราย
- ป้องกัน Path Traversal
- บันทึก Metadata

Step 2: Extract
- DOCX: อ่าน Paragraph, Heading, Table, Note และ Embedded Image
- XLSX: อ่าน Workbook, Sheet, Cell, Table, Comment และ Merge Cell
- CSV: ตรวจ Encoding และ Delimiter
- PDF: Extract Text พร้อม Page Number
- TXT: ตรวจ Encoding
- Paste Text: บันทึกเป็น Virtual Document

Step 3: Normalize
- รักษาเลขหน้า
- รักษา Section
- รักษา Table Structure
- รักษา Source Reference
- ลบ Header/Footer ที่ซ้ำโดยไม่ทำลายเนื้อหาหลัก
- Normalize whitespace
- Normalize Thai/English mixed text
- ห้ามแก้เนื้อหาต้นฉบับโดยไม่มี Original Text เก็บไว้

Step 4: Chunk
- แบ่งตาม Section
- รองรับ Chunk overlap
- ไม่ตัด Table กลางแถว
- ไม่ตัด Business Rule กลางประโยค
- ทุก Chunk ต้องมี Document ID, Version, Page, Section และ Sequence

Step 5: AI Analysis
- วิเคราะห์ทีละ Section
- บันทึกผลแต่ละ Section ทันที
- หาก Section ใดล้มเหลว ให้ Retry เฉพาะ Section นั้น
- ผู้ใช้สามารถ Run ใหม่เฉพาะ Section ที่ Fail
- ห้ามเริ่มใหม่ทั้งเล่มโดยไม่จำเป็น

==================================================
7. Requirement Extraction
==================================================

BRS อาจไม่มี Requirement ID
ระบบต้องสร้าง Requirement ID ใหม่ตามรูปแบบ:

REQ-{PROJECT_CODE}-{MODULE_CODE}-{RUNNING_NUMBER}

ตัวอย่าง:

REQ-CAM-TRANSACTION-001
REQ-CAM-RULE3-002

Requirement ต้องแบ่งตาม:

- Requirement ID
- Business Rule
- Process Flow

Requirement Type ที่ต้องรองรับ:

- Field Requirement
- Validation Rule
- Business Rule
- Text Condition
- Process Flow
- Data Requirement
- API Requirement
- Integration Requirement
- Report Requirement
- File Requirement
- Batch Requirement
- UI Requirement

แต่ละ Requirement ต้องเก็บข้อมูล:

- Requirement ID
- Project ID
- Document ID
- Document Version
- Requirement Type
- Module
- Submodule
- Title
- Original Text
- Normalized Text
- Business Rule
- Preconditions
- Input
- Process
- Output
- Expected Result
- Role
- Threshold
- Unit
- Date Range
- Inclusion
- Exclusion
- Source Page
- Source Section
- Source Table
- Source Screenshot
- AI Confidence
- Completeness Score
- Clarity Score
- Status
- Assumption
- Conflict Status
- Created By
- Reviewed By
- Approved By
- Created Date
- Updated Date

==================================================
8. Requirement Quality Analysis
==================================================

ตรวจสอบปัญหาต่อไปนี้:

- Requirement ไม่สมบูรณ์
- ไม่มี Expected Result
- ไม่ระบุ Role
- ไม่มี Threshold
- ไม่มีหน่วย
- ไม่มี Date Range
- ไม่ระบุ Inclusive หรือ Exclusive
- ไม่ระบุการปัดเศษ
- ไม่ระบุ Timezone
- ไม่ระบุ Error Message
- ไม่ระบุ Input
- ไม่ระบุ Output
- ไม่สามารถทดสอบได้
- ขัดแย้งกับ Requirement อื่น
- Requirement ซ้ำ
- คำศัพท์ไม่สอดคล้องกัน

คำนวณคะแนน:

1. Completeness Score
2. Clarity Score

คะแนนต้องอยู่ระหว่าง 0-100

คะแนนต้องมีคำอธิบาย เช่น:

Completeness Score = 65
เหตุผล:
- มี Input
- มี Business Rule
- ไม่มี Expected Result
- ไม่ระบุ Role
- มี Threshold แต่ไม่มีหน่วย

ห้ามแสดงเฉพาะคะแนนโดยไม่มีเหตุผล

==================================================
9. Clarification และ Assumption
==================================================

หาก Requirement ไม่ชัดเจน:

- หยุดสร้าง Test Case สำหรับ Requirement นั้น
- สร้าง Clarification Question ให้ Business Analyst
- สร้าง Assumption Draft ให้ QA ตรวจสอบ
- ตั้ง Status = NEEDS_CLARIFICATION
- แสดง Source Text และ Source Page
- ให้ QA แก้ไข Assumption
- ให้ BA ตอบคำถามได้
- ต้องมีปุ่ม Resolve Clarification
- หลัง Resolve แล้วจึงสร้าง Test Case ได้

ตัวอย่างคำถาม:

- Threshold นี้รวมค่าที่เท่ากับ 200,000 หรือไม่?
- ช่วงย้อนหลัง 14 วันรวมวันเริ่มต้นและวันสิ้นสุดหรือไม่?
- ใช้ Calendar Day หรือ Business Day?
- หากข้อมูลเป็น Null ระบบต้องแสดงอะไร?
- Role ใดมีสิทธิ์ทำรายการนี้?

Assumption ต้องติด Label ชัดเจน:

AI ASSUMPTION - NOT FOUND IN BRS

ห้ามนำ Assumption ไปแสดงเป็น Requirement ที่ยืนยันแล้ว

==================================================
10. Conflict Detection
==================================================

ระบบต้องตรวจ Requirement ที่ขัดแย้งกัน เช่น:

- Threshold คนละค่า
- Role คนละกลุ่ม
- Date Range คนละช่วง
- Expected Result ต่างกัน
- Field Mandatory ใน Section หนึ่ง แต่ Optional ในอีก Section
- Business Rule ใช้สัญลักษณ์ > และ >= ไม่ตรงกัน

เมื่อพบ Conflict:

- แสดง Requirement ทั้งสองฝั่ง
- แสดง Source Page และ Source Section
- Highlight จุดที่ต่างกัน
- ตั้ง Status = CONFLICT
- ห้ามสร้าง Test Case
- ห้ามเลือกข้อมูลล่าสุดโดยอัตโนมัติ
- ต้องให้ QA หรือ BA Resolve ก่อน
- เก็บประวัติการ Resolve
- เก็บเหตุผลในการเลือก Requirement ที่ถูกต้อง

==================================================
11. Test Scenario Generation
==================================================

สร้าง Test Scenario จาก Requirement ที่ผ่าน Review แล้ว

ประเภท Test ที่ต้องรองรับ:

- Positive Test
- Negative Test
- Boundary Test
- Integration Test
- Data Test
- API Test

Test Scenario ต้องเก็บ:

- Test Scenario ID
- Requirement ID
- Scenario Title
- Scenario Description
- Objective
- Test Type
- Priority
- Risk
- Source Page
- Source Section
- AI Rationale
- Status
- Reviewer
- Approval Date

ID รูปแบบ:

TS-{PROJECT_CODE}-{MODULE_CODE}-{RUNNING_NUMBER}

ระบบต้องป้องกัน Duplicate Scenario

==================================================
12. Test Case Generation
==================================================

Test Case ต้องเป็น Step-by-step และมี Test Data ในแต่ละ Step

ทุก Test Case ต้องใช้ Given / When / Then

Test Case ต้องมีข้อมูล:

- Test Case ID
- Test Scenario ID
- Requirement ID
- Title
- Description
- Business Explanation
- Given
- When
- Then
- Preconditions
- Test Data
- Test Steps
- Step Number
- Step Action
- Step Test Data
- Step Expected Result
- Overall Expected Result
- Test Type
- Priority
- Risk
- Automation Candidate
- Automation Tool
- Assumption
- Clarification Reference
- Source Page
- Source Section
- Status
- Reviewer
- Approved By
- Approved Date
- Version

ID รูปแบบ:

TC-{PROJECT_CODE}-{MODULE_CODE}-{RUNNING_NUMBER}

Priority และ Risk ให้ AI ประเมินจาก:

- ผลกระทบต่อ Business
- Compliance
- เงิน
- ข้อมูลลูกค้า
- Core Business Flow
- ความถี่ใช้งาน
- โอกาสเกิดข้อผิดพลาด
- Complexity
- Dependency

AI ต้องอธิบายเหตุผลในการกำหนด Priority และ Risk

Business Explanation ต้องเขียนให้ Business Analyst อ่านเข้าใจง่าย เช่น:

"Test Case นี้ตรวจสอบว่าระบบไม่นำรายการกองทุน PVD
มารวมใน Customer Transaction Monthly Report"

==================================================
13. Boundary Test Generation
==================================================

เมื่อพบ Threshold, Range, Length หรือ Date Boundary ให้สร้างกรณี:

- ต่ำกว่า Boundary
- เท่ากับ Boundary
- สูงกว่า Boundary
- ค่าศูนย์
- ค่าว่าง
- Null หากระบบรองรับ
- ชนิดข้อมูลผิด

ตัวอย่าง:

Requirement:
ยอดรวมมากกว่าหรือเท่ากับ 200,000 บาท

สร้าง Test Data:

199,999.99 → Expected: ไม่เข้าเงื่อนไข
200,000.00 → Expected: เข้าเงื่อนไข
200,000.01 → Expected: เข้าเงื่อนไข
0.00 → Expected: ไม่เข้าเงื่อนไข
ว่าง → Expected: Validation Error
"ABC" → Expected: Invalid Data Type

ห้ามสร้าง Boundary ที่ไม่มีหลักฐานจาก BRS
หากต้องเสนอเพิ่มเติมให้ติด Label:

AI RECOMMENDED TEST - NOT EXPLICITLY DEFINED IN BRS

==================================================
14. Negative Test Generation
==================================================

สร้าง Negative Test ตามความเหมาะสม:

- Required field ว่าง
- Null
- Format ไม่ถูกต้อง
- Data Type ไม่ถูกต้อง
- ไม่มีสิทธิ์
- ข้อมูลซ้ำ
- ข้อมูลอยู่นอกช่วงวันที่
- Status ไม่เข้าเงื่อนไข
- Business Exclusion
- API Error
- Missing Header
- Invalid Token
- Database Record ไม่ครบ

ทุก Negative Test ต้องอธิบายว่ามาจาก:

- BRS Explicit Rule
- Derived Boundary
- AI Recommendation
- Existing Validation Rule

==================================================
15. Requirement Traceability
==================================================

สร้าง Traceability Chain:

Document
→ Document Version
→ Section
→ Requirement
→ Test Scenario
→ Test Case
→ Python Function
→ Pytest Function
→ Postman Request
→ SQL Template
→ Playwright Test
→ JMeter Plan
→ Test Run
→ Test Result

ต้องมีหน้า Traceability Viewer แม้ไม่อยู่ใน Main Navigation
สามารถเปิดจาก Requirement หรือ Test Case ได้

ห้ามสร้าง Automation Artifact ที่ไม่สามารถย้อนกลับไปหา Test Case และ Requirement ได้

==================================================
16. Review และ Approval Workflow
==================================================

ใช้ Status:

- DRAFT
- AI_GENERATED
- WAITING_FOR_REVIEW
- NEEDS_CLARIFICATION
- CONFLICT
- REVISED
- APPROVED
- READY_FOR_AUTOMATION
- AUTOMATED
- DEPRECATED

QA เป็นผู้อนุมัติ Test Case

ระบบต้องเก็บ:

- Version
- ผู้สร้าง
- AI-generated หรือ Human-edited
- ผู้แก้ไข
- วันที่แก้ไข
- ค่าเดิม
- ค่าใหม่
- เหตุผล
- Comment
- Approval History

Test Case ที่ Approved แล้วต้องถูก Lock

หากต้องแก้ไข:

- สร้าง Version ใหม่
- Version เดิมยังดูได้
- ต้อง Review และ Approve ใหม่
- ห้ามเขียนทับ Version เดิม

==================================================
17. BRS Version Comparison และ Impact Analysis
==================================================

เมื่ออัปโหลด BRS Version ใหม่:

- เปรียบเทียบกับ Version เดิม
- แสดง Section ที่เพิ่ม
- แสดง Section ที่ถูกลบ
- แสดง Section ที่เปลี่ยน
- แสดง Requirement ที่ได้รับผลกระทบ
- แสดง Test Scenario ที่ได้รับผลกระทบ
- แสดง Test Case ที่ได้รับผลกระทบ
- แสดง Automation Script ที่ได้รับผลกระทบ
- แนะนำรายการที่ต้อง Retest

ห้ามแก้ Test Case ที่ Approved โดยอัตโนมัติ

ให้สร้าง Impact Proposal เช่น:

- No Impact
- Review Required
- Update Required
- New Test Required
- Deprecation Candidate

ต้องให้ QA อนุมัติ Impact Proposal

==================================================
18. Python Generator
==================================================

Python ทำหน้าที่:

- สร้าง Test Data
- ตรวจ Boundary
- สร้าง Utility ให้ Playwright
- แยก Business Logic ออกจาก Test Function
- สร้าง Shared Factory
- สร้าง Shared Fixture
- สร้าง Date Helper
- สร้าง Validation Helper
- สร้าง File Helper
- สร้าง API Helper

ใช้ Architecture:

- Page Object Model สำหรับ UI
- Service Pattern สำหรับ Business/API Logic
- Repository Pattern สำหรับ Database Access
- Test Data Factory
- Configuration Layer
- Environment Layer

Project Structure ตัวอย่าง:

automation_project/
  app/
    models/
    services/
    repositories/
    validators/
    utilities/
  tests/
    unit/
    integration/
    api/
    ui/
    data/
  pages/
  components/
  fixtures/
  test_data/
  config/
  reports/
  screenshots/
  conftest.py
  pytest.ini
  requirements.txt
  README.md
  .env.example
  .gitignore

ระบบต้องมี Monaco Editor สำหรับ Code Preview

ผู้ใช้ต้องสามารถ:

- ดู Code
- Copy Code
- Download File
- Download Project ZIP
- แก้ Code Draft
- Reset กลับ AI Version
- ดู Code Diff
- Run Code
- ดู Log

==================================================
19. Code Tips สำหรับ QA Manual
==================================================

Python และ Pytest ทุกส่วนต้องมี Code Tips ภาษาไทย

ตัวอย่าง:

Code:
Decimal("200000.00")

Tip:
"ใช้ Decimal แทน float เพราะตัวเลขจำนวนเงินต้องมีความแม่นยำ
และ float อาจเกิดปัญหาค่าทศนิยมคลาดเคลื่อน"

Code:
@pytest.mark.parametrize

Tip:
"ใช้ parametrize เพราะ Test Case นี้มี Boundary หลายค่า
แต่ใช้ Logic เดียวกัน จึงลดการเขียน Test Function ซ้ำ"

Code:
fixture

Tip:
"Fixture ใช้เตรียมข้อมูลพื้นฐานที่ Test หลายข้อใช้ร่วมกัน
ทำให้แก้ข้อมูลกลางได้จากจุดเดียว"

Code:
Page Object Model

Tip:
"Page Object Model ช่วยแยก Locator และการใช้งานหน้าเว็บ
ออกจาก Test Case ทำให้ Script ดูแลรักษาง่ายเมื่อ UI เปลี่ยน"

ทุก Code Block ต้องมี:

- จุดประสงค์
- Input
- Output
- เหตุผลที่ใช้
- อธิบายทีละส่วน
- Test Case ที่เชื่อมโยง
- ข้อควรระวัง
- สิ่งที่ QA ต้องแก้ก่อน Run

==================================================
20. Pytest Generator
==================================================

กฎการสร้าง Pytest:

- หลาย Boundary ใช้ pytest.mark.parametrize
- Business Logic ต้องแยกจาก Test Function
- ใช้ Fixture เมื่อข้อมูลถูกใช้ซ้ำ
- Test Name ต้องอ่านแล้วเข้าใจ Behavior
- เชื่อม Test Case ID ด้วย Marker
- ใช้ Decimal กับจำนวนเงิน
- Date และ Time ต้องระบุ Timezone หรือ Assumption
- ห้ามใช้ Test Data จริง
- ห้ามใช้ Customer ID จริง
- Test ต้องทำงานอิสระ
- Test ต้องทำซ้ำได้
- ห้ามพึ่งลำดับ Test

ตัวอย่าง Marker:

@pytest.mark.testcase("TC-CAM-RULE3-001")

สร้าง:

- conftest.py
- pytest.ini
- requirements.txt
- Test Data Factory
- Fixtures
- Helper
- HTML Report Configuration

ระบบต้อง Run Pytest บน Server เดียวกับเว็บไซต์

Runner ต้อง:

- จำกัด CPU
- จำกัด RAM
- จำกัดเวลา
- จำกัดขนาด Log
- Cancel ได้
- แสดง Progress
- เก็บ stdout
- เก็บ stderr
- เก็บ Exit Code
- เก็บ Test Result
- เก็บ Duration
- ห้ามเข้าถึง Secret ที่ไม่จำเป็น

==================================================
21. Postman Generator
==================================================

Input มาจาก API Document, Requirement และ Test Case

สร้าง:

- Postman Collection
- Request Header
- Request Body
- Test Scripts
- Positive Cases
- Negative Cases
- Environment Template
- Variable Template
- JSON Schema Assertion หาก Schema มีข้อมูลเพียงพอ

Authentication ยังไม่ทราบ
ดังนั้นต้องรองรับ Configurable Auth:

- No Auth
- Basic Auth
- Bearer Token
- API Key
- OAuth 2.0
- Cookie Session

ห้ามเดา Authentication
หากไม่มีข้อมูล ให้ตั้ง Needs Configuration

Version แรก:

- สร้างไฟล์ Collection
- Download JSON
- แสดง Preview
- แสดงผล Test Run บน Dashboard หากผู้ใช้ Import Newman Result
- Architecture รองรับ Newman Runner ในอนาคต

==================================================
22. SQL Generator
==================================================

Database เป้าหมายคือ MySQL

Version แรกสร้าง SQL Template เท่านั้น
ไม่เชื่อม Database จริง

Input:

- BRS
- Test Case
- Field Mapping
- API Response Contract

สร้าง SQL สำหรับ:

- Duplicate Check
- Missing Record
- API กับ Database ตรงกัน
- UI กับ Database ตรงกัน
- Aggregation
- Status
- Event
- Data Persistence
- Field Mapping

SQL Template ต้อง:

- ใช้ Placeholder
- ห้ามใส่ Password
- ห้ามใส่ Connection String
- ห้ามใส่ Customer ID จริง
- อธิบาย Table และ Column ที่เป็น Assumption
- ระบุ Dialect = MySQL
- ใช้ Read-only Query เป็นค่าเริ่มต้น

ตัวอย่าง Placeholder:

{{customer_id}}
{{start_date}}
{{end_date}}
{{expected_status}}

==================================================
23. Playwright Generator
==================================================

รองรับ:

- Public Website
- Web Application
- Chromium
- Microsoft Edge
- Firefox
- Headed Mode
- Headless Mode ในอนาคต
- สร้าง Script จาก Test Case
- Record User Flow แล้วแปลงเป็น Script
- AI สำรวจหน้าเว็บไซต์ภายใต้การควบคุมของผู้ใช้
- สร้าง Page Object Model อัตโนมัติ
- แนะนำ Locator ใหม่เมื่อ Locator เดิมใช้ไม่ได้

Locator Priority:

1. data-testid
2. get_by_role
3. get_by_label
4. get_by_text
5. CSS
6. XPath เป็นตัวเลือกสุดท้าย

Playwright Artifacts:

- Screenshot ตอน Fail
- Test Report
- API Response ที่เกี่ยวข้อง
- Log
- Trace เป็น Optional

Login อาจเป็น:

- Username/Password
- OTP
- CAPTCHA

ข้อกำหนดสำคัญ:

- Username/Password เก็บใน Environment Variable
- OTP ให้ผู้ใช้กรอกผ่าน Manual Checkpoint
- CAPTCHA ต้องให้ผู้ใช้ดำเนินการเอง
- ห้ามสร้างระบบข้าม CAPTCHA
- ห้ามอ่านหรือแก้ CAPTCHA อัตโนมัติ
- รองรับ Pause และ Resume หลังผู้ใช้ Login สำเร็จ
- Session Storage ต้องเข้ารหัสหรือเก็บใน Restricted Directory
- ห้าม Commit Session หรือ Credential ลง Git

AI Website Exploration:

- ผู้ใช้กรอก Base URL
- ผู้ใช้กด Start Exploration
- เปิด Browser แบบ Headed
- ผู้ใช้ Login เอง
- AI อ่านเฉพาะ DOM และ Accessibility Tree ที่ได้รับอนุญาต
- แนะนำ Page, Component และ Locator
- ผู้ใช้ต้อง Approve ก่อนสร้าง Script

==================================================
24. GitHub Integration
==================================================

รองรับ:

- สร้าง Repository
- อ่าน Existing Repository
- สร้าง Branch
- สร้าง Commit Proposal
- สร้าง Pull Request Proposal
- Push หลังผู้ใช้อนุมัติ

ห้าม:

- Merge อัตโนมัติ
- Force Push
- ลบ Branch โดยไม่ยืนยัน
- Commit Secret
- Commit .env
- Commit Customer Data
- Commit Password
- Commit Session File

ทุก Git Action ต้องมี Preview:

- Repository
- Branch
- Files Changed
- Diff
- Commit Message
- Action Type

ผู้ใช้ต้องกด Approve ก่อน Execute

==================================================
25. GitHub Actions
==================================================

สร้าง Workflow สำหรับ User-triggered Run เท่านั้น

ใช้ workflow_dispatch

รองรับ:

- Pytest
- Playwright
- Artifact Upload
- HTML Report
- Screenshot on Failure

อย่าเปิด Scheduled Run เป็นค่าเริ่มต้น

ห้ามใส่ Secret ใน Workflow File
ใช้ GitHub Secrets

==================================================
26. JMeter Generator
==================================================

สร้าง JMeter Plan จาก:

- API Test Case
- Playwright Flow

รองรับ:

- Load Test
- Stress Test
- Spike Test

Metric หลัก:

- Transaction per Second
- Error Rate
- Response Time
- Concurrent Users
- Throughput

ระบบต้องมี Safety Control:

- Environment Allowlist
- Block Production Default
- Approval ก่อน Run
- Limit Concurrent Users
- Limit Duration
- Emergency Stop
- Audit Log
- Confirm Target URL
- แสดง Warning สีแดง

Version แรกให้สร้าง:

- JMX Preview
- Test Profile
- Variables
- CSV Data Template
- Download JMX
- Run ในอนาคตได้ผ่าน Runner Interface

==================================================
27. หน้าจอที่ต้องสร้าง
==================================================

สร้างหน้าจอหลักดังนี้:

1. Login
2. Dashboard
3. Document Upload
4. Document Processing
5. Requirement Explorer
6. Python Generator
7. Pytest Generator
8. Postman Generator
9. SQL Generator
10. Playwright Generator

เพิ่มหน้าจอสนับสนุน:

11. Project Detail
12. Clarification and Conflict Center
13. Test Scenario Review
14. Test Case Review
15. Test Run Detail
16. GitHub Integration
17. Settings
18. Audit Log
19. Traceability Viewer

==================================================
28. Dashboard
==================================================

Dashboard ต้องแสดง:

- จำนวน Requirement
- จำนวน Requirement ที่ Needs Clarification
- จำนวน Conflict
- จำนวน Test Scenario
- จำนวน Test Case
- Automated/Manual
- Pass/Fail/Blocked
- Test Run ล่าสุด
- Document Processing Progress
- Approved Test Cases
- Ready for Automation
- Automation Coverage
- BRS Version ล่าสุด

ใช้ Chart เท่าที่ช่วยให้เข้าใจข้อมูล
ห้ามใส่ Chart เพื่อความสวยงามเพียงอย่างเดียว

==================================================
29. Requirement Explorer
==================================================

ต้องมี:

- Search
- Filter
- Filter ตาม Requirement Type
- Filter ตาม Status
- Filter ตาม Score
- Filter Conflict
- Filter Needs Clarification
- แสดง Source ด้านซ้าย
- แสดง Requirement ด้านกลาง
- แสดงคำอธิบายและ AI Analysis ด้านขวา
- กดดู Source Page ได้
- กดดู Source Table ได้
- กดดู Screenshot ได้
- Compare Requirement ได้

==================================================
30. Test Case Editor
==================================================

ต้องรองรับ:

- แก้ไขในตาราง
- เปิดรายละเอียด Test Case
- Filter
- Search
- Sort
- Export Excel
- Review
- Approve
- Reject
- Needs Clarification
- Lock Approved Version
- Version History

Excel Export ต้องรองรับภาษาไทยและโค้ดหลายบรรทัด

==================================================
31. Document Processing Page
==================================================

แสดง Progress:

- Uploaded
- Extracting
- Normalizing
- Creating Sections
- Analyzing Requirements
- Detecting Conflicts
- Generating Questions
- Ready for Review
- Failed

แสดง Progress แยก Section

ผู้ใช้ต้องสามารถ:

- Retry Section
- Retry Failed Only
- Cancel Job
- Resume Job
- ดู Error
- Download Processing Log

==================================================
32. Hallucination Control
==================================================

กฎสำคัญ:

- ห้ามสร้างค่าที่ไม่มีใน BRS โดยไม่ติดป้าย Assumption
- ทุก Requirement ต้องมี Source Reference
- ทุก Test Case ต้องมี Requirement Reference
- ทุกค่าตัวเลขต้องบอกว่ามาจากหน้าใด
- ถ้าไม่พบข้อมูลให้ใช้ NOT_FOUND
- ห้ามใช้ค่าตัวอย่างเป็นค่าจริง
- ห้ามสรุปว่า Assumption คือ Requirement
- ห้ามสร้าง Expected Result จากความรู้ทั่วไปโดยไม่ติดป้าย
- AI Recommendation ต้องแยกจาก BRS Explicit Rule
- QA ต้อง Approve ก่อน Generate Automation

ทุก AI Output ใช้โครงสร้าง:

{
  "found_in_brs": [],
  "assumptions": [],
  "recommendations": [],
  "clarification_questions": [],
  "conflicts": [],
  "source_references": [],
  "confidence": 0
}

==================================================
33. Security
==================================================

ต้องมี:

- Session Timeout
- Password Hashing
- Role-based Access Control
- Input Validation
- File Type Validation
- File Size Limit
- Path Traversal Protection
- Safe Filename
- Rate Limit
- Audit Log
- Secret Masking
- Customer ID Masking
- Password Masking
- Secure Error Message
- CORS Configuration
- CSRF Protection หากใช้ Cookie Session
- SQL Injection Protection
- XSS Protection
- Content Security Policy
- Dependency Lock Files

ข้อมูลที่ต้อง Mask:

- Customer ID
- Password
- Token
- API Key
- Connection String
- OTP
- Session Cookie

==================================================
34. Data Model
==================================================

ออกแบบ Database Tables อย่างน้อย:

- users
- roles
- user_roles
- projects
- project_members
- documents
- document_versions
- document_sections
- document_images
- processing_jobs
- processing_job_sections
- requirements
- requirement_versions
- requirement_sources
- requirement_questions
- requirement_assumptions
- requirement_conflicts
- test_scenarios
- test_scenario_versions
- test_cases
- test_case_versions
- test_steps
- test_data
- automation_artifacts
- python_artifacts
- pytest_artifacts
- postman_artifacts
- sql_artifacts
- playwright_artifacts
- jmeter_artifacts
- test_runs
- test_run_results
- test_run_artifacts
- github_integrations
- github_action_requests
- audit_logs
- comments
- approvals
- application_settings

สร้าง:

- ER Diagram ด้วย Mermaid
- SQLAlchemy Models
- Alembic Migration
- Seed Admin User
- Seed Example Project
- Seed Synthetic Demo Data

==================================================
35. API Design
==================================================

สร้าง REST API อย่างน้อย:

Authentication:
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

Projects:
- GET /api/projects
- POST /api/projects
- GET /api/projects/{id}
- PATCH /api/projects/{id}

Documents:
- POST /api/projects/{id}/documents
- POST /api/projects/{id}/paste-text
- GET /api/documents/{id}
- POST /api/documents/{id}/process
- POST /api/documents/{id}/retry-failed
- GET /api/documents/{id}/progress

Requirements:
- GET /api/projects/{id}/requirements
- GET /api/requirements/{id}
- PATCH /api/requirements/{id}
- POST /api/requirements/{id}/review
- POST /api/requirements/{id}/approve
- POST /api/requirements/{id}/resolve-question
- POST /api/requirements/{id}/resolve-conflict

Test Scenarios:
- POST /api/projects/{id}/test-scenarios/generate
- GET /api/projects/{id}/test-scenarios
- PATCH /api/test-scenarios/{id}

Test Cases:
- POST /api/test-scenarios/{id}/test-cases/generate
- GET /api/projects/{id}/test-cases
- GET /api/test-cases/{id}
- PATCH /api/test-cases/{id}
- POST /api/test-cases/{id}/approve
- GET /api/projects/{id}/test-cases/export

Automation:
- POST /api/test-cases/{id}/python/generate
- POST /api/test-cases/{id}/pytest/generate
- POST /api/test-cases/{id}/postman/generate
- POST /api/test-cases/{id}/sql/generate
- POST /api/test-cases/{id}/playwright/generate

Runs:
- POST /api/automation/{id}/run
- POST /api/test-runs/{id}/cancel
- GET /api/test-runs/{id}
- GET /api/test-runs/{id}/logs

GitHub:
- POST /api/github/connect
- POST /api/github/repository/propose
- POST /api/github/action/approve
- POST /api/github/action/execute

==================================================
36. UI Design
==================================================

UI ต้อง:

- ภาษาไทยเป็นหลัก
- รองรับอังกฤษ
- ใช้ข้อความ Technical ภาษาอังกฤษได้
- ดูสะอาด
- ไม่แน่นเกินไป
- มี Sidebar
- มี Breadcrumb
- มี Project Selector
- มี Status Badge
- มี Source Reference
- มี Split View สำหรับ Requirement
- มี Monaco Editor
- มี Progress Bar
- มี Error State
- มี Empty State
- มี Loading State
- มี Confirmation Dialog สำหรับ Action สำคัญ

Color Convention:

- Blue: Information
- Green: Approved/Passed
- Orange: Needs Review/Assumption
- Red: Conflict/Failed
- Purple: AI-generated
- Gray: Draft/Inactive

==================================================
37. Excel Export
==================================================

Export Test Case เป็น XLSX

Sheet อย่างน้อย:

- Summary
- Requirements
- Clarification Questions
- Conflicts
- Test Scenarios
- Test Cases
- Test Steps
- Test Data
- Traceability
- Automation Status

Excel ต้อง:

- รองรับภาษาไทย
- Wrap Text
- Freeze Header
- Filter
- กำหนด Column Width
- ใช้สีแยก Status
- ไม่ตัดข้อความ
- ไม่ทำ Code สูญหาย
- เก็บ Source Page
- เก็บ Requirement Version
- เก็บ Test Case Version

==================================================
38. Error Handling
==================================================

รองรับ:

- Unsupported File
- File Too Large
- Corrupt File
- AI API Timeout
- AI Rate Limit
- AI Invalid JSON
- Background Job Failed
- Database Error
- Runner Timeout
- Runner Out of Memory
- GitHub API Error
- Document Section Failed
- Duplicate Requirement
- Duplicate Test Case ID

Error ต้องมี:

- Error Code
- User Message
- Technical Detail สำหรับ Admin
- Timestamp
- Retryable หรือไม่
- Suggested Action
- Correlation ID

==================================================
39. Logging และ Audit
==================================================

ใช้ Structured Logging

บันทึก:

- Login
- Upload
- Delete
- Process
- Retry
- Requirement Edit
- Conflict Resolve
- Test Case Approve
- Automation Generate
- Test Run
- GitHub Action
- Download
- Export

ห้ามบันทึก:

- Password
- Full Token
- OTP
- Session Cookie
- Secret

==================================================
40. Testing ของระบบนี้
==================================================

สร้าง Test สำหรับ Application เอง:

Backend:
- Unit Test
- API Test
- Permission Test
- Document Parser Test
- Requirement Generator Test
- Conflict Detector Test
- Boundary Generator Test
- Export Test

Frontend:
- Component Test
- Form Validation Test
- Basic Playwright E2E

Security:
- Unauthorized Access
- Role Restriction
- Unsafe Filename
- Path Traversal
- Invalid File Type
- Secret Masking

==================================================
41. Acceptance Criteria
==================================================

ระบบถือว่าผ่านเมื่อ:

1. Login ด้วย Local Account ได้
2. สร้าง Project ได้
3. Upload DOCX, XLSX, CSV, Text PDF และ TXT ได้
4. Paste Text ได้
5. แสดง Document Processing Progress ได้
6. อ่านเอกสารแยก Section ได้
7. สร้าง Requirement ID ใหม่ได้
8. แสดง Source Page/Section ได้
9. ตรวจ Missing Expected Result ได้
10. ตรวจ Missing Role ได้
11. ตรวจ Missing Threshold ได้
12. ตรวจ Requirement Conflict ได้
13. ไม่สร้าง Test Case เมื่อมี Conflict
14. สร้าง Clarification Question ได้
15. สร้าง Assumption พร้อม Label ได้
16. สร้าง Positive Test ได้
17. สร้าง Negative Test ได้
18. สร้าง Boundary Test ได้
19. สร้าง Integration Test ได้
20. สร้าง Data Test ได้
21. สร้าง API Test ได้
22. QA แก้ Test Case ในตารางได้
23. QA Approve Test Case ได้
24. Test Case Approved ถูก Lock
25. Export Excel ได้
26. Generate Python ได้
27. แสดง Code Tips ภาษาไทยได้
28. Generate Pytest ได้
29. Run Pytest ได้
30. แสดง Pass/Fail/Blocked ได้
31. Screenshot Failure จาก Playwright ได้
32. Generate Postman Collection ได้
33. Generate MySQL Template ได้
34. Generate Playwright Page Object ได้
35. GitHub Action ต้องรอ Approval
36. เปรียบเทียบ BRS Version ได้
37. ไม่แก้ Test Case Approved อัตโนมัติ
38. แสดง Impact Analysis ได้
39. Retry เฉพาะ Section ที่ Fail ได้
40. Restart ระบบแล้วข้อมูลไม่หาย

==================================================
42. สิ่งที่ต้องส่งมอบ
==================================================

สร้าง Repository ที่มี:

- frontend/
- backend/
- worker/
- automation-runner/
- docker-compose.yml
- .env.example
- README.md
- ARCHITECTURE.md
- SECURITY.md
- API.md
- DATABASE.md
- DEVELOPMENT.md
- DEPLOYMENT_WINDOWS.md
- USER_GUIDE_TH.md
- TESTING.md
- CHANGELOG.md
- GitHub Actions Workflow
- Database Migration
- Seed Data
- Sample BRS
- Synthetic Demo Project
- Unit Tests
- Integration Tests
- Basic E2E Tests

README ต้องมีคำสั่งเริ่มระบบตั้งแต่เครื่องว่าง:

1. ติดตั้ง Docker Desktop
2. Copy .env.example เป็น .env
3. กำหนด CLAUDE_API_KEY
4. Run docker compose up -d
5. เปิด Browser
6. Login ด้วย Seed Admin
7. เปลี่ยน Password ทันที

==================================================
43. วิธีดำเนินงานเมื่อได้รับ Prompt นี้
==================================================

ถึงแม้ภารกิจนี้จะเป็น Master Prompt เดียว
ห้ามสร้างโค้ดแบบสุ่มหรือข้าม Architecture

ให้ทำงานภายในคำตอบเดียวตาม Stage:

Stage 1:
- สรุป Requirement
- ระบุ Assumption
- ระบุ Risk
- ระบุสิ่งที่ไม่ควรเดา

Stage 2:
- ออกแบบ Architecture
- Mermaid Diagram
- Data Flow
- Authentication Flow
- Document Processing Flow
- Automation Flow

Stage 3:
- ออกแบบ Database
- ER Diagram
- Models
- Migration

Stage 4:
- สร้าง Backend
- APIs
- Services
- Repositories
- Workers
- AI Provider
- Document Parsers

Stage 5:
- สร้าง Frontend
- Layout
- Pages
- Components
- Forms
- Dashboard
- Editors

Stage 6:
- สร้าง Automation Generators
- Python
- Pytest
- Postman
- SQL
- Playwright
- GitHub
- JMeter

Stage 7:
- สร้าง Test Runner
- Resource Limit
- Log Streaming
- Result Parser
- Cancel and Retry

Stage 8:
- Docker
- GitHub Actions
- Documentation
- Seed Data
- Tests

Stage 9:
- ตรวจ Acceptance Criteria ทั้ง 40 ข้อ
- สร้างรายการ Complete/Incomplete
- ห้ามกล่าวว่าทำเสร็จหากยังมี Placeholder ที่ทำให้ระบบ Run ไม่ได้

==================================================
44. กฎป้องกันคำตอบไม่ครบ
==================================================

เนื่องจากระบบมีขนาดใหญ่:

- สร้างไฟล์จริงใน Repository
- อย่าแสดงเฉพาะ Code Snippet
- ห้ามใช้คำว่า "implement later" ใน Core Feature
- ห้ามสร้าง Empty Function
- ห้ามใช้ pass ใน Core Feature
- ห้ามสร้าง Mock UI ที่ไม่มี Backend
- หาก Context ใกล้เต็ม ให้บันทึก PROGRESS.md
- PROGRESS.md ต้องระบุไฟล์ที่เสร็จ
- ระบุไฟล์ที่ยังไม่เสร็จ
- ระบุคำสั่งถัดไป
- ระบุ Known Issues
- เมื่อทำงานต่อ ให้เปิด PROGRESS.md ก่อน
- หาก Stage ใดล้มเหลว ให้แก้เฉพาะ Stage นั้น
- ห้ามสร้าง Repository ใหม่ทับของเดิม
- ห้ามลบโค้ดที่ทำงานแล้วโดยไม่มีเหตุผล
- ก่อนแก้ไฟล์ ให้ตรวจ Code เดิม
- หลังสร้างแต่ละ Stage ให้ Run Test ที่เกี่ยวข้อง

==================================================
45. ข้อจำกัดด้านความปลอดภัย
==================================================

- ห้ามข้าม CAPTCHA
- ห้ามถอดรหัส CAPTCHA
- ห้ามเก็บ OTP
- ห้ามพยายาม Bypass MFA
- OTP ต้องเป็น Manual Input
- CAPTCHA ต้องเป็น Manual Checkpoint
- ห้าม Run Load Test ไป Production โดยค่าเริ่มต้น
- ห้ามสร้าง SQL ที่แก้ไข Production Data เป็นค่าเริ่มต้น
- ห้าม Merge GitHub Pull Request อัตโนมัติ
- ห้ามส่ง Secret ไป Claude
- ห้ามใช้ Customer Data จริงใน Demo
- ใช้ Synthetic Data เท่านั้น

==================================================
46. รูปแบบการตอบและการสร้างงาน
==================================================

ก่อนเริ่มสร้าง Code ให้ตอบด้วย:

1. Understanding Summary
2. Architecture Decision
3. Assumptions
4. Risks
5. Repository Structure
6. Stage Execution Plan

จากนั้นเริ่มสร้าง Repository ทันที
ไม่ต้องถามคำถามเพิ่มในประเด็นที่ระบุไว้ชัดเจนแล้ว

หากพบข้อมูลที่ยังไม่ทราบ เช่น:

- API Authentication
- Database Table Name
- Production URL
- Exact BRS Format

ให้:

- สร้าง Configurable Interface
- กำหนด Status = NEEDS_CONFIGURATION
- ใช้ Placeholder ที่มีชื่อชัดเจน
- ห้ามเดาค่าจริง
- บันทึกใน ASSUMPTIONS.md

เมื่อสร้างเสร็จ ให้รายงาน:

- สิ่งที่สร้างแล้ว
- วิธี Run
- Seed Login
- Test Result
- Acceptance Criteria Result
- Known Limitations
- Security Notes
- Next Recommended Step

เริ่มพัฒนา BRS to QA Automation Platform ตามข้อกำหนดทั้งหมดข้างต้น
```
