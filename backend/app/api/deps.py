"""Auth dependency + permission guard. Backend always re-checks permission (PAGE_SPEC 27.3)."""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from ..core.errors import AppError, forbidden
from ..core.rbac import has_perm
from ..core.security import create_token, decode_token
from ..db import get_db
from ..models import Project, User
from ..repositories import audit


@dataclass
class Principal:
    user: User
    roles: list[str]
    ip: str

    @property
    def username(self) -> str:
        return self.user.username

    def can(self, perm: str) -> bool:
        return has_perm(self.roles, perm)


def current_user(request: Request, db: Session = Depends(get_db)) -> Principal:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise AppError("AUTH_REQUIRED", "กรุณาเข้าสู่ระบบ", status=401)
    data = decode_token(auth[7:])
    user = db.get(User, data.get("sub"))
    if user is None or not user.active:
        raise AppError("AUTH_INVALID_TOKEN", "Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", status=401)
    if user.must_change_password and not request.url.path.endswith(("/auth/change-password", "/auth/me", "/auth/logout")):
        raise AppError("PASSWORD_CHANGE_REQUIRED", "ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน", status=403, action="ไปที่หน้าเปลี่ยนรหัสผ่าน")
    # sliding idle session: hand back a refreshed token
    request.state.refreshed_token = create_token(user.id)
    return Principal(user=user, roles=user.role_codes, ip=request.client.host if request.client else "")


def require(perm: str):
    def dep(p: Principal = Depends(current_user), db: Session = Depends(get_db)) -> Principal:
        if not p.can(perm):
            audit(db, p.username, "PERMISSION_DENIED", perm, ip=p.ip)
            db.commit()
            raise forbidden(perm)
        return p
    dep.__name__ = f"require__{perm}"  # used by API.md generator
    return dep


def get_project(db: Session, project_id: str) -> Project:
    pr = db.get(Project, project_id)
    if pr is None:
        raise AppError("NOT_FOUND", "ไม่พบ Project", status=404)
    return pr
