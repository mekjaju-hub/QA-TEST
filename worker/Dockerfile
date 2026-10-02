# Celery worker — shares backend code (build context: repository root)
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/ backend/
COPY worker/ worker/
COPY samples/ samples/
RUN useradd --create-home --uid 10001 app && mkdir -p /data/storage && chown -R app /data /app
USER app
WORKDIR /app/worker
ENV STORAGE_ROOT=/data/storage BACKEND_PATH=/app/backend PYTHONPATH=/app/backend:/app/worker TASK_MODE=celery
CMD ["celery", "-A", "worker.celery_app", "worker", "--loglevel=INFO", "--concurrency=2"]
