"""Stage 7 — Test Runner via API: run generated pytest, results/evidence, logs, cancel, rerun failed, import (AC 29, 30)."""
from tests.test_stage6_generators import _ensure_flow


def _pytest_artifact(client, qam, qaa, project):
    ok = _ensure_flow(client, qam, project)
    return client.post(f"/api/projects/{project['id']}/automation/generate", headers=qaa, json={"kind": "pytest", "test_case_ids": [t["id"] for t in ok]}).json()


def test_run_pytest_from_web(client, qam, qaa, ba, project, demo_doc):
    a = _pytest_artifact(client, qam, qaa, project)
    assert client.post(f"/api/automation/{a['id']}/run", headers=ba, json={}).status_code == 403   # BA can view but not run
    r = client.post(f"/api/automation/{a['id']}/run", headers=qaa, json={}).json()
    run = client.get(f"/api/test-runs/{r['id']}", headers=ba).json()          # TASK_MODE=sync → finished
    assert run["status"] == "PASSED", run["stdout"][-2000:] + run["stderr"]
    s = run["summary"]
    assert s["passed"] >= 6 and s["blocked"] >= 1 and s["failed"] == 0      # AC 30 Pass/Fail/Blocked
    assert all(x["test_case_id"] for x in run["results"])                    # results traced to test cases
    kinds = {x["kind"] for x in run["artifacts"]}
    assert "junit" in kinds
    lg = client.get(f"/api/test-runs/{r['id']}/logs", headers=qaa, params={"offset": 0}).json()
    assert "passed" in lg["stdout"] and lg["offset"] > 0
    assert client.get(f"/api/test-runs/{r['id']}/logs", headers=qaa, params={"offset": lg["offset"]}).json()["stdout"] == ""
    junit = next(x for x in run["artifacts"] if x["kind"] == "junit")
    assert b"testcase" in client.get(f"/api/test-runs/{r['id']}/artifacts/{junit['id']}", headers=qaa).content
    dash = client.get(f"/api/projects/{project['id']}/dashboard", headers=qam).json()
    assert dash["last_run"]["id"] == r["id"]


def test_failed_run_and_rerun_failed_only(client, qam, qaa, project, demo_doc):
    a = _pytest_artifact(client, qam, qaa, project)
    full = client.get(f"/api/automation/{a['id']}", headers=qaa).json()
    path = "app/services/rule_service.py"
    broken = full["contents"][path].replace(">= REQ_CAM_RULE3_001_THRESHOLD", "> REQ_CAM_RULE3_001_THRESHOLD")
    assert broken != full["contents"][path]
    client.put(f"/api/automation/{a['id']}/files", headers=qaa, json={"path": path, "content": broken})
    r = client.post(f"/api/automation/{a['id']}/run", headers=qaa, json={}).json()
    run = client.get(f"/api/test-runs/{r['id']}", headers=qaa).json()
    assert run["status"] == "FAILED" and run["summary"]["failed"] >= 1
    failed = [x for x in run["results"] if x["status"] == "FAILED"]
    assert failed[0]["tc_id"].startswith("TC-CAM-RULE3-") and failed[0]["message"]
    rr = client.post(f"/api/test-runs/{r['id']}/rerun", headers=qaa, json={"failed_only": True}).json()
    rerun = client.get(f"/api/test-runs/{rr['id']}", headers=qaa).json()
    assert rerun["summary"]["total"] < run["summary"]["total"] and rerun["status"] == "FAILED"


def test_dangerous_code_is_not_executed(client, qam, qaa, project, demo_doc):
    a = _pytest_artifact(client, qam, qaa, project)
    client.put(f"/api/automation/{a['id']}/files", headers=qaa, json={"path": "conftest.py", "content": "import subprocess\nsubprocess.run(['whoami'])\n"})
    r = client.post(f"/api/automation/{a['id']}/run", headers=qaa, json={}).json()
    run = client.get(f"/api/test-runs/{r['id']}", headers=qaa).json()
    assert run["status"] == "FAILED" and run["summary"]["error_code"] == "RUNNER_VALIDATION_FAILED" and "subprocess" in run["stderr"]


def test_cancel_endpoint_states(client, qaa, project, demo_doc):
    runs = client.get(f"/api/projects/{project['id']}/test-runs", headers=qaa).json()
    assert client.post(f"/api/test-runs/{runs[0]['id']}/cancel", headers=qaa).status_code == 409   # finished runs cannot be cancelled


def test_import_junit_and_newman(client, qaa, project, demo_doc):
    xml = b'<testsuite><testcase classname="tests.unit.test_rule3" name="test_tc_cam_rule3_001_boundary" time="0.2"/><testcase classname="tests.unit.test_rule3" name="test_tc_cam_rule3_002_negative"><failure message="boom"/></testcase></testsuite>'
    r = client.post(f"/api/projects/{project['id']}/test-runs/import", headers=qaa, data={"kind": "junit"}, files={"file": ("junit.xml", xml)}).json()
    assert r["source"] == "JUNIT_IMPORT" and r["summary"]["failed"] == 1 and r["status"] == "FAILED"
    nm = b'{"run":{"executions":[{"item":{"name":"TC-CAM-RULE6-001 api"},"assertions":[],"response":{"responseTime":50}}]}}'
    r = client.post(f"/api/projects/{project['id']}/test-runs/import", headers=qaa, data={"kind": "newman"}, files={"file": ("n.json", nm)}).json()
    assert r["source"] == "NEWMAN_IMPORT" and r["status"] == "PASSED"
    bad = client.post(f"/api/projects/{project['id']}/test-runs/import", headers=qaa, data={"kind": "junit"}, files={"file": ("x.xml", b"<oops")})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "INVALID_RESULT_FILE"


def test_remote_runner_service(client, qam, qaa, project, demo_doc, monkeypatch):
    """Backend → automation-runner HTTP service (Docker mode) with token auth."""
    import os
    import socket
    import threading
    import time

    import uvicorn

    from app.config import get_settings
    from app.services.run_service import _runner_module
    _runner_module()  # puts automation-runner on sys.path
    os.environ["RUNNER_TOKEN"] = "remote-tok"
    import importlib
    import runner.service as svc
    importlib.reload(svc)
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    server = uvicorn.Server(uvicorn.Config(svc.app, host="127.0.0.1", port=port, log_level="warning"))
    th = threading.Thread(target=server.run, daemon=True)
    th.start()
    for _ in range(50):
        if server.started:
            break
        time.sleep(0.1)
    monkeypatch.setattr(get_settings(), "runner_url", f"http://127.0.0.1:{port}")
    monkeypatch.setattr(get_settings(), "runner_token", "remote-tok")
    try:
        a = _pytest_artifact(client, qam, qaa, project)
        r = client.post(f"/api/automation/{a['id']}/run", headers=qaa, json={}).json()
        run = client.get(f"/api/test-runs/{r['id']}", headers=qaa).json()
        assert run["status"] == "PASSED", run["stderr"]
        assert {x["kind"] for x in run["artifacts"]} >= {"junit"}
    finally:
        server.should_exit = True
        th.join(timeout=5)
