"""Requirement extraction, quality scoring, clarification, conflict detection.

Faithful Python port of 04_source/p3_engine.js (§7–§10). Functions are pure (dict in → dict out)
so they are unit-testable without a database; `services/processing.py` persists the results.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Callable

from .text import NF, normalize_text, uid

REQ_KW = re.compile(
    r"(ต้อง|จะต้อง|ให้ระบบ|ระบบจะ|ระบบต้อง|สามารถ|ไม่อนุญาต|ห้าม|ไม่นำ|ไม่รวม|เฉพาะ|แสดง|คำนวณ|ตรวจสอบ|บังคับ|"
    r"shall|must|should|will\s|required|mandatory|validate|only|exclude|display|calculate)", re.I)
OP_PATTERNS: list[tuple[str, str]] = [
    (r"(มากกว่าหรือเท่ากับ|ไม่น้อยกว่า|ตั้งแต่|>=|≥|greater than or equal to|at least|no less than)", ">="),
    (r"(น้อยกว่าหรือเท่ากับ|ไม่เกิน|ไม่มากกว่า|<=|≤|less than or equal to|at most|not exceed(?:ing)?|no more than|up to)", "<="),
    (r"(มากกว่า|เกินกว่า|สูงกว่า|greater than|more than|above|exceed(?:s|ing)?|>)", ">"),
    (r"(น้อยกว่า|ต่ำกว่า|less than|below|<)", "<"),
    (r"(เท่ากับ|equal to|equals|=)", "="),
]
UNIT_RE = r"(บาท|THB|USD|วันทำการ|วัน|days?|business days?|%|เปอร์เซ็นต์|ตัวอักษร|characters?|หลัก|digits?|รายการ|ครั้ง|ชั่วโมง|hours?|นาที|minutes?|เดือน|months?|ปี|years?)"
NUM_RE = r"(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
DATE_SPAN = re.compile(r"(ย้อนหลัง|ภายใน|ล่วงหน้า|within|last|past|previous)\s*" + NUM_RE +
                       r"\s*(วันทำการ|วัน|days?|business days?|เดือน|months?|ชั่วโมง|hours?)", re.I)


def parse_threshold(text: str) -> dict | None:
    t = str(text)
    ds = DATE_SPAN.search(t)
    scan = t.replace(ds.group(0), " ", 1) if ds else t
    for pat, op in OP_PATTERNS:
        m = re.search(pat + r"\s*" + NUM_RE + r"\s*" + UNIT_RE + "?", scan, re.I)
        if m:
            return {"op": op, "value": m.group(2).replace(",", ""), "unit": m.group(3) or NF, "raw": m.group(0),
                    "op_word": m.group(1), "ambiguous": False}
    up = re.search(NUM_RE + r"\s*" + UNIT_RE + r"?\s*(ขึ้นไป|or more|and above)", scan, re.I)
    if up:
        return {"op": ">=", "value": up.group(1).replace(",", ""), "unit": up.group(2) or NF, "raw": up.group(0),
                "op_word": up.group(3), "ambiguous": False}
    bare = re.search(r"(?:ยอด|จำนวน|วงเงิน|amount|total|limit|ความยาว|length)[^\d]{0,30}" + NUM_RE + r"\s*" + UNIT_RE + "?", scan, re.I)
    if bare:
        return {"op": NF, "value": bare.group(1).replace(",", ""), "unit": bare.group(2) or NF, "raw": bare.group(0),
                "op_word": NF, "ambiguous": True}
    return None


def parse_date_range(text: str) -> str:
    m = DATE_SPAN.search(str(text))
    if m:
        return m.group(0)
    r = re.search(r"(ระหว่างวันที่|ตั้งแต่วันที่|from)\s*[^,;\n]{3,40}(ถึง|to|until)\s*[^,;\n]{3,30}", str(text), re.I)
    return r.group(0) if r else NF


def pick(text: str, pattern: str | re.Pattern) -> str:
    m = re.search(pattern, str(text), re.I) if isinstance(pattern, str) else pattern.search(str(text))
    return m.group(0).strip()[:200] if m else NF


ROLE_RE = re.compile(
    r"(ผู้ดูแลระบบ|Admin(?:istrator)?|Maker|Checker|Approver|ผู้อนุมัติ|ผู้บันทึก|เจ้าหน้าที่[^\s,.;]*|Supervisor|หัวหน้า[^\s,.;]*|"
    r"Operator|Teller|Compliance(?: Officer)?|RM\b|Relationship Manager|Role\s*[:=]?\s*[A-Za-z_]+|"
    r"ผู้ใช้(?:งาน)?ที่มีสิทธิ์[^\s,.;]*|ผู้ใช้งานกลุ่ม[^\s,.;]*)", re.I)

TYPE_RULES: list[tuple[str, re.Pattern]] = [
    ("API Requirement", re.compile(r"(\bAPI\b|endpoint|request|response|REST|JSON|HTTP|status code)", re.I)),
    ("Integration Requirement", re.compile(r"(interface|เชื่อมต่อ|ส่งข้อมูลไปยัง|รับข้อมูลจาก|integration|ระบบภายนอก|core banking)", re.I)),
    ("Batch Requirement", re.compile(r"(batch|ทุกวันเวลา|รอบการประมวลผล|schedule|end of day|EOD|job)", re.I)),
    ("Report Requirement", re.compile(r"(รายงาน|report)", re.I)),
    ("File Requirement", re.compile(r"(ไฟล์|file|CSV|export|import|อัปโหลด|upload|download)", re.I)),
    ("Validation Rule", re.compile(r"(ตรวจสอบ|validate|validation|บังคับกรอก|required|mandatory|รูปแบบ|format|ไม่ถูกต้อง|invalid|ความยาว|length)", re.I)),
    ("UI Requirement", re.compile(r"(หน้าจอ|ปุ่ม|screen|button|dropdown|popup|เมนู|menu|คลิก|click)", re.I)),
    ("Process Flow", re.compile(r"(ขั้นตอน|flow|จากนั้น|ส่งต่อ|workflow|อนุมัติ|approve|สถานะ.*เปลี่ยน)", re.I)),
    ("Field Requirement", re.compile(r"(ฟิลด์|field|ช่อง|column|คอลัมน์)", re.I)),
    ("Text Condition", re.compile(r"(ข้อความ|message|คำว่า|label)", re.I)),
    ("Data Requirement", re.compile(r"(ข้อมูล|data|database|table|record|ฐานข้อมูล)", re.I)),
]
REQUIREMENT_TYPES = ["Field Requirement", "Validation Rule", "Business Rule", "Text Condition", "Process Flow",
                     "Data Requirement", "API Requirement", "Integration Requirement", "Report Requirement",
                     "File Requirement", "Batch Requirement", "UI Requirement"]


def classify(text: str, has_rule: bool) -> str:
    rules = TYPE_RULES[:6] if has_rule else TYPE_RULES
    for t, rx in rules:
        if rx.search(text):
            return t
    return "Business Rule"


VAGUE_RE = re.compile(r"(เหมาะสม|ประมาณ|รวดเร็ว|ถ้าเป็นไปได้|อาจจะ|บางกรณี|ฯลฯ|และอื่นๆ|และอื่น ๆ|ตามความเหมาะสม|โดยทั่วไป|"
                      r"\betc\b|\bTBD\b|appropriate|user[- ]friendly|as needed|fast|quickly|some cases|if possible)", re.I)


def module_from(title: str | None, fallback: str) -> str:
    m = re.search(r"(Rule|Module|โมดูล|กฎข้อ)\s*(\d+)", str(title or ""), re.I)
    if m:
        return ("RULE" if re.search(r"(rule|กฎ)", m.group(1), re.I) else "MOD") + m.group(2)
    words = re.findall(r"[A-Za-z]{3,}", str(title or ""))
    for w in words:
        if not re.match(r"^(section|chapter|table|the|and|for)$", w, re.I):
            return w.upper()[:16]
    return fallback


FIELD_TABLE_HDR = re.compile(r"(field|ฟิลด์|ชื่อข้อมูล|column|rule|เงื่อนไข|requirement|ความต้องการ|description|คำอธิบาย|validation)", re.I)
BULLET_RE = re.compile(r"^[-•*]\s|^\(?[a-zก-ฮ0-9]{1,2}[.)]\s", re.I)


def candidate_statements(section: dict) -> list[dict]:
    if section["kind"] == "table":
        rows = section.get("rows") or []
        if not rows:
            return []
        header, body = rows[0], rows[1:]
        field_table = any(FIELD_TABLE_HDR.search(h or "") for h in header)
        out = []
        for i, r in enumerate(body):
            parts = [f"{(header[j] if j < len(header) and header[j] else 'Col' + str(j + 1))}: {c}" for j, c in enumerate(r) if c]
            text = "; ".join(parts)
            if text and (field_table or REQ_KW.search(text)):
                out.append({"text": text, "row": (section.get("row_offset") or 1) + i, "field_table": field_table})
        return out
    out: list[dict] = []
    lead: str | None = None
    for line in section["text"].split("\n"):
        t = line.strip()
        if not t:
            continue
        if re.search(r"[:：]$", t) and len(t) < 200:
            lead = t
            continue
        is_bullet = bool(BULLET_RE.search(t))
        text = (lead + " " + re.sub(r"^[-•*]\s*", "", t)) if (is_bullet and lead) else t
        if not is_bullet:
            lead = None
        parts = re.split(r"(?<=[.;])\s+(?=\S)", text) if len(text) > 350 else [text]
        for p in parts:
            if REQ_KW.search(p) and len(p) > 12:
                out.append({"text": p.strip(), "field_table": False})
    return out


_EXP_HEAD = re.compile(r"(ต้อง|จะต้อง|ให้ระบบ|ระบบจะ|ระบบต้อง|shall|must|will)\s*(.{4,220})", re.I)
_EXP_VERB = re.compile(r"(แสดง|ไม่แสดง|ได้|บันทึก|ส่ง|คำนวณ|สร้าง|แจ้ง|ปฏิเสธ|reject|return|display|show|calculate|save|send|generate|"
                       r"error|ข้อความ|นำมา|ไม่นำ|รวม|ไม่รวม|เปลี่ยนสถานะ|block|บล็อก|ห้าม|export|ส่งออก|ตอบกลับ|HTTP|สามารถ)", re.I)


def extract_fields(text: str, field_table: bool = False) -> dict:
    th = parse_threshold(text)
    has_cond = bool(re.search(r"(ถ้า|หาก|เมื่อ|กรณี|if|when|where)", text, re.I)) or th is not None
    em = _EXP_HEAD.search(text)
    expected = em.group(2).strip() if em and _EXP_VERB.search(em.group(2)) else NF
    return {
        "business_rule": text[:300] if has_cond else NF,
        "preconditions": pick(text, r"(เมื่อ|หาก|ถ้า|กรณีที่|when|if)\s*(?:[^,;]|,(?=\d)){3,120}"),
        "input": text.split(";")[0] if field_table else pick(
            text, r"(กรอก|ระบุ|รับค่า|อัปโหลด|upload|ค้นหา|เลือก|ฟิลด์|field|parameter|request|ข้อมูล(?:รายการ|ธุรกรรม|ลูกค้า)[^\s,;]*|transaction[s]?|ยอด[^\s,;]*)(?:[^,;]|,(?=\d)){0,80}"),
        "process": pick(text, r"(คำนวณ|รวม|sum|ตรวจสอบ|validate|กรอง|filter|จัดกลุ่ม|group|เปรียบเทียบ|compare|นับ|count)(?:[^,;]|,(?=\d)){0,100}"),
        "output": pick(text, r"(แสดง|รายงาน|report|output|ไฟล์|export|response|ผลลัพธ์|ส่งออก|แจ้งเตือน|alert|display)(?:[^,;]|,(?=\d)){0,100}"),
        "expected_result": expected,
        "role": pick(text, ROLE_RE),
        "threshold": (th["value"] if th["op"] == NF else f"{th['op']} {th['value']}") if th else NF,
        "threshold_raw": th["raw"].strip() if th else NF,
        "threshold_op": th["op"] if th else NF,
        "threshold_value": th["value"] if th else NF,
        "threshold_ambiguous": th["ambiguous"] if th else False,
        "unit": th["unit"] if th else NF,
        "date_range": parse_date_range(text),
        "inclusion": pick(text, r"(เฉพาะ|รวมถึง|include[sd]?|only)\s*(?:[^,;]|,(?=\d)){2,100}"),
        "exclusion": pick(text, r"(ไม่นำ|ไม่รวม|ยกเว้น|exclude[sd]?|except)\s*(?:[^,;]|,(?=\d)){2,100}"),
    }


def _has(v) -> bool:
    return bool(v) and v != NF


def analyze_quality(r: dict) -> dict:
    f, t = r["fields"], r["original_text"]
    money = bool(re.search(r"(บาท|THB|USD|ยอด|amount|เงิน)", t, re.I))
    timeish = bool(re.search(r"(เวลา|time|timestamp|วันที่|date|ชั่วโมง|hour|cut-?off)", t, re.I))
    numeric = _has(f["threshold_value"]) or bool(re.search(r"(มากกว่า|น้อยกว่า|เกิน|ไม่เกิน|ขั้นต่ำ|สูงสุด|limit|threshold|at least|more than|less than)", t, re.I))
    dateish = _has(f["date_range"]) or bool(re.search(r"(ย้อนหลัง|ช่วงวันที่|รายเดือน|monthly|daily|รายวัน|period)", t, re.I))
    checks = [
        ("มี Input", _has(f["input"]), 15, True),
        ("มี Output", _has(f["output"]), 10, True),
        ("มี Expected Result", _has(f["expected_result"]), 25, True),
        ("ระบุ Role", _has(f["role"]), 15, not re.search(r"(Batch|Data Requirement|Field Requirement)", r["type"])),
        ("มี Business Rule / เงื่อนไข", _has(f["business_rule"]), 10, True),
        ("มี Threshold", _has(f["threshold_value"]), 10, numeric),
        ("ระบุหน่วยของ Threshold", _has(f["unit"]), 5, _has(f["threshold_value"])),
        ("มี Date Range", _has(f["date_range"]), 10, dateish),
    ]
    app = [c for c in checks if c[3]]
    total = sum(c[2] for c in app)
    got = sum(c[2] for c in app if c[1])

    def neg(label: str) -> str:
        # prototype bug fixed: "ระบุ Role" became "ไม่มี  Role" (double space) and never read "ไม่ระบุ Role"
        s = re.sub(r"^มี |^ระบุ\s*", "ไม่มี ", label, count=1)
        return s.replace("ไม่มี หน่วย", "ไม่ระบุหน่วย").replace("ไม่มี Role", "ไม่ระบุ Role")

    completeness = {"score": round(got / total * 100) if total else 0,
                    "reasons": [{"ok": c[1], "text": c[0] if c[1] else neg(c[0])} for c in app]}
    issues: list[dict] = []
    clarity = 100
    resolved = {q["key"] for q in r.get("questions", []) if q.get("resolved")}
    confirmed: list[dict] = []

    def pen(key: str, p: int, text: str) -> None:
        nonlocal clarity
        if key in resolved:
            confirmed.append({"ok": True, "text": re.sub(r"\s*\(-\d+\)$", "", text) + " → ยืนยันแล้วจาก Clarification"})
            return
        clarity -= p
        issues.append({"key": key, "text": text})

    vague = list(dict.fromkeys(x.lower() for x in VAGUE_RE.findall(t)))
    if vague:
        p = min(30, 10 * len(vague))
        pen("vague", p, f"ใช้คำกำกวม: {', '.join(vague)} (-{p})")
    if f["threshold_ambiguous"] and f["threshold_op"] == NF:
        pen("operator", 20, "มีตัวเลขแต่ไม่ระบุเครื่องหมายเปรียบเทียบ (> / >= / < / <=) (-20)")
    if _has(f["threshold_value"]) and not _has(f["unit"]):
        pen("unit", 10, "Threshold ไม่มีหน่วย (-10)")
    if _has(f["threshold_value"]) and re.search(r"(ตั้งแต่.*ถึง|ระหว่าง)", t) and not re.search(r"(รวม|inclusive|exclusive)", t, re.I):
        pen("inclusive", 5, "ไม่ระบุชัดว่ารวมค่าขอบหรือไม่ (-5)")
    if dateish and not re.search(r"(วันทำการ|business day|calendar|วันปฏิทิน)", t, re.I):
        pen("daytype", 10, "ไม่ระบุว่าเป็น Calendar Day หรือ Business Day (-10)")
    if dateish and not re.search(r"(รวมวัน|inclusive|exclusive|ไม่รวมวัน)", t, re.I):
        pen("dateinclusive", 5, "ไม่ระบุ Inclusive/Exclusive ของช่วงวันที่ (-5)")
    if money and numeric and not re.search(r"(ปัดเศษ|ทศนิยม|round|decimal)", t, re.I):
        pen("rounding", 5, "ไม่ระบุการปัดเศษ (-5)")
    if timeish and not re.search(r"(timezone|time zone|GMT|UTC|ICT|เวลาประเทศไทย|\+0?7)", t, re.I):
        pen("timezone", 5, "ไม่ระบุ Timezone (-5)")
    if "Validation" in r["type"] and not re.search(r"(ข้อความ|message|แจ้งเตือนว่า|error)", t, re.I):
        pen("errormsg", 10, "ไม่ระบุ Error Message (-10)")
    if not _has(f["expected_result"]) and not _has(f["threshold_value"]) and not _has(f["output"]):
        pen("untestable", 15, "ไม่สามารถทดสอบได้: ไม่มีผลลัพธ์ที่ตรวจวัดได้ (-15)")
    if len(t) > 400:
        pen("compound", 10, "ประโยคยาว อาจรวมหลาย Requirement (-10)")
    if r.get("duplicate_of"):
        pen("duplicate", 10, f"ซ้ำกับ {r['duplicate_of']} (-10)")
    if r.get("source_unverified"):
        pen("unverified", 20, "AI อ้างข้อความที่ไม่พบในต้นฉบับ (-20)")
    clarity = max(0, min(100, clarity))
    reasons = [{"ok": False, "text": i["text"]} for i in issues] or [{"ok": True, "text": "ไม่พบคำกำกวมหรือเงื่อนไขที่ขาด"}]
    return {"completeness": completeness, "clarity": {"score": clarity, "reasons": reasons + confirmed},
            "issue_keys": [i["key"] for i in issues], "money": money, "timeish": timeish, "dateish": dateish}


def fmt_en(v: str) -> str:
    """Number(v).toLocaleString('en-US')."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return str(v)
    if x.is_integer():
        return f"{int(x):,}"
    return f"{x:,.3f}".rstrip("0").rstrip(".")


QUESTION_BANK: dict[str, dict] = {
    "expected": {"q": "Requirement นี้ต้องได้ผลลัพธ์ (Expected Result) อะไรที่ตรวจสอบได้?", "a": None, "field": "expected_result"},
    "role": {"q": "Role ใดมีสิทธิ์ทำรายการนี้?", "a": "สมมติว่าเฉพาะผู้ใช้ที่ได้รับสิทธิ์ของ Module นี้เท่านั้น", "field": "role"},
    "input": {"q": "Input ของ Requirement นี้คืออะไร (Field / แหล่งข้อมูล)?", "a": None, "field": "input"},
    "operator": {"q": lambda v: f"Threshold {v} ต้องใช้เงื่อนไขใด (> / >= / < / <=) และรวมค่าที่เท่ากับ {v} หรือไม่?",
                 "a": lambda v: f"สมมติว่ารวมค่าที่เท่ากับ {v} (>=)", "field": "threshold_op"},
    "unit": {"q": "Threshold นี้ใช้หน่วยอะไร?", "a": "สมมติว่าเป็นบาท (THB) หากเป็นจำนวนเงิน", "field": "unit"},
    "daytype": {"q": "ช่วงวันที่นี้ใช้ Calendar Day หรือ Business Day?", "a": "สมมติว่าใช้ Calendar Day", "field": None},
    "dateinclusive": {"q": "ช่วงวันที่รวมวันเริ่มต้นและวันสิ้นสุดหรือไม่?", "a": "สมมติว่ารวมทั้งวันเริ่มต้นและวันสิ้นสุด (Inclusive)", "field": None},
    "inclusive": {"q": "ช่วงค่าที่ระบุรวมค่าขอบบนและขอบล่างหรือไม่?", "a": "สมมติว่ารวมค่าขอบทั้งสองด้าน", "field": None},
    "rounding": {"q": "การคำนวณจำนวนเงินต้องปัดเศษอย่างไร (กี่ตำแหน่ง, ROUND_HALF_UP?)", "a": "สมมติว่าปัดทศนิยม 2 ตำแหน่งแบบ ROUND_HALF_UP", "field": None},
    "timezone": {"q": "วันที่และเวลาอ้างอิง Timezone ใด?", "a": "สมมติว่าใช้ Asia/Bangkok (UTC+07:00)", "field": None},
    "errormsg": {"q": "เมื่อข้อมูลไม่ผ่าน Validation ระบบต้องแสดง Error Message อะไร?", "a": None, "field": None},
    "untestable": {"q": "จะวัดผลว่า Requirement นี้ผ่านได้อย่างไร (ผลลัพธ์ที่ตรวจสอบได้)?", "a": None, "field": "expected_result"},
    "vague": {"q": lambda t: f'คำว่า "{t}" หมายถึงอะไรในเชิงตัวเลขหรือเงื่อนไขที่วัดได้?', "a": None, "field": None},
    "nullcase": {"q": "หากข้อมูลเป็น Null หรือว่าง ระบบต้องแสดงอะไร?", "a": "สมมติว่าระบบแสดง Validation Error", "field": None},
}
ASSUMPTION_LABEL = "AI ASSUMPTION - NOT FOUND IN BRS"


def build_questions(r: dict, q: dict) -> list[dict]:
    out: list[dict] = []
    f = r["fields"]

    def add(key, qt, at, field):
        out.append({"id": uid(), "key": key, "text": qt, "answer": "", "resolved": False, "field": field,
                    "assumption": {"id": uid(), "text": at, "state": "DRAFT"} if at else None})

    if f["expected_result"] == NF:
        add("expected", QUESTION_BANK["expected"]["q"], None, "expected_result")
    if f["role"] == NF and any(not x["ok"] and "Role" in x["text"] for x in q["completeness"]["reasons"]):
        add("role", QUESTION_BANK["role"]["q"], QUESTION_BANK["role"]["a"], "role")
    for k in q["issue_keys"]:
        if k == "operator":
            v = fmt_en(f["threshold_value"])
            add(k, QUESTION_BANK["operator"]["q"](v), QUESTION_BANK["operator"]["a"](v), "threshold_op")
        elif k == "vague":
            words = list(dict.fromkeys(VAGUE_RE.findall(r["original_text"])))
            for w in words[:2]:
                add(k, QUESTION_BANK["vague"]["q"](w), None, None)
        elif k in QUESTION_BANK and k not in ("duplicate", "compound", "unverified"):
            b = QUESTION_BANK[k]
            if not any(o["key"] == k for o in out):
                add(k, b["q"], b["a"], b["field"])
    if re.search(r"Validation|Field", r["type"]) and not re.search(r"(null|ค่าว่าง|ว่าง|blank|empty)", r["original_text"], re.I):
        add("nullcase", QUESTION_BANK["nullcase"]["q"], QUESTION_BANK["nullcase"]["a"], None)
    return out


BLOCKING_KEYS = {"expected", "operator", "untestable", "vague", "role", "unit", "errormsg"}


def decide_status(r: dict) -> str:
    if r.get("conflict_status") == "OPEN":
        return "CONFLICT"
    open_q = [q for q in r["questions"] if not q["resolved"]]
    blocking = any(q["key"] in BLOCKING_KEYS for q in open_q)
    if blocking or r["clarity"]["score"] < 70 or r["completeness"]["score"] < 50:
        return "NEEDS_CLARIFICATION" if open_q else "WAITING_FOR_REVIEW"
    return "WAITING_FOR_REVIEW"


# ------------------------------------------------------------------ similarity / conflicts
_OP_WORDS = re.compile(r"(มากกว่าหรือเท่ากับ|น้อยกว่าหรือเท่ากับ|มากกว่า|น้อยกว่า|ไม่เกิน|ไม่น้อยกว่า|เท่ากับ|>=|<=|>|<|=)")


def bigrams(s: str) -> Counter:
    t = str(s).lower()
    t = re.sub(r"[\d,.]+", "#", t)
    t = _OP_WORDS.sub("", t)
    t = re.sub(r"\s+", "", t)
    return Counter(t[i:i + 2] for i in range(len(t) - 1))


def dice(a: Counter, b: Counter) -> float:
    na, nb = sum(a.values()), sum(b.values())
    inter = sum(min(v, b[k]) for k, v in a.items() if k in b)
    return 2 * inter / (na + nb) if na + nb else 0.0


def _num(v: str) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def compare_pair(a: dict, b: dict, sim: float) -> list[dict]:
    fa, fb = a["fields"], b["fields"]
    diffs: list[dict] = []
    if fa["threshold_value"] != NF and fb["threshold_value"] != NF and _num(fa["threshold_value"]) != _num(fb["threshold_value"]):
        diffs.append({"field": "Threshold", "a": fa["threshold"], "b": fb["threshold"]})
    elif fa["threshold_op"] != NF and fb["threshold_op"] != NF and fa["threshold_op"] != fb["threshold_op"]:
        diffs.append({"field": "Operator (> vs >=)", "a": fa["threshold_op"], "b": fb["threshold_op"]})
    if fa["date_range"] != NF and fb["date_range"] != NF and re.sub(r"\s", "", fa["date_range"]) != re.sub(r"\s", "", fb["date_range"]):
        diffs.append({"field": "Date Range", "a": fa["date_range"], "b": fb["date_range"]})
    if fa["role"] != NF and fb["role"] != NF and fa["role"].lower() != fb["role"].lower():
        diffs.append({"field": "Role", "a": fa["role"], "b": fb["role"]})

    def mand(t):
        if re.search(r"(ไม่บังคับ|optional)", t, re.I):
            return "Optional"
        if re.search(r"(บังคับ|mandatory|required)", t, re.I):
            return "Mandatory"
        return None

    ma, mb = mand(a["original_text"]), mand(b["original_text"])
    if ma and mb and ma != mb:
        diffs.append({"field": "Mandatory/Optional", "a": ma, "b": mb})
    neg = lambda t: bool(re.search(r"(ไม่แสดง|ไม่นำ|ไม่รวม|ห้าม|must not|shall not|exclude)", t, re.I))  # noqa: E731
    if sim > 0.8 and neg(a["original_text"]) != neg(b["original_text"]):
        diffs.append({"field": "Expected Result", "a": fa["expected_result"], "b": fb["expected_result"]})
    return diffs


def detect_conflicts(reqs: list[dict], existing: list[dict]) -> tuple[list[dict], dict[str, str]]:
    """reqs: [{id, req_id, fields, original_text, normalized_text, supersedes, duplicate_of}]
    existing: [{a, b, status}] → (new_conflicts, duplicates{id: req_id_of_original})."""
    grams = [bigrams(r["normalized_text"]) for r in reqs]
    pairs_existing = {frozenset((c["a"], c["b"])): c["status"] for c in existing}
    found: list[dict] = []
    dups: dict[str, str] = {}
    for i in range(len(reqs)):
        for j in range(i + 1, len(reqs)):
            a, b = reqs[i], reqs[j]
            if b["id"] in (a.get("supersedes") or []) or a["id"] in (b.get("supersedes") or []):
                continue
            key = frozenset((a["id"], b["id"]))
            if pairs_existing.get(key) == "RESOLVED":
                continue
            sim = dice(grams[i], grams[j])
            if sim < 0.72:
                continue
            diffs = compare_pair(a, b, sim)
            if diffs:
                if key not in pairs_existing:
                    found.append({"id": uid(), "a": a["id"], "b": b["id"], "similarity": round(sim * 100), "diffs": diffs,
                                  "status": "OPEN", "history": [{"by": "system", "action": "DETECTED"}]})
                    pairs_existing[key] = "OPEN"
            elif sim >= 0.95 and not a.get("duplicate_of") and not b.get("duplicate_of") and b["id"] not in dups:
                dups[b["id"]] = a["req_id"]
    return found, dups


# ------------------------------------------------------------------ build requirement
def build_requirement(ctx: dict, stmt: dict, fields_override: dict | None, ai_meta: dict | None,
                      next_seq: Callable[[str], int]) -> dict:
    """ctx: {project_code, module, section{id,title,parent_title,page,page_end,kind}, doc_name, screenshot_id, user}"""
    fields = extract_fields(stmt["text"], stmt.get("field_table", False))
    override = dict(fields_override or {})
    title_o = override.pop("__title", None)
    type_o = override.pop("__type", None)
    fields.update({k: v for k, v in override.items()})
    has_rule = fields["threshold_value"] != NF or fields["exclusion"] != NF or fields["inclusion"] != NF
    rtype = type_o if type_o in REQUIREMENT_TYPES else classify(stmt["text"], has_rule)
    module = ctx["module"]
    n = next_seq(f"REQ-{ctx['project_code']}-{module}")
    sec = ctx["section"]
    r = {
        "id": uid(), "req_id": f"REQ-{ctx['project_code']}-{module}-{n:03d}",
        "type": rtype, "module": module, "submodule": sec.get("parent_title") or NF,
        "title": (title_o if title_o and title_o != NF else re.sub(r"^[-•*]\s*", "", stmt["text"]))[:90],
        "original_text": stmt["text"], "normalized_text": normalize_text(stmt["text"]).lower(), "fields": fields,
        "source": {"page": str(sec["page"]) if sec.get("page") is not None else NF,
                   "page_end": str(sec["page_end"]) if sec.get("page_end") is not None else None,
                   "section": sec["title"], "section_id": sec["id"],
                   "table": f"{sec['title']} แถว {stmt.get('row')}" if sec["kind"] == "table" else NF,
                   "screenshot": ctx.get("screenshot_id") or NF, "doc_name": ctx.get("doc_name", NF)},
        "ai_meta": ai_meta or {"engine": "rule-based", "model": "deterministic-extractor", "prompt_version": "n/a"},
        "confidence": (ai_meta or {}).get("confidence", 0.6) if ai_meta else 0.6,
        "source_unverified": bool(ai_meta and ai_meta.get("unverified")),
        "status": "AI_GENERATED", "conflict_status": "NONE", "questions": [], "duplicate_of": None, "supersedes": [],
        "origin": "AI" if ai_meta and ai_meta.get("engine") == "claude" else "RULE_ENGINE",
    }
    q = analyze_quality(r)
    r["completeness"], r["clarity"] = q["completeness"], q["clarity"]
    r["questions"] = build_questions(r, q)
    r["status"] = decide_status(r)
    return r


def reanalyze(r: dict) -> dict:
    """Recompute scores/questions after edit or clarification; keeps answered/resolved questions."""
    q = analyze_quality(r)
    r["completeness"], r["clarity"] = q["completeness"], q["clarity"]
    kept = [x for x in r["questions"] if x["resolved"] or x.get("answer")]
    fresh = [n for n in build_questions(r, q) if not any(k["key"] == n["key"] for k in kept)]
    # keep the identity (id, assumption state) of still-open questions so clients can keep answering them
    olds = {(o["key"], o["text"]): o for o in r["questions"] if not o["resolved"] and not o.get("answer")}
    fresh = [olds.get((n["key"], n["text"]), n) for n in fresh]
    r["questions"] = kept + [n for n in fresh if not any(o["key"] == n["key"] and o["resolved"] for o in r["questions"])]
    if r["status"] not in ("APPROVED", "DEPRECATED"):
        r["status"] = decide_status(r)
    return r


# ------------------------------------------------------------------ AI output verification (§32)
def verify_ai_requirements(section: dict, out: dict) -> list[dict]:
    """Turn a Claude JSON answer into (stmt, fields_override, meta) tuples with hallucination checks."""
    if not isinstance(out, dict) or not isinstance(out.get("requirements"), list):
        from ...core.errors import AppError
        raise AppError("AI_INVALID_JSON", "AI ตอบกลับในรูปแบบที่ไม่ถูกต้อง", technical=str(out)[:300], retryable=True, action="กด Retry Section")
    norm = lambda s: re.sub(r"\s+", "", str(s or ""))  # noqa: E731
    sec_norm = norm(section["text"])
    res = []
    for x in out["requirements"]:
        orig = str(x.get("original_text") or "").strip()
        verified = bool(orig) and norm(orig) in sec_norm
        tv = str(x.get("threshold_value") or "")
        val = tv.replace(",", "") if tv and tv != NF and tv.replace(",", "") in orig.replace(",", "") else NF

        def f(v):
            return str(v).strip() if v is not None and str(v).strip() and v != "null" else NF

        op = x.get("threshold_operator") if x.get("threshold_operator") in (">", ">=", "<", "<=", "=") else NF
        res.append({
            "stmt": {"text": orig if verified else (orig or "(ไม่มีข้อความ)"), "field_table": section["kind"] == "table"},
            "fields": {"__title": f(x.get("title"))[:90], "__type": f(x.get("type")) if f(x.get("type")) != NF else None,
                       "business_rule": f(x.get("business_rule")), "preconditions": f(x.get("preconditions")),
                       "input": f(x.get("input")), "process": f(x.get("process")), "output": f(x.get("output")),
                       "expected_result": f(x.get("expected_result")), "role": f(x.get("role")), "threshold_op": op,
                       "threshold_value": val, "threshold": (f"{op} {val}" if op != NF else val) if val != NF else NF,
                       "threshold_ambiguous": val != NF and op == NF, "unit": f(x.get("unit")),
                       "date_range": f(x.get("date_range")), "inclusion": f(x.get("inclusion")), "exclusion": f(x.get("exclusion"))},
            "meta": {"confidence": x.get("confidence") if isinstance(x.get("confidence"), (int, float)) else out.get("confidence", 0.5),
                     "unverified": not verified, "assumptions": out.get("assumptions", []),
                     "recommendations": out.get("recommendations", [])},
        })
    return res
