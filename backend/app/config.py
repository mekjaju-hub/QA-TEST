"""Application settings loaded from environment variables (.env).

Secrets (CLAUDE_API_KEY, GITHUB_TOKEN, RUNNER_TOKEN, SECRET_KEY) stay on the server and are
never serialised to API responses — see `public_settings()`.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(str(REPO_ROOT / ".env"), ".env"), extra="ignore")

    app_name: str = "BRS to QA Automation Platform"
    environment: str = "development"
    secret_key: str = Field(default="", alias="SECRET_KEY")
    database_url: str = Field(default=f"sqlite:///{(REPO_ROOT / 'storage' / 'dev.sqlite3').as_posix()}", alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    task_mode: str = Field(default="inline", alias="TASK_MODE")  # inline | celery
    storage_root: str = Field(default=str(REPO_ROOT / "storage"), alias="STORAGE_ROOT")
    session_minutes: int = Field(default=30, alias="SESSION_MINUTES")
    max_upload_mb: int = Field(default=50, alias="MAX_UPLOAD_MB")
    cors_origins: str = Field(default="http://localhost:3000,http://127.0.0.1:3000", alias="CORS_ORIGINS")
    bind_host: str = Field(default="127.0.0.1", alias="BIND_HOST")
    allow_network_sharing: bool = Field(default=False, alias="ALLOW_NETWORK_SHARING")
    login_rate_per_minute: int = Field(default=5, alias="LOGIN_RATE_PER_MINUTE")
    api_rate_per_minute: int = Field(default=600, alias="API_RATE_PER_MINUTE")

    # AI
    ai_mode: str = Field(default="rule", alias="AI_MODE")  # rule | claude
    claude_api_key: str = Field(default="", alias="CLAUDE_API_KEY")
    claude_model: str = Field(default="", alias="CLAUDE_MODEL")
    claude_timeout_sec: int = Field(default=90, alias="CLAUDE_TIMEOUT_SEC")
    vision_enabled: bool = Field(default=False, alias="VISION_ENABLED")

    # Runner
    runner_url: str = Field(default="", alias="RUNNER_URL")  # empty => local in-process sandbox
    runner_token: str = Field(default="", alias="RUNNER_TOKEN")
    runner_timeout_sec: int = Field(default=120, alias="RUNNER_TIMEOUT_SEC")
    runner_max_memory_mb: int = Field(default=1024, alias="RUNNER_MAX_MEMORY_MB")
    runner_max_cpu_sec: int = Field(default=120, alias="RUNNER_MAX_CPU_SEC")
    runner_max_output_kb: int = Field(default=512, alias="RUNNER_MAX_OUTPUT_KB")

    # GitHub
    github_token: str = Field(default="", alias="GITHUB_TOKEN")
    github_api_url: str = Field(default="https://api.github.com", alias="GITHUB_API_URL")

    # Environments for generated tests / JMeter
    env_allowlist: str = Field(default="https://sit.example.test,https://uat.example.test", alias="ENV_ALLOWLIST")
    jmeter_max_users: int = Field(default=50, alias="JMETER_MAX_USERS")
    jmeter_max_minutes: int = Field(default=10, alias="JMETER_MAX_MINUTES")

    seed_admin_password: str = Field(default="Admin@12345", alias="SEED_ADMIN_PASSWORD")
    # Single-user mode (personal use on one PC): admin is never forced to change password, demo users are disabled
    single_user_mode: bool = Field(default=False, alias="SINGLE_USER_MODE")

    @property
    def storage_path(self) -> Path:
        p = Path(self.storage_root)
        if not p.is_absolute():
            p = (REPO_ROOT / p).resolve()
        return p

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowlist(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.env_allowlist.split(",") if o.strip()]

    def public_settings(self) -> dict:
        """Safe subset for the frontend — no secrets, only whether they are configured."""
        return {
            "app_name": self.app_name,
            "environment": self.environment,
            "session_minutes": self.session_minutes,
            "max_upload_mb": self.max_upload_mb,
            "ai_mode": self.ai_mode,
            "claude_configured": bool(self.claude_api_key and self.claude_model),
            "claude_model": self.claude_model or "NEEDS_CONFIGURATION",
            "vision_enabled": self.vision_enabled,
            "task_mode": self.task_mode,
            "runner_mode": "service" if self.runner_url else "local",
            "runner_timeout_sec": self.runner_timeout_sec,
            "runner_max_memory_mb": self.runner_max_memory_mb,
            "runner_max_output_kb": self.runner_max_output_kb,
            "github_configured": bool(self.github_token),
            "env_allowlist": self.allowlist,
            "jmeter_max_users": self.jmeter_max_users,
            "jmeter_max_minutes": self.jmeter_max_minutes,
            "bind_host": self.bind_host,
            "network_sharing": self.allow_network_sharing,
            "storage_root": str(self.storage_path),
        }


PLACEHOLDERS = {"", "CHANGE_ME", "change-me", "changeme"}


def ensure_secret(storage_root: Path, name: str, current: str, mode: int = 0o600) -> str:
    """Use the env value, or generate a strong random secret once and keep it in storage/secrets/<name> (git-ignored).
    Lets `docker compose up -d` work right after copying .env.example without weak default secrets."""
    if current and current not in PLACEHOLDERS and not current.startswith("CHANGE_ME"):
        return current
    import os
    import secrets as _s
    d = storage_root / "secrets"
    d.mkdir(parents=True, exist_ok=True)
    f = d / name
    if not f.exists():
        f.write_text(_s.token_urlsafe(48), encoding="utf-8")
        try:
            os.chmod(f, mode)
        except OSError:
            pass
    return f.read_text(encoding="utf-8").strip()


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.secret_key = ensure_secret(s.storage_path, "secret_key", s.secret_key)
    if s.runner_url:
        s.runner_token = ensure_secret(s.storage_path, "runner_token", s.runner_token, 0o644)  # readable by the runner container
    if s.bind_host in ("0.0.0.0", "::") and not s.allow_network_sharing:
        raise RuntimeError("BIND_HOST=0.0.0.0 เปิดให้ทุกเครื่องใน LAN เข้าถึง — ต้องตั้ง ALLOW_NETWORK_SHARING=true เพื่อยืนยัน (ดู SECURITY.md)")
    return s
