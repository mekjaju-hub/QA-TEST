# Backend API (FastAPI) — build context: repository root
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/ backend/
COPY samples/ samples/
COPY automation-runner/runner/ automation-runner/runner/
RUN useradd --create-home --uid 10001 app && mkdir -p /data/storage && chown -R app /data /app
USER app
WORKDIR /app/backend
ENV STORAGE_ROOT=/data/storage
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=10 CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
# migrate → seed (idempotent) → serve
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed ${SEED_ARGS:-} && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
