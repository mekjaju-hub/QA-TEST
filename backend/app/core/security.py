"""Password hashing (bcrypt) and signed session tokens (HS256, stdlib only)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time

import bcrypt

from ..config import get_settings
from .errors import AppError

PASSWORD_POLICY = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$")


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode())
    except ValueError:
        return False


def check_policy(pw: str) -> None:
    if not PASSWORD_POLICY.match(pw or ""):
        raise AppError("WEAK_PASSWORD", "รหัสผ่านต้องยาวอย่างน้อย 10 ตัว มีตัวพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ")


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_token(user_id: str, *, minutes: int | None = None, extra: dict | None = None) -> str:
    st = get_settings()
    exp = int(time.time()) + 60 * (minutes or st.session_minutes)
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64(json.dumps({"sub": user_id, "exp": exp, **(extra or {})}).encode())
    sig = hmac.new(st.secret_key.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64(sig)}"


def decode_token(token: str) -> dict:
    st = get_settings()
    try:
        header, payload, sig = token.split(".")
        good = hmac.new(st.secret_key.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(good, _unb64(sig)):
            raise ValueError("bad signature")
        data = json.loads(_unb64(payload))
    except Exception as exc:  # noqa: BLE001
        raise AppError("AUTH_INVALID_TOKEN", "Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", status=401, technical=str(exc)) from exc
    if data.get("exp", 0) < time.time():
        raise AppError("SESSION_EXPIRED", "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่", status=401)
    return data
