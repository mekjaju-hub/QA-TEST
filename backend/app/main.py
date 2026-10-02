"""FastAPI application entry point.

Run (dev):  uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
"""
from __future__ import annotations

import importlib
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .core.errors import AppError
from .core.ratelimit import limiter

logging.basicConfig(level=logging.INFO, format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}')
log = logging.getLogger("app")
logging.getLogger("httpx").setLevel(logging.WARNING)

settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=False,
                   allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"],
                   expose_headers=["X-Refreshed-Token", "X-Correlation-Id", "Content-Disposition"])

ROUTERS = ["auth", "projects", "documents", "requirements", "testdesign", "admin", "automation", "runs", "github", "web_explorer"]
for name in ROUTERS:
    try:
        mod = importlib.import_module(f".api.{name}", __package__)
    except ModuleNotFoundError as exc:  # router not built yet in an earlier stage
        if exc.name and exc.name.endswith(f"api.{name}"):
            continue
        raise
    app.include_router(mod.router)


@app.middleware("http")
async def security_mw(request: Request, call_next):
    cid = uuid.uuid4().hex[:8]
    request.state.correlation_id = cid
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        ip = request.client.host if request.client else "?"
        if not limiter.hit(f"api:{ip}", settings.api_rate_per_minute):
            return JSONResponse(status_code=429, content={"error": AppError("RATE_LIMITED", "เรียกใช้งานบ่อยเกินไป", status=429, retryable=True).to_dict()})
    resp = await call_next(request)
    resp.headers["X-Correlation-Id"] = cid
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'" if not request.url.path.startswith("/api/docs") else \
        "default-src 'self' https://cdn.jsdelivr.net; img-src 'self' data: https://fastapi.tiangolo.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net"
    tok = getattr(request.state, "refreshed_token", None)
    if tok:
        resp.headers["X-Refreshed-Token"] = tok
    return resp


def _is_admin(request: Request) -> bool:
    try:
        from .core.security import decode_token
        from .db import SessionLocal
        from .models import User
        auth = request.headers.get("authorization", "")
        data = decode_token(auth[7:])
        with SessionLocal() as db:
            u = db.get(User, data.get("sub"))
            return bool(u and "ADMIN" in u.role_codes)
    except Exception:  # noqa: BLE001
        return False


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    if exc.status >= 500:
        log.error("%s %s %s", exc.code, exc.correlation_id, exc.technical)
    return JSONResponse(status_code=exc.status, content={"error": exc.to_dict(include_technical=_is_admin(request))})


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    err = AppError("VALIDATION", "ข้อมูลที่ส่งมาไม่ถูกต้อง", status=422, technical=str(exc.errors())[:800])
    body = err.to_dict(include_technical=True)
    body["fields"] = [{"loc": ".".join(str(x) for x in e["loc"]), "msg": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"error": body})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    err = AppError("INTERNAL_ERROR", "เกิดข้อผิดพลาดภายในระบบ", status=500, technical=repr(exc), retryable=True,
                   action="ลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้ง Admin พร้อม Correlation ID")
    log.exception("unhandled %s", err.correlation_id)
    return JSONResponse(status_code=500, content={"error": err.to_dict(include_technical=_is_admin(request))})


@app.get("/api/health")
def health():
    from sqlalchemy import text
    from .db import engine
    with engine.connect() as c:
        c.execute(text("SELECT 1"))
    return {"status": "ok", "app": settings.app_name, "storage": str(settings.storage_path), "task_mode": settings.task_mode}
