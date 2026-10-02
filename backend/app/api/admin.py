"""Settings (P23), Users & Roles, Audit Log (P24)."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.errors import AppError
from ..core.rbac import PERMS, ROLES
from ..core.security import check_policy, hash_password
from ..db import get_db
from ..models import ApplicationSetting, AuditLog, Role, User
from ..repositories import audit, now
from .deps import Principal, require
from .serializers import iso, user_out

router = APIRouter(prefix="/api", tags=["admin"])

EDITABLE = {  # runtime settings stored in application_settings (no secrets here)
    "ai_mode": ("rule", str), "vision_enabled": (False, bool), "runner_timeout_sec": (120, int), "runner_max_output_kb": (512, int),
    "jmeter_max_users": (50, int), "jmeter_max_minutes": (10, int), "env_allowlist": ([], list),
    "github_owner": ("", str), "github_repo": ("", str),
}


def runtime_settings(db: Session) -> dict:
    base = get_settings().public_settings()
    for row in db.scalars(select(ApplicationSetting)):
        if row.key in EDITABLE:
            base[row.key] = row.value
    return base


class SettingsIn(BaseModel):
    values: dict


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.\-]+$")
    name: str = Field(default="", max_length=128)
    roles: list[str]
    password: str = Field(min_length=10, max_length=128)


class UserPatch(BaseModel):
    name: str | None = None
    roles: list[str] | None = None
    active: bool | None = None
    reset_password: str | None = Field(default=None, min_length=10, max_length=128)


@router.get("/settings")
def get_settings_api(p: Principal = Depends(require("settings")), db: Session = Depends(get_db)):
    return {"settings": runtime_settings(db), "roles": ROLES, "permissions": PERMS,
            "network_warning": "การตั้ง BIND_HOST=0.0.0.0 จะเปิดให้ทุกเครื่องใน LAN เข้าถึงระบบ — ใช้เฉพาะเครือข่ายที่เชื่อถือได้, "
                               "เปลี่ยนรหัสผ่าน Seed Admin แล้ว, และเปิด Windows Firewall เฉพาะ Port ที่จำเป็น"}


@router.patch("/settings")
def patch_settings(body: SettingsIn, p: Principal = Depends(require("settings")), db: Session = Depends(get_db)):
    for k, v in body.values.items():
        if k not in EDITABLE:
            raise AppError("VALIDATION", f"แก้ค่า {k} ผ่านหน้าเว็บไม่ได้ (ตั้งใน .env)")
        typ = EDITABLE[k][1]
        if not isinstance(v, typ):
            raise AppError("VALIDATION", f"{k} ต้องเป็น {typ.__name__}")
        if k == "ai_mode" and v not in ("rule", "claude"):
            raise AppError("VALIDATION", "ai_mode ต้องเป็น rule หรือ claude")
        row = db.get(ApplicationSetting, k) or ApplicationSetting(key=k)
        row.value, row.updated_by, row.updated_at = v, p.username, now()
        db.add(row)
        audit(db, p.username, "SETTINGS_UPDATE", k, str(v))
    db.commit()
    return {"settings": runtime_settings(db)}


@router.get("/users")
def list_users(p: Principal = Depends(require("user.manage")), db: Session = Depends(get_db)):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.username))]


def _roles(db: Session, codes: list[str]) -> list[Role]:
    bad = [c for c in codes if c not in ROLES]
    if bad or not codes:
        raise AppError("VALIDATION", f"Role ไม่ถูกต้อง: {bad or 'ว่าง'}")
    return list(db.scalars(select(Role).where(Role.code.in_(codes))))


@router.post("/users")
def create_user(body: UserIn, p: Principal = Depends(require("user.manage")), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == body.username)):
        raise AppError("DUPLICATE", "Username นี้มีอยู่แล้ว", status=409)
    check_policy(body.password)
    u = User(username=body.username, name=body.name, password_hash=hash_password(body.password), must_change_password=True)
    u.roles = _roles(db, body.roles)
    db.add(u)
    audit(db, p.username, "USER_CREATE", body.username, ",".join(body.roles))
    db.commit()
    return user_out(u)


@router.patch("/users/{uid}")
def patch_user(uid: str, body: UserPatch, p: Principal = Depends(require("user.manage")), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if u is None:
        raise AppError("NOT_FOUND", "ไม่พบผู้ใช้", status=404)
    if body.name is not None:
        u.name = body.name
    if body.roles is not None:
        if u.id == p.user.id and "ADMIN" not in body.roles:
            raise AppError("VALIDATION", "ห้ามถอด Role Admin ของตัวเอง")
        u.roles = _roles(db, body.roles)
    if body.active is not None:
        if u.id == p.user.id and not body.active:
            raise AppError("VALIDATION", "ห้ามปิดบัญชีตัวเอง")
        u.active = body.active
    if body.reset_password:
        check_policy(body.reset_password)
        u.password_hash, u.must_change_password = hash_password(body.reset_password), True
    audit(db, p.username, "USER_UPDATE", u.username)
    db.commit()
    return user_out(u)


@router.get("/audit-logs")
def audit_logs(q: str = "", action: str = "", username: str = "", limit: int = 500,
               p: Principal = Depends(require("audit.view")), db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if username:
        stmt = stmt.where(AuditLog.username == username)
    if q:
        stmt = stmt.where(or_(AuditLog.entity.ilike(f"%{q}%"), AuditLog.detail.ilike(f"%{q}%")))
    rows = db.scalars(stmt.order_by(AuditLog.at.desc()).limit(min(limit, 5000)))
    return [{"id": a.id, "at": iso(a.at), "username": a.username, "action": a.action, "entity": a.entity, "detail": a.detail,
             "correlation_id": a.correlation_id, "ip": a.ip} for a in rows]


@router.get("/audit-logs/export")
def audit_export(p: Principal = Depends(require("audit.view")), db: Session = Depends(get_db)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["at", "username", "action", "entity", "detail", "correlation_id", "ip"])
    for a in db.scalars(select(AuditLog).order_by(AuditLog.at.desc()).limit(50000)):
        w.writerow([iso(a.at), a.username, a.action, a.entity, a.detail, a.correlation_id, a.ip])
    audit(db, p.username, "EXPORT", "audit-log csv")
    db.commit()
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="audit_log.csv"'})
