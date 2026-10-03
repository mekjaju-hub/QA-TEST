"""Storage Interface (หัวข้อ 4) — LocalStorage under STORAGE_ROOT (default .\\storage).

Layout:
  uploads/{project_code}/{document_id}/v{n}/{safe_filename}
  images/{document_id}/v{n}/{image_id}.{ext}
  artifacts/{project_code}/{artifact_id}/{ai|current}/...
  runs/{run_id}/...
  exports/...

All keys are relative POSIX paths; `_resolve` blocks path traversal.
Future: MinioStorage / AzureBlobStorage implement the same interface.
"""
from __future__ import annotations

import abc
import os
import re
import shutil
import threading
import time
from pathlib import Path

from ..config import get_settings
from ..core.errors import AppError

SAFE_RE = re.compile(r'[<>:"|?*\x00-\x1f]')
WIN_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


def safe_filename(name: str) -> str:
    """Port of safeFilename() + Windows reserved names."""
    base = re.split(r"[\\/]", str(name))[-1]
    base = re.sub(r"\.\.+", ".", base)
    base = SAFE_RE.sub("_", base).strip().strip(".")
    stem = base.split(".")[0].upper()
    if stem in WIN_RESERVED:
        base = "_" + base
    return base[:180] or "document"


class StorageBackend(abc.ABC):
    @abc.abstractmethod
    def write_bytes(self, key: str, data: bytes) -> str: ...

    @abc.abstractmethod
    def read_bytes(self, key: str) -> bytes: ...

    @abc.abstractmethod
    def exists(self, key: str) -> bool: ...

    @abc.abstractmethod
    def list(self, prefix: str) -> list[str]: ...

    @abc.abstractmethod
    def delete_prefix(self, prefix: str) -> None: ...

    @abc.abstractmethod
    def local_path(self, key: str) -> Path:
        """Filesystem path (LocalStorage) or a downloaded temp copy (remote backends)."""

    def write_text(self, key: str, text: str) -> str:
        return self.write_bytes(key, text.encode("utf-8"))

    def read_text(self, key: str) -> str:
        return self.read_bytes(key).decode("utf-8")


class LocalStorage(StorageBackend):
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        for d in ("uploads", "images", "artifacts", "runs", "exports"):
            (self.root / d).mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        key = str(key).replace("\\", "/").lstrip("/")
        p = (self.root / key).resolve()
        if p != self.root and self.root not in p.parents:
            raise AppError("PATH_TRAVERSAL", "Path ไม่ถูกต้อง", status=400, technical=key)
        return p

    def write_bytes(self, key: str, data: bytes) -> str:
        """Atomic: write a temp file then rename over the old one, so a reader never sees a half-written (empty) file
        (concurrent requests to the Web History / Library used to read an empty JSON → HTTP 500 under load)."""
        p = self._resolve(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(f".{p.name}.{os.getpid()}.{threading.get_ident()}.tmp")
        tmp.write_bytes(data)
        for i in range(20):                      # Windows: the target may be open by a reader for a moment
            try:
                os.replace(tmp, p)
                return key
            except PermissionError:
                time.sleep(0.02 * (i + 1))
        tmp.unlink(missing_ok=True)
        raise AppError("STORAGE_BUSY", "ไฟล์กำลังถูกใช้งาน ลองใหม่อีกครั้ง", status=503, technical=key, retryable=True)

    def read_bytes(self, key: str) -> bytes:
        p = self._resolve(key)
        if not p.is_file():
            raise AppError("FILE_NOT_FOUND", "ไม่พบไฟล์ใน Storage", status=404, technical=key)
        for i in range(20):
            try:
                return p.read_bytes()
            except PermissionError:              # Windows: being replaced right now
                time.sleep(0.02 * (i + 1))
        return p.read_bytes()

    def exists(self, key: str) -> bool:
        return self._resolve(key).exists()

    def list(self, prefix: str) -> list[str]:
        base = self._resolve(prefix)
        if not base.exists():
            return []
        return sorted(p.relative_to(base).as_posix() for p in base.rglob("*") if p.is_file())

    def delete_prefix(self, prefix: str) -> None:
        p = self._resolve(prefix)
        if p == self.root:
            raise AppError("PATH_TRAVERSAL", "ห้ามลบ Storage Root", status=400)
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()

    def local_path(self, key: str) -> Path:
        return self._resolve(key)


_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage
    if _storage is None:
        _storage = LocalStorage(get_settings().storage_path)
    return _storage


def set_storage(s: StorageBackend) -> None:
    global _storage
    _storage = s
