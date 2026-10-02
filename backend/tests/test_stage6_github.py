"""GitHub Integration — proposal/approval gating, secret blocking, no merge/force push (mocked GitHub API)."""
import json

import httpx
import pytest

from app.config import get_settings
from app.services import github_service
from tests.test_stage6_generators import _ensure_flow


class FakeGitHub:
    def __init__(self):
        self.calls = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path, m = request.url.path, request.method
        self.calls.append((m, path))
        assert "merge" not in path, "must never merge"
        if m == "GET" and path == "/repos/acme/qa":
            return httpx.Response(200, json={"default_branch": "main"})
        if m == "GET" and path == "/repos/acme/qa/git/ref/heads/main":
            return httpx.Response(200, json={"object": {"sha": "base1"}})
        if m == "GET" and path.startswith("/repos/acme/qa/git/ref/heads/"):
            return httpx.Response(404, json={})
        if m == "GET" and path == "/repos/acme/qa/git/commits/base1":
            return httpx.Response(200, json={"tree": {"sha": "tree0"}})
        if m == "POST" and path.endswith("/git/blobs"):
            return httpx.Response(201, json={"sha": "blob" + str(len(self.calls))})
        if m == "POST" and path.endswith("/git/trees"):
            return httpx.Response(201, json={"sha": "tree1"})
        if m == "POST" and path.endswith("/git/commits"):
            return httpx.Response(201, json={"sha": "commit1"})
        if m == "POST" and path.endswith("/git/refs"):
            body = json.loads(request.content)
            assert body["ref"].startswith("refs/heads/") and "force" not in body
            return httpx.Response(201, json={})
        if m == "POST" and path.endswith("/pulls"):
            return httpx.Response(201, json={"html_url": "https://github.com/acme/qa/pull/1"})
        return httpx.Response(404, json={"message": "unexpected " + path})


@pytest.fixture
def fake_github(monkeypatch):
    fake = FakeGitHub()
    monkeypatch.setattr(get_settings(), "github_token", "ghp_testtoken_not_real_000000")
    github_service.set_transport(httpx.MockTransport(fake))
    yield fake
    github_service.set_transport(None)


def test_github_requires_token(client, qaa, project):
    r = client.post("/api/github/connect", headers=qaa, json={"project_id": project["id"], "owner": "acme", "repo": "qa"})
    assert r.json()["status"] == "NEEDS_CONFIGURATION"


def test_propose_approve_execute(client, qam, qaa, ba, project, demo_doc, fake_github):
    ok = _ensure_flow(client, qam, project)
    art = client.post(f"/api/projects/{project['id']}/automation/generate", headers=qaa, json={"kind": "pytest", "test_case_ids": [t["id"] for t in ok]}).json()
    assert client.post("/api/github/connect", headers=qaa, json={"project_id": project["id"], "owner": "acme", "repo": "qa"}).json()["status"] == "CONNECTED"
    assert client.post("/api/github/repository/propose", headers=ba, json={"project_id": project["id"], "artifact_id": art["id"], "action_type": "CREATE_BRANCH_COMMIT_PR",
                                                                          "repository": "acme/qa", "branch": "qa/x", "commit_message": "x y z"}).status_code == 403
    r = client.post("/api/github/repository/propose", headers=qaa, json={"project_id": project["id"], "artifact_id": art["id"], "action_type": "CREATE_BRANCH_COMMIT_PR",
                                                                       "repository": "acme/qa", "branch": "main", "commit_message": "add tests"})
    assert r.status_code == 400  # never commit straight to main
    prop = client.post("/api/github/repository/propose", headers=qaa, json={"project_id": project["id"], "artifact_id": art["id"], "action_type": "CREATE_BRANCH_COMMIT_PR",
                                                                          "repository": "acme/qa", "branch": "qa/cam-pytest", "commit_message": "Add CAM pytest suite"}).json()
    assert prop["status"] == "PROPOSED" and prop["files"] and "+++ b/conftest.py" in prop["diff"]
    # Execute before approval is refused (AC 35)
    r = client.post("/api/github/action/execute", headers=qaa, json={"request_id": prop["id"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "NOT_APPROVED"
    assert not any(m == "POST" for m, _ in fake_github.calls)
    client.post("/api/github/action/approve", headers=qaa, json={"request_id": prop["id"]})
    done = client.post("/api/github/action/execute", headers=qaa, json={"request_id": prop["id"]}).json()
    assert done["status"] == "EXECUTED" and done["result"]["pull_request"].endswith("/pull/1") and done["result"]["merged"] is False
    assert not any("merge" in p for _, p in fake_github.calls)


def test_secret_blocks_proposal(client, qam, qaa, project, demo_doc, fake_github):
    ok = _ensure_flow(client, qam, project)
    art = client.post(f"/api/projects/{project['id']}/automation/generate", headers=qaa, json={"kind": "python", "test_case_ids": [ok[0]["id"]]}).json()
    client.put(f"/api/automation/{art['id']}/files", headers=qaa, json={"path": "config/settings.py", "content": "password = 'P@ssw0rd!'\n"})
    prop = client.post("/api/github/repository/propose", headers=qaa, json={"project_id": project["id"], "artifact_id": art["id"], "action_type": "CREATE_BRANCH_COMMIT_PR",
                                                                          "repository": "acme/qa", "branch": "qa/secret", "commit_message": "should be blocked"}).json()
    assert prop["status"] == "BLOCKED" and prop["scan_problems"]
    assert client.post("/api/github/action/approve", headers=qaa, json={"request_id": prop["id"]}).status_code == 409
