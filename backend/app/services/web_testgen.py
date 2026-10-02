"""Web Explorer → simple Test Cases + pytest-playwright project (rule-based, no AI key needed).

Every generated test maps 1:1 to a Test Case ID, uses only locators that matched exactly one element
during exploration, and reads credentials from environment variables (never hard-coded).
"""
from __future__ import annotations

import json
import re
from urllib.parse import urljoin, urlparse

from .web_explorer import ALERT_SEL, LOGOUT_RX, MODAL_SEL

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


BASE_SIG = {"TC-WEB-001": "page.opens", "TC-WEB-002": "page.main_elements", "TC-WEB-003": "page.links",
            "TC-LOGIN-001": "login.password_masked", "TC-LOGIN-002": "login.empty_submit", "TC-LOGIN-003": "login.wrong_password",
            "TC-LOGIN-004": "login.valid", "TC-HOME-001": "home.menu", "TC-HOME-002": "home.logout"}


def build(r: dict, *, history_sigs: set[str] | None = None, extra_limit: int = 5, include_sigs: set[str] | None = None,
          hid_map: dict[str, str] | None = None) -> dict:
    """Return {'test_cases': [...], 'files': {path: content}} from an exploration result.

    history_sigs: test-case signatures already designed for this page → extra designs skip them (no duplicates).
    extra_limit:  how many *new* extra designs to add this time.
    include_sigs: build exactly these extra designs instead (used for the history ZIP).
    hid_map:      sig → page-history ID (WP-001…) shown in docstrings and TEST_CASES.md.
    """
    history_sigs = history_sigs or set()
    hid_map = hid_map or {}
    url = r["url"]
    b = r["before"]
    lf = r.get("login_form") or {}
    lg = r.get("login") or {}
    after = r.get("after")
    tcs: list[dict] = []
    files: dict[str, str] = {}

    def tc(id_, title, type_, steps, expected, observed, func, file, needs_login=False, priority="Medium", sig=None):
        sig = sig or BASE_SIG[id_]
        tcs.append({"id": id_, "sig": sig, "hid": hid_map.get(sig), "is_new": sig not in history_sigs, "title": title, "type": type_,
                    "priority": priority, "steps": steps, "expected": expected, "observed": observed, "func": func, "file": file,
                    "needs_login": needs_login})

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

    # ---------------------------------------------------------------- Click Explore → behaviour tests (what really happened after a click)
    clicks = r.get("clicks") or {}
    behave = [x for x in clicks.get("items", []) if x.get("clicked") and x.get("changed") and _click_assertion(x)]
    if behave:
        logged = bool(clicks.get("logged_in"))
        t5 = ["import re", "", "import pytest", "from playwright.sync_api import Page, expect", "",
              f"START_URL = {q(clicks['start_url'])}  # หน้าที่เริ่มกดตอนสำรวจ", f"MODAL = {q(MODAL_SEL)}", "", "",
              "def block_writes(page: Page):",
              '    """กันไม่ให้ Test ส่งข้อมูลไปเปลี่ยนอะไรบน server (ยกเลิก POST/PUT/PATCH/DELETE) — เหมือนตอนสำรวจ"""',
              "    page.route(\"**/*\", lambda route: route.continue_() if route.request.method in (\"GET\", \"HEAD\", \"OPTIONS\") else route.abort())",
              "", ""]
        for i, x in enumerate(behave[:15], 1):
            id_ = f"TC-CLICK-{i:02d}"
            func = f"test_tc_click_{i:02d}_{_slug(x['label'])}"
            kind_th = "ปุ่ม" if x["kind"] == "button" else "ลิงก์"
            what, code = _click_assertion(x)
            sig = f"click:{x['kind']}:{x['label'][:60]}"
            tc(id_, f"กด{kind_th} \"{x['label']}\" แล้ว{what}", "Behavior",
               (["Login ด้วยบัญชีที่ถูกต้อง"] if logged else []) + [f"เปิด {clicks['start_url']}", f"กด{kind_th} \"{x['label']}\""],
               x["summary"], "เห็นตอนกดสำรวจ (ดูภาพในแท็บ ①)", func, "tests/test_05_clicks.py", needs_login=logged, sig=sig,
               priority="Medium")
            hid = hid_map.get(sig)
            t5 += ["@pytest.mark.smoke" if not logged else "@pytest.mark.login",
                   f"def {func}({'logged_in_page: Page' if logged else 'page: Page'}):",
                   f'    """{id_}{f" [{hid}]" if hid else ""}: ' + _doc("กด" + kind_th + " '" + x["label"] + "' แล้ว" + what) + '"""',
                   *(["    page = logged_in_page"] if logged else []),
                   "    page.goto(START_URL)", "    block_writes(page)",
                   *("    " + c for c in code(loc_code(x["locator"]))), "", ""]
        files["tests/test_05_clicks.py"] = "\n".join(t5).rstrip() + "\n"

    # ---------------------------------------------------------------- extra designs (never repeat what this page already has)
    cands = _extra_candidates(r, has_login)
    if include_sigs is not None:
        chosen = [c for c in cands if c["sig"] in include_sigs]
    else:
        chosen = [c for c in cands if c["sig"] not in history_sigs][:max(0, extra_limit)]
    if chosen:
        t4 = ["import re", "import time", "from urllib.parse import urlparse", "", "import pytest", "from playwright.sync_api import Page, expect", ""]
        if has_login:
            t4 += ["from pages.login_page import LoginPage", ""]
        t4 += [f"ALERT = {q(ALERT_SEL)}  # ตำแหน่งที่เว็บส่วนใหญ่ใช้แสดงข้อความ error", "WRONG_PASSWORD = \"Wrong-Password-123!\"", "", ""]
        for i, c in enumerate(chosen, 1):
            id_ = f"TC-MORE-{i:02d}"
            func = f"test_tc_more_{i:02d}_{c['name']}"
            tc(id_, c["title"], c["type"], c["steps"], c["expected"], c["observed"], func, "tests/test_04_more.py",
               needs_login=c.get("needs_login", False), priority=c.get("priority", "Medium"), sig=c["sig"])
            hid = hid_map.get(c["sig"])
            t4 += [*(f"@pytest.mark.{m}" for m in c.get("marks", [])), f"def {func}({c['args']}):",
                   f'    """{id_}{f" [{hid}]" if hid else ""}: ' + _doc(c["title"]) + '"""', *("    " + line for line in c["body"]), "", ""]
        files["tests/test_04_more.py"] = "\n".join(t4).rstrip() + "\n"

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
    return {"test_cases": tcs, "files": files, "slug": _slug(urlparse(url).netloc), "candidates_total": len(cands),
            "candidates_left": len([c for c in cands if c["sig"] not in history_sigs and c not in chosen])}


def _tc_markdown(url: str, tcs: list[dict]) -> str:
    rows = ["# Test Cases — " + url, "", "| ID | ประวัติ | ชื่อ | ประเภท | ขั้นตอน | ผลที่คาดหวัง | pytest |", "|---|---|---|---|---|---|---|"]
    for t in tcs:
        rows.append(f"| {t['id']} | {t.get('hid') or '-'}{' (ใหม่)' if t.get('is_new') else ''} | {t['title']} | {t['type']} | {'<br>'.join(f'{i+1}. {s}' for i, s in enumerate(t['steps']))} | {t['expected']} | `{t['file']}::{t['func']}` |")
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


# ------------------------------------------------------------------ catalog of extra test designs
TEXT_TYPES = {"text", "search", "", "textarea"}


def _field_name(f: dict) -> str:
    return f["label"] or f["placeholder"] or f["name"] or f["id"] or f["type"]


def _extra_candidates(r: dict, has_login: bool) -> list[dict]:
    """Ordered catalog of additional test ideas for this page. Each has a stable `sig` so the page history
    can tell which ideas were already designed. Only ideas that make sense for what was observed are returned."""
    url = r["url"]
    b = r["before"]
    lf = r.get("login_form") or {}
    lg = r.get("login") or {}
    after = r.get("after")
    host = urlparse(url).hostname or ""
    out: list[dict] = []

    def add(sig, name, title, type_, steps, expected, body, *, args="page: Page, site_url", observed="-", needs_login=False,
            marks=(), priority="Medium"):
        out.append({"sig": sig, "name": name, "title": title, "type": type_, "steps": steps, "expected": expected, "body": body,
                    "args": args, "observed": observed, "needs_login": needs_login, "marks": list(marks), "priority": priority})

    anchor = None  # something that should always be visible on the page
    first_field = next((f for f in b["fields"] if f.get("locator") and f["type"] not in ("submit", "button", "hidden")), None)
    if first_field:
        anchor = (loc_code(first_field["locator"]), f"ช่อง \"{_field_name(first_field)}\"")
    elif b["headings"]:
        anchor = (f"page.get_by_role(\"heading\", name={q(b['headings'][0]['text'])}).first", f"หัวข้อ \"{b['headings'][0]['text']}\"")

    if has_login:
        user_l = (lf.get("user") or {}).get("locator")
        submit = ["login.submit.click() if login.submit is not None else login.password.press(\"Enter\")"]
        add("login.error_message", "error_message_on_wrong_password", "รหัสผ่านผิดต้องมีข้อความแจ้งเตือน", "Negative / UX",
            [f"เปิด {url}", "กรอก Username ตัวอย่างและรหัสผ่านผิด", "กด Login"], "มีข้อความแจ้งเตือนให้ผู้ใช้รู้ว่าเข้าสู่ระบบไม่สำเร็จ",
            ["login = LoginPage(page).open(site_url)", "login.login(\"qa.practice.user\", WRONG_PASSWORD)",
             "# ถ้า Fail = เว็บไม่บอกผู้ใช้ว่าผิดอะไร (เป็นข้อสังเกตด้าน UX ที่ควรรายงาน)",
             "expect(page.locator(ALERT).first).to_be_visible(timeout=5000)"], marks=["login", "negative"], priority="High")
        if user_l:
            add("login.only_username", "only_username", "กรอกเฉพาะ Username แล้วกด Login", "Negative",
                [f"เปิด {url}", "กรอก Username อย่างเดียว เว้น Password ว่าง", "กด Login"], "ไม่เข้าสู่ระบบ ยังอยู่หน้า Login",
                ["login = LoginPage(page).open(site_url)", "login.username.fill(\"qa.practice.user\")", *submit,
                 "page.wait_for_timeout(1000)", "expect(login.password).to_be_visible()"], marks=["login", "negative"])
        add("login.only_password", "only_password", "กรอกเฉพาะ Password แล้วกด Login", "Negative",
            [f"เปิด {url}", "เว้น Username ว่าง กรอก Password อย่างเดียว", "กด Login"], "ไม่เข้าสู่ระบบ ยังอยู่หน้า Login",
            ["login = LoginPage(page).open(site_url)", "login.password.fill(WRONG_PASSWORD)", *submit,
             "page.wait_for_timeout(1000)", "expect(login.password).to_be_visible()"], marks=["login", "negative"])
        add("login.password_not_in_url", "password_not_in_url", "รหัสผ่านต้องไม่ไปโผล่ใน URL", "Security",
            [f"เปิด {url}", "กรอกข้อมูลแล้วกด Login", "ดู URL บนแถบที่อยู่"], "URL ไม่มีรหัสผ่านอยู่ (ป้องกันรหัสหลุดใน History/Log)",
            ["login = LoginPage(page).open(site_url)", "login.login(\"qa.practice.user\", WRONG_PASSWORD)", "page.wait_for_timeout(1500)",
             "assert WRONG_PASSWORD not in page.url, \"รหัสผ่านไปอยู่ใน URL — ฟอร์มอาจส่งแบบ GET\""], marks=["login"], priority="High")
        if lg.get("success") and urlparse(lg.get("url_after", "")).path not in ("", urlparse(url).path):
            after_url = lg["url_after"].split("#")[0]
            add("home.direct_url_requires_login", "protected_page_requires_login", "เปิดหน้าหลัง Login ตรงๆ โดยไม่ Login", "Security",
                [f"เปิด {after_url} โดยยังไม่ได้ Login"], "ต้องถูกพากลับไปหน้า Login (เห็นช่อง Password) ไม่เห็นข้อมูลข้างใน",
                [f"page.goto({q(after_url)})", "expect(LoginPage(page).password).to_be_visible(timeout=15000)"],
                observed=f"หลัง Login อยู่ที่ {urlparse(after_url).path}", marks=["login"], priority="High")
        if after:
            add("home.refresh_keeps_session", "refresh_keeps_session", "Login แล้วกด Refresh ยังอยู่ในระบบ", "Positive",
                ["Login ด้วยบัญชีที่ถูกต้อง", "กด Refresh (F5)"], "ยังอยู่ในระบบ ไม่ถูกเด้งกลับหน้า Login",
                ["page = logged_in_page", "page.reload()", "expect(LoginPage(page).password).to_be_hidden(timeout=10000)"],
                args="logged_in_page: Page", needs_login=True, marks=["login"])
        add("login.enter_key", "login_with_enter_key", "Login ด้วยการกด Enter แทนการคลิกปุ่ม", "Positive",
            [f"เปิด {url}", "กรอก Username/Password ที่ถูกต้อง", "กด Enter ที่ช่อง Password"], "เข้าสู่ระบบได้เหมือนกดปุ่ม",
            ["user, password = credentials", "login = LoginPage(page).open(site_url)",
             *(["login.username.fill(user)"] if user_l else []), "login.password.fill(password)", "login.password.press(\"Enter\")",
             "expect(login.password).to_be_hidden(timeout=15000)"], args="page: Page, site_url, credentials", needs_login=True, marks=["login"])
        if after and any(LOGOUT_RX.search(x["text"] or "") and x.get("locator") for x in after["buttons"] + after["links"]):
            lo = next(x for x in after["buttons"] + after["links"] if LOGOUT_RX.search(x["text"] or "") and x.get("locator"))
            add("home.back_after_logout", "back_after_logout", "ออกจากระบบแล้วกด Back ต้องไม่กลับเข้าไปได้", "Security",
                ["Login ด้วยบัญชีที่ถูกต้อง", f"กด \"{lo['text']}\"", "กดปุ่ม Back ของ browser"], "ยังต้องเห็นหน้า Login ไม่เห็นข้อมูลหลัง Login",
                ["page = logged_in_page", f"{loc_code(lo['locator'])}.click()", "expect(LoginPage(page).password).to_be_visible(timeout=15000)",
                 "page.go_back()", "page.wait_for_timeout(1500)",
                 "# ถ้า Back แล้วออกนอกเว็บไปเลย (เช่น about:blank) ถือว่าผ่าน — กลับเข้าไปดูข้อมูลไม่ได้",
                 "if urlparse(page.url).netloc == urlparse(site_url).netloc:",
                 "    expect(LoginPage(page).password).to_be_visible(timeout=10000)"],
                args="logged_in_page: Page, site_url", needs_login=True, marks=["login"])

    add("page.no_js_errors", "no_javascript_errors", "หน้าเว็บไม่มี JavaScript error ตอนโหลด", "Quality",
        [f"เปิด {url}", "ดู Console ของ browser"], "ไม่มี error ใน Console",
        ["errors = []", "page.on(\"pageerror\", lambda e: errors.append(str(e)))  # ดักฟัง error ที่เกิดใน browser", "page.goto(site_url)",
         "page.wait_for_timeout(1500)", "assert errors == [], f\"พบ JavaScript error: {errors[:3]}\""])
    add("page.load_time", "loads_within_5_seconds", "หน้าเว็บโหลดเสร็จภายใน 5 วินาที", "Performance",
        [f"เปิด {url}", "จับเวลาจนหน้าแสดงผล"], "โหลด (DOMContentLoaded) ไม่เกิน 5 วินาที",
        ["start = time.monotonic()", "page.goto(site_url, wait_until=\"domcontentloaded\")", "seconds = time.monotonic() - start",
         "assert seconds < 5, f\"ใช้เวลา {seconds:.1f} วินาที\""], observed=f"ตอนสำรวจใช้ {r.get('duration_sec')} วินาที (รวมเปิด browser)")
    if anchor:
        add("page.reload", "reload_still_works", "กด Refresh แล้วหน้าเว็บยังแสดงปกติ", "UI", [f"เปิด {url}", "กด Refresh (F5)"],
            f"ยังเห็น {anchor[1]}", ["page.goto(site_url)", "page.reload()", f"expect({anchor[0]}).to_be_visible()"])
        add("page.mobile", "mobile_screen", "เปิดบนจอมือถือ (375×812) ยังใช้งานได้", "Responsive", [f"เปิด {url} บนจอขนาดมือถือ"],
            f"ยังเห็น {anchor[1]} และไม่ต้องเลื่อนซ้ายขวา",
            ["page.set_viewport_size({\"width\": 375, \"height\": 812})", "page.goto(site_url)", f"expect({anchor[0]}).to_be_visible()",
             "overflow = page.evaluate(\"() => document.documentElement.scrollWidth - window.innerWidth\")",
             "assert overflow <= 1, f\"หน้าเว็บกว้างเกินจอ {overflow}px (ต้องเลื่อนซ้ายขวา)\""])
    if not (host in ("localhost", "::1") or host.startswith("127.") or host.endswith(".local") or host.startswith("192.168.")):
        add("page.https", "uses_https", "หน้าเว็บใช้ HTTPS", "Security", [f"เปิด {url}", "ดูรูปกุญแจ/URL"], "URL ขึ้นต้นด้วย https://",
            ["page.goto(site_url)", "assert page.url.startswith(\"https://\"), page.url"], observed=url.split(":")[0].upper(), priority="High")
    add("page.lang", "html_lang", "หน้าเว็บระบุภาษา (html lang)", "Accessibility", [f"เปิด {url}", "ดู <html lang=...>"],
        "มี lang เช่น th หรือ en (ช่วยโปรแกรมอ่านหน้าจอ)",
        ["page.goto(site_url)", "expect(page.locator(\"html\")).to_have_attribute(\"lang\", re.compile(r\"\\S\"))"],
        observed=f"lang = \"{b['lang']}\"" if b["lang"] else "ไม่พบ lang")
    add("page.images_alt", "images_have_alt", "รูปภาพทุกรูปมีข้อความ alt", "Accessibility", [f"เปิด {url}", "ตรวจ alt ของรูปภาพ"],
        "ไม่มีรูปที่ขาด alt", ["page.goto(site_url)", "missing = page.locator(\"img:not([alt])\").count()",
                                "assert missing == 0, f\"รูปไม่มี alt {missing} รูป\""], observed=f"รูปไม่มี alt {b['imgs_no_alt']} รูป")

    texts = [f for f in b["fields"] if f.get("locator") and f["type"] in TEXT_TYPES | {"email"} and f["tag"] in ("input", "textarea")][:3]
    for n, f in enumerate(texts, 1):
        fname = _field_name(f)
        loc = loc_code(f["locator"])
        add(f"field.editable:{fname}", f"field{n}_editable", f"ช่อง \"{fname}\" พร้อมให้กรอก", "UI", [f"เปิด {url}", f"คลิกช่อง \"{fname}\""],
            "ช่องกรอกได้ (ไม่ถูกปิด/อ่านอย่างเดียว)", ["page.goto(site_url)", f"expect({loc}).to_be_editable()"])
        if f["type"] in TEXT_TYPES:
            add(f"field.keeps_value:{fname}", f"field{n}_keeps_thai_text", f"ช่อง \"{fname}\" รับภาษาไทยและตัวเลขได้", "Data",
                [f"เปิด {url}", f"พิมพ์ \"ทดสอบ QA 123\" ในช่อง \"{fname}\""], "ข้อความในช่องตรงกับที่พิมพ์",
                ["page.goto(site_url)", f"field = {loc}", "field.fill(\"ทดสอบ QA 123\")", "expect(field).to_have_value(\"ทดสอบ QA 123\")"])
            add(f"field.special_chars:{fname}", f"field{n}_special_chars", f"ช่อง \"{fname}\" รับอักขระพิเศษได้", "Data",
                [f"เปิด {url}", f"พิมพ์อักขระพิเศษ ก๋ฮ ÀÉ !@#$%&*() ในช่อง \"{fname}\""], "ข้อความไม่เพี้ยน และหน้าเว็บไม่ error",
                ["page.goto(site_url)", f"field = {loc}", "text = \"ก๋ฮ ÀÉ !@#$%&*()\"", "field.fill(text)", "expect(field).to_have_value(text)"])
        add(f"field.long_input:{fname}", f"field{n}_long_input", f"ช่อง \"{fname}\" กับข้อความยาว 300 ตัวอักษร", "Boundary",
            [f"เปิด {url}", f"พิมพ์ข้อความยาว 300 ตัวในช่อง \"{fname}\""], "หน้าเว็บไม่ค้าง/ไม่ error ถ้ามีการจำกัดความยาว ระบบตัดให้สั้นลงได้",
            ["page.goto(site_url)", f"field = {loc}", "field.fill(\"a\" * 300)", "value = field.input_value()",
             "assert 0 < len(value) <= 300  # มี maxlength ตัดให้สั้นลงก็ถือว่าปกติ", "expect(field).to_be_visible()"])
    return out


def _click_assertion(x: dict):
    """Pick the clearest observable effect of a click → (Thai description, code builder) or None."""
    if x.get("new_tab"):
        return None  # new tabs are noted in observations only
    if x.get("url_changed"):
        u = urlparse(x["url_after"])
        target = (u.path or "/") + (("?" + u.query) if u.query else "") + (("#" + u.fragment) if u.fragment else "")
        return (f"ไปหน้า {target}", lambda loc: [f"{loc}.click()", f"expect(page).to_have_url(re.compile({q(re.escape(target))}))"])
    if x.get("modal_opened"):
        return ("มีหน้าต่างเปิดขึ้นมา", lambda loc: [f"{loc}.click()", "expect(page.locator(MODAL).first).to_be_visible()"])
    if x.get("js_dialogs"):
        msg = x["js_dialogs"][0]
        return ("มีกล่องข้อความเด้งขึ้น", lambda loc: [
            "messages = []", "page.on(\"dialog\", lambda d: (messages.append(d.message), d.dismiss()))  # กด Cancel เสมอ",
            f"{loc}.click()", "page.wait_for_timeout(1000)", f"assert messages and messages[0] == {q(msg)}"])
    good = [t for t in x.get("added", []) if 2 <= len(t) <= 60 and re.search(r"[A-Za-zก-๙]", t)]
    if good:
        t = good[0]
        return (f"เห็นข้อความ \"{t[:30]}\"", lambda loc: [f"{loc}.click()", f"expect(page.get_by_text({q(t)}, exact=True).first).to_be_visible()"])
    gone = [t for t in x.get("removed", []) if 2 <= len(t) <= 60 and re.search(r"[A-Za-zก-๙]", t)]
    if gone:
        t = gone[0]
        return (f"ข้อความ \"{t[:30]}\" หายไป", lambda loc: [f"{loc}.click()", f"expect(page.get_by_text({q(t)}, exact=True)).to_have_count(0)"])
    return None


def _doc(text: str) -> str:
    """Safe text inside a triple-quoted docstring (labels may contain quotes or backslashes)."""
    return text.replace("\\", "/").replace('"', "'")
