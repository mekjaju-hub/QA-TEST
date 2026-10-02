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
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
    handler.log_message = lambda *a, **k: None
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
