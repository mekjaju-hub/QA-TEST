import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))

_tmp = Path(tempfile.mkdtemp(prefix="brsqa-test-"))
os.environ.update({
    "DATABASE_URL": os.getenv("TEST_DATABASE_URL") or f"sqlite:///{(_tmp / 'test.db').as_posix()}",
    "STORAGE_ROOT": str(_tmp / "storage"),
    "TASK_MODE": "sync",
    "SECRET_KEY": "test-secret-key-0123456789abcdef",
    "LOGIN_RATE_PER_MINUTE": "1000",
    "API_RATE_PER_MINUTE": "100000",
    "RUNNER_URL": "",
    "CLAUDE_API_KEY": "",
    "GITHUB_TOKEN": "",
})

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
import app.models  # noqa: E402,F401
from app.main import app  # noqa: E402

ADMIN_PW = "Admin@12345"
NEW_PW = "N3w-Strong!Pass"


@pytest.fixture(scope="session", autouse=True)
def _db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    from app.seed import seed_roles_and_admin
    from app.core.security import hash_password
    from app.models import Role, User
    from sqlalchemy import select
    db = SessionLocal()
    seed_roles_and_admin(db)
    for name, role in (("qam", "QA_MANUAL"), ("qaa", "QA_AUTOMATION"), ("ba1", "BA")):
        u = User(username=name, name=name, password_hash=hash_password(NEW_PW), must_change_password=False)
        u.roles = list(db.scalars(select(Role).where(Role.code == role)))
        db.add(u)
    db.commit()
    db.close()
    yield


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


def _login(client, user, pw):
    r = client.post("/api/auth/login", json={"username": user, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin(client):
    h = _login(client, "admin", ADMIN_PW)
    # seed admin must change password first
    r = client.post("/api/auth/change-password", headers=h, json={"current_password": ADMIN_PW, "new_password": NEW_PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def qam(client):
    return _login(client, "qam", NEW_PW)


@pytest.fixture(scope="session")
def qaa(client):
    return _login(client, "qaa", NEW_PW)


@pytest.fixture(scope="session")
def ba(client):
    return _login(client, "ba1", NEW_PW)


@pytest.fixture(scope="session")
def project(client, admin):
    r = client.post("/api/projects", headers=admin, json={"code": "CAM", "name": "Demo"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def scratch(client, admin):
    r = client.post("/api/projects", headers=admin, json={"code": "SCR", "name": "Scratch uploads"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def demo_doc(client, qam, project):
    """CAM_BRS_v1.txt processed synchronously."""
    with open(REPO / "samples" / "CAM_BRS_v1.txt", "rb") as fh:
        r = client.post(f"/api/projects/{project['id']}/documents", headers=qam,
                        files={"file": ("CAM_BRS_v1.txt", fh, "text/plain")}, data={"ai_mode": "rule"})
    assert r.status_code == 200, r.text
    return r.json()
