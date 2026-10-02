#!/usr/bin/env bash
# Linux equivalent of `docker compose up` without Docker (used in CI and when Docker Hub is unreachable):
# PostgreSQL + Redis + Celery worker + automation-runner + backend + Next.js standalone, then scripts/stack_smoke.py
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/storage/stack-smoke"; rm -rf "$WORK"; mkdir -p "$WORK"
export DATABASE_URL="${SMOKE_DATABASE_URL:?set SMOKE_DATABASE_URL (postgresql+psycopg2://...)}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379/0}" STORAGE_ROOT="$WORK/storage" TASK_MODE=celery \
       RUNNER_URL=http://127.0.0.1:8100 RUNNER_TOKEN_FILE="$WORK/storage/secrets/runner_token" ENVIRONMENT=production
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
cd "$ROOT/backend" && python3 -m alembic upgrade head && python3 -m app.seed
(cd "$ROOT/backend" && exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >"$WORK/backend.log" 2>&1) & PIDS+=($!)
(cd "$ROOT/automation-runner" && exec python3 -m uvicorn runner.service:app --host 127.0.0.1 --port 8100 >"$WORK/runner.log" 2>&1) & PIDS+=($!)
(cd "$ROOT/worker" && PYTHONPATH="$ROOT/backend:$ROOT/worker" exec python3 -m celery -A worker.celery_app worker --loglevel=INFO --concurrency=2 >"$WORK/worker.log" 2>&1) & PIDS+=($!)
(cd "$ROOT/frontend/.next/standalone" && cp -r ../static .next/ 2>/dev/null || true; cp -r ../../public . 2>/dev/null || true; BACKEND_INTERNAL_URL=http://127.0.0.1:8000 PORT=3000 HOSTNAME=127.0.0.1 exec node server.js >"$WORK/frontend.log" 2>&1) & PIDS+=($!)
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000/api/health >/dev/null && break; sleep 1; done
python3 "$ROOT/scripts/stack_smoke.py" --base http://127.0.0.1:3000
echo "--- restart backend: data must persist (AC 40)"
kill "${PIDS[0]}"; sleep 2
(cd "$ROOT/backend" && exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >>"$WORK/backend.log" 2>&1) & PIDS[0]=$!
for i in $(seq 1 60); do curl -sf http://127.0.0.1:3000/api/health >/dev/null && break; sleep 1; done
python3 "$ROOT/scripts/stack_smoke.py" --base http://127.0.0.1:3000
