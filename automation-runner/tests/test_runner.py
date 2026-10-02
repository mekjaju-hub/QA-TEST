"""automation-runner: limits, validation, cancel, result parsing (หัวข้อ 20, 40 Security)."""
import os
import sys
import threading
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from runner.results import parse_junit, parse_newman, tc_id_from  # noqa: E402
from runner.sandbox import Limits, run_pytest  # noqa: E402
from runner.validate import ValidationError, validate_files, validate_nodeids  # noqa: E402

INI = "[pytest]\ntestpaths = tests\nmarkers =\n    testcase(id): tc\n"


def proj(test_body: str) -> dict:
    return {"pytest.ini": INI, "tests/__init__.py": "", "tests/unit/__init__.py": "", "tests/unit/test_x.py": test_body}


def test_pass_fail_skip_and_junit():
    body = ('import pytest\n\n@pytest.mark.testcase("TC-CAM-RULE3-001")\n@pytest.mark.parametrize("v,e", [(1, True), (2, False)])\n'
            "def test_tc_cam_rule3_001_boundary(v, e):\n    assert (v == 1) is e\n\n"
            "def test_tc_cam_rule3_002_negative():\n    assert 1 == 2\n\n"
            '@pytest.mark.skip(reason="NEEDS_CONFIGURATION")\ndef test_tc_cam_rule3_003_api():\n    pass\n')
    lines = []
    out = run_pytest(proj(body), Limits(timeout_sec=60), on_output=lambda l, p: lines.append(p))
    assert out.status == "FAILED" and out.exit_code == 1
    assert out.summary == {"total": 4, "passed": 2, "failed": 1, "blocked": 1}
    assert {r["tc_id"] for r in out.results} == {"TC-CAM-RULE3-001", "TC-CAM-RULE3-002", "TC-CAM-RULE3-003"}
    assert "reports/junit.xml" in out.artifacts
    assert max(lines) == 100  # progress reported


def test_secrets_not_visible_to_child(monkeypatch):
    monkeypatch.setenv("CLAUDE_API_KEY", "sk-ant-should-not-leak")
    monkeypatch.setenv("SECRET_KEY", "server-secret")
    body = 'import os\n\ndef test_env():\n    assert os.getenv("CLAUDE_API_KEY") is None and os.getenv("SECRET_KEY") is None\n    assert os.getenv("BASE_URL") == "https://sit.example.test"\n'
    out = run_pytest(proj(body), Limits(), test_env={"BASE_URL": "https://sit.example.test", "SECRET_KEY": "x"})
    assert out.status == "PASSED", out.stdout + out.stderr


def test_timeout_kills_process():
    body = "import time\n\ndef test_slow():\n    time.sleep(30)\n"
    t0 = time.monotonic()
    out = run_pytest(proj(body), Limits(timeout_sec=2))
    assert out.error_code == "RUNNER_TIMEOUT" and time.monotonic() - t0 < 15


def test_cancel():
    ev = threading.Event()
    threading.Timer(1.5, ev.set).start()
    out = run_pytest(proj("import time\n\ndef test_slow():\n    time.sleep(30)\n"), Limits(timeout_sec=60), cancel=ev)
    assert out.status == "CANCELLED"


@pytest.mark.skipif(os.name != "posix", reason="rlimit only on POSIX/Docker")
def test_memory_limit():
    out = run_pytest(proj("def test_big():\n    x = bytearray(600 * 1024 * 1024)\n    assert x\n"), Limits(memory_mb=300, timeout_sec=60))
    assert out.status == "FAILED" and (out.error_code == "RUNNER_OUT_OF_MEMORY" or "MemoryError" in out.stdout)


def test_output_limit():
    out = run_pytest(proj("def test_noisy():\n    for i in range(20000):\n        print('x' * 100)\n    assert False\n"), Limits(max_output_kb=8))
    assert len(out.stdout) < 12 * 1024 and "truncated" in out.stdout


@pytest.mark.parametrize("files", [
    {"../evil.py": "x=1"},
    {"tests/test_a.py": "import subprocess\n"},
    {"tests/test_a.py": "import os\nos.system('calc')\n"},
    {"tests/test_a.py": "eval('1')\n"},
    {"tests/test_a.py": "from os import system\n"},
    {"tests/run.exe": "MZ"},
    {".env": "A=1"},
    {"tests/test_a.py": "TOKEN='ghp_" + "a" * 30 + "'\n"},
])
def test_validation_rejects(files):
    with pytest.raises(ValidationError):
        validate_files({"pytest.ini": INI, **files})


def test_nodeid_validation():
    assert validate_nodeids(["tests/unit/test_rule3.py::test_tc_cam_rule3_001_boundary[ต่ำกว่า Boundary]"])
    for bad in ["tests/x.py; rm -rf /", "--rootdir=/", "../tests/x.py", "tests/x.py::t$(id)"]:
        with pytest.raises(ValidationError):
            validate_nodeids([bad])


def test_parsers():
    assert tc_id_from("test_tc_cam_rule5_002_boundary[x]") == "TC-CAM-RULE5-002"
    xml = '<testsuites><testsuite><testcase classname="tests.unit.test_rule3" name="test_tc_cam_rule3_001_positive" time="0.1"><skipped message="NEEDS_CONFIGURATION"/></testcase></testsuite></testsuites>'
    r = parse_junit(xml)[0]
    assert r["status"] == "BLOCKED" and r["name"] == "tests/unit/test_rule3.py::test_tc_cam_rule3_001_positive"
    nm = parse_newman({"run": {"executions": [{"item": {"name": "TC-CAM-RULE6-001 — API"}, "assertions": [{"error": {"message": "expected 200"}}], "response": {"responseTime": 120}}]}})
    assert nm[0]["tc_id"] == "TC-CAM-RULE6-001" and nm[0]["status"] == "FAILED"
    with pytest.raises(ValueError):
        parse_junit("<not xml")


def test_http_service():
    os.environ["RUNNER_TOKEN"] = "t0k"
    import importlib
    import runner.service as svc
    importlib.reload(svc)
    from fastapi.testclient import TestClient
    c = TestClient(svc.app)
    assert c.post("/runs", json={"files": {}}).status_code == 401
    rid = c.post("/runs", headers={"X-Runner-Token": "t0k"}, json={"files": proj("def test_ok():\n    assert True\n")}).json()["id"]
    for _ in range(100):
        s = c.get(f"/runs/{rid}", headers={"X-Runner-Token": "t0k"}).json()
        if s["status"] not in ("QUEUED", "RUNNING"):
            break
        time.sleep(0.1)
    assert s["status"] == "PASSED" and s["summary"]["passed"] == 1
    bad = c.post("/runs", headers={"X-Runner-Token": "t0k"}, json={"files": {"tests/test_a.py": "import subprocess\n", "pytest.ini": INI}}).json()["id"]
    time.sleep(0.5)
    assert c.get(f"/runs/{bad}", headers={"X-Runner-Token": "t0k"}).json()["error_code"] == "RUNNER_VALIDATION_FAILED"


def test_failure_screenshot_collected_as_evidence():
    """Same hook shape as generated tests/ui/conftest.py: on failure a PNG is written to screenshots/ and returned."""
    conftest = ('from pathlib import Path\nimport pytest\n\n@pytest.hookimpl(hookwrapper=True)\ndef pytest_runtest_makereport(item, call):\n'
                '    outcome = yield\n    rep = outcome.get_result()\n    if rep.when == "call" and rep.failed:\n'
                '        Path("screenshots").mkdir(exist_ok=True)\n        Path(f"screenshots/{item.name}.png").write_bytes(b"\\x89PNG\\r\\n\\x1a\\n")\n')
    files = proj("def test_tc_cam_ui_001_ui():\n    assert False, 'locator not visible'\n")
    files["tests/conftest.py"] = conftest
    out = run_pytest(files, Limits())
    assert out.status == "FAILED"
    assert "screenshots/test_tc_cam_ui_001_ui.png" in out.artifacts
