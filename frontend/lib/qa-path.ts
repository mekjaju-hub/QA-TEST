// Become to QA Engineer — Upskill path data (ported from the prototype index.html, `#/qa-path`)
export type QAMode = {
  id: string; no: number; title: string; weeks: string; tag: string; jd: string; goal: string;
  pages: [string, string][]; tasks: string[]; deliverable: string; quiz: [string, string[], number][];
};

// Practice-page key (prototype) → route segment under /projects/[pid]/
export const QA_PAGE_ROUTE: Record<string, string> = {
  upload: "documents/upload", requirements: "requirements", clarifications: "clarifications", scenarios: "test-scenarios",
  testcases: "test-cases", trace: "traceability", "auto/postman": "automation/postman", "auto/sql": "automation/sql",
  "auto/python": "automation/python", "auto/pytest": "automation/pytest", "auto/playwright": "automation/playwright",
  "auto/jmeter": "automation/jmeter", runs: "test-runs", github: "github", dashboard: "dashboard",
};

export const QA_MODES: QAMode[] = [
  { id: "m1", no: 1, title: "Requirement → Test Design", weeks: "สัปดาห์ 1–2", tag: "ต่อยอดจากงานปัจจุบัน",
    jd: "Collaborate with product team, analyze business requirements and create test documents",
    goal: "เปลี่ยนจาก 'อ่าน BRS แล้วเขียน Test Case' เป็น 'วิเคราะห์ Requirement เชิงความเสี่ยง' พร้อม Traceability",
    pages: [["upload", "Upload เอกสาร"], ["requirements", "Requirement Explorer"], ["clarifications", "Clarification & Conflict"], ["scenarios", "Test Scenarios"], ["testcases", "Test Cases"], ["trace", "Traceability"]],
    tasks: ["อัปโหลด BRS จริงที่เคยทำ (ลบข้อมูลลับก่อน) 1 ฉบับ", "แยก Requirement เป็น Functional / Non-functional ให้ครบ", "ตั้งคำถาม Clarification อย่างน้อย 5 ข้อ (เหมือนถาม BA ในงานจริง)", "เขียน Test Scenario ที่ครอบคลุม Positive / Negative / Edge", "ทำ Test Case อย่างน้อย 10 เคส ใช้เทคนิค Boundary Value + Equivalence Partitioning", "ตรวจ Traceability ว่าทุก Requirement มี Test Case รองรับ"],
    deliverable: "Test Plan + Test Case ชุดแรก (ใช้ DCA mini project เป็นต้นแบบได้)",
    quiz: [["จำนวนเงินขั้นต่ำ 500 บาท ค่าใดเป็น Boundary Value ที่ควรทดสอบ", ["499, 500, 501", "100, 1000", "500 อย่างเดียว"], 0],
           ["Requirement ข้อใดเป็น Non-functional", ["ผู้ใช้ตั้งวันตัดรอบได้", "หน้า Portfolio โหลดภายใน 2 วินาที", "ยกเลิกแผน DCA ได้"], 1]] },
  { id: "m2", no: 2, title: "API Testing ด้วย Postman", weeks: "สัปดาห์ 3–4", tag: "ทักษะแรกที่ควรได้",
    jd: "Perform quality assurance activities and execute test scripts",
    goal: "ทดสอบ Backend ได้โดยไม่ต้องรอหน้าจอ เขียน Assertion และรัน Collection อัตโนมัติ",
    pages: [["auto/postman", "Postman"]],
    tasks: ["เข้าใจ HTTP method, status code (200/400/401/404/500) และ JSON", "สร้าง Collection จาก Test Case ที่ Approved ในหน้า Postman", "เขียน Test script ตรวจ status code + response body", "ใช้ Environment variable (SIT/UAT) แทนการ hardcode URL", "รัน Collection ด้วย Newman ผ่าน command line"],
    deliverable: "Postman Collection + Environment ที่รันผ่าน Newman ได้",
    quiz: [["ส่งข้อมูลจำนวนเงินผิดรูปแบบ API ควรตอบ status ใด", ["200", "400", "500"], 1],
           ["ยิง API ตัดเงินซ้ำ 2 ครั้งด้วย request เดิม ควรทดสอบเรื่องอะไร", ["Idempotency", "UI layout", "Font"], 0]] },
  { id: "m3", no: 3, title: "SQL Data Validation", weeks: "สัปดาห์ 5", tag: "ตรวจข้อมูลหลังบ้าน",
    jd: "Perform quality assurance activities and execute test scripts",
    goal: "Verify ว่าข้อมูลใน Database ตรงกับที่ระบบแสดง แทนการดูแค่ภาพหน้าจอจาก User",
    pages: [["auto/sql", "SQL (MySQL)"]],
    tasks: ["ฝึก SELECT / WHERE / JOIN / GROUP BY", "เขียน Query หา Transaction ซ้ำ (duplicate)", "เขียน Query เทียบยอดรวม (aggregation) กับยอดที่แสดงบนหน้าจอ", "นำ Query ไปแนบใน Test Case เป็น Expected result ที่วัดได้"],
    deliverable: "ชุด SQL Validation อย่างน้อย 5 Query",
    quiz: [["หา Transaction ที่ตัดเงินซ้ำในรอบเดียวกัน ใช้คำสั่งใดคู่กัน", ["GROUP BY + HAVING COUNT(*) > 1", "ORDER BY", "DELETE"], 0]] },
  { id: "m4", no: 4, title: "Programming + UI Automation", weeks: "สัปดาห์ 6–9", tag: "หัวใจของ QA Engineer",
    jd: "Develop and maintain automation testing scripts",
    goal: "เขียน Automation Script ที่ดูแลง่าย ด้วย Page Object Model และรันซ้ำได้",
    pages: [["auto/python", "Python"], ["auto/pytest", "Pytest"], ["auto/playwright", "Playwright"]],
    tasks: ["พื้นฐาน Python: ตัวแปร, if/loop, function, list/dict", "เขียน Pytest พร้อม fixture และ parametrize", "Generate Playwright script จาก Test Case แล้วอ่านทำความเข้าใจทีละบรรทัด", "แยก Page Object ออกจาก Test (ดูตัวอย่าง dcaSetupPage.js)", "ใช้ data-testid เป็น selector แทน XPath ยาวๆ", "Automate Regression เคสหลัก 5 เคสให้รันผ่าน"],
    deliverable: "Automation repo ที่มี Page Object + Test 5 เคส",
    quiz: [["ทำไมต้องใช้ Page Object Model", ["ให้ Script เร็วขึ้น", "รวม selector ไว้ที่เดียว แก้ครั้งเดียวทุก test ใช้ได้", "ไม่ต้องเขียน assertion"], 1],
           ["ควร automate เคสแบบไหนก่อน", ["เคสที่รันซ้ำบ่อยและเสถียร เช่น Regression", "เคสที่ UI เปลี่ยนทุกวัน", "เคส Exploratory"], 0]] },
  { id: "m5", no: 5, title: "Performance Testing ด้วย JMeter", weeks: "สัปดาห์ 10–11", tag: "Non-functional",
    jd: "Perform performance testing such load test and stress test",
    goal: "ออกแบบ Load / Stress Test อ่านผล Response time, Throughput, Error rate เทียบ SLA",
    pages: [["auto/jmeter", "JMeter"]],
    tasks: ["แยกให้ออก: Load test vs Stress test vs Spike test", "สร้าง Test plan: Thread Group, HTTP Sampler, Assertion, Listener", "ทดลอง Load จำลอง user น้อยๆ บน SIT ก่อน (ห้ามยิง Production)", "อ่านผล p90/p95 response time และ error %", "เขียนสรุปผลว่าผ่าน SLA หรือไม่ พร้อมคอขวดที่พบ"],
    deliverable: "JMeter .jmx + Performance Summary 1 หน้า",
    quiz: [["ดันระบบเกิน capacity เพื่อหาจุดพัง คือการทดสอบแบบใด", ["Load test", "Stress test", "Smoke test"], 1]] },
  { id: "m6", no: 6, title: "CI/CD, Reporting & Monitoring", weeks: "สัปดาห์ 12", tag: "ทำงานเป็นทีม",
    jd: "Communicate key insights / improve monitoring / design & maintain processes",
    goal: "ต่อยอดประสบการณ์ประสาน UAT ให้เป็น Test Report ที่มีตัวเลข และให้ Test รันอัตโนมัติ",
    pages: [["runs", "Test Runs"], ["github", "GitHub"], ["dashboard", "Dashboard"]],
    tasks: ["รัน Test Run แล้วอ่านผล Pass / Fail / Blocked", "Push Automation script ขึ้น GitHub และเรียนรู้ Pull Request", "ตั้ง GitHub Actions ให้รัน Test ทุกครั้งที่ push (ศึกษาเพิ่ม)", "เปลี่ยนเอกสาร UAT Result จากภาพแคป เป็น Test Summary Report (pass rate, defect by severity, risk)", "เสนอ Metric ที่ควร Monitor บน Production 3 ตัว"],
    deliverable: "Portfolio: GitHub repo + Test Summary Report สำหรับใช้สมัครงาน",
    quiz: [["Test Summary Report ที่ดีควรมีอะไร", ["แค่ภาพหน้าจอผลทดสอบ", "Pass rate, Defect ตาม severity, ความเสี่ยงก่อน release", "รายชื่อทีม"], 1]] }
];
export const QA_SKILLS: [string, string, string, number][] = [
  ["อ่าน BRS / สร้าง Test Case Manual", "มีแล้ว", "ยกระดับเป็น Risk-based + Traceability", 1],
  ["ประสาน UAT ระหว่าง BA / DEV / USER", "มีแล้ว", "ใช้เป็นจุดแข็งด้าน Communication", 6],
  ["เอกสาร Result / User manual", "มีแล้ว", "เปลี่ยนเป็น Test Summary Report เชิงตัวเลข", 6],
  ["API Testing", "ยังไม่มี", "Postman + Newman", 2],
  ["SQL Validation", "ยังไม่มี", "Query ตรวจข้อมูลหลังบ้าน", 3],
  ["Automation Script", "ยังไม่มี", "Python / Pytest / Playwright", 4],
  ["Performance Test", "ยังไม่มี", "JMeter Load / Stress", 5],
  ["CI/CD + Git", "ยังไม่มี", "GitHub + Actions", 6]
];
