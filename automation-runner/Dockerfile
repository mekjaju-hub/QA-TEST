# Restricted test runner — internal only, non-root, no secrets mounted
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /opt/runner
COPY automation-runner/requirements.txt .
RUN pip install -r requirements.txt
COPY automation-runner/runner/ runner/
RUN useradd --create-home --uid 10002 runner
USER runner
EXPOSE 8100
HEALTHCHECK --interval=15s --timeout=5s --retries=10 CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8100/health')"
CMD ["uvicorn", "runner.service:app", "--host", "0.0.0.0", "--port", "8100"]
