from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.errors import AppError
from ..core.ratelimit import limiter
from ..core.security import check_policy, create_token, hash_password, verify_password
from ..db import get_db
from ..models import User
from ..repositories import audit, now
from .deps import Principal, current_user
from .serializers import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "?"
    if not limiter.hit(f"login:{ip}:{body.username.lower()}", get_settings().login_rate_per_minute):
        audit(db, body.username, "LOGIN_RATE_LIMITED", body.username, ip=ip)
        db.commit()
        raise AppError("RATE_LIMITED", "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 1 นาที", status=429, retryable=True)
    user = db.scalar(select(User).where(User.username == body.username.strip()))
    if user is None or not user.active or not verify_password(body.password, user.password_hash):
        audit(db, body.username, "LOGIN_FAILED", body.username, ip=ip)
        db.commit()
        # do not reveal whether username or password was wrong (P01)
        raise AppError("AUTH_INVALID", "Username หรือ Password ไม่ถูกต้อง", status=401)
    user.last_login_at = now()
    audit(db, user.username, "LOGIN", user.username, ip=ip)
    db.commit()
    return {"access_token": create_token(user.id), "token_type": "bearer", "expires_in": get_settings().session_minutes * 60,
            "must_change_password": user.must_change_password, "user": user_out(user)}


@router.post("/logout")
def logout(p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    audit(db, p.username, "LOGOUT", p.username, ip=p.ip)
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(p: Principal = Depends(current_user)):
    return {"user": user_out(p.user), "settings": get_settings().public_settings()}


@router.post("/change-password")
def change_password(body: ChangePasswordIn, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, p.user.password_hash):
        raise AppError("AUTH_INVALID", "รหัสผ่านปัจจุบันไม่ถูกต้อง", status=400)
    if body.new_password == body.current_password:
        raise AppError("WEAK_PASSWORD", "รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม")
    check_policy(body.new_password)
    p.user.password_hash = hash_password(body.new_password)
    p.user.must_change_password = False
    audit(db, p.username, "PASSWORD_CHANGED", p.username, ip=p.ip)
    db.commit()
    return {"ok": True, "access_token": create_token(p.user.id)}
