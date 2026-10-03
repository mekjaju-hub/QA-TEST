"""Web Explorer (practice mode): explore a local practice site → test cases → pytest-playwright → run in sandbox."""
import functools
import http.server
import threading
from pathlib import Path

import pytest

from app.services import web_explorer as wx
from app.services import web_testgen

pw = pytest.importorskip("playwright.sync_api")
SITE = Path(__file__).parent / "web_fixture"


@pytest.fixture(scope="module")
def site():
    class Handler(http.server.SimpleHTTPRequestHandler):
        # like a real server: protected pages without a session show the login page again
        ROUTES = {"/home": "/index.html", "/inventory.html": "/spa.html"}

        def do_GET(self):  # noqa: N802
            self.path = self.ROUTES.get(self.path.split("?")[0], self.path)
            return super().do_GET()

        def log_message(self, *a, **k):
            pass
    handler = functools.partial(Handler, directory=str(SITE))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}/index.html"
    srv.shutdown()


def _browser_ok():
    try:
        with pw.sync_playwright() as p:
            p.chromium.launch().close()
        return True
    except Exception:  # noqa: BLE001
        return False


needs_browser = pytest.mark.skipif(not _browser_ok(), reason="Chromium for Playwright not installed")


def test_url_validation():
    assert wx.check_url("www.example.com") == "https://www.example.com"
    with pytest.raises(Exception):
        wx.check_url("file:///etc/passwd")
    assert wx.mask_user("demo") == "d***o"


@needs_browser
def test_explore_without_login_generates_page_and_login_cases(site):
    r = wx.explore(site)
    assert r["before"]["title"] == "Practice Login" and r["login"]["reason"] == "NO_CREDENTIALS"
    assert r["login_form"]["user"]["locator"] == {"by": "label", "value": "ชื่อผู้ใช้"}
    gen = web_testgen.build(r)
    ids = [t["id"] for t in gen["test_cases"]]
    assert ids[:2] == ["TC-WEB-001", "TC-WEB-002"] and "TC-LOGIN-003" in ids and "TC-HOME-001" not in ids


@needs_browser
def test_explore_login_then_generated_tests_pass_in_sandbox(site):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "automation-runner"))
    from runner import sandbox
    shots = {}
    r = wx.explore(site, username="demo", password="demo-pass-1", shots=shots)
    assert r["login"]["success"] and r["login"]["url_after"].endswith("/home") and set(shots) == {"before", "after"}
    assert "demo-pass-1" not in str(r)                       # password never kept
    obs = wx.observations(r)
    assert any("Login สำเร็จ" in o for o in obs) and any("ออกจากระบบ" in o for o in obs)
    gen = web_testgen.build(r)
    assert {"TC-LOGIN-004", "TC-HOME-001", "TC-HOME-002"} <= {t["id"] for t in gen["test_cases"]}
    assert "demo-pass-1" not in "".join(gen["files"].values())   # credentials come from env only
    lim = sandbox.Limits(timeout_sec=180, cpu_sec=300, memory_mb=1024, limit_address_space=False, max_procs=4096)
    out = sandbox.run_pytest(gen["files"], lim, test_env={"BASE_URL": site, "LOGIN_USER": "demo", "LOGIN_PASS": "demo-pass-1"})
    assert out.status == "PASSED", out.stdout[-3000:] + out.stderr[-2000:]
    assert out.summary["passed"] == len(gen["test_cases"]) and out.summary["failed"] == 0
    # without credentials the login-only tests are skipped, not failed
    out2 = sandbox.run_pytest(gen["files"], lim, test_env={"BASE_URL": site})
    assert out2.summary["failed"] == 0 and out2.summary["passed"] < out.summary["passed"]


@needs_browser
def test_spa_login_url_changes_before_page_renders(site):
    """saucedemo-style: URL changes immediately, inventory renders 1.5 s later → must still count as logged in."""
    spa = site.replace("index.html", "spa.html")
    r = wx.explore(spa, username="standard_user", password="practice-pass")
    assert r["login"]["success"], r["login"]
    assert r["login"]["url_after"].endswith("/inventory.html")
    assert any(h["text"] == "Products" for h in r["after"]["headings"])
    gen = web_testgen.build(r)
    assert {"TC-HOME-001", "TC-HOME-002"} <= {t["id"] for t in gen["test_cases"]}


@needs_browser
def test_wrong_password_reports_error_message_quickly(site):
    import time
    spa = site.replace("index.html", "spa.html")
    t0 = time.monotonic()
    r = wx.explore(spa, username="standard_user", password="wrong")
    assert not r["login"]["success"]
    assert "Epic sadface" in r["login"]["message"] and "standard_user" not in r["login"]["alerts"][0]
    assert time.monotonic() - t0 < 25


@needs_browser
def test_page_history_accumulates_without_duplicates(client, admin, site):
    """Each exploration of the same page adds only *new* designs; history keeps every TC once with a WP-ID."""
    spa = site.replace("index.html", "spa.html") + "?utm_source=a"
    creds = {"username": "standard_user", "password": "practice-pass", "extra": 4}
    r1 = client.post("/api/web-explorer", headers=admin, json={"url": spa, **creds}).json()
    sig1 = {t["sig"] for t in r1["test_cases"]}
    more1 = [t for t in r1["test_cases"] if t["id"].startswith("TC-MORE")]
    assert len(more1) == 4 and all(t["is_new"] and t["hid"].startswith("WP-") for t in r1["test_cases"])
    # same page, different query string → same history; base TCs are "seen before", extras are all different
    r2 = client.post("/api/web-explorer", headers=admin, json={"url": spa.replace("utm_source=a", "x=1"), **creds}).json()
    assert r2["history_key"] == r1["history_key"]
    more2 = [t for t in r2["test_cases"] if t["id"].startswith("TC-MORE")]
    assert more2 and not ({t["sig"] for t in more2} & sig1)
    assert all(not t["is_new"] for t in r2["test_cases"] if not t["id"].startswith("TC-MORE"))
    base_hids = {t["sig"]: t["hid"] for t in r1["test_cases"]}
    assert all(base_hids[t["sig"]] == t["hid"] for t in r2["test_cases"] if t["sig"] in base_hids)   # IDs are stable
    # history page
    pages = client.get("/api/web-history", headers=admin).json()
    pg = next(x for x in pages if x["key"] == r1["history_key"])
    assert pg["explorations"] == 2 and pg["test_cases"] == len(sig1 | {t["sig"] for t in r2["test_cases"]})
    det = client.get(f"/api/web-history/{r1['history_key']}", headers=admin).json()
    hids = [t["hid"] for t in det["test_cases"]]
    assert len(hids) == len(set(hids)) and det["test_cases"][0]["designed"] == 2
    # a run updates the history results
    run = client.post(f"/api/web-explorer/{r2['id']}/run", headers=admin, json={"username": "standard_user", "password": "practice-pass"}).json()
    # the practice site keeps its session in localStorage, so every generated test — base, extra and click — passes
    assert run["status"] == "PASSED" and run["summary"]["total"] >= len(r2["test_cases"]), run["stdout"][-2000:]
    det = client.get(f"/api/web-history/{r1['history_key']}", headers=admin).json()
    results = {t["sig"]: t.get("last_result") for t in det["test_cases"]}
    assert results["login.valid"] == "PASSED"
    assert results.get("home.refresh_keeps_session") in (None, "PASSED")
    # ZIP with every accumulated TC + CSV export
    z = client.get(f"/api/web-history/{r1['history_key']}/zip", headers=admin)
    import io
    import zipfile
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    md = zipfile.ZipFile(io.BytesIO(z.content)).read([n for n in names if n.endswith("TEST_CASES.md")][0]).decode()
    assert all(h in md for h in hids)
    csv = client.get(f"/api/web-history/{r1['history_key']}/csv", headers=admin)
    assert csv.status_code == 200 and "WP-001" in csv.text


@needs_browser
def test_click_explore_only_safe_clicks_and_behaviour_tests_pass(site):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "automation-runner"))
    from runner import sandbox
    spa = site.replace("index.html", "spa.html")
    shots = {}
    r = wx.explore(spa, username="standard_user", password="practice-pass", shots=shots, click_explore=True, max_clicks=10)
    c = r["clicks"]
    assert c["logged_in"] and c["start_url"].endswith("/inventory.html")
    by = {x["label"]: x for x in c["items"]}
    for unsafe in ("Pay now", "Checkout", "Logout"):           # payment / checkout / logout are never clicked
        assert not by[unsafe]["clicked"] and "ไม่ปลอดภัย" in by[unsafe]["reason"]
    assert by["Add to cart"]["clicked"] and "Items in cart: 1" in by["Add to cart"]["added"]
    assert by["Open Menu"]["modal_opened"]
    assert by["Say hello"]["js_dialogs"] == ["Hello tester"]
    assert by["About"]["url_changed"]
    assert by["Sync list"]["blocked_writes"] >= 1 and c["blocked_writes"] >= 1   # POST was cancelled
    assert not by["Nothing"]["changed"]
    assert {f"click_{x['n']}" for x in c["items"] if x.get("clicked")} <= set(shots)
    obs = wx.observations(r)
    assert any("กด \"Add to cart\"" in o for o in obs)
    gen = web_testgen.build(r, extra_limit=0)
    clicks = [t for t in gen["test_cases"] if t["id"].startswith("TC-CLICK")]
    assert {t["sig"] for t in clicks} >= {"click:button:Add to cart", "click:button:Open Menu", "click:button:Say hello", "click:link:About"}
    lim = sandbox.Limits(timeout_sec=240, cpu_sec=400, memory_mb=1024, limit_address_space=False, max_procs=4096)
    out = sandbox.run_pytest(gen["files"], lim, test_env={"BASE_URL": spa, "LOGIN_USER": "standard_user", "LOGIN_PASS": "practice-pass"})
    assert out.status == "PASSED", out.stdout[-4000:] + out.stderr[-1500:]


@needs_browser
def test_dropdown_designs_run(site):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "automation-runner"))
    from runner import sandbox
    r = wx.explore(site)
    dd = next(f for f in r["before"]["fields"] if f["tag"] == "select")
    assert [o["text"] for o in dd["options"]] == ["ไทย", "English", "日本語"]
    assert any("Dropdown: ภาษา (3 ตัวเลือก)" in o for o in wx.observations(r))
    gen = web_testgen.build(r, include_sigs={"dropdown.has_options:ภาษา", "dropdown.select_option:ภาษา"})
    titles = [t["title"] for t in gen["test_cases"]]
    assert 'Dropdown "ภาษา" มีตัวเลือกให้เลือก' in titles and 'เลือก "English" ใน Dropdown "ภาษา" ได้' in titles
    lim = sandbox.Limits(timeout_sec=180, cpu_sec=300, memory_mb=1024, limit_address_space=False, max_procs=4096)
    out = sandbox.run_pytest(gen["files"], lim, test_env={"BASE_URL": site})
    assert out.summary["failed"] == 0, out.stdout[-3000:]


@needs_browser
def test_library_merges_all_websites_without_duplicates(client, admin, site):
    """Same test idea on two different pages → one library row with two sources; categories + filters + exports work."""
    a = client.post("/api/web-explorer", headers=admin, json={"url": site, "extra": 30}).json()
    b = client.post("/api/web-explorer", headers=admin, json={"url": site.replace("index.html", "spa.html"), "extra": 30}).json()
    assert a["history_key"] != b["history_key"]
    lib = client.get("/api/web-library", headers=admin).json()
    keys = [(i["category"], i["title"].lower()) for i in lib["items"]]
    assert len(keys) == len(set(keys))                                    # no identical test cases
    lids = [i["lid"] for i in lib["items"]]
    assert len(lids) == len(set(lids))
    opens = next(i for i in lib["items"] if i["title"] == "เปิดหน้าเว็บได้และชื่อหน้าถูกต้อง")
    pages = {s["page"] for s in opens["sources"]}
    assert len(pages) >= 2 and all(s["hid"].startswith("WP-") for s in opens["sources"])     # still traceable
    assert "[หน้าเว็บที่ทดสอบ]" in opens["steps"][0] and "http" not in opens["steps"][0]
    cats = {c["code"]: c["count"] for c in lib["categories"]}
    assert cats["login"] > 0 and cats["dropdown"] > 0 and cats["input"] > 0 and cats["page"] > 0
    only_dd = client.get("/api/web-library?category=dropdown", headers=admin).json()
    assert only_dd["count"] == cats["dropdown"] and all(i["category"] == "dropdown" for i in only_dd["items"])
    found = client.get("/api/web-library", headers=admin, params={"q": "รหัสผ่านผิด"}).json()
    assert found["count"] >= 1 and all("รหัสผ่านผิด" in (i["title"] + i["expected"] + " ".join(i["steps"])) for i in found["items"])
    again = client.get("/api/web-library", headers=admin).json()
    assert [i["lid"] for i in again["items"]] == lids                    # IDs are stable
    x = client.get("/api/web-library/export.xlsx", headers=admin)
    assert x.status_code == 200 and x.content[:2] == b"PK"
    c = client.get("/api/web-library/export.csv?category=login", headers=admin)
    assert c.status_code == 200 and "Library ID" in c.text


@needs_browser
def test_recorder_captures_clicks_fields_submit_and_alert_then_replays(site):
    """Record: click ลงทะเบียน → type each field → choose dropdown → tick → Submit → alert. Then the generated test replays it."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "automation-runner"))
    from runner import sandbox
    from app.services import web_recorder as wr
    url = site.replace("index.html", "register.html")

    def user(page):  # what a person would do in the window
        page.get_by_role("button", name="ลงทะเบียน").click()
        page.get_by_label("ชื่อ-นามสกุล").click()
        page.get_by_label("ชื่อ-นามสกุล").press_sequentially("สมชาย ใจดี", delay=10)
        page.get_by_label("อีเมล").fill("somchai@example.test")
        page.get_by_label("รหัสผ่าน").fill("Secret-123")
        page.get_by_label("จังหวัด").select_option("cnx")
        page.get_by_label("ยอมรับเงื่อนไข").check()
        page.get_by_role("button", name="Submit").click()
        page.wait_for_timeout(800)

    rec = wr.Recording(url, "tester", headless=True, actions=user, save_password=False).start()
    rec.stop()
    assert rec.status == "stopped", rec.error
    steps = rec.steps()
    texts = [s["text"] for s in steps]
    assert texts[0] == 'กดปุ่ม "ลงทะเบียน"'
    assert 'กรอก "ชื่อ-นามสกุล" = "สมชาย ใจดี"' in texts                # one step per field with the exact final value
    assert len([t for t in texts if t.startswith('กรอก "ชื่อ-นามสกุล"')]) == 1
    assert 'กรอก "อีเมล" = "somchai@example.test"' in texts
    assert any(t.startswith('กรอก "รหัสผ่าน" = ********') for t in texts)
    assert 'เลือก "เชียงใหม่" ใน "จังหวัด"' in texts and 'ติ๊ก "ยอมรับเงื่อนไข"' in texts
    assert texts[-2] == 'กดปุ่ม "Submit"' and texts[-1] == 'พบกล่องข้อความ (alert): "ลงทะเบียนสำเร็จ: สมชาย ใจดี"'
    assert "Secret-123" not in repr(rec.raw) and set(rec.shots) == {"before", "after"}
    gen = web_testgen.build_record(url, rec.title, steps)
    assert [t["id"] for t in gen["test_cases"]] == ["TC-REC-01", "TC-REC-02"]
    code = gen["files"]["tests/test_06_recorded.py"]
    assert "Secret-123" not in code and "fill(PASSWORD)" in code
    lim = sandbox.Limits(timeout_sec=180, cpu_sec=300, memory_mb=1024, limit_address_space=False, max_procs=4096)
    out = sandbox.run_pytest(gen["files"], lim)
    assert out.status == "PASSED", out.stdout[-3000:] + out.stderr[-1000:]
    assert out.summary["passed"] == 2


@needs_browser
def test_recorder_api_headed_browser_driven_like_a_user(client, admin, site, monkeypatch):
    """API path with a real headed window (xvfb in CI) driven over CDP — exactly how a person's clicks arrive."""
    import shutil
    import socket
    import time as _t
    if not shutil.which("Xvfb") and not __import__("os").environ.get("DISPLAY"):
        pytest.skip("no display")
    with socket.socket() as s_:
        s_.bind(("127.0.0.1", 0))
        port = s_.getsockname()[1]
    monkeypatch.setenv("WEB_RECORDER_CDP_PORT", str(port))
    monkeypatch.setenv("WEB_RECORDER_HEADLESS", "1" if not __import__("os").environ.get("DISPLAY") else "0")
    url = site.replace("index.html", "register.html")
    r = client.post("/api/web-recorder/start", headers=admin, json={"url": url, "save_password": False}).json()
    assert r["status"] == "recording", r
    assert client.post("/api/web-recorder/start", headers=admin, json={"url": url}).status_code == 409   # one at a time
    with pw.sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
        page = b.contexts[0].pages[0]
        page.get_by_role("button", name="ลงทะเบียน").click()
        page.get_by_role("button", name="Submit").click()   # submit without data → HTML pop-up message
        _t.sleep(1)
    live = client.get(f"/api/web-recorder/{r['id']}", headers=admin).json()
    assert [s["text"] for s in live["steps"]][:2] == ['กดปุ่ม "ลงทะเบียน"', 'กดปุ่ม "Submit"']
    done = client.post(f"/api/web-recorder/{r['id']}/stop", headers=admin).json()
    eid = done["exploration_id"]
    d = client.get(f"/api/web-explorer/{eid}", headers=admin).json()
    assert d["kind"] == "record" and d["test_cases"][0]["id"] == "TC-REC-01" and d["history_key"]
    assert any("กรุณากรอกข้อมูลให้ครบ" in o for o in d["observations"]), d["observations"]
    lib = client.get("/api/web-library?category=record", headers=admin).json()
    assert lib["count"] >= 1
    z = client.get(f"/api/web-history/{d['history_key']}/zip", headers=admin)
    assert z.status_code == 200


@needs_browser
def test_recorded_login_replays_only_with_the_password_given_at_run_time(client, admin, site):
    """saucedemo case: the password is not recorded → the replay needs it at run time (RECORD_PASSWORD)."""
    from app.services import web_recorder as wr
    from app.api.web_explorer import save_recording
    from app.db import SessionLocal
    url = site.replace("index.html", "spa.html") + "?utm_source=x"

    def user(page):
        page.get_by_placeholder("Username").fill("standard_user")
        page.get_by_placeholder("Password").fill("practice-pass")
        page.get_by_role("button", name="Login").click()
        page.wait_for_timeout(2500)
    rec = wr.Recording(url, "admin", headless=True, actions=user, save_password=False).start()
    rec.stop()
    with SessionLocal() as db:
        save_recording(rec, "admin", db)
    eid = rec.exploration_id
    code = client.get(f"/api/web-explorer/{eid}", headers=admin).json()["files"]["tests/test_06_recorded.py"]
    assert "practice-pass" not in code and 'os.getenv("RECORD_PASSWORD") or os.getenv("LOGIN_PASS")' in code
    no_pw = client.post(f"/api/web-explorer/{eid}/run", headers=admin, json={}).json()
    assert no_pw["status"] == "FAILED"                                   # sample password → login fails (expected)
    ok = client.post(f"/api/web-explorer/{eid}/run", headers=admin, json={"password": "practice-pass"}).json()
    assert ok["status"] == "PASSED", ok["stdout"][-2000:]
    assert "practice-pass" not in ok["stdout"]


@needs_browser
def test_recorder_test_cases_checks_pause_saved_password_script_and_replay(client, admin, site):
    """Record 2 test cases (Add Test Case) with a text check, a paused part and the real password kept on request;
    the explained script says where each element is; the visible replay repeats everything and passes."""
    import time as _t
    from app.api.web_explorer import save_recording
    from app.db import SessionLocal
    from app.services import web_recorder as wr
    url = site.replace("index.html", "spa.html")
    holder = {}

    def user(page):
        rec = holder["rec"]
        page.get_by_placeholder("Username").fill("standard_user")
        page.get_by_placeholder("Password").fill("practice-pass")
        page.get_by_role("button", name="Login").click()
        page.wait_for_timeout(2200)
        rec.add_check("Products")                       # "ตรวจสอบ Text เฉพาะคำ"
        rec.add_testcase("ใส่สินค้าลงตะกร้า")              # "Add Test Case" → next test case continues from here
        page.get_by_role("button", name="Add to cart").click()
        page.wait_for_timeout(300)
        rec.pause()                                     # "หยุด" — nothing is recorded now
        page.get_by_role("button", name="Open Menu").click()
        page.wait_for_timeout(300)
        rec.resume()                                    # "เริ่ม" again
        page.get_by_role("button", name="Say hello").click()
        page.wait_for_timeout(500)
        rec.add_check("Items in cart: 1")
        rec.add_check("PAID!", "hidden")
    rec = wr.Recording(url, "admin", headless=True, actions=user, first_name="Login เข้าระบบ")
    holder["rec"] = rec
    rec.start()
    rec.stop()
    steps = rec.steps()
    texts = [s["text"] for s in steps]
    assert 'กรอก "Password" = "practice-pass" (รหัสผ่าน)' in texts          # saved & shown in the log on request
    assert not any("Open Menu" in t for t in texts)                          # paused part not recorded
    assert 'ตรวจว่าเห็นข้อความ "Products"' in texts and 'ตรวจว่าไม่เห็นข้อความ "PAID!"' in texts
    assert {s["seg"] for s in steps} == {0, 1} and steps[-1]["seg_name"] == "ใส่สินค้าลงตะกร้า"
    with SessionLocal() as db:
        save_recording(rec, "admin", db)
    d = client.get(f"/api/web-explorer/{rec.exploration_id}", headers=admin).json()
    rec_tcs = [t for t in d["test_cases"] if t["type"] == "Scenario (Recorded)"]
    assert [t["title"].split(" (")[0] for t in rec_tcs] == ["สถานการณ์: Login เข้าระบบ", "สถานการณ์: ใส่สินค้าลงตะกร้า"]
    assert any("ทำ Test Case ก่อนหน้า" in st for st in rec_tcs[1]["steps"])
    sc = {r["event"]: r for r in d["script"]}
    login = sc['กดปุ่ม "Login" → ไปหน้า /inventory.html']
    assert "ของหน้าจอ" in login["where"] and "ในฟอร์ม" in login["where"] and "x=" in login["where"]
    assert login["command"] == 'page.get_by_role("button", name=NAME("Login")).click()' and "role" in login["meaning"]
    assert "practice-pass" in d["files"]["tests/test_06_recorded.py"] and "SCRIPT_TH.md" in d["files"]
    run = client.post(f"/api/web-explorer/{rec.exploration_id}/run", headers=admin, json={}).json()
    assert run["status"] == "PASSED", run["stdout"][-2500:]
    # Test Automation: visible step-by-step replay
    rp = client.post(f"/api/web-explorer/{rec.exploration_id}/replay", headers=admin, json={"slow_ms": 0}).json()
    for _ in range(120):
        v = client.get(f"/api/web-replay/{rp['id']}", headers=admin).json()
        if v["status"] not in ("starting", "running"):
            break
        _t.sleep(0.5)
    assert v["status"] == "passed", v
    assert all(r["status"] == "passed" for r in v["results"]) and len(v["results"]) == len(steps)
    shot = next(r["shot"] for r in v["results"] if r.get("shot"))
    img = client.get(f"/api/web-replay/{rp['id']}/shot/{shot}", headers=admin)
    assert img.status_code == 200 and img.content[:4] == b"\x89PNG"


@needs_browser
def test_recorder_captures_shadow_dom_swallowed_clicks_early_navigation_and_many_test_cases(site):
    """Real-site cases that used to be lost: Shadow DOM buttons, pages that stop click propagation, links that
    navigate on pointerdown — and every 'Add Test Case' with steps becomes its own test case (6 here)."""
    from app.services import web_recorder as wr
    url = site.replace("index.html", "tricky.html")
    holder = {}

    def user(page):
        rec = holder["rec"]
        page.get_by_role("button", name="Shadow buy later").click()
        rec.add_testcase("greedy")
        page.get_by_role("button", name="Greedy button").click()
        rec.add_testcase("empty one")                    # nothing done → name is replaced by the next one
        rec.add_testcase("fast link")
        page.get_by_role("link", name="Fast link").click()
        page.wait_for_url("**/register.html")
        page.wait_for_timeout(300)
        for i in range(3, 6):
            rec.add_testcase(f"tc{i}")
            page.get_by_role("button", name="ลงทะเบียน").click()
        rec.add_testcase("tc6")
        page.get_by_label("ชื่อ-นามสกุล").fill(f"user6")
        page.wait_for_timeout(300)
    rec = wr.Recording(url, "t", headless=True, actions=user, first_name="shadow")
    holder["rec"] = rec
    rec.start()
    rec.stop()
    steps = rec.steps()
    texts = [s["text"] for s in steps]
    assert texts[0] == 'กดปุ่ม "Shadow buy later"'
    assert 'กดปุ่ม "Greedy button"' in texts
    assert any(t.startswith('กดลิงก์ "Fast link"') for t in texts)
    names = []
    for s in steps:
        if not names or names[-1] != s["seg_name"]:
            names.append(s["seg_name"])
    assert names == ["shadow", "greedy", "fast link", "tc3", "tc4", "tc5", "tc6"]
    ov = wr.segments_overview(list(rec.raw))
    assert [x["events"] > 0 for x in ov].count(False) == 1     # the one empty test case is visible to the user
    gen = web_testgen.build_record(url, rec.title, steps)
    assert len([t for t in gen["test_cases"] if t["type"] == "Scenario (Recorded)"]) == 7


@needs_browser
def test_shadow_dom_click_gets_a_working_locator_and_replays(site):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "automation-runner"))
    from runner import sandbox
    from app.services import web_recorder as wr
    url = site.replace("index.html", "tricky.html")

    def user(page):
        page.get_by_role("button", name="Shadow buy later").click()
        page.wait_for_timeout(200)
        page.get_by_role("button", name="Greedy button").click()
        page.wait_for_timeout(300)
        holder["rec"].add_check("greedy clicked")
    holder = {}
    rec = wr.Recording(url, "t", headless=True, actions=user)
    holder["rec"] = rec
    rec.start()
    rec.stop()
    steps = rec.steps()
    assert steps[0]["el"]["locator"] == {"by": "role", "role": "button", "value": "Shadow buy later"}
    gen = web_testgen.build_record(url, rec.title, steps)
    out = sandbox.run_pytest(gen["files"], sandbox.Limits(timeout_sec=120, cpu_sec=200, limit_address_space=False, max_procs=4096))
    assert out.status == "PASSED", out.stdout[-2000:]


def test_record_cycles_from_raw_events_third_test_case_and_new_cycle():
    """Bug report: the 3rd 'Add Test Case' gave no new test case when the user only went to another page (typed URL /
    Back) — now that is a 'goto' step. Pause → resume as a NEW cycle starts an independent test case at its own URL."""
    from app.services import web_recorder as wr
    el = lambda n: {"tag": "a", "text": n, "locator": {"by": "role", "role": "link", "value": n}}  # noqa: E731
    raw = [{"type": "segment", "name": "", "t": 1000},
           {"type": "nav", "url": "https://x.test/", "initial": True, "t": 1100},
           {"type": "click", "el": el("About"), "t": 2000}, {"type": "nav", "url": "https://x.test/about", "t": 2300},
           {"type": "segment", "name": "Services", "t": 3000},
           {"type": "click", "el": el("Services"), "t": 4000}, {"type": "nav", "url": "https://x.test/services", "t": 4200},
           {"type": "segment", "name": "Products", "t": 5000},
           {"type": "nav", "url": "https://x.test/products", "t": 20000},          # typed URL, no click → goto
           {"type": "nav", "url": "https://x.test/products?lang=th", "t": 20500},  # its redirect → same step
           {"type": "segment", "name": "Contact (new cycle)", "url": "https://x.test/contact", "t": 30000},
           {"type": "nav", "url": "https://x.test/contact", "t": 30300},
           {"type": "click", "el": el("Send"), "t": 31000},
           {"type": "segment", "name": "empty", "url": "https://x.test/", "t": 40000}]
    steps = wr.to_steps("https://x.test/", raw)
    names = [s["seg_name"] for s in steps]
    assert sorted(set(names), key=names.index) == ["", "Services", "Products", "Contact (new cycle)"]
    goto = next(s for s in steps if s["action"] == "goto" and s.get("manual"))
    assert goto["url"] == "https://x.test/products?lang=th" and goto["seg_name"] == "Products"
    ov = wr.segments_overview(raw, "https://x.test/")
    assert [x["events"] for x in ov] == [1, 1, 1, 1, 0]      # last cycle waits for its first step
    gen = web_testgen.build_record("https://x.test/", "X", steps)
    tcs = [t for t in gen["test_cases"] if t["type"] == "Scenario (Recorded)"]
    assert len(tcs) == 4
    assert tcs[2]["independent"] is False and any("ทำ Test Case ก่อนหน้า" in st for st in tcs[2]["steps"])
    assert tcs[3]["independent"] is True and tcs[3]["steps"][0] == "เปิด https://x.test/contact"
    assert not any("ทำ Test Case ก่อนหน้า" in st for st in tcs[3]["steps"])
    code = gen["files"]["tests/test_06_recorded.py"]
    contact = code.split("def test_tc_rec_04")[1]
    assert 'page.goto("https://x.test/contact")' in contact and "About" not in contact
    assert 'page.goto("https://x.test/products?lang=th")' in code


@needs_browser
def test_recorder_pause_then_new_cycle_at_another_url_runs_and_replays(client, admin, site):
    """Pause = end the cycle; resume as a new cycle at another URL (not the page that was open); a chained test case
    after it; a typed URL in the 3rd cycle. Generated tests pass in the sandbox and the visible replay passes."""
    import sys
    import threading as _th
    import time as _t
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "automation-runner"))
    from runner import sandbox
    from app.api.web_explorer import save_recording
    from app.db import SessionLocal
    from app.services import web_recorder as wr
    url = site.replace("index.html", "tricky.html")
    reg = site.replace("index.html", "register.html")
    holder = {}

    def from_ui(page, fn):  # the UI calls the API from another thread while the browser thread keeps running
        t = _th.Thread(target=fn)
        t.start()
        while t.is_alive():
            holder["rec"]._run_commands(page)
            page.wait_for_timeout(50)

    def user(page):
        rec = holder["rec"]
        page.get_by_role("button", name="Greedy button").click()
        page.wait_for_timeout(200)
        rec.pause()                                                     # "หยุด" → cycle 1 ends
        page.get_by_role("button", name="Shadow buy later").click()     # not recorded
        from_ui(page, lambda: rec.resume(new_case=True, name="สมัครสมาชิก", url=reg))   # new cycle, other page
        assert page.url == reg
        page.get_by_role("button", name="ลงทะเบียน").click()
        page.get_by_label("ชื่อ-นามสกุล").fill("สมหญิง")
        page.wait_for_timeout(200)
        rec.add_testcase("เลือกจังหวัด")                                 # chained to cycle 2
        page.get_by_label("จังหวัด").select_option("cnx")
        page.wait_for_timeout(200)
        rec.pause()
        from_ui(page, lambda: rec.resume(new_case=True, name="หน้า Tricky"))   # new cycle at the page open now
        page.wait_for_timeout(2700)
        page.goto(url)                                                  # user types a URL → recorded as a step
        page.wait_for_timeout(300)
        page.get_by_role("button", name="Greedy button").click()
        page.wait_for_timeout(300)
        rec.add_check("greedy clicked")
    rec = wr.Recording(url, "admin", headless=True, actions=user, first_name="Greedy")
    holder["rec"] = rec
    rec.start()
    rec.stop()
    assert rec.status == "stopped", rec.error
    steps = rec.steps()
    texts = [s["text"] for s in steps]
    assert not any("Shadow buy later" in t for t in texts)
    assert [s["seg_name"] for s in steps if s["action"] == "goto" and s.get("fresh")] == ["สมัครสมาชิก", "หน้า Tricky"]
    assert any(s["action"] == "goto" and s.get("manual") and s["url"].endswith("tricky.html") for s in steps)
    with SessionLocal() as db:
        save_recording(rec, "admin", db)
    d = client.get(f"/api/web-explorer/{rec.exploration_id}", headers=admin).json()
    tcs = [t for t in d["test_cases"] if t["type"] == "Scenario (Recorded)"]
    assert [t["title"].split(" (")[0] for t in tcs] == ["สถานการณ์: Greedy", "สถานการณ์: สมัครสมาชิก",
                                                       "สถานการณ์: เลือกจังหวัด", "สถานการณ์: หน้า Tricky"]
    assert [t["independent"] for t in tcs] == [True, True, False, True]
    assert tcs[1]["steps"][0] == f"เปิด {reg}" and tcs[2]["steps"][0] == f"เปิด {reg}"
    out = sandbox.run_pytest(d["files"], sandbox.Limits(timeout_sec=180, cpu_sec=300, limit_address_space=False, max_procs=4096))
    assert out.status == "PASSED", out.stdout[-3000:]
    rp = client.post(f"/api/web-explorer/{rec.exploration_id}/replay", headers=admin, json={"slow_ms": 0}).json()
    for _ in range(120):
        v = client.get(f"/api/web-replay/{rp['id']}", headers=admin).json()
        if v["status"] not in ("starting", "running"):
            break
        _t.sleep(0.5)
    assert v["status"] == "passed", v


def test_recorder_stop_with_nothing_recorded_resets_instead_of_getting_stuck(client, admin, monkeypatch):
    """Pressing save with no steps used to leave the panel stuck (browser closed, save fails forever)."""
    from app.services import web_recorder as wr

    class Fake:
        id, url, status, error, started_at, paused, save_password, title = "fake-1", "https://x.test/", "recording", None, "", False, True, ""
        raw = [{"type": "segment", "name": "", "t": 1}]
        shots: dict = {}

        def stop(self):
            self.status = "stopped"

        def steps(self):
            return wr.to_steps(self.url, self.raw)
    fake = Fake()
    monkeypatch.setitem(wr._active, fake.id, fake)
    r = client.post(f"/api/web-recorder/{fake.id}/stop", headers=admin)
    assert r.status_code == 200 and r.json()["discarded"] is True and r.json()["status"] == "stopped"
    assert wr.active() is None


def test_history_test_case_detail_shows_how_it_was_written(client, admin, monkeypatch):
    """History → click a test case → detail: steps/expected, source exploration, explained script and pytest code."""
    from app.api import web_explorer as api_wx
    from app.services import web_history as wh
    from app.services import web_recorder as wr
    el = lambda n: {"tag": "button", "text": n, "locator": {"by": "role", "role": "button", "value": n}}  # noqa: E731
    url = "https://detail.test/app"
    raw = [{"type": "segment", "name": "เปิดเมนู", "t": 1}, {"type": "click", "el": el("Menu"), "t": 1000},
           {"type": "segment", "name": "หน้าติดต่อ", "url": "https://detail.test/contact", "t": 9000},
           {"type": "click", "el": el("Send"), "t": 10000}, {"type": "assert_text", "text": "Thanks", "t": 10100}]

    class Rec:
        id, title, save_password = "20261003000000-detail", "Detail", True
        shots: dict = {}

        def steps(self):
            return wr.to_steps(url, raw)
    rec = Rec()
    rec.url = url
    from app.db import SessionLocal
    with SessionLocal() as db:
        api_wx.save_recording(rec, "admin", db)
    key = wh.page_id(url)[0]
    hist = client.get(f"/api/web-history/{key}", headers=admin).json()
    hids = [t["hid"] for t in hist["test_cases"]]
    d = client.get(f"/api/web-history/{key}/case/{hids[1]}", headers=admin).json()
    assert d["case"]["title"].startswith("สถานการณ์: หน้าติดต่อ") and d["case"]["steps"][0] == "เปิด https://detail.test/contact"
    assert d["source"]["id"] == rec.id and d["source"]["independent"] is True and d["prev"] == hids[0]
    assert d["code"].startswith("@pytest.mark.recorded\ndef test_tc_rec_02") and 'page.goto("https://detail.test/contact")' in d["code"]
    assert "Menu" not in d["code"] and [r["event"] for r in d["script"]][-1] == 'ตรวจว่าเห็นข้อความ "Thanks"'
    assert client.get(f"/api/web-history/{key}/case/WP-999", headers=admin).status_code == 404


@needs_browser
def test_uppercase_css_menu_is_recorded_with_its_real_name_and_replays(client, admin, site):
    """automationexercise.com case: the category link shows "WOMEN" (CSS text-transform) but its real name is "Women"
    → the locator must use the real name, otherwise the replay waits for "WOMEN" and fails at step 1."""
    import sys
    import time as _t
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "automation-runner"))
    from runner import sandbox
    from app.api.web_explorer import save_recording
    from app.db import SessionLocal
    from app.services import web_recorder as wr
    url = site.replace("index.html", "shop.html")

    def user(page):
        page.get_by_text("Women").click()
        page.wait_for_timeout(200)
        page.get_by_text("Dress").click()
        page.wait_for_url("**/register.html")
        page.wait_for_timeout(2700)
        page.goto(url)                                    # typed URL → a "go to page" step
        page.wait_for_timeout(2700)
        page.get_by_text("API Testing").click()          # header link with a Font Awesome icon in ::before
        page.wait_for_url("**/register.html?p=api")
        page.wait_for_timeout(300)
    rec = wr.Recording(url, "admin", headless=True, actions=user)
    rec.start()
    rec.stop()
    steps = rec.steps()
    assert steps[0]["el"]["locator"] == {"by": "role", "role": "link", "value": "Women"}, steps[0]["el"]
    assert steps[1]["el"]["locator"]["value"] == "Dress" and steps[1]["url_after"].endswith("/register.html")
    api = next(s for s in steps if s["action"] == "click" and "API" in s["text"])
    assert api["el"]["locator"] == {"by": "role", "role": "link", "value": "API Testing"} and api["text"].startswith('กดลิงก์ "API Testing"')
    with SessionLocal() as db:
        save_recording(rec, "admin", db)
    d = client.get(f"/api/web-explorer/{rec.exploration_id}", headers=admin).json()
    out = sandbox.run_pytest(d["files"], sandbox.Limits(timeout_sec=120, cpu_sec=200, limit_address_space=False, max_procs=4096))
    assert out.status == "PASSED", out.stdout[-2000:]
    rp = client.post(f"/api/web-explorer/{rec.exploration_id}/replay", headers=admin, json={"slow_ms": 0}).json()
    for _ in range(80):
        v = client.get(f"/api/web-replay/{rp['id']}", headers=admin).json()
        if v["status"] not in ("starting", "running"):
            break
        _t.sleep(0.5)
    assert v["status"] == "passed", v


@needs_browser
def test_old_recording_with_uppercase_name_still_replays(client, admin, site):
    """Recordings saved before the fix ("WOMEN", "API Testing" with exact=True) → replay, Run and the code use NAME()."""
    from app.api.web_explorer import _upgrade_record
    from app.services import web_testgen as tg
    from app.services.web_explorer import to_locator
    url = site.replace("index.html", "shop.html")
    spec = {"by": "role", "role": "link", "value": "WOMEN"}
    assert 'name=NAME("WOMEN")' in tg.step_command({"action": "click", "el": {"locator": spec}})
    old = {"kind": "record", "url": url, "files": {"conftest.py": "", "tests/test_06_recorded.py":
           'import re\nPASSWORD = "x"\n\n\ndef test_a(page):\n    page.get_by_role("link", name="API Testing", exact=True).click()\n'}}
    new = _upgrade_record(old)["files"]
    assert 'name=NAME("API Testing")' in new["tests/test_06_recorded.py"] and "def NAME(" in new["tests/test_06_recorded.py"]
    assert "block_ads" in new["conftest.py"]
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        page.goto(url)
        to_locator(page, spec).first.click(timeout=3000)
        assert page.get_by_text("Dress").is_visible()
        to_locator(page, {"by": "role", "role": "link", "value": "API Testing"}).click(timeout=3000)
        page.wait_for_url("**/register.html?p=api")
        b.close()


@needs_browser
def test_passkey_prompt_is_answered_by_a_virtual_authenticator_not_windows(site):
    """Login pages that ask for a passkey made Windows show 'Sign in with your Microsoft account / passkey'.
    The recorder's browser answers WebAuthn with a virtual authenticator → no system dialog."""
    from app.services import web_recorder as wr
    out = {}
    js = """async () => { const c = await navigator.credentials.create({ publicKey: { challenge: new Uint8Array(16),
      rp: { name: 'practice', id: location.hostname }, user: { id: new Uint8Array(8), name: 'u', displayName: 'u' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 5000 } }); return c.type; }"""

    def user(page):
        out["type"] = page.evaluate(js)
    rec = wr.Recording(site.replace("127.0.0.1", "localhost"), "t", headless=True, actions=user)   # passkeys need a domain
    rec.start()
    rec.stop()
    assert rec.status == "stopped", rec.error
    assert out["type"] == "public-key"


@needs_browser
def test_closing_the_recorder_window_keeps_the_steps(site):
    """A person closes the recorder window when done (no 'save' first): it used to end in RECORDER_FAILED
    ('Target page, context or browser has been closed') and every recorded step was lost."""
    import socket
    import time as _t
    from app.services import web_recorder as wr
    url = site.replace("index.html", "register.html")
    with socket.socket() as s_:
        s_.bind(("127.0.0.1", 0))
        port = s_.getsockname()[1]
    rec = wr.Recording(url, "t", headless=True, cdp_port=port)
    rec.start()
    with pw.sync_playwright() as p:                      # "the person" works in the window, then closes it
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
        page = b.contexts[0].pages[0]
        page.get_by_role("button", name="ลงทะเบียน").click()
        _t.sleep(0.5)
        page.close()
    for _ in range(40):
        if rec.status != "recording":
            break
        _t.sleep(0.25)
    rec.stop()
    assert rec.status == "stopped", rec.error
    assert [s["text"] for s in rec.steps()] == ['กดปุ่ม "ลงทะเบียน"']


def test_library_and_history_files_survive_concurrent_requests():
    """Load test finding: many people opening the Library at once rewrote library_index.json while others read it
    (half-written / empty file) → HTTP 500 'Expecting value'. Writes are atomic now and the index is built one at a time."""
    import json
    import threading
    from app.services import web_history as wh
    from app.services import web_library as wl
    from app.services.storage import get_storage
    for i in range(3):   # a few page histories with test cases
        h = wh.for_url(f"https://concurrency{i}.test/page")
        sigs = [f"page.case{i}_{n}" for n in range(15)]
        wh.assign_ids(h, sigs)
        for s in sigs:
            h["test_cases"][s].update({"first_seen": "2026-10-03", "last_seen": "2026-10-03", "title": f"TC {s}", "steps": ["a"], "expected": "b"})
        wh.save(h)
    errors: list[Exception] = []

    def worker():
        try:
            for _ in range(15):
                wl.build()
                json.loads(get_storage().read_text(wl.INDEX))
        except Exception as e:  # noqa: BLE001
            errors.append(e)
    ts = [threading.Thread(target=worker) for _ in range(12)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert not errors, errors[:3]
    ids = json.loads(get_storage().read_text(wl.INDEX)).values()
    assert len(ids) == len(set(ids))                    # every TL-ID given once
