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
