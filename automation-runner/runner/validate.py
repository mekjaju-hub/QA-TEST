"""Static validation before anything is executed.

The runner never executes a user-typed command: the command line is fixed (python -m pytest ...).
User-editable *code* is validated here: allowed file types, no path traversal, no secrets, and an AST
deny-list for process/OS/network escape hatches. Generated projects pass this check unchanged.
"""
from __future__ import annotations

import ast
import re
from pathlib import PurePosixPath

ALLOWED_EXT = {".py", ".ini", ".txt", ".md", ".json", ".sql", ".csv", ".yml", ".yaml", ".jmx", ".cfg", ".toml", ".example", ""}
ALLOWED_NAMES = {".gitkeep", ".gitignore", ".env.example"}
MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES = 500, 2 * 1024 * 1024, 20 * 1024 * 1024
DENY_IMPORTS = {"subprocess", "ctypes", "socket", "multiprocessing", "pty", "shutil", "signal", "resource", "winreg", "_winapi", "asyncio.subprocess"}
DENY_CALLS = {"eval", "exec", "compile", "__import__", "breakpoint"}
DENY_ATTRS = {("os", "system"), ("os", "popen"), ("os", "remove"), ("os", "unlink"), ("os", "rmdir"), ("os", "removedirs"), ("os", "kill"),
              ("os", "fork"), ("os", "execv"), ("os", "execve"), ("os", "spawnv"), ("os", "chmod"), ("os", "chown"), ("os", "environ")}
SECRET_RE = [re.compile(p) for p in (r"ghp_[A-Za-z0-9]{20,}", r"sk-ant-[A-Za-z0-9_\-]{10,}", r"github_pat_[A-Za-z0-9_]{20,}")]
NODEID_RE = re.compile(r"^tests/[A-Za-z0-9_/\-]+\.py(::[A-Za-z0-9_]+(\[[^\]\n\r;&|`$<>]{0,120}\])?)?$")


class ValidationError(Exception):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems[:5]))
        self.problems = problems


def check_path(path: str) -> str:
    p = PurePosixPath(path.replace("\\", "/"))
    if p.is_absolute() or ".." in p.parts or not p.parts or any(x.startswith("~") for x in p.parts):
        raise ValidationError([f"{path}: path ไม่ปลอดภัย"])
    if p.suffix.lower() not in ALLOWED_EXT and p.name not in ALLOWED_NAMES:
        raise ValidationError([f"{path}: ไม่อนุญาตไฟล์ชนิด {p.suffix}"])
    if p.name == ".env":
        raise ValidationError([f"{path}: ห้ามส่ง .env เข้า Runner"])
    return str(p)


def _ast_problems(path: str, src: str) -> list[str]:
    try:
        tree = ast.parse(src, filename=path)
    except SyntaxError as e:
        return [f"{path}:{e.lineno}: SyntaxError {e.msg}"]
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name.split(".")[0] in DENY_IMPORTS or a.name in DENY_IMPORTS:
                    out.append(f"{path}:{node.lineno}: ห้าม import {a.name}")
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if mod.split(".")[0] in DENY_IMPORTS:
                out.append(f"{path}:{node.lineno}: ห้าม import จาก {mod}")
            if mod == "os" and any(a.name in {n for _, n in DENY_ATTRS} for a in node.names):
                out.append(f"{path}:{node.lineno}: ห้าม from os import {', '.join(a.name for a in node.names)}")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in DENY_CALLS:
            out.append(f"{path}:{node.lineno}: ห้ามเรียก {node.func.id}()")
        elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and (node.value.id, node.attr) in DENY_ATTRS:
            out.append(f"{path}:{node.lineno}: ห้ามใช้ {node.value.id}.{node.attr}")
    return out


def validate_files(files: dict[str, str]) -> dict[str, str]:
    if not files:
        raise ValidationError(["ไม่มีไฟล์ให้ Run"])
    if len(files) > MAX_FILES:
        raise ValidationError([f"ไฟล์มากเกิน {MAX_FILES}"])
    total, problems, clean = 0, [], {}
    for path, content in files.items():
        try:
            safe = check_path(path)
        except ValidationError as e:
            problems += e.problems
            continue
        size = len(content.encode("utf-8"))
        total += size
        if size > MAX_FILE_BYTES:
            problems.append(f"{path}: ใหญ่เกิน 2 MB")
        if any(rx.search(content) for rx in SECRET_RE):
            problems.append(f"{path}: พบ Secret/Token")
        if safe.endswith(".py"):
            problems += _ast_problems(safe, content)
        clean[safe] = content
    if total > MAX_TOTAL_BYTES:
        problems.append("ขนาดรวมเกิน 20 MB")
    if "pytest.ini" not in clean and not any(p.startswith("tests/") for p in clean):
        problems.append("ไม่พบ pytest.ini หรือ tests/")
    if problems:
        raise ValidationError(problems)
    return clean


def validate_nodeids(ids: list[str]) -> list[str]:
    bad = [i for i in ids if not NODEID_RE.match(i)]
    if bad:
        raise ValidationError([f"node id ไม่ถูกต้อง: {b}" for b in bad[:5]])
    return ids
