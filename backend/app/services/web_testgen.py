"""Web Explorer → simple Test Cases + pytest-playwright project (rule-based, no AI key needed).

Every generated test maps 1:1 to a Test Case ID, uses only locators that matched exactly one element
during exploration, and reads credentials from environment variables (never hard-coded).
"""
from __future__ import annotations

import json
import re
from urllib.parse import urljoin, urlparse

from .web_explorer import LOGOUT_RX

PIN_REQUIREMENTS = "pytest==8.3.3\npytest-playwright==0.7.1\nplaywright==1.56.0\npython-dotenv==1.0.1\n"


def q(s: str) -> str:
    """Python string literal (Thai stays readable)."""
    return json.dumps(s, ensure_ascii=False)


def loc_code(spec: dict, page: str = "page") -> str:
    by, v = spec["by"], q(spec["value"])
    if by == "label":
        return f"{page}.get_by_label({v}, exact=True)"
    if by == "placeholder":
        return f"{page}.get_by_placeholder({v}, exact=True)"
    if by == "role":
        return f"{page}.get_by_role({q(spec['role'])}, name={v}, exact=True)"
    return f"{page}.locator({v})"


def loc_human(spec: dict) -> str:
    by = spec["by"]
    return {"label": f"ช่องที่มีป้ายชื่อ \"{spec['value']}\"", "placeholder": f"ช่องที่มีข้อความจาง \"{spec['value']}\"",
            "role": f"{'ปุ่ม' if spec.get('role') == 'button' else 'ลิงก์'} \"{spec['value']}\""}.get(by, f"element {spec['value']}")


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:30] or "site"


def _same_origin_links(snap: dict, base: str, limit: int = 5) -> list[dict]:
    host = urlparse(base).netloc
    out, seen = [], set()
    for l in snap["links"]:
        u = urlparse(l["href"])
        if u.scheme not in ("http", "https") or u.netloc != host:
            continue
        clean = l["href"].split("#")[0]
        if not clean or clean in seen or clean.rstrip("/") == base.split("#")[0].rstrip("/") or LOGOUT_RX.search(l["text"] or ""):
            continue
        seen.add(clean)
        out.append({"text": l["text"] or clean, "href": clean})
        if len(out) >= limit:
            break
    return out


def build(r: dict) -> dict:
    """Return {'test_cases': [...], 'files': {path: content}} from an exploration result."""
    url = r["url"]
    b = r["before"]
    lf = r.get("login_form") or {}
    lg = r.get("login") or {}
    after = r.get("after")
    tcs: list[dict] = []
    files: dict[str, str] = {}

    def tc(id_, title, type_, steps, expected, observed, func, file, needs_login=False, priority="Medium"):
        tcs.append({"id": id_, "title": title, "type": type_, "priority": priority, "steps": steps, "expected": expected,
                    "observed": observed, "func": func, "file": file, "needs_login": needs_login})

    # ---------------------------------------------------------------- page-level tests
    heads = [h for h in b["headings"] if h["text"]][:3]
    visible_fields = [f for f in b["fields"] if f.get("locator")][:6]
    visible_btns = [x for x in b["buttons"] if x.get("locator")][:4]
    links = _same_origin_links(b, url)

    t1 = ["import re", "", "import pytest", "from playwright.sync_api import Page, expect", "",
          f"PAGE_TITLE = {q(b['title'])}  # ชื่อหน้าที่สังเกตได้ตอนสำรวจ", "", ""]
    tc("TC-WEB-001", "เปิดหน้าเว็บได้และชื่อหน้าถูกต้อง", "Smoke", [f"เปิด {url}"],
       f"หน้าเว็บโหลดสำเร็จ (HTTP 2xx/3xx) และ title มีคำว่า \"{b['title']}\"" if b["title"] else "หน้าเว็บโหลดสำเร็จ (HTTP 2xx/3xx)",
       f"HTTP {r.get('status')}, title = \"{b['title']}\"", "test_tc_web_001_page_opens", "tests/test_01_page.py", priority="High")
    t1 += ["@pytest.mark.smoke", "def test_tc_web_001_page_opens(page: Page, site_url):",
           '    """TC-WEB-001: เปิดหน้าเว็บได้และชื่อหน้าถูกต้อง"""',
           "    # Act: เปิดหน้าเว็บ (page = browser tab ที่ pytest-playwright เตรียมให้)",
           "    response = page.goto(site_url)",
           "    # Assert: server ตอบสำเร็จ",
           "    assert response is None or response.ok, f\"HTTP {response.status}\""]
    if b["title"]:
        t1 += ["    # Assert: ชื่อหน้า (title) ตรงกับที่สังเกตไว้ — expect() จะรอให้เป็นจริงเองสูงสุด 5 วินาที",
               "    expect(page).to_have_title(re.compile(re.escape(PAGE_TITLE)))"]
    t1 += ["", ""]

    if heads or visible_fields or visible_btns:
        items = [f"หัวข้อ \"{h['text']}\"" for h in heads] + [loc_human(f["locator"]) for f in visible_fields] + [loc_human(x["locator"]) for x in visible_btns]
        tc("TC-WEB-002", "องค์ประกอบหลักของหน้าแสดงครบ", "UI", [f"เปิด {url}", "สังเกตหัวข้อ ช่องกรอก และปุ่ม"],
           "เห็น: " + ", ".join(items), "พบครบตอนสำรวจ", "test_tc_web_002_main_elements_visible", "tests/test_01_page.py", priority="High")
        t1 += ["@pytest.mark.smoke", "def test_tc_web_002_main_elements_visible(page: Page, site_url):",
               '    """TC-WEB-002: องค์ประกอบหลักของหน้าแสดงครบ"""', "    page.goto(site_url)",
               "    # Assert: แต่ละบรรทัดคือ 1 สิ่งที่เราสังเกตเห็นบนหน้าจอ"]
        for h in heads:
            t1.append(f"    expect(page.get_by_role(\"heading\", name={q(h['text'])}).first).to_be_visible()")
        for f in visible_fields:
            t1.append(f"    expect({loc_code(f['locator'])}).to_be_visible()  # {f['label'] or f['placeholder'] or f['name'] or f['type']}")
        for x in visible_btns:
            t1.append(f"    expect({loc_code(x['locator'])}).to_be_visible()  # ปุ่ม")
        t1 += ["", ""]

    if links:
        tc("TC-WEB-003", "ลิงก์บนหน้าเปิดได้ (ไม่เสีย)", "Navigation", [f"เปิด {url}", "ตรวจลิงก์ภายในเว็บเดียวกัน: " + ", ".join(l["text"] for l in links)],
           "ทุกลิงก์ตอบกลับสำเร็จ (ไม่ใช่ 4xx/5xx)", f"พบลิงก์ภายใน {len(links)} รายการ", "test_tc_web_003_links_work", "tests/test_01_page.py")
        t1 += ["# parametrize = รัน Test เดียวกันซ้ำกับข้อมูลหลายชุด (1 ลิงก์ = 1 ผลลัพธ์)",
               "LINKS = [", *[f"    ({q(l['text'])}, {q(l['href'])})," for l in links], "]", "", "",
               "@pytest.mark.parametrize(\"text,href\", LINKS, ids=[t for t, _ in LINKS])",
               "def test_tc_web_003_links_work(page: Page, text, href):",
               '    """TC-WEB-003: ลิงก์บนหน้าเปิดได้ (ไม่เสีย)"""',
               "    response = page.request.get(href)  # ขอหน้าโดยตรง ไม่ต้องคลิก (เร็วกว่า)",
               "    assert response.ok, f\"ลิงก์ '{text}' ตอบ HTTP {response.status}\"", "", ""]
    files["tests/test_01_page.py"] = "\n".join(t1).rstrip() + "\n"

    # ---------------------------------------------------------------- login tests
    has_login = bool(lf.get("password"))
    if has_login:
        pw_spec = lf["password"]["locator"]
        user_spec = (lf.get("user") or {}).get("locator")
        sub_spec = (lf.get("submit") or {}).get("locator")
        files["pages/__init__.py"] = ""
        lp = ['"""Page Object ของหน้า Login — เก็บ "วิธีหา element" ไว้ที่เดียว ถ้าหน้าเว็บเปลี่ยน แก้ที่ไฟล์นี้ไฟล์เดียว"""',
              "from playwright.sync_api import Page", "", "", "class LoginPage:", "    def __init__(self, page: Page):", "        self.page = page"]
        lp.append(f"        self.username = {loc_code(user_spec, 'page')}" if user_spec else "        self.username = None  # ไม่พบช่อง Username ตอนสำรวจ")
        lp.append(f"        self.password = {loc_code(pw_spec, 'page')}")
        lp.append(f"        self.submit = {loc_code(sub_spec, 'page')}" if sub_spec else "        self.submit = None  # ไม่พบปุ่ม — จะกด Enter แทน")
        lp += ["", "    def open(self, url: str):", "        self.page.goto(url)", "        return self", "",
               "    def login(self, user: str, password: str):", "        if self.username is not None:", "            self.username.fill(user)",
               "        self.password.fill(password)", "        if self.submit is not None:", "            self.submit.click()", "        else:",
               "            self.password.press(\"Enter\")", ""]
        files["pages/login_page.py"] = "\n".join(lp)

        t2 = ["import pytest", "from playwright.sync_api import Page, expect", "", "from pages.login_page import LoginPage", "", ""]
        tc("TC-LOGIN-001", "ช่อง Password ปิดบังตัวอักษร", "Security", [f"เปิด {url}", "ดูชนิดของช่อง Password"],
           "ช่อง Password เป็น type=\"password\" (พิมพ์แล้วเห็นเป็นจุด)", "type=password", "test_tc_login_001_password_is_masked", "tests/test_02_login.py")
        t2 += ["@pytest.mark.login", "def test_tc_login_001_password_is_masked(page: Page, site_url):",
               '    """TC-LOGIN-001: ช่อง Password ปิดบังตัวอักษร"""', "    login = LoginPage(page).open(site_url)",
               "    expect(login.password).to_have_attribute(\"type\", \"password\")", "", ""]
        tc("TC-LOGIN-002", "กด Login โดยไม่กรอกข้อมูล", "Negative", [f"เปิด {url}", "ไม่กรอกอะไร กดปุ่ม Login"],
           "ยังอยู่หน้า Login (ยังเห็นช่อง Password) — ไม่เข้าสู่ระบบ", "-", "test_tc_login_002_empty_submit_stays", "tests/test_02_login.py")
        t2 += ["@pytest.mark.login", "@pytest.mark.negative", "def test_tc_login_002_empty_submit_stays(page: Page, site_url):",
               '    """TC-LOGIN-002: กด Login โดยไม่กรอกข้อมูล → ต้องไม่เข้าสู่ระบบ"""', "    login = LoginPage(page).open(site_url)",
               "    if login.submit is not None:", "        login.submit.click()", "    else:", "        login.password.press(\"Enter\")",
               "    page.wait_for_timeout(1000)  # ให้เวลาหน้าเว็บตอบสนอง", "    expect(login.password).to_be_visible()", "", ""]
        tc("TC-LOGIN-003", "Login ด้วยรหัสผ่านผิด", "Negative", [f"เปิด {url}", "กรอก Username ตัวอย่าง และรหัสผ่านผิด", "กด Login"],
           "Login ไม่สำเร็จ ยังอยู่หน้า Login และควรมีข้อความแจ้งเตือน", "-", "test_tc_login_003_wrong_password_rejected", "tests/test_02_login.py", priority="High")
        t2 += ["@pytest.mark.login", "@pytest.mark.negative", "def test_tc_login_003_wrong_password_rejected(page: Page, site_url):",
               '    """TC-LOGIN-003: Login ด้วยรหัสผ่านผิด → ต้องถูกปฏิเสธ"""',
               "    # Arrange: ใช้ข้อมูลสมมติ (Synthetic) ไม่ใช้บัญชีจริง", "    login = LoginPage(page).open(site_url)",
               "    # Act", "    login.login(\"qa.practice.user\", \"Wrong-Password-123!\")",
               "    page.wait_for_timeout(1500)", "    # Assert: ยังเห็นช่อง Password = ยังไม่ได้เข้าสู่ระบบ",
               "    expect(login.password).to_be_visible()", "", ""]
        after_path = urlparse(lg.get("url_after", "")).path if lg.get("success") else ""
        exp = "เข้าสู่ระบบได้ ช่อง Password หายไป" + (f" และไปที่หน้า {after_path}" if after_path else "")
        tc("TC-LOGIN-004", "Login ด้วยบัญชีที่ถูกต้อง", "Positive", [f"เปิด {url}", "กรอก Username/Password ที่ถูกต้อง", "กด Login"], exp,
           ("สำเร็จ → " + after_path) if lg.get("success") else (lg.get("message") or "ยังไม่ได้ลองตอนสำรวจ"),
           "test_tc_login_004_valid_login", "tests/test_02_login.py", needs_login=True, priority="High")
        t2 += ["@pytest.mark.login", "def test_tc_login_004_valid_login(page: Page, site_url, credentials):",
               '    """TC-LOGIN-004: Login ด้วยบัญชีที่ถูกต้อง (ต้องตั้ง LOGIN_USER / LOGIN_PASS)"""',
               "    user, password = credentials  # มาจาก environment variable ไม่เขียนรหัสลงในโค้ด",
               "    login = LoginPage(page).open(site_url)", "    login.login(user, password)",
               "    # Assert: ช่อง Password หายไป = เข้าสู่ระบบแล้ว", "    expect(login.password).to_be_hidden(timeout=15000)"]
        if after_path and after_path != urlparse(url).path:
            t2 += [f"    expect(page).to_have_url(re.compile({q(re.escape(after_path))}))"]
            t2.insert(0, "import re")
        files["tests/test_02_login.py"] = "\n".join(t2).rstrip() + "\n"

    # ---------------------------------------------------------------- after-login tests
    if has_login and after:
        menu = [l for l in after["links"] if l.get("locator") and l["text"] and not LOGOUT_RX.search(l["text"])]
        menu = ([l for l in menu if l.get("nav")] or menu)[:6]
        btns = [x for x in after["buttons"] if x.get("locator") and x["text"] and not LOGOUT_RX.search(x["text"])][:3]
        logout = next((x for x in after["buttons"] + after["links"] if x.get("locator") and LOGOUT_RX.search(x["text"] or "")), None)
        t3 = ["import pytest", "from playwright.sync_api import Page, expect", "", "from pages.login_page import LoginPage", "", ""]
        if menu or btns:
            tc("TC-HOME-001", "หลัง Login เห็นเมนูและปุ่มหลัก", "UI", ["Login ด้วยบัญชีที่ถูกต้อง", "สังเกตเมนูและปุ่ม"],
               "เห็น: " + ", ".join([f"เมนู \"{l['text']}\"" for l in menu] + [f"ปุ่ม \"{x['text']}\"" for x in btns]),
               "พบครบตอนสำรวจ", "test_tc_home_001_menu_visible", "tests/test_03_after_login.py", needs_login=True)
            t3 += ["@pytest.mark.login", "def test_tc_home_001_menu_visible(logged_in_page: Page):",
                   '    """TC-HOME-001: หลัง Login เห็นเมนูและปุ่มหลัก (logged_in_page = fixture ที่ Login ให้แล้ว ดู conftest.py)"""',
                   "    page = logged_in_page"]
            t3 += [f"    expect({loc_code(l['locator'])}).to_be_visible()" for l in menu]
            t3 += [f"    expect({loc_code(x['locator'])}).to_be_visible()" for x in btns]
            t3 += ["", ""]
        if logout:
            tc("TC-HOME-002", "ออกจากระบบได้", "Positive", ["Login ด้วยบัญชีที่ถูกต้อง", f"กด \"{logout['text']}\""],
               "กลับมาหน้า Login (เห็นช่อง Password อีกครั้ง)", f"พบ \"{logout['text']}\"", "test_tc_home_002_logout",
               "tests/test_03_after_login.py", needs_login=True)
            t3 += ["@pytest.mark.login", "def test_tc_home_002_logout(logged_in_page: Page):",
                   '    """TC-HOME-002: ออกจากระบบได้"""', "    page = logged_in_page",
                   f"    {loc_code(logout['locator'])}.click()", "    expect(LoginPage(page).password).to_be_visible(timeout=15000)", "", ""]
        if len(t3) > 6:
            files["tests/test_03_after_login.py"] = "\n".join(t3).rstrip() + "\n"

    # ---------------------------------------------------------------- project scaffolding
    conf = ['"""conftest.py = ไฟล์ที่ pytest อ่านก่อนทุก Test — ใช้เก็บ fixture (ของที่หลาย Test ใช้ร่วมกัน)"""', "import os", "",
            "import pytest", "", "try:", "    from dotenv import load_dotenv", "    load_dotenv()  # อ่านค่าจากไฟล์ .env ถ้ามี", "except ImportError:",
            "    pass", "", f"DEFAULT_URL = {q(url)}", "", "", "@pytest.fixture", "def site_url():",
            '    """URL ที่จะทดสอบ — เปลี่ยนได้ด้วย BASE_URL โดยไม่ต้องแก้โค้ด"""', "    return os.getenv(\"BASE_URL\") or DEFAULT_URL", "", "",
            "@pytest.fixture", "def credentials():", '    """Username/Password มาจาก environment variable เท่านั้น — ไม่เขียนรหัสจริงลงในโค้ด"""',
            "    user, password = os.getenv(\"LOGIN_USER\", \"\"), os.getenv(\"LOGIN_PASS\", \"\")", "    if not user or not password:",
            "        pytest.skip(\"ยังไม่ได้ตั้ง LOGIN_USER / LOGIN_PASS — ข้าม Test ที่ต้อง Login\")", "    return user, password", ""]
    if has_login:
        conf += ["", "@pytest.fixture", "def logged_in_page(page, site_url, credentials):",
                 '    """เตรียมหน้าเว็บที่ Login แล้ว ให้ Test ที่ต้องอยู่หลัง Login ใช้ต่อ"""',
                 "    from playwright.sync_api import expect", "", "    from pages.login_page import LoginPage", "",
                 "    login = LoginPage(page).open(site_url)", "    login.login(*credentials)", "    expect(login.password).to_be_hidden(timeout=15000)",
                 "    return page", ""]
    files["conftest.py"] = "\n".join(conf)
    files["pytest.ini"] = ("[pytest]\ntestpaths = tests\nmarkers =\n    smoke: ทดสอบพื้นฐานว่าหน้าเว็บใช้ได้\n    login: เกี่ยวกับการเข้าสู่ระบบ\n"
                           "    negative: กรณีผิดปกติ/ข้อมูลผิด\naddopts = --screenshot only-on-failure --output test-results\n"
                           "# แสดงชื่อ Test ภาษาไทยเป็นตัวอักษร (ไม่ใช่รหัส \\u0e..)\n"
                           "disable_test_id_escaping_and_forfeit_all_rights_to_community_support = True\n")
    files["requirements.txt"] = PIN_REQUIREMENTS
    files["tests/__init__.py"] = ""
    files[".env.example"] = f"BASE_URL={url}\nLOGIN_USER=\nLOGIN_PASS=\n"
    files["TEST_CASES.md"] = _tc_markdown(url, tcs)
    files["README_TH.md"] = _readme(url, has_login)
    return {"test_cases": tcs, "files": files, "slug": _slug(urlparse(url).netloc)}


def _tc_markdown(url: str, tcs: list[dict]) -> str:
    rows = ["# Test Cases — " + url, "", "| ID | ชื่อ | ประเภท | ขั้นตอน | ผลที่คาดหวัง | pytest |", "|---|---|---|---|---|---|"]
    for t in tcs:
        rows.append(f"| {t['id']} | {t['title']} | {t['type']} | {'<br>'.join(f'{i+1}. {s}' for i, s in enumerate(t['steps']))} | {t['expected']} | `{t['file']}::{t['func']}` |")
    return "\n".join(rows) + "\n"


def _readme(url: str, has_login: bool) -> str:
    return f"""# Automated tests สำหรับ {url}

สร้างโดย WebQA2026 · Web Explorer (โหมดฝึก) — ใช้ pytest + Playwright

## รันบนเครื่องตัวเอง (Windows)

```powershell
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
python -m playwright install chromium
copy .env.example .env      # แล้วใส่ LOGIN_USER / LOGIN_PASS ถ้าต้องการทดสอบ Login
pytest                       # รันทุก Test
pytest -m smoke              # รันเฉพาะ Test ที่ติด marker smoke
pytest -k login --headed --slowmo 500   # ดู browser ทำงานจริงแบบช้าๆ
```

## โครงสร้าง

- `tests/` — ไฟล์ Test (ชื่อต้องขึ้นต้นด้วย `test_`)
{"- `pages/login_page.py` — Page Object: วิธีหา element ของหน้า Login" if has_login else ""}
- `conftest.py` — fixture ที่ใช้ร่วมกัน (URL, Username/Password)
- `TEST_CASES.md` — Test Case ทั้งหมด และชื่อ Test ที่ตรงกัน

ถ้า Test ไหน Fail ดูภาพหน้าจอใน `test-results/`
"""
