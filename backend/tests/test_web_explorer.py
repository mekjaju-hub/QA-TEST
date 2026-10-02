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
    # the practice site keeps no session, so "refresh keeps session" is expected to FAIL — extra designs can find real issues
    assert run["summary"]["total"] >= len(r2["test_cases"]) and run["error_code"] is None, run["stdout"][-2000:]
    det = client.get(f"/api/web-history/{r1['history_key']}", headers=admin).json()
    results = {t["sig"]: t.get("last_result") for t in det["test_cases"]}
    assert results["login.valid"] == "PASSED"
    assert results.get("home.refresh_keeps_session") in (None, "FAILED")
    # ZIP with every accumulated TC + CSV export
    z = client.get(f"/api/web-history/{r1['history_key']}/zip", headers=admin)
    import io
    import zipfile
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    md = zipfile.ZipFile(io.BytesIO(z.content)).read([n for n in names if n.endswith("TEST_CASES.md")][0]).decode()
    assert all(h in md for h in hids)
    csv = client.get(f"/api/web-history/{r1['history_key']}/csv", headers=admin)
    assert csv.status_code == 200 and "WP-001" in csv.text
