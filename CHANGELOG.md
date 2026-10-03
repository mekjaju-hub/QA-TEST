# CHANGELOG

## [1.7.0] — 2026-10-03 — Website Test Suite (ทดสอบหน้าเว็บ WebQA2026 เอง)

### Added
- **Test Case 113 ข้อ** ของหน้าเว็บ (`docs/qa/WEBQA2026_TEST_CASES.xlsx` + CSV): Login/บัญชี, เมนูตาม Role, Projects, เอกสาร, Requirement, Clarification, Test Design, Automation/Run, Web Explorer, Web Recorder, Web History + Detail, คลังรวม, Settings/Users, Audit Log, API/Security, Performance, Manual
- **Playwright Website Suite** `frontend/e2e/website` (101 test, ID ตรงกับ Excel) — backend/practice site/หน้าเว็บของตัวเอง (8002/8765/3200), ฐานข้อมูลแยก `storage/e2e-website`, รายงาน HTML + JUnit · Recorder ถูกขับผ่าน CDP เหมือนผู้ใช้คลิกในหน้าต่าง
- **Performance** `perf/webqa_perf.py`: load / stress (หา Breaking point) / spike (ฟื้นตัว) / ratelimit → รายงาน `storage/perf/*.html`
- `RUN-WEBSITE-TESTS.bat` เมนูรันทั้งหมด · `docs/qa/WEBSITE_TEST_PLAN.md` แผนและผลทดสอบ · `npm run e2e:website`

### Fixed (พบจากการทดสอบ)
- **DEF-WQA-03 (Critical)** ผู้ใช้ ~50 คำขอพร้อมกันทำให้ Backend **ค้างถาวร** (DB connection pool เล็กกว่า worker thread → deadlock) → SQLite ใช้ NullPool, DB อื่น pool 10 + overflow 50 · ก่อนแก้ 7 req/s timeout 21% → หลังแก้ 114 req/s error 0%
- **DEF-WQA-02 (Critical)** ปิดหน้าต่าง Recorder เองแล้วขึ้น `RECORDER_FAILED … has been closed` และขั้นตอนที่บันทึกหายหมด → จบแบบปกติ เก็บขั้นตอนไว้ กดบันทึกได้
- **DEF-WQA-04 (High)** เปิดคลัง Test Case พร้อมกันหลายคนได้ HTTP 500 → เขียนไฟล์ใน Storage แบบ atomic (temp + rename, retry บน Windows) + lock ตอนสร้าง TL-ID + ไม่เขียนไฟล์ตอนแค่อ่าน

### Known issues (รอแก้ ดูชีต Defects)
- DEF-WQA-01 เปิดลิงก์ภายในตอนยังไม่ Login → หลัง Login ไม่กลับหน้าเดิม · DEF-WQA-05 / 06 / 07 (Low–Medium)

## [1.6.4] — 2026-10-03 — ปุ่ม/ลิงก์ที่มีไอคอน + ไม่มีหน้าต่าง Microsoft/passkey ตอน Login

### Fixed
- **Run pytest ไม่ผ่าน "กดลิงก์ API Testing" (Timeout 30000ms)**: เมนูของ automationexercise มีไอคอน Font Awesome อยู่หน้าชื่อ (`<i class="fa fa-list">` ใส่ตัวอักษรไอคอนผ่าน CSS ::before) Playwright นับไอคอนเป็นส่วนของชื่อ (= "\uf03a API Testing") จึงหา `name="API Testing", exact=True` ไม่เจอ — เป็นสาเหตุเดียวกับ "WOMEN" (ชื่อจริงคือ ไอคอน + "Women")
  - pytest ที่สร้างใช้ `NAME("API Testing")` = ต้องตรงทั้งข้อความ แต่ไม่สนตัวพิมพ์เล็ก-ใหญ่และไอคอนหน้า/หลัง · เล่นซ้ำใช้กติกาเดียวกัน
  - ตัวบันทึกตัดตัวอักษรไอคอนออกจากชื่อ และตรวจว่าชื่อไม่ซ้ำแบบเดียวกับที่ Test ใช้
  - รายการที่บันทึกไว้แล้วถูกแปลงเป็น `NAME(...)` ตอนเปิดดู / Run / ดาวน์โหลด — ไม่ต้องบันทึกใหม่
- กดลิงก์แล้วพิมพ์ URL ใหม่ภายใน 10 วินาที → เดิมทับปลายทางของการคลิก ตอนนี้เป็นขั้น "ไปที่หน้า" แยก
- **Login ไม่ถาม Email/บัญชี Microsoft (Windows Security / passkey)**: เว็บที่ขอ passkey (WebAuthn) ทำให้ Windows เด้งหน้าต่างให้ลงชื่อเข้าบัญชี Microsoft — browser ของ Record, เล่นซ้ำ และ pytest (`conftest.py` → `no_os_login_prompts`) ใช้ตัวยืนยันจำลองแทน ไม่มีหน้าต่างของ Windows

## [1.6.3] — 2026-10-03 — เล่นซ้ำไม่ผ่านที่เมนูตัวพิมพ์ใหญ่ (automationexercise.com)

### Fixed
- **เล่นซ้ำล้มตั้งแต่ขั้นที่ 1 "กดลิงก์ WOMEN"** ทั้งที่หน้าเว็บแสดง WOMEN อยู่: เว็บเขียนชื่อจริงว่า "Women" แล้วใช้ CSS `text-transform: uppercase` ให้แสดงเป็นตัวใหญ่ ตัวบันทึกเดิมอ่านข้อความแบบที่ตาเห็น (`innerText` = "WOMEN") แต่ Playwright หา element จากชื่อจริงใน DOM ("Women") + `exact=True` จึงหาไม่เจอ 10 วินาทีแล้วไม่ผ่าน ขั้นที่เหลือถูกข้าม
  - ตัวบันทึกใช้ชื่อจริงจาก DOM (accessible name: aria-label / aria-labelledby / ข้อความใน DOM) แทนข้อความที่ถูกแปลงด้วย CSS
  - รายการที่บันทึกไว้ก่อนหน้านี้ (ชื่อเป็นตัวพิมพ์ใหญ่ทั้งหมด) เล่นซ้ำ / Run pytest / ดาวน์โหลด ZIP ได้ทันทีโดยไม่ต้องบันทึกใหม่ — จับคู่ชื่อแบบไม่สนตัวพิมพ์เล็ก-ใหญ่
- ปิดโฆษณา/ตัวติดตาม (Google Ads, DoubleClick, Analytics ฯลฯ) ระหว่างบันทึก เล่นซ้ำ และใน pytest ที่สร้าง (`conftest.py` → `block_ads`) — popup โฆษณาเต็มจอ `#google_vignette` บังปุ่มทำให้ล้มแบบสุ่ม และไม่ถูกบันทึกเป็นขั้น "ไปที่หน้า"
- Tests: หน้า `shop.html` จำลองเมนู Category ของ automationexercise (WOMEN → Dress) — บันทึก, Run pytest และเล่นซ้ำผ่าน · รายการเก่าที่เป็น "WOMEN" ยังกดได้

## [1.6.2] — 2026-10-03 — Record เป็นรอบ (cycle) + หน้า Detail ของ Test Case ใน History

### Fixed
- **Add Test Case ครั้งที่ 3 ไม่เกิด Test Case ใหม่**: Test Case ที่ทำแค่เปลี่ยนหน้า (พิมพ์ URL / กดย้อนกลับ) ไม่มีขั้นตอนที่บันทึกได้ จึงถูกตัดทิ้งตอนบันทึก → ตอนนี้การเปลี่ยนหน้าเองถูกบันทึกเป็นขั้น "ไปที่หน้า …" (`page.goto`) · redirect และหน้าที่เปลี่ยนเพราะการคลิกไม่ถูกนับซ้ำ
- **กดหยุดแล้วไปต่อไม่ได้**: กดบันทึกตอนยังไม่มีขั้นตอน (RECORD_EMPTY) ทำให้หน้าค้าง (browser ปิดแล้วแต่บันทึกไม่ผ่านตลอด) → ตอนนี้ระบบจบรอบนั้นและกลับไปหน้าเริ่มบันทึกให้เอง · มีปุ่ม "เริ่มรอบใหม่" เมื่อ browser ถูกปิด · เตือนก่อนบันทึกถ้า Test Case ล่าสุดยังว่าง
- เวลาบันทึกสูงสุดเพิ่มจาก 15 เป็น 60 นาที (`WEB_RECORDER_MAX_MINUTES`) · ลิงก์ที่เปิดแท็บใหม่ถูกบันทึกต่อ

### Changed
- **⏸ หยุดบันทึก = จบรอบ (reset cycle)** แล้วรอรอบใหม่: **▶ เริ่มรอบใหม่** = Test Case ใหม่ที่เปิด URL ของตัวเอง (ค่าเริ่มต้น = หน้าที่เปิดอยู่ แก้เป็นหน้าอื่นได้) ไม่ต้องทำขั้นตอนของรอบก่อน · **↩ ทำต่อ Test Case เดิม** ยังใช้ได้
- Add Test Case เลือก "เริ่มใหม่จาก URL (ไม่อิงหน้าเดิม)" ได้ · pytest ของรอบใหม่ `page.goto(<URL ของรอบ>)` เอง ไม่เล่นขั้นตอนของ Test Case ก่อนหน้า · กดบันทึกแล้วหน้า Record reset พร้อมรอบใหม่ (จำ URL ล่าสุด)
- API: `POST /api/web-recorder/{id}/resume` รับ `{new_case, name, url}` · `/testcase` รับ `url` · `/stop` ที่ไม่มีขั้นตอนตอบ `discarded: true`

### Added
- **History → รายละเอียด Test Case** (`/web-explorer/history/case?key=…&hid=WP-xxx`): คลิกแถว/ID/ชื่อ หรือปุ่ม "รายละเอียด →" (และ WP-ID ในคลังรวม) เพื่ออ่านการเขียน Test Case: เงื่อนไขก่อนเริ่ม, ขั้นตอน, ผลที่คาดหวัง, ผลรันล่าสุด, ที่มา (ลิงก์ไปผลสำรวจ/บันทึก), Script ทีละขั้น (Test Case จากการบันทึก) และโค้ด pytest ของข้อนั้น · ปุ่ม ‹ ก่อนหน้า / ถัดไป › · คัดลอกเป็นข้อความ/คัดลอกโค้ด
- API: `GET /api/web-history/{key}/case/{hid}`
- Tests: รอบใหม่ + Test Case ที่ 3 จาก raw events, recorder จริง (หยุด → รอบใหม่ที่ URL อื่น → ต่อ → พิมพ์ URL) แล้วรัน pytest และเล่นซ้ำผ่าน, stop แบบไม่มีขั้นตอนไม่ค้าง, หน้า detail ของ History

## [1.6.1] — 2026-10-02

### Fixed
- Record ได้ Test Case น้อยกว่าที่กด "Add Test Case" (saucedemo: กด 5 ครั้ง ได้ 4 · adobe: กด 4 ครั้ง ได้ 3):
  - Test Case ที่ยังไม่มีขั้นตอนถูกรวม/ตัดทิ้งโดยไม่บอก → หน้า Record แสดงรายการ Test Case ทุกอันพร้อมจำนวนเหตุการณ์ เตือนเมื่อ Test Case ล่าสุดยังว่าง และปุ่มเปลี่ยนเป็น "เปลี่ยนชื่อ Test Case นี้" เมื่อกดซ้ำโดยยังไม่มีขั้นตอน · เตือนเมื่อกำลังหยุดชั่วคราว
  - การคลิกบางแบบไม่ถูกบันทึก: ปุ่มใน Shadow DOM (web components), เว็บที่หยุดการส่งต่อ event คลิก, ลิงก์ที่เปลี่ยนหน้าตั้งแต่กดเมาส์ลง (pointerdown) → ตอนนี้จับได้ทั้งหมด และ Locator มองเห็นใน Shadow DOM ด้วย (เล่นซ้ำได้)

## [1.6.0] — 2026-10-02 — Record แบบควบคุมได้ + Script อธิบายทีละขั้น + Test Automation เล่นซ้ำ

### Added
- หน้า Record มีปุ่ม **▶ เริ่ม / ⏸ หยุด (ชั่วคราว) / ▶ เริ่มต่อ / บันทึก** — ระหว่างหยุด สิ่งที่ทำจะไม่ถูกบันทึก · เปิดหน้าใหม่แล้วกลับมาเชื่อมต่อการบันทึกที่ค้างอยู่ได้
- **+ Add Test Case**: แบ่งการบันทึกเป็นหลาย Test Case ต่อเนื่อง (ตั้งชื่อได้) — Test Case ถัดไปทำต่อจากจุดเดิม และ pytest ของมันจะทำขั้นตอนก่อนหน้าให้ครบก่อน
- **ตรวจสอบข้อความ (Text)**: เพิ่มขั้นตรวจ "ต้องเห็น / ต้องไม่เห็น" คำที่ระบุ ณ จุดนั้น
- **บันทึกรหัสผ่านจริงใน Log/โค้ด** (ตัวเลือก เปิดไว้เป็นค่าเริ่มต้นตามที่ผู้ใช้ขอ — ใช้กับบัญชีทดสอบเท่านั้น) · ปิดได้เพื่อใส่ตอนรันแทน
- **Script ทีละขั้น** (แท็บ ⑤ + `SCRIPT_TH.md`): ทุกขั้นบอก เหตุการณ์ · อยู่ตรงไหน (ส่วนของหน้าจอ, อยู่ในฟอร์ม/เมนู/popup/หัวข้อไหน, พิกัด x,y และขนาด) · คำสั่ง Playwright ที่ใช้ · ความหมายของคำสั่งและวิธีหา element
- **Test Automation (เล่นซ้ำ)** (แท็บ ④ หลัง pytest): เปิด browser ให้เห็นบนเครื่องแล้วทำตามที่บันทึกครบทุกขั้น ตีกรอบแดง + ป้าย "ขั้นที่ N" ที่ปุ่ม/ช่องก่อนกด, ตรวจผลทุกขั้น (หน้าเปลี่ยน, popup, ข้อความ), ภาพประกอบทุกขั้น, สถานะสดในหน้าเว็บ, เลือกความเร็วได้, หยุดกลางทางได้
- API: `/api/web-recorder/{id}/pause|resume|testcase|check`, `/api/web-recorder-active`, `POST /api/web-explorer/{id}/replay`, `/api/web-replay/{id}`, `/cancel`, `/shot/{name}`

## [1.5.1] — 2026-10-02

### Fixed
- Test ที่บันทึกจากการ Login (เช่น saucedemo) Fail ตอน Run เพราะระบบไม่เก็บรหัสผ่าน → โค้ดใช้รหัสตัวอย่าง → Login ไม่ผ่าน: เพิ่มช่อง "รหัสผ่านที่ใช้ตอนบันทึก" ในกล่อง Run (ส่งเป็น `RECORD_PASSWORD` เฉพาะตอนรัน ไม่ถูกเก็บ) · โค้ดอ่าน `RECORD_PASSWORD` หรือ `LOGIN_PASS` · การบันทึกเก่าก็ใช้ได้

## [1.5.0] — 2026-10-02 — บันทึกการใช้งานเป็น Test Case (Record)

### Added
- Web Explorer โหมด **บันทึกการใช้งาน (Record)**: เปิดหน้าต่าง browser จริงบนเครื่อง → ผู้ใช้ทำรายการเอง → ระบบบันทึกทีละขั้นแบบสด: คลิกปุ่ม/ลิงก์, ค่าที่พิมพ์ในแต่ละช่อง (เก็บค่าสุดท้ายของช่อง 1 ขั้นต่อช่อง), เลือก Dropdown, ติ๊ก Checkbox/Radio, กด Enter, popup alert/confirm (ข้อความจริง), popup ในหน้า (role=dialog/alert/modal/toast), การเปลี่ยนหน้า
- Locator ของแต่ละ element คำนวณตอนผู้ใช้กด/พิมพ์ (role+ชื่อ → label → placeholder → id → name → data-testid → CSS path) และเลือกแบบที่ตรงตัวเดียว
- "หยุดบันทึก" → สร้าง **TC-REC-01** (สถานการณ์ตามที่บันทึก + ผลที่คาดหวังจาก popup/การเปลี่ยนหน้า) และ **TC-REC-02** (ทำทางเดิมแต่ไม่กรอกข้อมูล → ต้องไม่แสดงผลสำเร็จ) + pytest `tests/test_06_recorded.py` ที่ตรวจข้อความ popup จริง · เก็บเข้า Web History / คลังรวม (หมวด "สถานการณ์ที่บันทึก")
- ความปลอดภัย: ไม่บันทึกรหัสผ่าน (โค้ดใช้ RECORD_PASSWORD หรือค่าตัวอย่าง), ปิดบังตัวเลข 13–19 หลัก (บัตร/เลขบัตรประชาชน), alert กด OK / confirm กด Cancel, บันทึกได้ครั้งละ 1 รายการ สูงสุด 15 นาที
- API: `POST /api/web-recorder/start`, `GET /api/web-recorder/{id}`, `POST /api/web-recorder/{id}/stop`

## [1.4.0] — 2026-10-02 — คลัง Test Case รวมทุกเว็บไซต์ + Dropdown + Google Sheets

### Added
- Web History แท็บ **คลัง Test Case รวม (ทุกเว็บไซต์)**: รวม Test Case จากทุกหน้า/ทุกเว็บต่อกันเป็นรายการเดียว ข้อที่เหมือนกัน (หมวดเดียวกัน + ชื่อเดียวกัน) รวมเป็นแถวเดียว → ไม่มีข้อซ้ำ · รหัสถาวร **TL-001 …** · ทุกแถวอ้างอิงกลับได้ว่าพบในหน้าไหน (WP-ID) และมีกี่เว็บไซต์ · ขั้นตอนแสดง URL เป็น "[หน้าเว็บที่ทดสอบ]"
- ตัวกรอง: หมวด (Login, หลัง Login, กดปุ่ม/ลิงก์, กรอกข้อมูล, Dropdown, หน้าเว็บ) พร้อมจำนวน, ค้นหาข้อความ/รหัส, เว็บไซต์, ผลรันล่าสุด
- Google Sheets: ปุ่ม **คัดลอกไปวางใน Google Sheets** (คัดลอกเป็นตาราง + เปิดชีตใหม่ sheets.new ให้วาง Ctrl+V) · ดาวน์โหลด **Excel (.xlsx)** สำหรับ File → Import · CSV — ส่งออกตามตัวกรองที่เลือก
- **Dropdown**: การสำรวจอ่านตัวเลือกของ `<select>` · Test Case ใหม่: มีตัวเลือกให้เลือก, เลือกค่าได้, บังคับเลือก (required)
- API: `GET /api/web-library`, `/api/web-library/export.xlsx`, `/api/web-library/export.csv`

## [1.3.0] — 2026-10-02 — Click Explore (กดสำรวจแบบปลอดภัย)

### Added
- Web Explorer ตัวเลือก **กดสำรวจ (Click Explore)**: กดปุ่ม/ลิงก์บนหน้า (หลัง Login ถ้า Login ได้) ทีละอัน เริ่มจากหน้าเดิมทุกครั้ง สูงสุด 1–20 ครั้ง แล้วบันทึกผล: URL เปลี่ยน, หน้าต่าง/modal เปิด, กล่องข้อความ (alert) เด้ง, ข้อความบนหน้าเพิ่ม/หาย, เปิดแท็บใหม่ + ภาพหน้าจอหลังกด
- ความปลอดภัย: **ไม่กด**ปุ่ม/ลิงก์เกี่ยวกับชำระเงิน/ซื้อ/สั่งซื้อ/Checkout/บัตร/โอน, ลบ, ส่ง/ยืนยัน/บันทึก, ออกจากระบบ, รหัสผ่าน, สร้าง/อนุมัติ/สมัคร/จอง, Upload/Download/Import/Export/Run, ปุ่มส่งฟอร์ม, ปุ่มที่ไม่มีชื่อ และลิงก์ไปเว็บอื่น · ระหว่างกด **ยกเลิกทุก request ที่เขียนข้อมูล (POST/PUT/PATCH/DELETE)** · กล่อง confirm ถูกกด Cancel เสมอ
- สร้าง Test Case พฤติกรรมจากผลที่เห็นจริง (TC-CLICK-xx, กลุ่ม "การกด" ใน Web History) + pytest `tests/test_05_clicks.py` ที่กันการเขียนข้อมูลแบบเดียวกัน
- ตารางผลการกดสำรวจในแท็บ ① (ซ่อนในโหมดฝึกจนกด "ดูเฉลย")

## [1.2.0] — 2026-10-02 — Web History (ประวัติ Test Case ของแต่ละหน้าเว็บ)

### Added
- ทุกการสำรวจใน Web Explorer ถูกเก็บเข้า **ประวัติของหน้าเว็บนั้น** (host + path; `?query` ต่างกันถือเป็นหน้าเดียวกัน) — `storage/explore/history/<key>.json`
- Test Case แต่ละแบบมี signature คงที่ + รหัสประวัติถาวร **WP-001, WP-002 …** (ไม่ซ้ำ ไม่เปลี่ยน)
- **ออกแบบ Test Case ใหม่ไม่ซ้ำของเดิม**: แคตตาล็อกแบบทดสอบเพิ่ม (Login: ข้อความ error, กรอกช่องเดียว, รหัสไม่อยู่ใน URL, กด Enter, เปิดหน้าหลัง Login ตรงๆ, Refresh แล้วยังอยู่ในระบบ, Back หลัง Logout · หน้าเว็บ: JS error, เวลาโหลด, Refresh, จอมือถือ, HTTPS, lang, alt · ช่องกรอก: กรอกได้, ภาษาไทย, อักขระพิเศษ, ข้อความยาว) — แต่ละรอบเลือกเฉพาะแบบที่หน้านั้นยังไม่เคยมี (ตั้งจำนวนได้ 0–30, ค่าเริ่มต้น 5)
- หน้า **Web History** (`/web-explorer/history`): รายการหน้าเว็บ, Test Case สะสมพร้อมวันที่ออกแบบครั้งแรก/จำนวนครั้ง/ผลรันล่าสุด, ตัวกรอง, ไทม์ไลน์การสำรวจ, ดาวน์โหลด pytest รวมทุก TC (ZIP), Export CSV (เปิดใน Excel ได้)
- Web Explorer แสดงป้าย "ใหม่ / เคยมีแล้ว" และสรุปประวัติของหน้า; ผลรันถูกบันทึกกลับเข้าประวัติ
- API: `GET /api/web-history`, `GET /api/web-history/{key}`, `/zip`, `/csv`; `POST /api/web-explorer` รับ `extra`
- ผลการสำรวจเดิมก่อนมีฟีเจอร์นี้ถูกนำเข้าประวัติอัตโนมัติเมื่อเปิดหน้า Web History ครั้งแรก

## [1.1.0] — 2026-10-02 — Web Explorer (โหมดฝึก) + ใช้งานแบบไม่ใช้ Docker

### Added
- **Web Explorer** (`/web-explorer`, เมนู "ฝึก Automation"): วาง URL → เปิด headless Chromium → ถ่ายภาพและสรุปสิ่งที่เห็น (หัวข้อ, ช่องกรอก, ปุ่ม, ลิงก์, ฟอร์ม Login, CAPTCHA/OTP, alt/lang) → ถ้าใส่ Username/Password จะลอง Login 1 ครั้งและสำรวจหน้าหลัง Login → แตกเป็น Test Case (TC-WEB / TC-LOGIN / TC-HOME) → สร้างโปรเจกต์ pytest-playwright (Page Object, conftest fixture, marker, parametrize, คอมเมนต์ภาษาไทย) → รันใน Sandbox ได้ทันที → ดาวน์โหลด ZIP
  - โหมดฝึก: ซ่อนเฉลยจนกว่าผู้ใช้จะจดสิ่งที่สังเกตเอง + แท็บ "เรียนรู้ pytest"
  - Locator เลือกเฉพาะแบบที่ match element เดียวตอนสำรวจ (role → label → placeholder → id/name)
  - Password ไม่ถูกบันทึก (ใช้ในหน่วยความจำครั้งเดียว), Username ถูก Mask ใน Audit, ไม่แก้/ข้าม CAPTCHA หรือ OTP
  - API: `POST/GET /api/web-explorer`, `GET /api/web-explorer/{id}`, `/screenshot/{before|after}`, `/zip`, `POST /run`, `DELETE`
- `RUN-DEV.bat` / `STOP-DEV.bat`: รันแบบไม่ใช้ Docker (SQLite `storage\webqa.sqlite3`, งานเบื้องหลังแบบ inline, ติดตั้ง package + Chromium ให้อัตโนมัติ)
- `SINGLE_USER_MODE`: ใช้คนเดียว — admin ไม่ถูกบังคับเปลี่ยนรหัส, ปิดบัญชี demo
- `DEPLOY.bat`: deploy ด้วย Docker แบบดับเบิลคลิก

### Fixed
- ชื่อ Test ภาษาไทยในผลรันแสดงเป็นรหัส `\u0e..` → แสดงเป็นตัวอักษรไทย (pytest.ini ที่ generate)
- `requirements-dev.txt` ระบุ pytest คนละเวอร์ชันกับ automation-runner ทำให้ติดตั้งรวมกันไม่ได้ → ใช้ 8.3.3 ทั้งคู่
- Sandbox: ส่งตัวแปรที่ Playwright ต้องใช้ (LOCALAPPDATA ฯลฯ) และไม่จำกัด address space สำหรับ browser test

## [1.0.0] — 2026-10-01 — Repository จริง (หัวข้อ 42)

### Added
- `backend/` FastAPI + SQLAlchemy 2 + Alembic (`0001_initial`, `0002_test_data_text`) + PostgreSQL/SQLite, 88 REST endpoints, RBAC 4 Role, bcrypt, Session timeout, Rate limit, Audit, Masking, Error model + Correlation ID
- Port Logic จากต้นแบบ: `04_source/p3_engine.js` → `backend/app/services/engine/` (Parsers, Normalize, Section/Chunk, Requirement extraction, Quality score + เหตุผล, Clarification/Assumption, Conflict detection) และ `04_source/p4_gen.js` → `services/testdesign.py` + `services/generators/` (Boundary, Priority/Risk, Scenario, Test Case, Python, Pytest, Postman, SQL, Playwright, JMeter, GitHub Actions, Secret scan) — ตรวจความเท่ากันด้วย Golden test
- Document Processing ราย Section: Retry Section / Retry Failed Only / Cancel / Resume / Progress / Log, รูปหน้าจอ → NEEDS_VISUAL_REVIEW
- Version Compare + Impact Proposal (ไม่แก้ Test Case ที่ Approved อัตโนมัติ)
- AI Provider Interface: Rule Engine + Claude API (Hallucination control, Prompt version, Input hash, Token usage)
- Storage Interface (`LocalStorage` ที่ `.\storage`, พร้อมต่อยอด MinIO/Azure Blob)
- `worker/` Celery + Redis (acks_late, retry)
- `automation-runner/` Sandbox (rlimit CPU/RAM/FSIZE/NPROC, timeout, output cap, clean env, AST validation), HTTP service, Headed Exploration CLI
- GitHub Integration: Connect, Proposal + Preview (files/diff), Approve, Execute (branch + commit + PR, ไม่มี merge/force push)
- `frontend/` Next.js 15 + TypeScript + Tailwind + shadcn-style (Radix) + TanStack Query + React Hook Form + Zod + Monaco (offline) — 24 หน้า ตาม PAGE_SPECIFICATION โดยใช้ Design token จาก `03_web_app`
- Excel Export 10 Sheet (openpyxl) พร้อม Freeze Header, Filter, Wrap, สี Status
- Docker Compose (postgres, redis, backend, worker, runner, frontend), `.env.example`, Secret อัตโนมัติ, Network-sharing guard
- VS Code: `.vscode/` (settings, extensions, launch, tasks) + `WebQA2026.code-workspace`
- CI: `.github/workflows/ci.yml` · Docs: ARCHITECTURE, SECURITY, API, DATABASE, DEVELOPMENT, DEPLOYMENT_WINDOWS, USER_GUIDE_TH, TESTING

### Fixed (เทียบต้นแบบ HTML)
- Completeness reason "ระบุ Role" แสดงผิดเป็น "ไม่มี  Role" → "ไม่ระบุ Role"
- คำถาม Clarification ที่ยังไม่ตอบเปลี่ยน ID ทุกครั้งที่ Resolve ข้ออื่น → คง ID เดิม
- Length Boundary (เช่น ไม่เกิน 200 ตัวอักษร) สร้างเป็นตัวเลข → สร้าง String ความยาวจริง + `len()` ใน rule_service
- Excel ไม่มี Freeze Header/สี Status → มีแล้ว
- ข้อมูลอยู่ใน IndexedDB ของเบราว์เซอร์ → PostgreSQL + `.\storage`

## [0.9.0] — 2026-09-30 — ต้นแบบ HTML ไฟล์เดียว
- `03_web_app/brs-qa-platform.html` (ดู `01_conversation/CONVERSATION_HISTORY.md`)
