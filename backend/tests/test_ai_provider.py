"""Claude provider with a mocked Messages API: hallucination control (หัวข้อ 32) + error mapping (หัวข้อ 38)."""
import json

import httpx
import pytest

from app.core.errors import AppError
from app.services.ai_provider import PROMPT_VERSION, ClaudeProvider

SECTION = {"id": "s1", "title": "2. Rule 3", "page": 4, "kind": "text",
           "text": "ระบบต้องแสดงรายการลูกค้าที่มียอดรวมมากกว่าหรือเท่ากับ 200,000 บาท ให้เจ้าหน้าที่Compliance password=Secret123"}


def provider(handler):
    return ClaudeProvider("sk-ant-test-key-000000", "claude-test-model", transport=httpx.MockTransport(handler))


def test_verified_and_unverified_requirements():
    sent = {}

    def handler(req):
        sent["body"] = json.loads(req.content)
        sent["key"] = req.headers["x-api-key"]
        answer = {"requirements": [
            {"original_text": "ระบบต้องแสดงรายการลูกค้าที่มียอดรวมมากกว่าหรือเท่ากับ 200,000 บาท", "type": "Report Requirement", "threshold_operator": ">=",
             "threshold_value": "200000", "unit": "บาท", "role": "NOT_FOUND", "expected_result": "แสดงรายการลูกค้า", "confidence": 0.9},
            {"original_text": "ระบบต้องส่งอีเมลทุกวัน", "threshold_value": "999", "threshold_operator": ">"}],  # hallucinated
            "assumptions": ["Calendar day"], "confidence": 0.8}
        return httpx.Response(200, json={"content": [{"type": "text", "text": json.dumps(answer, ensure_ascii=False)}], "usage": {"input_tokens": 100, "output_tokens": 50}})

    items = provider(handler).extract(SECTION)
    assert "Secret123" not in sent["body"]["messages"][0]["content"]          # secrets masked before sending
    assert sent["body"]["model"] == "claude-test-model"
    ok, bad = items
    assert ok["meta"]["unverified"] is False and ok["fields"]["threshold_value"] == "200000"
    assert bad["meta"]["unverified"] is True and bad["fields"]["threshold_value"] == "NOT_FOUND"   # number not in its own text → dropped
    assert ok["meta"]["prompt_version"] == PROMPT_VERSION and ok["meta"]["token_usage"]["input_tokens"] == 100 and len(ok["meta"]["input_hash"]) == 64


@pytest.mark.parametrize("status,code", [(429, "AI_RATE_LIMIT"), (500, "AI_ERROR")])
def test_errors(status, code):
    with pytest.raises(AppError) as e:
        provider(lambda r: httpx.Response(status, json={})).extract(SECTION)
    assert e.value.code == code


def test_invalid_json_and_timeout():
    with pytest.raises(AppError) as e:
        provider(lambda r: httpx.Response(200, json={"content": [{"type": "text", "text": "sorry, no json"}]})).extract(SECTION)
    assert e.value.code == "AI_INVALID_JSON" and e.value.retryable

    def boom(req):
        raise httpx.ReadTimeout("slow", request=req)
    with pytest.raises(AppError) as e:
        provider(boom).extract(SECTION)
    assert e.value.code == "AI_TIMEOUT"


def test_not_configured():
    with pytest.raises(AppError) as e:
        ClaudeProvider("", "")
    assert e.value.code == "AI_NOT_CONFIGURED"
