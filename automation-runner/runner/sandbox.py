"""Restricted execution of a generated pytest project.

Limits (หัวข้อ 20): CPU seconds, RAM (address space), wall-clock time, output size, file size, process count;
cancel at any time; stdout/stderr/exit code/duration/results captured.
Secrets: the child gets a *clean* environment (no backend env vars) — only PATH/locale/temp + an explicit
allow-list of test variables (BASE_URL, AUTH_TYPE, ... ) passed by the caller.

Linux/Docker: limits via setrlimit + new session (whole process group is killed on timeout/cancel).
Windows dev mode: wall-clock timeout, output cap and process-tree kill are enforced; CPU/RAM rlimits are
not available on Windows — use Docker for hard limits (documented in SECURITY.md).
"""
from __future__ import annotations

import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .results import parse_junit, summarize
from .validate import validate_files, validate_nodeids

TEST_ENV_ALLOW = {"TEST_ENV", "BASE_URL", "AUTH_TYPE", "API_TIMEOUT", "LOGIN_USER", "LOGIN_PASS", "HEADLESS"}
IS_POSIX = os.name == "posix"


@dataclass
class Limits:
    timeout_sec: int = 120
    cpu_sec: int = 120
    memory_mb: int = 1024
    max_output_kb: int = 512
    max_file_mb: int = 50
    max_procs: int = 64
    limit_address_space: bool = True   # False for browser tests: Chromium reserves far more virtual memory than it uses


@dataclass
class RunOutcome:
    status: str  # PASSED | FAILED | CANCELLED | ERROR
    exit_code: int | None
    stdout: str
    stderr: str
    duration: float
    results: list[dict] = field(default_factory=list)
    summary: dict = field(default_factory=dict)
    error_code: str | None = None
    artifacts: dict[str, bytes] = field(default_factory=dict)


def _preexec(limits: Limits):
    def fn():  # runs in the child before exec (POSIX only)
        import resource
        os.setsid()
        resource.setrlimit(resource.RLIMIT_CPU, (limits.cpu_sec, limits.cpu_sec + 5))
        if limits.limit_address_space:
            mem = limits.memory_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
        fsize = limits.max_file_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_FSIZE, (fsize, fsize))
        try:
            resource.setrlimit(resource.RLIMIT_NPROC, (limits.max_procs, limits.max_procs))
        except (ValueError, OSError):
            pass
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    return fn


def _kill(proc: subprocess.Popen) -> None:
    try:
        if IS_POSIX:
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
    except (ProcessLookupError, PermissionError, OSError):
        proc.kill()


def _clean_env(workdir: Path, test_env: dict[str, str] | None) -> dict[str, str]:
    env = {"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(workdir), "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8",
           "PYTHONUTF8": "1", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "HOME": str(workdir), "TMPDIR": str(workdir / ".tmp"),
           "TEMP": str(workdir / ".tmp"), "TMP": str(workdir / ".tmp"), "NO_COLOR": "1"}
    for k in ("SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT",  # required for Python on Windows
              "LOCALAPPDATA", "USERPROFILE", "APPDATA", "PROGRAMDATA", "PLAYWRIGHT_BROWSERS_PATH"):  # Playwright browsers
        if k in os.environ:
            env[k] = os.environ[k]
    for k, v in (test_env or {}).items():
        if k in TEST_ENV_ALLOW:
            env[k] = str(v)
    return env


def run_pytest(files: dict[str, str], limits: Limits, *, node_ids: list[str] | None = None, test_env: dict[str, str] | None = None,
               cancel: threading.Event | None = None, on_output: Callable[[str, int], None] | None = None,
               python: str | None = None, keep_dir: Path | None = None) -> RunOutcome:
    """Validate → write to a fresh temp workspace → run pytest with limits → parse junit."""
    files = validate_files(files)
    args = validate_nodeids(node_ids or [])
    cancel = cancel or threading.Event()
    work = Path(tempfile.mkdtemp(prefix="brsqa-run-"))
    try:
        for rel, content in files.items():
            p = work / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
        (work / "reports").mkdir(exist_ok=True)
        (work / ".tmp").mkdir(exist_ok=True)
        cmd = [python or sys.executable, "-m", "pytest", "-v", "-p", "no:cacheprovider", "--junitxml=reports/junit.xml", "-o", "console_output_style=classic", *args]
        if _has_pytest_html(python):
            cmd += ["--html=reports/report.html", "--self-contained-html"]
        max_bytes = limits.max_output_kb * 1024
        out_chunks: list[str] = []
        out_size = 0
        truncated = False
        t0 = time.monotonic()
        kwargs = {"cwd": str(work), "env": _clean_env(work, test_env), "stdout": subprocess.PIPE, "stderr": subprocess.PIPE,
                  "stdin": subprocess.DEVNULL, "text": True, "encoding": "utf-8", "errors": "replace", "bufsize": 1}
        if IS_POSIX:
            kwargs["preexec_fn"] = _preexec(limits)
        else:
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        proc = subprocess.Popen(cmd, **kwargs)  # noqa: S603 — fixed argv, no shell
        err_buf: list[str] = []
        err_thread = threading.Thread(target=lambda: err_buf.append(proc.stderr.read()[: max_bytes]), daemon=True)
        err_thread.start()
        reason = None
        collected = 0
        done = 0

        def reader():
            nonlocal out_size, truncated, collected, done
            for line in proc.stdout:
                mc = re.search(r"collected (\d+) item", line)
                if mc:
                    collected = int(mc.group(1))
                if " PASSED" in line or " FAILED" in line or " SKIPPED" in line or " ERROR" in line:
                    done += 1
                if out_size < max_bytes:
                    out_chunks.append(line)
                    out_size += len(line.encode())
                    if on_output:
                        on_output(line, int(done * 100 / collected) if collected else 0)
                else:
                    truncated = True
        rt = threading.Thread(target=reader, daemon=True)
        rt.start()
        while proc.poll() is None:
            if cancel.is_set():
                reason = "CANCELLED"
                _kill(proc)
                break
            if time.monotonic() - t0 > limits.timeout_sec:
                reason = "TIMEOUT"
                _kill(proc)
                break
            time.sleep(0.1)
        proc.wait()
        rt.join(timeout=5)
        err_thread.join(timeout=5)
        duration = round(time.monotonic() - t0, 3)
        stdout = "".join(out_chunks) + ("\n[log truncated: output limit reached]" if truncated else "")
        stderr = "".join(err_buf)
        code = proc.returncode
        artifacts = {}
        for rel in ("reports/junit.xml", "reports/report.html"):
            if (work / rel).exists():
                artifacts[rel] = (work / rel).read_bytes()
        for png in (work / "screenshots").glob("*.png") if (work / "screenshots").exists() else []:
            artifacts[f"screenshots/{png.name}"] = png.read_bytes()
        results = parse_junit(artifacts["reports/junit.xml"]) if "reports/junit.xml" in artifacts and reason is None else []
        if reason == "CANCELLED":
            return RunOutcome("CANCELLED", code, stdout + "\n!!! CANCELLED by user", stderr, duration, results, summarize(results), "RUN_CANCELLED", artifacts)
        if reason == "TIMEOUT":
            return RunOutcome("FAILED", 124, stdout + "\n!!! RUNNER TIMEOUT", stderr + f"\nRunner Timeout after {limits.timeout_sec}s", duration, results,
                              summarize(results), "RUNNER_TIMEOUT", artifacts)
        if code is not None and code < 0 and -code in (signal.SIGKILL, getattr(signal, "SIGXCPU", 24)):
            ecode = "RUNNER_CPU_LIMIT" if -code == getattr(signal, "SIGXCPU", 24) else "RUNNER_OUT_OF_MEMORY"
            return RunOutcome("FAILED", code, stdout, stderr + f"\n{ecode}", duration, results, summarize(results), ecode, artifacts)
        if "MemoryError" in stderr or "MemoryError" in stdout:
            return RunOutcome("FAILED", code, stdout, stderr, duration, results, summarize(results), "RUNNER_OUT_OF_MEMORY", artifacts)
        summ = summarize(results)
        if code in (0, 5) and not summ["failed"]:
            status = "PASSED"
        elif code in (1,) or summ["failed"]:
            status = "FAILED"
        else:
            status = "ERROR"
        return RunOutcome(status, code, stdout, stderr, duration, results, summ, None if status != "ERROR" else "RUNNER_ERROR", artifacts)
    finally:
        if keep_dir is None:
            shutil.rmtree(work, ignore_errors=True)


def _has_pytest_html(python: str | None) -> bool:
    if python and python != sys.executable:
        return False
    try:
        import pytest_html  # noqa: F401
        return True
    except ImportError:
        return False
