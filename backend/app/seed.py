"""Seed: roles, Seed Admin, demo users per role, Example Project CAM with Synthetic BRS (processed).

Usage:  python -m app.seed            (idempotent)
        python -m app.seed --no-demo  (roles + admin only)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import select

from .config import REPO_ROOT, get_settings
from .core.rbac import ROLES
from .core.security import hash_password
from .db import SessionLocal
from .models import Document, Project, ProcessingJob, Role, User

SAMPLE_BRS = REPO_ROOT / "samples" / "CAM_BRS_v1.txt"
DEMO_USERS = [("qa_manual", "QA Manual (Demo)", "QA_MANUAL"), ("qa_auto", "QA Automation (Demo)", "QA_AUTOMATION"),
              ("ba", "Business Analyst (Demo)", "BA")]


def seed_roles_and_admin(db) -> User:
    for code, name in ROLES.items():
        if not db.scalar(select(Role).where(Role.code == code)):
            db.add(Role(code=code, name=name))
    db.flush()
    admin = db.scalar(select(User).where(User.username == "admin"))
    if admin is None:
        admin = User(username="admin", name="System Admin", password_hash=hash_password(get_settings().seed_admin_password),
                     must_change_password=not get_settings().single_user_mode)
        admin.roles = list(db.scalars(select(Role).where(Role.code == "ADMIN")))
        db.add(admin)
    if get_settings().single_user_mode:
        # One account that can do everything: no forced password change, admin always active with the ADMIN role
        admin.must_change_password = False
        admin.active = True
        if not any(r.code == "ADMIN" for r in admin.roles):
            admin.roles = list(admin.roles) + list(db.scalars(select(Role).where(Role.code == "ADMIN")))
    db.flush()
    return admin


def seed_demo(db) -> None:
    pw = get_settings().seed_admin_password
    for username, name, role in DEMO_USERS:
        existing = db.scalar(select(User).where(User.username == username))
        if get_settings().single_user_mode:
            if existing is not None:
                existing.active = False   # single-user mode: only admin can log in
            continue
        if existing is None:
            u = User(username=username, name=name, password_hash=hash_password(pw), must_change_password=True)
            u.roles = list(db.scalars(select(Role).where(Role.code == role)))
            db.add(u)
    if db.scalar(select(Project).where(Project.code == "CAM")):
        db.commit()
        return
    pr = Project(code="CAM", name="Customer Activity Monitoring (Synthetic Demo)",
                 description="Project ตัวอย่าง — ข้อมูลทั้งหมดเป็น Synthetic", module_codes=["RULE3", "RULE4", "RULE5", "RULE6"], created_by="seed")
    db.add(pr)
    db.commit()
    from .api.documents import _store_version
    from .services.processing import run_job
    data = SAMPLE_BRS.read_bytes()
    _, _, job = _store_version(db, project=pr, data=data, filename=SAMPLE_BRS.name, ext="txt", document_id=None,
                               default_module="GENERAL", ai_mode="rule", username="seed")
    run_job(db, job.id, username="seed")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-demo", action="store_true")
    args = ap.parse_args(argv)
    db = SessionLocal()
    try:
        seed_roles_and_admin(db)
        db.commit()
        if not args.no_demo:
            seed_demo(db)
        n_docs = len(db.scalars(select(Document)).all())
        jobs = db.scalars(select(ProcessingJob)).all()
        print(f"seed ok: users={len(db.scalars(select(User)).all())} documents={n_docs} jobs={[j.status for j in jobs]}")
        print("Seed Admin: admin / (SEED_ADMIN_PASSWORD, default Admin@12345) — ระบบจะบังคับเปลี่ยนรหัสผ่านเมื่อ Login ครั้งแรก")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
