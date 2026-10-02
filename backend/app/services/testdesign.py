"""Test design (หัวข้อ 11–14) — port of the first half of 04_source/p4_gen.js.

Pure functions working on requirement dicts (same shape as services/engine/analysis.py) so they
can be unit-tested; persistence lives in api/testdesign routes.

Improvement vs. prototype (Known Issue): Length boundaries (ตัวอักษร/characters) now generate real
strings of the boundary length instead of numbers.
"""
from __future__ import annotations

import re

from .engine.text import NF

Y, N = "เข้าเงื่อนไข", "ไม่เข้าเงื่อนไข"
AI_REC = "AI RECOMMENDED TEST - NOT EXPLICITLY DEFINED IN BRS"
LENGTH_UNIT = re.compile(r"(ตัวอักษร|characters?|หลัก|digits?)", re.I)


def is_money(u: str | None) -> bool:
    return bool(re.search(r"(บาท|THB|USD)", u or "", re.I))


def is_length(u: str | None) -> bool:
    return bool(LENGTH_UNIT.search(u or ""))


def meets(op: str, x: float, v: float) -> bool | None:
    return {">=": x >= v, ">": x > v, "<=": x <= v, "<": x < v, "=": x == v}.get(op)


def fmt_num(n: float, dec: int) -> str:
    return f"{n:,.{dec}f}"


def boundary_data(r: dict) -> list[dict] | None:
    f = r["fields"]
    if f["threshold_value"] == NF or f["threshold_op"] == NF:
        return None
    v = float(f["threshold_value"])
    op = f["threshold_op"]
    if is_length(f["unit"]):
        n = int(v)
        rows = []
        for length, note, origin in ((n - 1, "ต่ำกว่า Boundary", "Derived Boundary"), (n, "เท่ากับ Boundary", "BRS Explicit Rule"),
                                     (n + 1, "สูงกว่า Boundary", "Derived Boundary")):
            if length < 0:
                continue
            rows.append({"value": f"ข้อความยาว {length} ตัวอักษร", "raw": "ก" * length, "length": length,
                         "expected": Y if meets(op, length, n) else N, "origin": origin, "note": note, "kind": "length"})
        rows.append({"value": "(ว่าง)", "raw": "", "length": 0, "expected": "Validation Error" if not meets(op, 0, n) else Y,
                     "origin": "AI Recommendation", "note": "ค่าว่าง", "label": AI_REC, "kind": "length"})
        return rows
    dec = 2 if is_money(f["unit"]) or "." in f["threshold_value"] else 0
    step = 0.01 if dec else 1

    def fix(x: float) -> float:
        return round(x, dec)

    rows = [
        {"value": fmt_num(fix(v - step), dec), "raw": fix(v - step), "expected": Y if meets(op, v - step, v) else N, "origin": "Derived Boundary", "note": "ต่ำกว่า Boundary"},
        {"value": fmt_num(v, dec), "raw": v, "expected": Y if meets(op, v, v) else N, "origin": "BRS Explicit Rule", "note": "เท่ากับ Boundary"},
        {"value": fmt_num(fix(v + step), dec), "raw": fix(v + step), "expected": Y if meets(op, v + step, v) else N, "origin": "Derived Boundary", "note": "สูงกว่า Boundary"},
    ]
    if v != 0:
        rows.append({"value": fmt_num(0, dec), "raw": 0, "expected": Y if meets(op, 0, v) else N, "origin": "Derived Boundary", "note": "ค่าศูนย์"})
    rows.append({"value": "(ว่าง)", "raw": "", "expected": "Validation Error", "origin": "AI Recommendation", "note": "ค่าว่าง", "label": AI_REC})
    rows.append({"value": '"ABC"', "raw": "ABC", "expected": "Invalid Data Type", "origin": "AI Recommendation", "note": "ชนิดข้อมูลผิด", "label": AI_REC})
    for x in rows:
        x["kind"] = "number"
        if isinstance(x["raw"], float) and dec == 0 and x["raw"].is_integer():
            x["raw"] = int(x["raw"])
    return rows


def assess_priority_risk(r: dict, test_type: str) -> dict:
    t, f = r["original_text"], r["fields"]
    reasons: list[str] = []
    impact = likelihood = 0
    if re.search(r"(บาท|THB|USD|ยอด|เงิน|amount|payment|โอน)", t, re.I):
        impact += 2; reasons.append("เกี่ยวข้องกับจำนวนเงิน (+2 ผลกระทบ)")
    if re.search(r"(AML|ปปง|กฎหมาย|regulat|compliance|ธปท|BOT|audit|ตรวจสอบย้อนหลัง|รายงานต่อ)", t, re.I):
        impact += 2; reasons.append("เกี่ยวข้องกับ Compliance/กฎระเบียบ (+2 ผลกระทบ)")
    if re.search(r"(ลูกค้า|customer|บัตรประชาชน|PII|ส่วนบุคคล)", t, re.I):
        impact += 1; reasons.append("เกี่ยวข้องกับข้อมูลลูกค้า (+1 ผลกระทบ)")
    if re.search(r"(Business Rule|Process Flow)", r["type"]):
        impact += 1; reasons.append("อยู่ใน Core Business Flow (+1 ผลกระทบ)")
    if re.search(r"(รายวัน|ทุกวัน|daily|ทุกรายการ|every)", t, re.I):
        impact += 1; reasons.append("ใช้งานบ่อย (+1 ผลกระทบ)")
    if f["threshold_value"] != NF or f["date_range"] != NF:
        likelihood += 2; reasons.append("มี Threshold/ช่วงวันที่ ซึ่งมักเกิด Off-by-one (+2 โอกาสผิดพลาด)")
    if re.search(r"(Integration|API|Batch)", r["type"]):
        likelihood += 1; reasons.append("มี Dependency กับระบบอื่น (+1 โอกาสผิดพลาด)")
    if len(t) > 250 or (f["exclusion"] != NF and f["inclusion"] != NF):
        likelihood += 1; reasons.append("เงื่อนไขซับซ้อน (+1 โอกาสผิดพลาด)")
    if test_type in ("Boundary", "Negative"):
        likelihood += 1; reasons.append(f"{test_type} Test มีโอกาสพบ Defect สูง (+1)")
    score = impact + likelihood
    priority = "Critical" if impact >= 4 or score >= 6 else "High" if score >= 4 else "Medium" if score >= 2 else "Low"
    prod = impact * max(1, likelihood)
    risk = "High" if prod >= 8 else "Medium" if prod >= 3 else "Low"
    if not reasons:
        reasons.append("ไม่พบปัจจัยเสี่ยงเฉพาะใน BRS (ค่าเริ่มต้น)")
    return {"priority": priority, "risk": risk, "reasons": reasons, "impact": impact, "likelihood": likelihood}


def scenario_types_for(r: dict) -> list[str]:
    f, types = r["fields"], ["Positive"]
    if f["threshold_value"] != NF and f["threshold_op"] != NF:
        types.append("Boundary")
    if f["exclusion"] != NF or f["inclusion"] != NF or re.search(r"Validation|Field", r["type"]) or f["role"] != NF:
        types.append("Negative")
    if re.search(r"(Data|Report|Batch|File)", r["type"]):
        types.append("Data")
    if "API" in r["type"]:
        types.append("API")
    if "Integration" in r["type"]:
        types.append("Integration")
    return types


SCENARIO_TITLES = {
    "Positive": "ทำงานถูกต้องเมื่อข้อมูลเข้าเงื่อนไข",
    "Negative": "ปฏิเสธ/ไม่นำข้อมูลที่ไม่เข้าเงื่อนไข",
    "Data": "ข้อมูลที่บันทึก/แสดงผลถูกต้องครบถ้วน",
    "API": "API ตอบกลับตาม Contract",
    "Integration": "ข้อมูลส่งต่อระหว่างระบบถูกต้อง",
}


def build_scenario(r: dict, test_type: str) -> dict:
    f = r["fields"]
    pr = assess_priority_risk(r, test_type)
    title = SCENARIO_TITLES.get(test_type) or f"ตรวจค่าขอบของ {f['threshold']} {f['unit'] if f['unit'] != NF else ''}"
    rationale = f'สร้างจาก Requirement Type "{r["type"]}"'
    if test_type == "Boundary":
        rationale += f" และพบ Threshold {f['threshold']} (หน้า {r['source']['page']})"
    if test_type == "Negative" and f["exclusion"] != NF:
        rationale += f' และพบ Exclusion "{f["exclusion"]}"'
    return {"title": f"{r['req_id']}: {title}".strip(), "description": r["original_text"], "objective": f"ยืนยันว่า {r['title']}",
            "type": test_type, "priority": pr["priority"], "risk": pr["risk"], "pr_reasons": pr["reasons"], "rationale": rationale}


def build_test_case(scenario_type: str, r: dict) -> dict:
    """Return the data part of a test case (steps, test_data, given/when/then...)."""
    f = r["fields"]
    pr = assess_priority_risk(r, scenario_type)
    accepted = [q["assumption"]["text"] for q in r.get("questions", []) if q.get("assumption") and q["assumption"]["state"] == "ACCEPTED"]
    clar_refs = [f"{q['text']} → {q['answer']}" for q in r.get("questions", []) if q.get("resolved")]
    role = f["role"] if f["role"] != NF else "ผู้ใช้ที่มีสิทธิ์ (ตาม Clarification/Assumption)"
    given = f"{f['preconditions'] + ' และ' if f['preconditions'] != NF else ''} ผู้ใช้ {role} เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม {r['req_id']}".strip()
    then = f["expected_result"] if f["expected_result"] != NF else "ผลลัพธ์ตามที่ BA ยืนยันใน Clarification"
    origin = "BRS Explicit Rule"
    base = {"n": 1, "action": "เตรียมข้อมูลทดสอบและเข้าสู่ระบบ", "data": f"Role: {role}; Customer ID: CUST-TEST-0001 (Synthetic)",
            "expected": "เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ", "origin": "", "label": ""}
    test_data: list[dict] = []
    if scenario_type == "Boundary":
        rows = boundary_data(r) or []
        test_data = rows
        origin = "Derived Boundary"
        when = f"ประมวลผลรายการโดยใช้ค่า {f['input'] if f['input'] != NF else 'ค่าที่ใช้เปรียบเทียบ'} ตามค่าขอบที่กำหนด"
        steps = [base] + [{"n": i + 2, "action": f"ประมวลผลด้วยค่า {d['value']} ({d['note']})", "data": d["value"],
                           "expected": d["expected"], "origin": d["origin"], "label": d.get("label", "")} for i, d in enumerate(rows)]
        explain = (f'Test Case นี้ตรวจสอบว่าระบบตัดสินเงื่อนไข "{f["threshold"]}{" " + f["unit"] if f["unit"] != NF else ""}" ถูกต้อง '
                   "โดยทดสอบค่าต่ำกว่า เท่ากับ และสูงกว่าค่าขอบ")
    elif scenario_type == "Negative":
        if f["exclusion"] != NF:
            when = f"ประมวลผลข้อมูลที่เข้าข่ายข้อยกเว้น: {f['exclusion']}"
            then = f"ระบบต้องไม่นำข้อมูลดังกล่าวมาประมวลผล ({f['exclusion']})"
            explain = f"Test Case นี้ตรวจสอบว่าระบบ{f['exclusion']}"
        elif f["inclusion"] != NF:
            when = f'ประมวลผลข้อมูลที่ไม่อยู่ในเงื่อนไข "{f["inclusion"]}"'
            then = "ระบบต้องไม่นำข้อมูลนอกเงื่อนไขมาประมวลผล"
            explain = f"Test Case นี้ตรวจสอบว่าระบบใช้{f['inclusion']}เท่านั้น"
        elif f["role"] != NF:
            when = f"ผู้ใช้ที่ไม่ใช่ {f['role']} พยายามทำรายการ"
            then = "ระบบต้องปฏิเสธการทำรายการ"
            origin = "AI Recommendation"
            explain = f"Test Case นี้ตรวจสอบว่าเฉพาะ {f['role']} เท่านั้นที่ทำรายการได้"
        else:
            when = "ส่งข้อมูลที่ Required field ว่างหรือรูปแบบไม่ถูกต้อง"
            then = "ระบบต้องแสดง Validation Error"
            origin = "Existing Validation Rule"
            explain = "Test Case นี้ตรวจสอบว่าระบบป้องกันข้อมูลไม่ถูกต้อง"
        steps = [base,
                 {"n": 2, "action": when, "data": "ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative", "expected": then, "origin": origin, "label": ""},
                 {"n": 3, "action": "ตรวจผลลัพธ์/ข้อมูลที่บันทึก", "data": "-", "expected": "ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์", "origin": origin, "label": ""}]
    else:
        if f["threshold_value"] != NF and f["threshold_op"] != NF:
            v = float(f["threshold_value"])
            bump = 1000 if is_money(f["unit"]) else 1
            x = v + bump if f["threshold_op"].startswith(">") else max(0.0, v - bump) if f["threshold_op"].startswith("<") else v
            val = fmt_num(x, 2 if is_money(f["unit"]) else 0)
        else:
            val = "ข้อมูล Synthetic ที่เข้าเงื่อนไข"
        when = (("ระบุ/ประมวลผล " + f["input"]) if f["input"] != NF else "ดำเนินการตาม Requirement") + (" แล้ว" + f["process"] if f["process"] != NF else "")
        steps = [base, {"n": 2, "action": when, "data": val, "expected": "ระบบรับข้อมูลได้", "origin": "", "label": ""},
                 {"n": 3, "action": f"ตรวจสอบ {f['output'] if f['output'] != NF else 'ผลลัพธ์'}", "data": "-", "expected": then, "origin": "", "label": ""}]
        extra = {"API": ("ตรวจ Status Code และ Response Body", "Endpoint: {{endpoint}} (NEEDS_CONFIGURATION)", "Response ตรงตาม Contract"),
                 "Data": ("Query ข้อมูลที่บันทึกด้วย SQL Template", "SQL Template (Read-only)", "ข้อมูลใน Database ตรงกับผลลัพธ์บนหน้าจอ/API"),
                 "Integration": ("ตรวจข้อมูลที่ระบบปลายทางได้รับ", "-", "ข้อมูลครบถ้วนและตรงกัน")}.get(scenario_type)
        if extra:
            steps.append({"n": 4, "action": extra[0], "data": extra[1], "expected": extra[2], "origin": "AI Recommendation", "label": ""})
        test_data = [{"value": val, "raw": None, "expected": then, "origin": "BRS Explicit Rule", "note": "ข้อมูลหลัก", "label": "", "kind": "value"}]
        pre = f["preconditions"] + " " if f["preconditions"] != NF else ""
        explain = f"Test Case นี้ตรวจสอบว่า {pre}ระบบ{re.sub(r'^ระบบ', '', then)}"
    return {
        "title": f"{scenario_type}: {r['title']}"[:120], "description": r["original_text"], "business_explanation": explain,
        "given": given, "when": when, "then": then,
        "preconditions": f["preconditions"] if f["preconditions"] != NF else "ข้อมูล Synthetic พร้อมใช้งาน",
        "steps": steps, "test_data": test_data, "overall_expected": then, "type": scenario_type,
        "priority": pr["priority"], "risk": pr["risk"], "pr_reasons": pr["reasons"], "origin": origin,
        "automation_candidate": "Yes" if scenario_type in ("Boundary", "API", "Positive") else "Maybe",
        "automation_tool": "Pytest + Postman" if scenario_type == "API" else ("Playwright" if "UI" in r["type"] else "Pytest"),
        "assumption": "\n".join("AI ASSUMPTION - NOT FOUND IN BRS: " + a for a in accepted),
        "clarification_ref": "\n".join(clar_refs),
    }
