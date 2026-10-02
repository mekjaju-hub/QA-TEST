"""หัวข้อ 35: every required REST endpoint exists and is protected (no anonymous access except login/health)."""
from fastapi.routing import APIRoute

from app.main import app

SPEC = """POST /api/auth/login|POST /api/auth/logout|GET /api/auth/me|GET /api/projects|POST /api/projects|GET /api/projects/{project_id}
PATCH /api/projects/{project_id}|POST /api/projects/{project_id}/documents|POST /api/projects/{project_id}/paste-text|GET /api/documents/{document_id}
POST /api/documents/{document_id}/process|POST /api/documents/{document_id}/retry-failed|GET /api/documents/{document_id}/progress
GET /api/projects/{project_id}/requirements|GET /api/requirements/{rid}|PATCH /api/requirements/{rid}|POST /api/requirements/{rid}/review
POST /api/requirements/{rid}/approve|POST /api/requirements/{rid}/resolve-question|POST /api/requirements/{rid}/resolve-conflict
POST /api/projects/{project_id}/test-scenarios/generate|GET /api/projects/{project_id}/test-scenarios|PATCH /api/test-scenarios/{sid}
POST /api/test-scenarios/{sid}/test-cases/generate|GET /api/projects/{project_id}/test-cases|GET /api/test-cases/{tid}|PATCH /api/test-cases/{tid}
POST /api/test-cases/{tid}/approve|GET /api/projects/{project_id}/test-cases/export|POST /api/test-cases/{tid}/python/generate
POST /api/test-cases/{tid}/pytest/generate|POST /api/test-cases/{tid}/postman/generate|POST /api/test-cases/{tid}/sql/generate
POST /api/test-cases/{tid}/playwright/generate|POST /api/automation/{aid}/run|POST /api/test-runs/{rid}/cancel|GET /api/test-runs/{rid}
GET /api/test-runs/{rid}/logs|POST /api/github/connect|POST /api/github/repository/propose|POST /api/github/action/approve
POST /api/github/action/execute""".replace("\n", "|").split("|")


def _routes():
    def walk(rs):
        for r in rs:
            if isinstance(r, APIRoute):
                yield r
            elif hasattr(r, "original_router"):
                yield from walk(r.original_router.routes)
    return list(walk(app.routes))


def test_spec_endpoints_exist():
    have = {(m, r.path) for r in _routes() for m in r.methods}
    missing = [s for s in SPEC if tuple(s.split(" ")) not in have]
    assert not missing, missing


def test_all_endpoints_require_auth(client):
    public = {"/api/auth/login", "/api/health"}
    for r in _routes():
        if r.path in public:
            continue
        path = r.path.replace("{", "").replace("}", "")
        for m in r.methods:
            res = client.request(m, path)
            assert res.status_code in (401, 422), (m, r.path, res.status_code)
