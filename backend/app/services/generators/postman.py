from __future__ import annotations

import json

from .common import GenTC, slug, tip

AUTH_TYPES = ["none", "basic", "bearer", "apikey", "oauth2", "cookie"]
AUTH_BLOCK = {
    "none": {"type": "noauth"},
    "basic": {"type": "basic", "basic": [{"key": "username", "value": "{{username}}"}, {"key": "password", "value": "{{password}}"}]},
    "bearer": {"type": "bearer", "bearer": [{"key": "token", "value": "{{token}}"}]},
    "apikey": {"type": "apikey", "apikey": [{"key": "key", "value": "{{api_key_header}}"}, {"key": "value", "value": "{{api_key}}"}]},
    "oauth2": {"type": "oauth2", "oauth2": [{"key": "accessTokenUrl", "value": "{{oauth_token_url}}"}, {"key": "clientId", "value": "{{client_id}}"},
                                           {"key": "clientSecret", "value": "{{client_secret}}"}]},
    "cookie": {"type": "noauth"},
}


def gen_postman(tcs: list[GenTC], project: dict, auth: str = "none") -> dict:
    auth = auth if auth in AUTH_TYPES else "none"
    items = []
    for tc in tcs:
        d = tc.data
        tests = [f"// {tc.tc_id} | {tc.req_id}",
                 f'pm.test("{tc.tc_id} status code (NEEDS_CONFIGURATION: expected code)", function () {{ pm.expect(pm.response.code).to.be.oneOf([200, 201]); }});',
                 (f'pm.test("{tc.tc_id} rejects invalid data", function () {{ pm.expect(pm.response.code).to.be.within(400, 499); }});' if d["type"] == "Negative"
                  else f'pm.test("{tc.tc_id} has JSON body", function () {{ pm.response.to.be.json; }});')]
        if d["type"] == "API":
            tests.append(f'// JSON Schema assertion: NEEDS_CONFIGURATION — BRS ไม่มี Response Schema เพียงพอ\n'
                         f'pm.test("{tc.tc_id} response is an object", function () {{ pm.expect(pm.response.json()).to.be.an("object"); }});')
        first = d["test_data"][0] if d.get("test_data") else None
        amount = str(first["raw"]) if first and first.get("raw") not in (None, "") else "{{amount}}"
        headers = [{"key": "Content-Type", "value": "application/json"}] + ([{"key": "Cookie", "value": "{{session_cookie}}"}] if auth == "cookie" else [])
        ep = f"{{{{endpoint_{slug(tc.tc_id)}}}}}"
        items.append({"name": f"{tc.tc_id} — {d['title'][:60]}", "event": [{"listen": "test", "script": {"type": "text/javascript", "exec": tests}}],
                      "request": {"method": "POST", "header": headers, "url": {"raw": f"{{{{base_url}}}}{ep}", "host": ["{{base_url}}"], "path": [ep]},
                                  "body": {"mode": "raw", "raw": json.dumps({"customer_id": "{{customer_id}}", "amount": amount}, ensure_ascii=False, indent=2)},
                                  "description": f"NEEDS_CONFIGURATION: method/endpoint ยังไม่ทราบจาก BRS\nGiven: {d['given']}\nWhen: {d['when']}\nThen: {d['then']}"}})
    collection = {"info": {"name": f"{project['code']} API Tests", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                           "description": f"Auth: {'NEEDS_CONFIGURATION' if auth == 'none' else auth}"}, "auth": AUTH_BLOCK[auth], "item": items}
    values = [{"key": "base_url", "value": "", "enabled": True}, {"key": "customer_id", "value": "CUST-TEST-0001", "enabled": True}]
    values += [{"key": f"endpoint_{slug(t.tc_id)}", "value": "", "enabled": True} for t in tcs]
    if auth == "bearer":
        values.append({"key": "token", "value": "", "type": "secret", "enabled": True})
    if auth == "basic":
        values += [{"key": "username", "value": "", "enabled": True}, {"key": "password", "value": "", "type": "secret", "enabled": True}]
    if auth == "apikey":
        values += [{"key": "api_key_header", "value": "", "enabled": True}, {"key": "api_key", "value": "", "type": "secret", "enabled": True}]
    if auth == "oauth2":
        values += [{"key": k, "value": "", "enabled": True} for k in ("oauth_token_url", "client_id")] + [{"key": "client_secret", "value": "", "type": "secret", "enabled": True}]
    if auth == "cookie":
        values.append({"key": "session_cookie", "value": "", "type": "secret", "enabled": True})
    env = {"name": f"{project['code']}-SIT", "values": values}
    cpath = f"postman/{project['code']}.postman_collection.json"
    return {"files": {cpath: json.dumps(collection, ensure_ascii=False, indent=2),
                      f"postman/{project['code']}-SIT.postman_environment.json": json.dumps(env, ensure_ascii=False, indent=2),
                      "postman/README.md": "Run with Newman (optional):\n\n    npx newman run postman/*.postman_collection.json -e postman/*-SIT.postman_environment.json "
                                           "-r json --reporter-json-export newman.json\n\nImport newman.json back at Test Runs → Import Newman Result.\n"},
            "tips": {cpath: [tip("{{base_url}} / {{endpoint_...}}", "ตัวแปรของ Collection", "Environment Template", "Request ที่พร้อมส่ง",
                                 "ห้ามเดา Endpoint/Authentication — ทุกค่าเป็น Variable (NEEDS_CONFIGURATION)", "1 Request ต่อ 1 Test Case พร้อม Test Script Positive/Negative",
                                 ", ".join(t.tc_id for t in tcs), "Credential เป็น type=secret ใน Environment — ห้าม Commit", "กรอก base_url/endpoint/auth ใน Postman Environment")]}}
