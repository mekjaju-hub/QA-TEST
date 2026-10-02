"""AI Provider Interface (หัวข้อ 4, 32).

- RuleBasedProvider: deterministic extractor (port of p3_engine.js) — default, offline
- ClaudeProvider: Claude Messages API via httpx; API key from env only, never sent to the frontend.
  Records model, prompt version, input hash, token usage (หัวข้อ 4).
Secrets are masked out of the section text before it is sent (หัวข้อ 45 "ห้ามส่ง Secret ไป Claude").
"""
from __future__ import annotations

import abc
import hashlib
import json
import re

import httpx

from ..config import get_settings
from ..core.errors import AppError
from ..core.masking import mask
from .engine.analysis import candidate_statements, verify_ai_requirements

PROMPT_VERSION = "req-extract-v1.2"

PROMPT_TEMPLATE = """You are a QA business analyst. Extract testable requirements from ONE section of a Business Requirement Specification (Thai/English).
RULES:
- Only use facts written in the section. Never invent values. Use "NOT_FOUND" for anything not written.
- "original_text" MUST be copied verbatim from the section (an exact substring).
- threshold_value must be a number that literally appears in original_text, else "NOT_FOUND".
- threshold_operator one of ">", ">=", "<", "<=", "=", or "NOT_FOUND" when the text does not state it.
- type one of: Field Requirement, Validation Rule, Business Rule, Text Condition, Process Flow, Data Requirement, API Requirement, Integration Requirement, Report Requirement, File Requirement, Batch Requirement, UI Requirement.
- Put anything inferred in "assumptions" (never inside requirement fields).
Return ONLY JSON, no markdown:
{{"requirements":[{{"original_text":"","title":"","type":"","business_rule":"","preconditions":"","input":"","process":"","output":"","expected_result":"","role":"","threshold_operator":"","threshold_value":"","unit":"","date_range":"","inclusion":"","exclusion":"","confidence":0.0}}],
"found_in_brs":[],"assumptions":[],"recommendations":[],"clarification_questions":[],"conflicts":[],"source_references":[],"confidence":0}}

SECTION TITLE: {title}
SOURCE PAGE: {page}
SECTION TEXT:
<<<
{body}
>>>"""


class AIProvider(abc.ABC):
    name = "abstract"

    @abc.abstractmethod
    def extract(self, section: dict) -> list[dict]:
        """Return [{stmt, fields(override|None), meta(None for rule engine)}]."""


class RuleBasedProvider(AIProvider):
    name = "rule"

    def extract(self, section: dict) -> list[dict]:
        return [{"stmt": st, "fields": None, "meta": None} for st in candidate_statements(section)]


class ClaudeProvider(AIProvider):
    name = "claude"

    def __init__(self, api_key: str, model: str, timeout: int = 90, transport: httpx.BaseTransport | None = None) -> None:
        if not api_key or not model:
            raise AppError("AI_NOT_CONFIGURED", "ยังไม่ได้ตั้งค่า CLAUDE_API_KEY / CLAUDE_MODEL", status=400,
                           action="ตั้งค่าใน .env หรือเลือก Rule Engine")
        self.api_key, self.model, self.timeout, self.transport = api_key, model, timeout, transport

    def _call(self, prompt: str) -> tuple[str, dict]:
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as cli:
                res = cli.post("https://api.anthropic.com/v1/messages",
                               headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                               json={"model": self.model, "max_tokens": 4096, "messages": [{"role": "user", "content": prompt}]})
        except httpx.TimeoutException as exc:
            raise AppError("AI_TIMEOUT", "AI ตอบกลับช้าเกินกำหนด", retryable=True, action="กด Retry Section", technical=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise AppError("AI_UNAVAILABLE", "เชื่อมต่อ AI ไม่สำเร็จ", retryable=True, technical=str(exc)) from exc
        if res.status_code == 429:
            raise AppError("AI_RATE_LIMIT", "AI ถูกจำกัดอัตราการเรียก (Rate Limit)", retryable=True, action="รอสักครู่แล้ว Retry Section")
        if res.status_code >= 400:
            raise AppError("AI_ERROR", "AI ตอบกลับผิดพลาด", retryable=res.status_code >= 500, technical=f"{res.status_code} {res.text[:300]}")
        body = res.json()
        text = "".join(c.get("text", "") for c in body.get("content", []) if c.get("type") == "text")
        return text, body.get("usage", {})

    def extract(self, section: dict) -> list[dict]:
        body = mask(section["text"][:12000])
        prompt = PROMPT_TEMPLATE.format(title=section["title"], page=section.get("page") or "NOT_FOUND", body=body)
        input_hash = hashlib.sha256(prompt.encode()).hexdigest()
        text, usage = self._call(prompt)
        m = re.search(r"\{.*\}", text, re.S)
        try:
            out = json.loads(m.group(0)) if m else None
        except json.JSONDecodeError:
            out = None
        items = verify_ai_requirements(section, out)  # raises AI_INVALID_JSON
        for it in items:
            it["meta"].update({"engine": "claude", "model": self.model, "prompt_version": PROMPT_VERSION,
                               "input_hash": input_hash, "token_usage": usage})
        return items


def get_provider(mode: str | None = None) -> AIProvider:
    st = get_settings()
    mode = mode or st.ai_mode
    if mode == "claude":
        return ClaudeProvider(st.claude_api_key, st.claude_model, st.claude_timeout_sec)
    return RuleBasedProvider()
