"""Stage 6 — Automation generators (Python, Pytest, Postman, SQL, Playwright, JMeter, GitHub Actions)."""
import io
import json
import re
import subprocess
import sys
import zipfile
import xml.dom.minidom

import yaml

from tests.test_stage4_api import reqs


def approved_tcs(client, h, project):
    tcs = client.get(f"/api/projects/{project['id']}/test-cases", headers=h).json()["items"]
    return [t for t in tcs if t["status"] in ("APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED")], tcs


def _ensure_flow(client, qam, project):
    """Make sure some test cases exist and are approved (independent of test order)."""
    ok, all_ = approved_tcs(client, qam, project)
    if ok:
        return ok
    rs = reqs(client, qam, project)
    r31 = rs.get("REQ-CAM-RULE3-001")
    if r31 and r31["status"] != "APPROVED":
        center = client.get(f"/api/projects/{project['id']}/clarifications", headers=qam).json()
        for c in center["conflicts"]:
            if c["status"] == "OPEN" and r31["id"] in (c["a"]["id"], c["b"]["id"]):
                client.post(f"/api/requirements/{r31['id']}/resolve-conflict", headers=qam,
                            json={"conflict_id": c["id"], "keep": "a" if c["a"]["id"] == r31["id"] else "b", "reason": "test setup"})
        d = client.get(f"/api/requirements/{r31['id']}", headers=qam).json()
        for q in d["questions"]:
            if not q["resolved"]:
                client.post(f"/api/requirements/{r31['id']}/resolve-question", headers=qam, json={"question_id": q["id"], "answer": "ok", "resolve": True})
    for code in ("REQ-CAM-RULE3-001", "REQ-CAM-RULE5-002", "REQ-CAM-RULE6-001", "REQ-CAM-RULE5-001", "REQ-CAM-RULE3-003"):
        if code in rs and rs[code]["status"] != "APPROVED":
            client.post(f"/api/requirements/{rs[code]['id']}/approve", headers=qam)
    client.post(f"/api/projects/{project['id']}/test-scenarios/generate", headers=qam, json={})
    client.post(f"/api/projects/{project['id']}/test-cases/generate", headers=qam, json={})
    _, all_ = approved_tcs(client, qam, project)
    client.post("/api/test-cases/bulk-status", headers=qam, json={"ids": [t["id"] for t in all_ if not t["locked"]], "status": "APPROVED"})
    return approved_tcs(client, qam, project)[0]


def test_unapproved_blocked_unless_draft(client, qam, qaa, project, demo_doc):
    _ensure_flow(client, qam, project)
    r = client.post(f"/api/projects/{project['id']}/paste-text", headers=qam,
                    json={"title": "draft-src", "text": "1. Rule 21 Draft\n- ระบบต้องแสดงยอดรวมมากกว่า 5,000 บาท ให้ผู้ดูแลระบบ"})
    rs = reqs(client, qam, project)
    rid = next(v["id"] for k, v in rs.items() if k.startswith("REQ-CAM-RULE21-"))
    d = client.get(f"/api/requirements/{rid}", headers=qam).json()
    for q in d["questions"]:
        client.post(f"/api/requirements/{rid}/resolve-question", headers=qam, json={"question_id": q["id"], "answer": "ok", "resolve": True})
    assert client.post(f"/api/requirements/{rid}/approve", headers=qam).status_code == 200
    client.post(f"/api/projects/{project['id']}/test-scenarios/generate", headers=qam, json={"requirement_ids": [rid]})
    client.post(f"/api/projects/{project['id']}/test-cases/generate", headers=qam, json={})
    tcs = client.get(f"/api/projects/{project['id']}/test-cases", headers=qam, params={"q": "RULE21"}).json()["items"]
    draft_tc = tcs[0]
    assert draft_tc["status"] == "AI_GENERATED"
    r = client.post(f"/api/projects/{project['id']}/automation/generate", headers=qaa, json={"kind": "pytest", "test_case_ids": [draft_tc["id"]]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "TEST_CASE_NOT_APPROVED"
    r = client.post(f"/api/projects/{project['id']}/automation/generate", headers=qaa, json={"kind": "pytest", "test_case_ids": [draft_tc["id"]], "draft": True})
    assert r.status_code == 200 and r.json()["is_draft"] is True
    art = client.get(f"/api/automation/{r.json()['id']}", headers=qaa).json()
    assert art["contents"]["app/services/rule_service.py"].startswith("# DRAFT")
    # draft generation must not move the test case to AUTOMATED
    assert client.get(f"/api/test-cases/{draft_tc['id']}", headers=qam).json()["status"] == "AI_GENERATED"
    # QA Manual cannot generate code
    assert client.post(f"/api/projects/{project['id']}/automation/generate", headers=qam, json={"kind": "pytest", "test_case_ids": [draft_tc["id"]], "draft": True}).status_code == 403


def test_pytest_generated_project_really_runs(client, qam, qaa, project, demo_doc, tmp_path):
    ok = _ensure_flow(client, qam, project)
    r = client.post(f"/api/projects/{project['id']}/automation/generate", headers=qaa, json={"kind": "pytest", "test_case_ids": [t["id"] for t in ok]})
    assert r.status_code == 200, r.text
    a = r.json()
    assert not a["scan_problems"]
    assert {"conftest.py", "pytest.ini", "requirements.txt", "test_data/factory.py", "app/services/rule_service.py"} <= set(a["files"])
    # Thai Code Tips with all mandatory parts (หัวข้อ 19)
    tip = a["tips"]["app/services/rule_service.py"][0]
    assert set(tip) == {"code", "purpose", "input", "output", "why", "explain", "tc", "caution", "fix"} and "Decimal" in tip["why"]
    z = client.get(f"/api/automation/{a['id']}/zip", headers=qaa)
    zipfile.ZipFile(io.BytesIO(z.content)).extractall(tmp_path)
    proj = tmp_path / "automation_project"
    assert (proj / ".github/workflows/qa-automation.yml").exists()
    res = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=proj, capture_output=True, text=True, timeout=120)
    assert res.returncode == 0, res.stdout + res.stderr
    m = re.search(r"(\d+) passed", res.stdout)
    assert m and int(m.group(1)) >= 6, res.stdout          # boundary params really execute
    junit = (proj / "reports/junit.xml").read_text(encoding="utf-8")
    assert "TC-CAM-" in junit
    # every test file carries test case markers (traceability)
    unit = next(p for p in a["files"] if p.startswith("tests/unit/test_"))
    content = client.get(f"/api/automation/{a['id']}", headers=qaa).json()["contents"][unit]
    assert '@pytest.mark.testcase("TC-CAM-' in content and "pytest.mark.parametrize" in content
    # test cases are now AUTOMATED
    assert all(client.get(f"/api/test-cases/{t['id']}", headers=qam).json()["status"] == "AUTOMATED" for t in ok)


def test_python_layer_and_edit_reset_diff(client, qam, qaa, project, demo_doc):
    ok = _ensure_flow(client, qam, project)
    a = client.post(f"/api/test-cases/{ok[0]['id']}/python/generate", headers=qaa, json={}).json()
    assert {"app/utilities/date_helper.py", "app/utilities/api_helper.py", "app/repositories/transaction_repository.py", "app/validators/input_validator.py"} <= set(a["files"])
    path = "app/services/rule_service.py"
    r = client.put(f"/api/automation/{a['id']}/files", headers=qaa, json={"path": path, "content": "# edited\npassword = 'hunter2'\n"})
    assert r.status_code == 200 and r.json()["warnings"] and r.json()["artifact"]["edited"] is True   # secret warning
    d = client.get(f"/api/automation/{a['id']}/diff", headers=qaa, params={"path": path}).text
    assert "+# edited" in d
    client.post(f"/api/automation/{a['id']}/reset", headers=qaa, json={"path": path})
    art = client.get(f"/api/automation/{a['id']}", headers=qaa).json()
    assert art["edited"] is False and art["contents"][path] == art["ai_contents"][path]
    assert client.put(f"/api/automation/{a['id']}/files", headers=qaa, json={"path": "../../etc/passwd", "content": "x"}).status_code == 404
    assert client.put(f"/api/automation/{a['id']}/files", headers=qam, json={"path": path, "content": "x"}).status_code == 403


def test_postman_sql_playwright_jmeter_actions(client, qam, qaa, project, demo_doc):
    ok = _ensure_flow(client, qam, project)
    ids = [t["id"] for t in ok][:3]
    gen = lambda kind, **o: client.post(f"/api/projects/{project['id']}/automation/generate", headers=qaa, json={"kind": kind, "test_case_ids": ids, **o})  # noqa: E731
    # Postman (AC 32)
    a = gen("postman", options={"auth": "bearer"}).json()
    files = client.get(f"/api/automation/{a['id']}", headers=qaa).json()["contents"]
    col = json.loads(next(v for k, v in files.items() if k.endswith("postman_collection.json")))
    env = json.loads(next(v for k, v in files.items() if k.endswith("postman_environment.json")))
    assert col["auth"]["type"] == "bearer" and len(col["item"]) == len(ids)
    assert any(v["key"] == "token" and v["value"] == "" and v["type"] == "secret" for v in env["values"])
    none = gen("postman", options={}).json()
    assert "NEEDS_CONFIGURATION" in json.loads(next(v for k, v in client.get(f"/api/automation/{none['id']}", headers=qaa).json()["contents"].items() if k.endswith("collection.json")))["info"]["description"]
    # SQL (AC 33): MySQL, read-only, placeholders
    s = gen("sql", options={"types": ["duplicate", "aggregation", "status", "missing"]}).json()
    sql = next(iter(client.get(f"/api/automation/{s['id']}", headers=qaa).json()["contents"].values()))
    assert "Dialect: MySQL" in sql and "{{start_date}}" in sql
    body = "\n".join(l for l in sql.splitlines() if not l.startswith("--"))
    assert not re.search(r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b", body, re.I)
    assert ">= 200000" in sql or "> " in sql
    # Playwright (AC 34): POM, manual checkpoints, valid python
    pw = gen("playwright", options={"page_name": "CustomerSearch", "otp": True, "captcha": True, "browser": "msedge",
                                     "locators": [{"name": "search_box", "strategy": "get_by_test_id", "value": "customer-id"}]}).json()
    pf = client.get(f"/api/automation/{pw['id']}", headers=qaa).json()["contents"]
    assert "class CustomerSearchPage(BasePage)" in pf["pages/customersearch_page.py"]
    assert 'get_by_test_id("customer-id")' in pf["pages/customersearch_page.py"]
    ui = next(v for k, v in pf.items() if k.startswith("tests/ui/test_"))
    assert "manual_checkpoint" in ui and "CAPTCHA" in ui
    for k, v in pf.items():
        if k.endswith(".py"):
            compile(v, k, "exec")
    assert "screenshot" in pf["tests/ui/conftest.py"]
    # JMeter safety
    bad = gen("jmeter", options={"type": "Load", "url": "https://prod.bank.example", "users": 10, "minutes": 5, "ramp": 30, "confirm": True})
    assert bad.status_code == 409 and bad.json()["error"]["code"] == "JMETER_SAFETY"
    over = gen("jmeter", options={"type": "Load", "url": "https://sit.example.test", "users": 5000, "minutes": 5, "confirm": True})
    assert over.status_code == 409
    j = gen("jmeter", options={"type": "Spike", "url": "https://sit.example.test", "users": 20, "minutes": 2, "ramp": 5, "confirm": True}).json()
    jf = client.get(f"/api/automation/{j['id']}", headers=qaa).json()["contents"]
    jmx = next(v for k, v in jf.items() if k.endswith(".jmx"))
    xml.dom.minidom.parseString(jmx.encode())
    assert "ThreadGroup.num_threads\">20<" in jmx and "jmeter/test_data.csv" in jf
    assert client.post(f"/api/automation/{j['id']}/jmeter/approve", headers=qaa).json()["status"] == "APPROVED"
    # GitHub Actions: workflow_dispatch only, secrets referenced not embedded
    g = gen("github_actions").json()
    wf = client.get(f"/api/automation/{g['id']}", headers=qaa).json()["contents"][".github/workflows/qa-automation.yml"]
    y = yaml.safe_load(wf)
    triggers = y.get("on") or y.get(True)
    assert list(triggers) == ["workflow_dispatch"] and "schedule" not in wf
    assert "${{ secrets.BASE_URL }}" in wf


def test_locator_advisor_and_recording(client, qaa):
    html = '<form><label for="cid">Customer ID</label><input id="cid"><button data-testid="search-btn">ค้นหา</button><a href="/x">รายงาน</a><div><span>x</span><input></div></form>'
    locs = client.post("/api/playwright/locators/from-html", headers=qaa, json={"html": html}).json()["locators"]
    strat = [l["strategy"] for l in locs]
    assert strat[:3] == ["get_by_label", "get_by_test_id", "get_by_role"] and strat[-1] == "xpath"
    rec = "page.get_by_label(\"Username\").fill(\"x\")\npage.get_by_role(\"button\", name=\"Login\").click()\npage.locator(\"#result\").click()"
    locs = client.post("/api/playwright/locators/from-recording", headers=qaa, json={"html": rec}).json()["locators"]
    assert [l["strategy"] for l in locs] == ["get_by_label", "get_by_role", "css"]


def test_secret_scan_unit():
    from app.services.generators import scan_files_for_secrets
    assert scan_files_for_secrets({".env": "A=1"})
    assert scan_files_for_secrets({"a.py": "token = 'ghp_" + "a" * 30 + "'"})
    assert scan_files_for_secrets({"a.py": "id = 1234567890123"})
    assert not scan_files_for_secrets({".env.example": "BASE_URL=\n", "a.py": "x = 1"})
