/* ============ Test design (§11–§14) ============ */
const isMoney = u => /(บาท|THB|USD)/i.test(u || "");
function meets(op, x, v) { x = Number(x); v = Number(v); return op === ">=" ? x >= v : op === ">" ? x > v : op === "<=" ? x <= v : op === "<" ? x < v : op === "=" ? x === v : null; }
function fmtNum(n, dec) { return Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function boundaryData(r) {
  const f = r.fields; if (f.thresholdValue === NF || f.thresholdOp === NF) return null;
  const v = Number(f.thresholdValue); const dec = isMoney(f.unit) || /\./.test(f.thresholdValue) ? 2 : 0; const step = dec ? 0.01 : 1;
  const fix = x => Number(x.toFixed(dec));
  const Y = "เข้าเงื่อนไข", N = "ไม่เข้าเงื่อนไข";
  const rows = [
    { value: fmtNum(fix(v - step), dec), raw: fix(v - step), expected: meets(f.thresholdOp, v - step, v) ? Y : N, origin: "Derived Boundary", note: "ต่ำกว่า Boundary" },
    { value: fmtNum(v, dec), raw: v, expected: meets(f.thresholdOp, v, v) ? Y : N, origin: "BRS Explicit Rule", note: "เท่ากับ Boundary" },
    { value: fmtNum(fix(v + step), dec), raw: fix(v + step), expected: meets(f.thresholdOp, v + step, v) ? Y : N, origin: "Derived Boundary", note: "สูงกว่า Boundary" }
  ];
  if (v !== 0) rows.push({ value: fmtNum(0, dec), raw: 0, expected: meets(f.thresholdOp, 0, v) ? Y : N, origin: "Derived Boundary", note: "ค่าศูนย์" });
  rows.push({ value: "(ว่าง)", raw: "", expected: "Validation Error", origin: "AI Recommendation", note: "ค่าว่าง", label: "AI RECOMMENDED TEST - NOT EXPLICITLY DEFINED IN BRS" });
  rows.push({ value: "\"ABC\"", raw: "ABC", expected: "Invalid Data Type", origin: "AI Recommendation", note: "ชนิดข้อมูลผิด", label: "AI RECOMMENDED TEST - NOT EXPLICITLY DEFINED IN BRS" });
  return rows;
}
function assessPriorityRisk(r, type) {
  const t = r.originalText; const reasons = []; let impact = 0, likelihood = 0;
  if (/(บาท|THB|USD|ยอด|เงิน|amount|payment|โอน)/i.test(t)) { impact += 2; reasons.push("เกี่ยวข้องกับจำนวนเงิน (+2 ผลกระทบ)"); }
  if (/(AML|ปปง|กฎหมาย|regulat|compliance|ธปท|BOT|audit|ตรวจสอบย้อนหลัง|รายงานต่อ)/i.test(t)) { impact += 2; reasons.push("เกี่ยวข้องกับ Compliance/กฎระเบียบ (+2 ผลกระทบ)"); }
  if (/(ลูกค้า|customer|บัตรประชาชน|PII|ส่วนบุคคล)/i.test(t)) { impact += 1; reasons.push("เกี่ยวข้องกับข้อมูลลูกค้า (+1 ผลกระทบ)"); }
  if (/(Business Rule|Process Flow)/.test(r.type)) { impact += 1; reasons.push("อยู่ใน Core Business Flow (+1 ผลกระทบ)"); }
  if (/(รายวัน|ทุกวัน|daily|ทุกรายการ|every)/i.test(t)) { impact += 1; reasons.push("ใช้งานบ่อย (+1 ผลกระทบ)"); }
  if (r.fields.thresholdValue !== NF || r.fields.dateRange !== NF) { likelihood += 2; reasons.push("มี Threshold/ช่วงวันที่ ซึ่งมักเกิด Off-by-one (+2 โอกาสผิดพลาด)"); }
  if (/(Integration|API|Batch)/.test(r.type)) { likelihood += 1; reasons.push("มี Dependency กับระบบอื่น (+1 โอกาสผิดพลาด)"); }
  if (t.length > 250 || (r.fields.exclusion !== NF && r.fields.inclusion !== NF)) { likelihood += 1; reasons.push("เงื่อนไขซับซ้อน (+1 โอกาสผิดพลาด)"); }
  if (type === "Boundary" || type === "Negative") { likelihood += 1; reasons.push(`${type} Test มีโอกาสพบ Defect สูง (+1)`); }
  const score = impact + likelihood;
  const priority = impact >= 4 || score >= 6 ? "Critical" : score >= 4 ? "High" : score >= 2 ? "Medium" : "Low";
  const risk = impact * Math.max(1, likelihood) >= 8 ? "High" : impact * Math.max(1, likelihood) >= 3 ? "Medium" : "Low";
  if (!reasons.length) reasons.push("ไม่พบปัจจัยเสี่ยงเฉพาะใน BRS (ค่าเริ่มต้น)");
  return { priority, risk, reasons, impact, likelihood };
}
function scenarioTypesFor(r) {
  const f = r.fields, types = ["Positive"];
  if ((f.thresholdValue !== NF && f.thresholdOp !== NF)) types.push("Boundary");
  if (f.exclusion !== NF || f.inclusion !== NF || /Validation|Field/.test(r.type) || f.role !== NF) types.push("Negative");
  if (/(Data|Report|Batch|File)/.test(r.type)) types.push("Data");
  if (/API/.test(r.type)) types.push("API");
  if (/Integration/.test(r.type)) types.push("Integration");
  return types;
}
function generateScenarios(projectId, reqIds) {
  const p = S.projects.find(x => x.id === projectId); let created = 0, skipped = [];
  reqIds.forEach(id => {
    const r = S.requirements.find(x => x.id === id);
    if (!r || r.status !== "APPROVED") { skipped.push(r ? `${r.reqId} (${r.status})` : id); return; }
    scenarioTypesFor(r).forEach(type => {
      if (S.scenarios.some(s => s.reqRef === r.id && s.type === type && s.status !== "DEPRECATED")) return; // duplicate prevention
      const pr = assessPriorityRisk(r, type);
      const n = nextSeq(`TS-${p.code}-${r.module}`);
      const title = { Positive: "ทำงานถูกต้องเมื่อข้อมูลเข้าเงื่อนไข", Boundary: `ตรวจค่าขอบของ ${r.fields.threshold} ${r.fields.unit !== NF ? r.fields.unit : ""}`, Negative: "ปฏิเสธ/ไม่นำข้อมูลที่ไม่เข้าเงื่อนไข", Data: "ข้อมูลที่บันทึก/แสดงผลถูกต้องครบถ้วน", API: "API ตอบกลับตาม Contract", Integration: "ข้อมูลส่งต่อระหว่างระบบถูกต้อง" }[type];
      S.scenarios.push({
        id: uid(), tsId: `TS-${p.code}-${r.module}-${pad(n)}`, projectId, reqRef: r.id, title: `${r.reqId}: ${title}`.trim(),
        description: r.originalText, objective: `ยืนยันว่า ${r.title}`, type, priority: pr.priority, risk: pr.risk, prReasons: pr.reasons,
        source: r.source, rationale: `สร้างจาก Requirement Type "${r.type}"` + (type === "Boundary" ? ` และพบ Threshold ${r.fields.threshold} (หน้า ${r.source.page})` : "") + (type === "Negative" && r.fields.exclusion !== NF ? ` และพบ Exclusion "${r.fields.exclusion}"` : ""),
        status: "AI_GENERATED", reviewer: null, approvedAt: null, created: now()
      });
      created++;
    });
  });
  save(); return { created, skipped };
}
function buildTestCase(s, r, p) {
  const f = r.fields; const pr = assessPriorityRisk(r, s.type);
  const acceptedAssumptions = r.questions.filter(q => q.assumption && q.assumption.state === "ACCEPTED").map(q => q.assumption.text);
  const clarRefs = r.questions.filter(q => q.resolved).map(q => `${q.text} → ${q.answer}`);
  const role = f.role !== NF ? f.role : "ผู้ใช้ที่มีสิทธิ์ (ตาม Clarification/Assumption)";
  const given = `${f.preconditions !== NF ? f.preconditions + " และ" : ""} ผู้ใช้ ${role} เข้าสู่ระบบ และมีข้อมูลทดสอบ Synthetic ตาม ${r.reqId}`;
  let steps = [], when = "", then = f.expected !== NF ? f.expected : "ผลลัพธ์ตามที่ BA ยืนยันใน Clarification", origin = "BRS Explicit Rule", testData = [], explain = "";
  const base = { n: 1, action: "เตรียมข้อมูลทดสอบและเข้าสู่ระบบ", data: `Role: ${role}; Customer ID: CUST-TEST-0001 (Synthetic)`, expected: "เข้าสู่ระบบสำเร็จและข้อมูลพร้อมทดสอบ" };
  if (s.type === "Boundary") {
    const rows = boundaryData(r) || [];
    testData = rows; origin = "Derived Boundary";
    when = `ประมวลผลรายการโดยใช้ค่า ${f.input !== NF ? f.input : "ค่าที่ใช้เปรียบเทียบ"} ตามค่าขอบที่กำหนด`;
    steps = [base, ...rows.map((d, i) => ({ n: i + 2, action: `ประมวลผลด้วยค่า ${d.value} (${d.note})`, data: d.value, expected: d.expected, origin: d.origin, label: d.label || "" }))];
    explain = `Test Case นี้ตรวจสอบว่าระบบตัดสินเงื่อนไข "${f.threshold}${f.unit !== NF ? " " + f.unit : ""}" ถูกต้อง โดยทดสอบค่าต่ำกว่า เท่ากับ และสูงกว่าค่าขอบ`;
  } else if (s.type === "Negative") {
    if (f.exclusion !== NF) { when = `ประมวลผลข้อมูลที่เข้าข่ายข้อยกเว้น: ${f.exclusion}`; then = `ระบบต้องไม่นำข้อมูลดังกล่าวมาประมวลผล (${f.exclusion})`; explain = `Test Case นี้ตรวจสอบว่าระบบ${f.exclusion}`; }
    else if (f.inclusion !== NF) { when = `ประมวลผลข้อมูลที่ไม่อยู่ในเงื่อนไข "${f.inclusion}"`; then = "ระบบต้องไม่นำข้อมูลนอกเงื่อนไขมาประมวลผล"; explain = `Test Case นี้ตรวจสอบว่าระบบใช้${f.inclusion}เท่านั้น`; }
    else if (f.role !== NF) { when = `ผู้ใช้ที่ไม่ใช่ ${f.role} พยายามทำรายการ`; then = "ระบบต้องปฏิเสธการทำรายการ"; origin = "AI Recommendation"; explain = `Test Case นี้ตรวจสอบว่าเฉพาะ ${f.role} เท่านั้นที่ทำรายการได้`; }
    else { when = "ส่งข้อมูลที่ Required field ว่างหรือรูปแบบไม่ถูกต้อง"; then = "ระบบต้องแสดง Validation Error"; origin = "Existing Validation Rule"; explain = "Test Case นี้ตรวจสอบว่าระบบป้องกันข้อมูลไม่ถูกต้อง"; }
    steps = [base, { n: 2, action: when, data: "ข้อมูล Synthetic ที่เข้าข่ายกรณี Negative", expected: then, origin }, { n: 3, action: "ตรวจผลลัพธ์/ข้อมูลที่บันทึก", data: "-", expected: "ไม่มีข้อมูลที่ไม่เข้าเงื่อนไขปรากฏในผลลัพธ์", origin }];
  } else {
    const val = f.thresholdValue !== NF && f.thresholdOp !== NF ? (() => { const v = Number(f.thresholdValue); const x = f.thresholdOp.startsWith(">") ? v + (isMoney(f.unit) ? 1000 : 1) : f.thresholdOp.startsWith("<") ? Math.max(0, v - (isMoney(f.unit) ? 1000 : 1)) : v; return fmtNum(x, isMoney(f.unit) ? 2 : 0); })() : "ข้อมูล Synthetic ที่เข้าเงื่อนไข";
    when = `${f.input !== NF ? "ระบุ/ประมวลผล " + f.input : "ดำเนินการตาม Requirement"}${f.process !== NF ? " แล้ว" + f.process : ""}`;
    steps = [base, { n: 2, action: when, data: val, expected: "ระบบรับข้อมูลได้" }, { n: 3, action: `ตรวจสอบ ${f.output !== NF ? f.output : "ผลลัพธ์"}`, data: "-", expected: then }];
    if (s.type === "API") steps.push({ n: 4, action: "ตรวจ Status Code และ Response Body", data: "Endpoint: {{endpoint}} (NEEDS_CONFIGURATION)", expected: "Response ตรงตาม Contract", origin: "AI Recommendation" });
    if (s.type === "Data") steps.push({ n: 4, action: "Query ข้อมูลที่บันทึกด้วย SQL Template", data: "SQL Template (Read-only)", expected: "ข้อมูลใน Database ตรงกับผลลัพธ์บนหน้าจอ/API", origin: "AI Recommendation" });
    if (s.type === "Integration") steps.push({ n: 4, action: "ตรวจข้อมูลที่ระบบปลายทางได้รับ", data: "-", expected: "ข้อมูลครบถ้วนและตรงกัน", origin: "AI Recommendation" });
    testData = [{ value: val, expected: then, origin: "BRS Explicit Rule" }];
    explain = `Test Case นี้ตรวจสอบว่า ${f.preconditions !== NF ? f.preconditions + " " : ""}ระบบ${then.replace(/^ระบบ/, "")}`;
  }
  const n = nextSeq(`TC-${p.code}-${r.module}`);
  const data = {
    title: `${s.type}: ${r.title}`.slice(0, 120), description: r.originalText, businessExplanation: explain, given, when, then,
    preconditions: f.preconditions !== NF ? f.preconditions : "ข้อมูล Synthetic พร้อมใช้งาน", steps, testData, overallExpected: then, type: s.type,
    priority: pr.priority, risk: pr.risk, prReasons: pr.reasons, origin,
    automationCandidate: s.type === "Boundary" || s.type === "API" || s.type === "Positive" ? "Yes" : "Maybe",
    automationTool: s.type === "API" ? "Pytest + Postman" : (/UI/.test(r.type) ? "Playwright" : "Pytest"),
    assumption: acceptedAssumptions.map(a => "AI ASSUMPTION - NOT FOUND IN BRS: " + a).join("\n"), clarificationRef: clarRefs.join("\n")
  };
  return { id: uid(), tcId: `TC-${p.code}-${r.module}-${pad(n)}`, projectId: p.id, scenarioRef: s.id, reqRef: r.id, reqVersion: r.versions.length + 1, version: 1, status: "AI_GENERATED", locked: false, data, editedBy: "AI", history: [{ version: 1, at: now(), by: "AI", kind: "AI-generated", reason: "สร้างจาก Scenario " + s.tsId, snapshot: clone(data) }], approvals: [], comments: [], source: r.source, created: now(), reviewer: null, approvedBy: null, approvedAt: null };
}
function generateTestCases(scenarioIds) {
  let created = 0; const blocked = [];
  scenarioIds.forEach(id => {
    const s = S.scenarios.find(x => x.id === id); const r = S.requirements.find(x => x.id === s.reqRef); const p = S.projects.find(x => x.id === s.projectId);
    if (!r || ["NEEDS_CLARIFICATION", "CONFLICT"].includes(r.status) || r.status !== "APPROVED") { blocked.push(`${s.tsId} (Requirement ${r ? r.status : "missing"})`); return; }
    if (S.testCases.some(t => t.scenarioRef === s.id && t.status !== "DEPRECATED")) return;
    S.testCases.push(buildTestCase(s, r, p)); created++;
  });
  save(); return { created, blocked };
}

/* ============ Automation generators (§18–§26) ============ */
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const pyStr = s => JSON.stringify(String(s ?? ""));
function tcCtx(tc) { const r = S.requirements.find(x => x.id === tc.reqRef); return { tc, r, f: r ? r.fields : {}, d: tc.data }; }
function genPythonLayer(tcs, project) {
  const files = {}, tips = {};
  const rules = []; const seen = new Set();
  tcs.forEach(tc => { const { r, f } = tcCtx(tc); if (r && f.thresholdValue !== NF && f.thresholdOp !== NF && !seen.has(r.id)) { seen.add(r.id); rules.push({ r, f, fn: "meets_" + slug(r.reqId), const: slug(r.reqId).toUpperCase() + "_THRESHOLD", tcs: tcs.filter(t => t.reqRef === r.id).map(t => t.tcId) }); } });
  files["app/__init__.py"] = "";
  files["app/services/__init__.py"] = "";
  files["app/services/rule_service.py"] = `"""Business rules extracted from BRS (${project.code}).
Each constant links back to its Requirement ID and source page.
Generated by BRS to QA Automation Platform — review before running.
"""
from decimal import Decimal

${rules.map(x => `# ${x.r.reqId} | Source: ${x.r.source.docName} หน้า ${x.r.source.page} / ${x.r.source.section}
# BRS: ${x.r.originalText.replace(/\n/g, " ").slice(0, 150)}
${x.const} = Decimal(${pyStr(x.f.thresholdValue)})  # unit: ${x.f.unit}


def ${x.fn}(value: Decimal) -> bool:
    """Return True when value satisfies '${x.f.thresholdOp} ${x.f.thresholdValue}' (${x.r.reqId})."""
    return value ${x.f.thresholdOp === "=" ? "==" : x.f.thresholdOp} ${x.const}
`).join("\n\n") || "# ไม่มี Requirement ที่มี Threshold เชิงตัวเลขใน Test Case ที่เลือก\n"}
`;
  files["app/validators/__init__.py"] = "";
  files["app/validators/input_validator.py"] = `from decimal import Decimal, InvalidOperation


class ValidationError(ValueError):
    """Raised when a required value is empty (Validation Error)."""


class InvalidDataTypeError(ValueError):
    """Raised when a value is not numeric (Invalid Data Type)."""


def parse_amount(raw) -> Decimal:
    """Convert raw input to Decimal. Empty -> ValidationError, non-numeric -> InvalidDataTypeError."""
    if raw is None or str(raw).strip() == "":
        raise ValidationError("Validation Error")
    try:
        return Decimal(str(raw).replace(",", ""))
    except InvalidOperation as exc:
        raise InvalidDataTypeError("Invalid Data Type") from exc
`;
  files["app/utilities/__init__.py"] = "";
  files["app/utilities/date_helper.py"] = `from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

# AI ASSUMPTION - NOT FOUND IN BRS: timezone = Asia/Bangkok unless BA confirms otherwise
TZ = ZoneInfo("Asia/Bangkok")


def today() -> date:
    return datetime.now(TZ).date()


def days_back_range(days: int, end: date | None = None, inclusive: bool = True) -> tuple[date, date]:
    """Return (start, end) for a look-back window of 'days' calendar days."""
    end = end or today()
    start = end - timedelta(days=days - 1 if inclusive else days)
    return start, end


def in_range(d: date, start: date, end: date) -> bool:
    return start <= d <= end
`;
  files["app/utilities/file_helper.py"] = `from pathlib import Path

REPORT_DIR = Path(__file__).resolve().parents[2] / "reports"


def ensure_report_dir() -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    return REPORT_DIR
`;
  files["app/utilities/api_helper.py"] = `import os
import requests

# NEEDS_CONFIGURATION: set BASE_URL and AUTH_TYPE in .env (never commit .env)
BASE_URL = os.getenv("BASE_URL", "")
TIMEOUT = float(os.getenv("API_TIMEOUT", "30"))


def build_headers() -> dict:
    headers = {"Content-Type": "application/json"}
    token = os.getenv("API_TOKEN")
    if os.getenv("AUTH_TYPE", "none") == "bearer" and token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get(path: str, **params):
    if not BASE_URL:
        raise RuntimeError("NEEDS_CONFIGURATION: BASE_URL is empty")
    return requests.get(f"{BASE_URL}{path}", headers=build_headers(), params=params, timeout=TIMEOUT)
`;
  files["app/repositories/__init__.py"] = "";
  files["app/repositories/transaction_repository.py"] = `"""Repository pattern: all DB access goes through here (read-only by default).
NEEDS_CONFIGURATION: table/column names are placeholders until confirmed by BA/DBA.
"""
TRANSACTION_TABLE = "{{table_transaction}}"  # AI ASSUMPTION - NOT FOUND IN BRS


def select_by_customer_sql() -> str:
    return f"SELECT * FROM {TRANSACTION_TABLE} WHERE customer_id = %s AND txn_date BETWEEN %s AND %s"
`;
  files["test_data/__init__.py"] = "";
  files["test_data/factory.py"] = `"""Synthetic test data factory — never use real customer data."""
from dataclasses import dataclass, field
from decimal import Decimal
from itertools import count

_seq = count(1)


@dataclass
class Customer:
    customer_id: str = field(default_factory=lambda: f"CUST-TEST-{next(_seq):04d}")
    name: str = "Synthetic Customer"


@dataclass
class Transaction:
    customer: Customer
    amount: Decimal
    product: str = "GENERAL"


def make_transaction(amount, product: str = "GENERAL") -> Transaction:
    return Transaction(customer=Customer(), amount=Decimal(str(amount)), product=product)
`;
  files["config/__init__.py"] = "";
  files["config/settings.py"] = `import os
from dotenv import load_dotenv

load_dotenv()
ENV = os.getenv("TEST_ENV", "sit")
BASE_URL = os.getenv("BASE_URL", "")
`;
  tips["app/services/rule_service.py"] = [
    { code: "Decimal(\"...\")", purpose: "เก็บค่า Threshold จาก BRS", input: "ค่าตัวเลขจาก BRS", output: "ค่าคงที่ชนิด Decimal", why: "ใช้ Decimal แทน float เพราะตัวเลขจำนวนเงินต้องแม่นยำ float อาจทำให้ทศนิยมคลาดเคลื่อน เช่น 0.1+0.2", explain: "ค่าคงที่แต่ละตัวมี Comment บอก Requirement ID และหน้าที่มา ถ้า BRS เปลี่ยนค่าแก้ที่จุดเดียว", tc: rules.flatMap(x => x.tcs).join(", ") || "-", caution: "ห้ามแก้ค่าให้ต่างจาก BRS โดยไม่มี Clarification", fix: "ตรวจว่าค่าและเครื่องหมายตรงกับ Requirement ที่ Approved" },
    { code: "def meets_...(value)", purpose: "ตัดสินว่าค่าเข้าเงื่อนไข Business Rule หรือไม่", input: "value: Decimal", output: "True/False", why: "แยก Business Logic ออกจาก Test Function ทำให้ Test สั้นและนำ Logic ไปใช้ซ้ำได้ (Service Pattern)", explain: "ฟังก์ชันเปรียบเทียบค่ากับ Threshold ด้วยเครื่องหมายที่ BRS ระบุ", tc: rules.flatMap(x => x.tcs).join(", ") || "-", caution: "เครื่องหมาย > กับ >= ให้ผลต่างกันที่ค่าขอบพอดี", fix: "ยืนยันเครื่องหมายกับ BA หากยังมี Clarification ค้าง" }
  ];
  tips["app/validators/input_validator.py"] = [{ code: "parse_amount(raw)", purpose: "แปลงค่าที่รับเข้ามาเป็นจำนวนเงิน", input: "ข้อความหรือตัวเลข", output: "Decimal หรือ Error", why: "รวมการตรวจค่าว่างและชนิดข้อมูลไว้ที่เดียว (Validation Helper)", explain: "ค่าว่างจะเกิด ValidationError ค่าที่ไม่ใช่ตัวเลขจะเกิด InvalidDataTypeError", tc: tcs.map(t => t.tcId).join(", "), caution: "ชื่อ Error ต้องตรงกับ Expected Result ใน Test Case", fix: "ถ้า BRS ระบุ Error Message ให้แก้ข้อความให้ตรง" }];
  tips["app/utilities/date_helper.py"] = [{ code: "ZoneInfo(\"Asia/Bangkok\")", purpose: "กำหนด Timezone ของวันที่", input: "-", output: "วันที่ตามเวลาประเทศไทย", why: "ถ้าไม่ระบุ Timezone ผลการนับวันอาจคลาดเมื่อ Run บน Server ต่างประเทศหรือ GitHub Actions", explain: "days_back_range คืนวันเริ่มและวันสิ้นสุดของช่วงย้อนหลัง", tc: "-", caution: "เป็น AI ASSUMPTION จนกว่า BA ยืนยัน", fix: "ตรวจว่า Calendar Day/Business Day ตรงกับคำตอบ BA" }];
  tips["test_data/factory.py"] = [{ code: "make_transaction()", purpose: "สร้างข้อมูลทดสอบแบบ Synthetic", input: "amount, product", output: "Transaction", why: "Test Data Factory ทำให้ Test ไม่ใช้ข้อมูลลูกค้าจริงและสร้างข้อมูลใหม่ได้ทุกครั้ง", explain: "Customer ID ขึ้นต้นด้วย CUST-TEST- เพื่อแยกจากข้อมูลจริง", tc: tcs.map(t => t.tcId).join(", "), caution: "ห้ามแทนด้วย Customer ID จริง", fix: "-" }];
  tips["app/utilities/api_helper.py"] = [{ code: "BASE_URL = os.getenv(...)", purpose: "อ่าน URL ของระบบที่จะทดสอบจาก Environment", input: ".env", output: "URL", why: "ห้าม Hardcode URL/Token ใน Code เพื่อไม่ให้ Secret หลุดเข้า Git", explain: "build_headers ใส่ Token เฉพาะเมื่อกำหนด AUTH_TYPE=bearer", tc: "-", caution: "Authentication ยังไม่ทราบ (NEEDS_CONFIGURATION)", fix: "กำหนด BASE_URL, AUTH_TYPE ใน .env" }];
  return { files, tips };
}
function genPytestLayer(tcs, project) {
  const py = genPythonLayer(tcs, project); const files = { ...py.files }, tips = { ...py.tips };
  const byModule = {};
  tcs.forEach(tc => { const { r } = tcCtx(tc); const m = r ? r.module : "GENERAL"; (byModule[m] = byModule[m] || []).push(tc); });
  Object.entries(byModule).forEach(([m, list]) => {
    const path = `tests/unit/test_${slug(m)}.py`;
    const parts = [`"""Tests for module ${m} — generated from APPROVED test cases only."""
import pytest
from decimal import Decimal

from app.services import rule_service
from app.validators.input_validator import parse_amount, ValidationError, InvalidDataTypeError
`];
    list.forEach(tc => {
      const { r, f, d } = tcCtx(tc); const fname = `test_${slug(tc.tcId)}_${slug(d.type)}`;
      const header = `\n\n# ${tc.tcId} v${tc.version} | ${r ? r.reqId : "-"} | ${d.title.replace(/\n/g, " ").slice(0, 90)}\n# Given: ${d.given.slice(0, 140)}\n# When: ${d.when.slice(0, 140)}\n# Then: ${d.then.slice(0, 140)}`;
      if (d.type === "Boundary" && r && f.thresholdOp !== NF) {
        const fn = "meets_" + slug(r.reqId);
        const cases = d.testData.map(x => {
          const exp = x.expected === "เข้าเงื่อนไข" ? "True" : x.expected === "ไม่เข้าเงื่อนไข" ? "False" : x.expected === "Validation Error" ? "ValidationError" : "InvalidDataTypeError";
          return `        pytest.param(${pyStr(x.raw)}, ${exp}, id=${pyStr(x.note + (x.label ? " [AI RECOMMENDED]" : ""))}),`;
        }).join("\n");
        parts.push(`${header}
@pytest.mark.testcase("${tc.tcId}")
@pytest.mark.parametrize(
    "raw_value, expected",
    [
${cases}
    ],
)
def ${fname}(raw_value, expected):
    if isinstance(expected, type) and issubclass(expected, Exception):
        with pytest.raises(expected):
            parse_amount(raw_value)
        return
    assert rule_service.${fn}(parse_amount(raw_value)) is expected
`);
      } else {
        parts.push(`${header}
@pytest.mark.testcase("${tc.tcId}")
@pytest.mark.skip(reason="NEEDS_CONFIGURATION: ${d.type} test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน ${tc.tcId}")
def ${fname}(synthetic_transaction):
${d.steps.map(s => `    # Step ${s.n}: ${String(s.action).replace(/\n/g, " ").slice(0, 100)} | Data: ${String(s.data).slice(0, 60)} | Expected: ${String(s.expected).slice(0, 80)}`).join("\n")}
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")
`);
      }
    });
    files[path] = parts.join("");
    tips[path] = [
      { code: "@pytest.mark.parametrize", purpose: "รันหลายค่าขอบด้วย Test Function เดียว", input: "รายการค่า Boundary จาก Test Case", output: "ผล Pass/Fail แยกตามค่า", why: "ใช้ parametrize เพราะ Test Case มี Boundary หลายค่าแต่ใช้ Logic เดียวกัน จึงลดการเขียน Test ซ้ำ", explain: "แต่ละ pytest.param คือ 1 Step ใน Test Case และ id บอกว่าเป็นค่าขอบแบบไหน", tc: list.map(t => t.tcId).join(", "), caution: "ค่าที่ติด [AI RECOMMENDED] ไม่มีใน BRS ต้องให้ QA ยืนยัน", fix: "ตรวจ Expected ของค่าว่างและค่าผิดชนิดกับ BA" },
      { code: "@pytest.mark.testcase(\"TC-...\")", purpose: "เชื่อม Test กับ Test Case ID", input: "Test Case ID", output: "Marker ใน Report", why: "ทำ Traceability จากผล Run กลับไปหา Test Case และ Requirement", explain: "Marker นี้ลงทะเบียนใน pytest.ini แล้ว", tc: list.map(t => t.tcId).join(", "), caution: "ห้ามลบ Marker", fix: "-" },
      { code: "@pytest.mark.skip(reason=\"NEEDS_CONFIGURATION...\")", purpose: "กัน Test ที่ยังเชื่อมระบบจริงไม่ได้", input: "-", output: "สถานะ Skipped (นับเป็น Blocked บน Dashboard)", why: "ห้ามเดา URL, Auth หรือชื่อตาราง จึงข้ามไว้จนกว่าจะตั้งค่า", explain: "ใน Function มี Step จาก Test Case เป็น Comment ให้ QA เขียนต่อ", tc: list.map(t => t.tcId).join(", "), caution: "อย่าลบ skip ก่อนตั้งค่า .env", fix: "ตั้งค่า BASE_URL/Auth แล้วลบ skip" }
    ];
  });
  files["conftest.py"] = `import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from test_data.factory import make_transaction  # noqa: E402


@pytest.fixture
def synthetic_transaction():
    """Shared synthetic transaction (no real customer data)."""
    return make_transaction("1000.00")
`;
  files["pytest.ini"] = `[pytest]
testpaths = tests
markers =
    testcase(id): link a test to a QA Test Case ID for traceability
addopts = -ra --junitxml=reports/junit.xml --html=reports/report.html --self-contained-html
`;
  files["requirements.txt"] = "pytest==8.3.3\npytest-html==4.1.1\nrequests==2.32.3\npython-dotenv==1.0.1\nplaywright==1.47.0\npytest-playwright==0.5.2\n";
  files[".env.example"] = "TEST_ENV=sit\nBASE_URL=\nAUTH_TYPE=none\nAPI_TOKEN=\nAPP_USERNAME=\nAPP_PASSWORD=\n";
  files[".gitignore"] = ".env\n.auth/\n__pycache__/\n.pytest_cache/\nreports/\nscreenshots/\n*.session\n*.har\n";
  files["README.md"] = `# ${project.name} — Automation (${project.code})\n\nGenerated from APPROVED test cases: ${tcs.map(t => t.tcId).join(", ")}\n\n## Run\n\n\`\`\`bash\npython -m venv .venv\n.venv\\Scripts\\activate   # Windows\npip install -r requirements.txt\ncopy .env.example .env\npytest\n\`\`\`\n\nReports: reports/report.html, reports/junit.xml (import back into the platform: Test Runs → Import JUnit XML).\n`;
  ["tests/__init__.py", "tests/unit/__init__.py", "tests/integration/.gitkeep", "tests/api/.gitkeep", "tests/ui/.gitkeep", "tests/data/.gitkeep", "pages/.gitkeep", "components/.gitkeep", "fixtures/.gitkeep", "reports/.gitkeep", "screenshots/.gitkeep"].forEach(p => files[p] = files[p] || "");
  tips["conftest.py"] = [{ code: "@pytest.fixture", purpose: "เตรียมข้อมูลพื้นฐานที่หลาย Test ใช้ร่วมกัน", input: "-", output: "synthetic_transaction", why: "Fixture ทำให้แก้ข้อมูลกลางได้จากจุดเดียว", explain: "ทุก Test ได้ Object ใหม่ จึงทำงานอิสระ ไม่พึ่งลำดับ", tc: tcs.map(t => t.tcId).join(", "), caution: "อย่าเก็บ State ข้าม Test", fix: "-" }];
  tips["pytest.ini"] = [{ code: "addopts = ... --html", purpose: "ตั้งค่า Report", input: "-", output: "reports/report.html, junit.xml", why: "ได้ HTML Report ให้คนอ่าน และ JUnit XML ให้ระบบนำเข้าผล", explain: "markers ลงทะเบียน testcase เพื่อไม่ให้เกิด Warning", tc: "-", caution: "-", fix: "-" }];
  return { files, tips };
}
function genPostman(tcs, project, auth) {
  const authBlock = { none: { type: "noauth" }, basic: { type: "basic", basic: [{ key: "username", value: "{{username}}" }, { key: "password", value: "{{password}}" }] }, bearer: { type: "bearer", bearer: [{ key: "token", value: "{{token}}" }] }, apikey: { type: "apikey", apikey: [{ key: "key", value: "{{api_key_header}}" }, { key: "value", value: "{{api_key}}" }] }, oauth2: { type: "oauth2", oauth2: [{ key: "accessTokenUrl", value: "{{oauth_token_url}}" }, { key: "clientId", value: "{{client_id}}" }, { key: "clientSecret", value: "{{client_secret}}" }] }, cookie: { type: "noauth" } };
  const items = tcs.map(tc => {
    const { r, d } = tcCtx(tc);
    const tests = [
      `// ${tc.tcId} | ${r ? r.reqId : "-"}`,
      `pm.test("${tc.tcId} status code (NEEDS_CONFIGURATION: expected code)", function () { pm.expect(pm.response.code).to.be.oneOf([200, 201]); });`,
      d.type === "Negative" ? `pm.test("${tc.tcId} rejects invalid data", function () { pm.expect(pm.response.code).to.be.within(400, 499); });` : `pm.test("${tc.tcId} has JSON body", function () { pm.response.to.be.json; });`
    ];
    return { name: `${tc.tcId} — ${d.title.slice(0, 60)}`, event: [{ listen: "test", script: { type: "text/javascript", exec: tests } }], request: { method: "POST", header: [{ key: "Content-Type", value: "application/json" }, ...(auth === "cookie" ? [{ key: "Cookie", value: "{{session_cookie}}" }] : [])], url: { raw: `{{base_url}}{{endpoint_${slug(tc.tcId)}}}`, host: ["{{base_url}}"], path: [`{{endpoint_${slug(tc.tcId)}}}`] }, body: { mode: "raw", raw: JSON.stringify({ customer_id: "{{customer_id}}", amount: (d.testData[0] && d.testData[0].raw !== undefined ? String(d.testData[0].raw) : "{{amount}}") }, null, 2) }, description: `NEEDS_CONFIGURATION: method/endpoint ยังไม่ทราบจาก BRS\nGiven: ${d.given}\nWhen: ${d.when}\nThen: ${d.then}` } };
  });
  const collection = { info: { name: `${project.code} API Tests`, schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json", description: `Auth: ${auth === "none" ? "NEEDS_CONFIGURATION" : auth}` }, auth: authBlock[auth] || authBlock.none, item: items };
  const env = { name: `${project.code}-SIT`, values: [{ key: "base_url", value: "", enabled: true }, { key: "customer_id", value: "CUST-TEST-0001", enabled: true }, ...tcs.map(tc => ({ key: `endpoint_${slug(tc.tcId)}`, value: "", enabled: true })), ...(auth === "bearer" ? [{ key: "token", value: "", type: "secret", enabled: true }] : []), ...(auth === "basic" ? [{ key: "username", value: "", enabled: true }, { key: "password", value: "", type: "secret", enabled: true }] : [])] };
  return { files: { [`postman/${project.code}.postman_collection.json`]: JSON.stringify(collection, null, 2), [`postman/${project.code}-SIT.postman_environment.json`]: JSON.stringify(env, null, 2) }, tips: {} };
}
const SQL_TYPES = { duplicate: "Duplicate Check", missing: "Missing Record", api_db: "API กับ Database ตรงกัน", ui_db: "UI กับ Database ตรงกัน", aggregation: "Aggregation", status: "Status", event: "Event", persistence: "Data Persistence", mapping: "Field Mapping" };
function genSql(tcs, project, types) {
  const tmpl = {
    duplicate: `SELECT {{key_column}}, COUNT(*) AS dup_count\nFROM {{table_name}}\nWHERE {{date_column}} BETWEEN {{start_date}} AND {{end_date}}\nGROUP BY {{key_column}}\nHAVING COUNT(*) > 1;`,
    missing: `SELECT s.{{key_column}}\nFROM {{source_table}} s\nLEFT JOIN {{target_table}} t ON t.{{key_column}} = s.{{key_column}}\nWHERE t.{{key_column}} IS NULL\n  AND s.{{date_column}} BETWEEN {{start_date}} AND {{end_date}};`,
    api_db: `-- เปรียบเทียบกับ API Response ของ {{customer_id}}\nSELECT {{field_list}}\nFROM {{table_name}}\nWHERE customer_id = {{customer_id}};`,
    ui_db: `-- ค่าที่ต้องตรงกับหน้าจอ\nSELECT {{display_columns}}\nFROM {{table_name}}\nWHERE customer_id = {{customer_id}}\nORDER BY {{date_column}} DESC\nLIMIT 50;`,
    aggregation: `SELECT customer_id, SUM({{amount_column}}) AS total_amount, COUNT(*) AS txn_count\nFROM {{table_name}}\nWHERE {{date_column}} BETWEEN {{start_date}} AND {{end_date}}\n  AND {{exclusion_condition}}\nGROUP BY customer_id\nHAVING SUM({{amount_column}}) {{operator}} {{threshold}};`,
    status: `SELECT {{key_column}}, status\nFROM {{table_name}}\nWHERE {{key_column}} = {{record_id}}\n  AND status = {{expected_status}};`,
    event: `SELECT event_type, created_at\nFROM {{event_table}}\nWHERE {{key_column}} = {{record_id}}\nORDER BY created_at;`,
    persistence: `SELECT *\nFROM {{table_name}}\nWHERE {{key_column}} = {{record_id}};`,
    mapping: `SELECT {{source_column}} AS source_value, {{target_column}} AS target_value\nFROM {{table_name}}\nWHERE {{source_column}} <> {{target_column}};`
  };
  const out = [`-- Dialect: MySQL 8.x | Read-only templates | Project: ${project.code}\n-- ห้ามใส่ Password / Connection String / Customer ID จริง\n-- Placeholder {{...}} ทั้งหมดต้องแทนค่าก่อน Run\n-- AI ASSUMPTION - NOT FOUND IN BRS: ชื่อตารางและคอลัมน์ทั้งหมดเป็น Placeholder (NEEDS_CONFIGURATION)\n`];
  tcs.forEach(tc => {
    const { r, f } = tcCtx(tc);
    types.forEach(t => {
      let q = tmpl[t];
      if (t === "aggregation" && r && f.thresholdOp !== NF) q = q.replace("{{operator}}", f.thresholdOp).replace("{{threshold}}", f.thresholdValue + ` /* ${r.reqId} หน้า ${r.source.page} */`);
      out.push(`\n-- ${tc.tcId} | ${r ? r.reqId : "-"} | ${SQL_TYPES[t]}\n${q}`);
    });
  });
  return { files: { [`sql/${project.code}_mysql_templates.sql`]: out.join("\n") + "\n" }, tips: { [`sql/${project.code}_mysql_templates.sql`]: [{ code: "{{placeholder}}", purpose: "ตำแหน่งที่ต้องแทนค่าก่อน Run", input: "ค่าจริงจาก Environment ทดสอบ", output: "SQL ที่พร้อม Run", why: "ป้องกันการใส่ข้อมูลลูกค้าจริงและ Connection String ลงใน Script", explain: "ทุก Query เป็น SELECT (Read-only)", tc: tcs.map(t => t.tcId).join(", "), caution: "ชื่อตารางเป็น Assumption", fix: "ยืนยันชื่อตาราง/คอลัมน์กับ DBA" }] } };
}
function genPlaywright(tcs, project, opts) {
  const files = {}, tips = {};
  const pageName = slug(opts.pageName || "target") + "_page"; const cls = (opts.pageName || "Target").replace(/[^A-Za-z0-9]/g, "") + "Page";
  files["pages/__init__.py"] = "";
  files["pages/base_page.py"] = `from playwright.sync_api import Page


class BasePage:
    def __init__(self, page: Page, base_url: str):
        self.page = page
        self.base_url = base_url

    def open(self, path: str = ""):
        self.page.goto(f"{self.base_url}{path}")

    def manual_checkpoint(self, reason: str):
        """Pause for the human to complete OTP / CAPTCHA. Never automate these."""
        print(f"MANUAL CHECKPOINT: {reason} — complete it in the browser, then press Resume in the inspector")
        self.page.pause()
`;
  const locs = (opts.locators || []).length ? opts.locators : [{ name: "username_input", strategy: "get_by_label", value: "Username" }, { name: "password_input", strategy: "get_by_label", value: "Password" }, { name: "login_button", strategy: "get_by_role", value: "button|Login" }, { name: "result_table", strategy: "get_by_test_id", value: "NEEDS_CONFIGURATION" }];
  const locExpr = l => l.strategy === "get_by_role" ? `self.page.get_by_role(${pyStr(l.value.split("|")[0])}, name=${pyStr(l.value.split("|")[1] || "")})` : l.strategy === "css" ? `self.page.locator(${pyStr(l.value)})` : l.strategy === "xpath" ? `self.page.locator(${pyStr("xpath=" + l.value)})  # XPath = ตัวเลือกสุดท้าย` : `self.page.${l.strategy}(${pyStr(l.value)})`;
  files[`pages/${pageName}.py`] = `from pages.base_page import BasePage


class ${cls}(BasePage):
    """Page Object for ${opts.pageName || "target page"}.
    Locator priority: data-testid > role > label > text > CSS > XPath.
    """

${locs.map(l => `    @property\n    def ${slug(l.name)}(self):\n        return ${locExpr(l)}\n`).join("\n")}
    def login(self, username: str, password: str):
        self.username_input.fill(username)
        self.password_input.fill(password)
        self.login_button.click()
`;
  files["tests/ui/conftest.py"] = `import os
from pathlib import Path

import pytest

AUTH_DIR = Path(".auth")  # restricted dir, git-ignored


@pytest.fixture(scope="session")
def base_url_env():
    url = os.getenv("BASE_URL", "")
    if not url:
        pytest.skip("NEEDS_CONFIGURATION: BASE_URL")
    return url


@pytest.fixture(scope="session")
def credentials():
    user, pw = os.getenv("APP_USERNAME"), os.getenv("APP_PASSWORD")
    if not user or not pw:
        pytest.skip("NEEDS_CONFIGURATION: APP_USERNAME / APP_PASSWORD in .env")
    return user, pw


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    if rep.when == "call" and rep.failed and "page" in item.funcargs:
        Path("screenshots").mkdir(exist_ok=True)
        item.funcargs["page"].screenshot(path=f"screenshots/{item.name}.png", full_page=True)
`;
  tcs.forEach(tc => {
    const { r, d } = tcCtx(tc);
    files[`tests/ui/test_${slug(tc.tcId)}.py`] = `"""${tc.tcId} | ${r ? r.reqId : "-"} | ${d.title.replace(/"/g, "'").slice(0, 80)}"""
import pytest
from pages.${pageName} import ${cls}


@pytest.mark.testcase("${tc.tcId}")
def test_${slug(tc.tcId)}_ui(page, base_url_env, credentials):
    po = ${cls}(page, base_url_env)
    po.open("${opts.loginPath || "/"}")
    po.login(*credentials)
${opts.otp ? `    po.manual_checkpoint("กรอก OTP ด้วยตนเอง")\n` : ""}${opts.captcha ? `    po.manual_checkpoint("ทำ CAPTCHA ด้วยตนเอง — ระบบไม่อ่านหรือข้าม CAPTCHA")\n` : ""}${d.steps.slice(1).map(s => `    # Step ${s.n}: ${String(s.action).replace(/\n/g, " ").slice(0, 100)} | Expected: ${String(s.expected).slice(0, 80)}`).join("\n")}
    assert po.result_table.is_visible()  # NEEDS_CONFIGURATION: replace with real assertion
`;
  });
  files["playwright.config.md"] = `Browsers: ${opts.browser || "chromium"} (headed). Run:\n  pytest tests/ui --headed --browser ${opts.browser === "msedge" ? "chromium --browser-channel msedge" : (opts.browser || "chromium")} --tracing retain-on-failure\n`;
  tips[`pages/${pageName}.py`] = [{ code: "class ...Page(BasePage)", purpose: "รวม Locator และการใช้งานหน้าเว็บไว้ที่เดียว", input: "Playwright page", output: "Methods สำหรับใช้งานหน้าเว็บ", why: "Page Object Model ช่วยแยก Locator ออกจาก Test Case ทำให้ดูแลง่ายเมื่อ UI เปลี่ยน", explain: "Locator เรียงตามลำดับความเสถียร data-testid ก่อน XPath เป็นตัวสุดท้าย", tc: tcs.map(t => t.tcId).join(", "), caution: "Locator ที่เป็น NEEDS_CONFIGURATION ต้องแก้ก่อน", fix: "เปิดหน้าเว็บจริงแล้วตรวจ Locator ทุกตัว" }];
  tips["pages/base_page.py"] = [{ code: "manual_checkpoint()", purpose: "หยุดให้ผู้ใช้กรอก OTP/ทำ CAPTCHA เอง", input: "เหตุผล", output: "Browser หยุดรอ", why: "ระบบห้ามอ่านหรือข้าม CAPTCHA และห้ามเก็บ OTP", explain: "page.pause() เปิด Inspector ให้กด Resume หลังทำเสร็จ", tc: "-", caution: "ใช้ได้เฉพาะ Headed Mode", fix: "-" }];
  tips["tests/ui/conftest.py"] = [{ code: "pytest_runtest_makereport", purpose: "ถ่าย Screenshot เมื่อ Test Fail", input: "ผล Test", output: "screenshots/*.png", why: "มีหลักฐานประกอบ Defect", explain: "Hook ทำงานหลัง Test แต่ละข้อ", tc: tcs.map(t => t.tcId).join(", "), caution: "Screenshot อาจมีข้อมูลบนหน้าจอ ห้าม Commit", fix: "-" }];
  return { files, tips };
}
function genJmeter(tcs, project, prof) {
  const x = s => esc(s);
  const samplers = tcs.map(tc => `        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${x(tc.tcId)}" enabled="true">
          <stringProp name="HTTPSampler.domain">\${target_host}</stringProp>
          <stringProp name="HTTPSampler.protocol">https</stringProp>
          <stringProp name="HTTPSampler.path">\${endpoint_${slug(tc.tcId)}}</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments"><elementProp name="" elementType="HTTPArgument"><boolProp name="HTTPArgument.always_encode">false</boolProp><stringProp name="Argument.value">{"customer_id":"\${customer_id}","amount":"\${amount}"}</stringProp></elementProp></collectionProp></elementProp>
        </HTTPSamplerProxy>
        <hashTree>
          <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Status 2xx" enabled="true"><collectionProp name="Asserion.test_strings"><stringProp name="0">2\\d\\d</stringProp></collectionProp><stringProp name="Assertion.test_field">Assertion.response_code</stringProp><intProp name="Assertion.test_type">1</intProp></ResponseAssertion>
          <hashTree/>
        </hashTree>`).join("\n");
  const host = (() => { try { return new URL(prof.url).host; } catch { return "NEEDS_CONFIGURATION"; } })();
  const jmx = `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${project.code} ${prof.type} test | Target: ${x(prof.url)} | Generated for review only — requires approval before run -->
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${x(project.code)} ${x(prof.type)} Test" enabled="true">
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments"><collectionProp name="Arguments.arguments">
        <elementProp name="target_host" elementType="Argument"><stringProp name="Argument.name">target_host</stringProp><stringProp name="Argument.value">${x(host)}</stringProp></elementProp>
${tcs.map(tc => `        <elementProp name="endpoint_${slug(tc.tcId)}" elementType="Argument"><stringProp name="Argument.name">endpoint_${slug(tc.tcId)}</stringProp><stringProp name="Argument.value">/NEEDS_CONFIGURATION</stringProp></elementProp>`).join("\n")}
      </collectionProp></elementProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${x(prof.type)} Users" enabled="true">
        <stringProp name="ThreadGroup.num_threads">${prof.users}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${prof.ramp}</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">${prof.minutes * 60}</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController"><boolProp name="LoopController.continue_forever">false</boolProp><intProp name="LoopController.loops">-1</intProp></elementProp>
      </ThreadGroup>
      <hashTree>
        <CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="Synthetic data" enabled="true"><stringProp name="filename">test_data.csv</stringProp><stringProp name="variableNames">customer_id,amount</stringProp><stringProp name="delimiter">,</stringProp><boolProp name="recycle">true</boolProp></CSVDataSet>
        <hashTree/>
${samplers}
        <ResultCollector guiclass="SummaryReport" testclass="ResultCollector" testname="Summary (TPS, Error %, Response Time, Throughput)" enabled="true"><stringProp name="filename">results.jtl</stringProp></ResultCollector>
        <hashTree/>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>
`;
  const csv = "customer_id,amount\n" + Array.from({ length: 20 }, (_, i) => `CUST-TEST-${pad(i + 1, 4)},${(1000 + i * 250).toFixed(2)}`).join("\n") + "\n";
  return { files: { [`jmeter/${project.code}_${slug(prof.type)}.jmx`]: jmx, "jmeter/test_data.csv": csv, "jmeter/profile.json": JSON.stringify(prof, null, 2) }, tips: {} };
}
function genGithubWorkflow(project) {
  return `name: ${project.code} QA Automation (manual)

on:
  workflow_dispatch:
    inputs:
      suite:
        description: "Test suite to run"
        required: true
        default: "unit"
        type: choice
        options: [unit, ui, all]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      BASE_URL: \${{ secrets.BASE_URL }}
      APP_USERNAME: \${{ secrets.APP_USERNAME }}
      APP_PASSWORD: \${{ secrets.APP_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - if: \${{ inputs.suite != 'unit' }}
        run: python -m playwright install --with-deps chromium
      - name: Run pytest
        run: |
          if [ "\${{ inputs.suite }}" = "unit" ]; then pytest tests/unit; elif [ "\${{ inputs.suite }}" = "ui" ]; then pytest tests/ui; else pytest; fi
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-reports
          path: |
            reports/
            screenshots/
`;
}
const FORBIDDEN_FILES = [/(^|\/)\.env$/, /\.auth\//, /\.session$/, /(^|\/)(secrets?|credentials?)\./i, /\.har$/, /storage_state/i];
const SECRET_CONTENT = [/ghp_[A-Za-z0-9]{20,}/, /sk-ant-[A-Za-z0-9_\-]{10,}/, /password\s*=\s*['"][^'"{}]+['"]/i, /\b\d{13}\b/];
function scanFilesForSecrets(files) {
  const problems = [];
  Object.entries(files).forEach(([p, c]) => {
    if (FORBIDDEN_FILES.some(re => re.test(p))) problems.push(`${p}: ไฟล์ต้องห้าม (.env/session/credential)`);
    SECRET_CONTENT.forEach(re => { if (re.test(c)) problems.push(`${p}: พบข้อมูลที่อาจเป็น Secret/Customer ID (${re.source.slice(0, 20)}…)`); });
  });
  return problems;
}
function lineDiff(a, b) {
  const A = String(a || "").split("\n"), B = String(b || "").split("\n");
  if (A.length * B.length > 4e6) return [{ t: "c", s: "(ไฟล์ใหญ่เกินกว่าจะแสดง Diff)" }];
  const m = A.length, n = B.length, dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < m && j < n) { if (A[i] === B[j]) { out.push({ t: "c", s: A[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: "d", s: A[i++] }); else out.push({ t: "a", s: B[j++] }); }
  while (i < m) out.push({ t: "d", s: A[i++] }); while (j < n) out.push({ t: "a", s: B[j++] });
  return out;
}
const renderDiff = (a, b, ctx = 2) => {
  const d = lineDiff(a, b); const keep = new Set();
  d.forEach((x, i) => { if (x.t !== "c") for (let k = i - ctx; k <= i + ctx; k++) keep.add(k); });
  if (!keep.size) return `<div class="diff"><span class="c">(ไม่มีความเปลี่ยนแปลง)</span></div>`;
  let last = -2; return `<div class="diff">${d.map((x, i) => { if (!keep.has(i)) return ""; const gap = i > last + 1 && last >= 0 ? `<span class="c">…</span>` : ""; last = i; return gap + `<span class="${x.t}">${x.t === "a" ? "+ " : x.t === "d" ? "- " : "  "}${esc(x.s)}</span>`; }).join("")}</div>`;
};

/* ============ Browser rule-engine runner & result import (§20) ============ */
function runRuleEngine(artifact, onProgress, isCancelled) {
  return new Promise(resolve => {
    const tcs = artifact.tcRefs.map(id => S.testCases.find(t => t.id === id)).filter(Boolean);
    const results = []; const log = []; let i = 0; const started = Date.now();
    const limitMs = S.settings.runnerTimeoutSec * 1000, maxLog = S.settings.runnerMaxLogKb * 1024;
    log.push(`============================= test session starts =============================`);
    log.push(`runner: browser rule-engine | artifact: ${artifact.name} | timeout: ${S.settings.runnerTimeoutSec}s`);
    const step = () => {
      if (isCancelled()) { log.push("!!! CANCELLED by user"); return resolve({ status: "CANCELLED", results, stdout: log.join("\n"), stderr: "", exitCode: 130 }); }
      if (Date.now() - started > limitMs) { log.push("!!! RUNNER TIMEOUT"); return resolve({ status: "FAILED", results, stdout: log.join("\n"), stderr: "Runner Timeout", exitCode: 124 }); }
      if (i >= tcs.length) {
        const c = s => results.filter(x => x.status === s).length;
        log.push(`======= ${c("PASSED")} passed, ${c("FAILED")} failed, ${c("BLOCKED")} blocked in ${((Date.now() - started) / 1000).toFixed(2)}s =======`);
        let out = log.join("\n"); if (out.length > maxLog) out = out.slice(0, maxLog) + "\n[log truncated]";
        return resolve({ status: c("FAILED") ? "FAILED" : "PASSED", results, stdout: mask(out), stderr: "", exitCode: c("FAILED") ? 1 : 0 });
      }
      const tc = tcs[i++]; const { r, f, d } = tcCtx(tc);
      if (d.type === "Boundary" && r && f.thresholdOp !== NF) {
        d.testData.forEach(row => {
          let actual;
          if (row.raw === "" || row.raw === null) actual = "Validation Error";
          else if (isNaN(Number(String(row.raw).replace(/,/g, "")))) actual = "Invalid Data Type";
          else actual = meets(f.thresholdOp, Number(String(row.raw).replace(/,/g, "")), Number(f.thresholdValue)) ? "เข้าเงื่อนไข" : "ไม่เข้าเงื่อนไข";
          const ok = actual === row.expected;
          const name = `tests/unit/test_${slug(r.module)}.py::test_${slug(tc.tcId)}_boundary[${row.note}]`;
          results.push({ tcId: tc.tcId, tcRef: tc.id, name, status: ok ? "PASSED" : "FAILED", message: ok ? "" : `expected ${row.expected} but rule ${f.thresholdOp} ${f.thresholdValue} gives ${actual}`, duration: 0.001 });
          log.push(`${name} ${ok ? "PASSED" : "FAILED"}`); if (!ok) log.push(`E   AssertionError: ${results[results.length - 1].message}`);
        });
      } else {
        const name = `tests/unit/test_${slug(r ? r.module : "general")}.py::test_${slug(tc.tcId)}_${slug(d.type)}`;
        results.push({ tcId: tc.tcId, tcRef: tc.id, name, status: "BLOCKED", message: "NEEDS_CONFIGURATION: ต้องเชื่อมระบบจริง (API/UI/DB)", duration: 0 });
        log.push(`${name} SKIPPED (NEEDS_CONFIGURATION)`);
      }
      onProgress(Math.round(i / tcs.length * 100), log);
      setTimeout(step, 120);
    };
    step();
  });
}
function parseJUnit(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw appError("INVALID_JUNIT", "ไฟล์ JUnit XML ไม่ถูกต้อง", "", false, "ใช้ไฟล์ reports/junit.xml จาก pytest");
  return [...doc.querySelectorAll("testcase")].map(tc => {
    const name = `${tc.getAttribute("classname") || ""}::${tc.getAttribute("name") || ""}`;
    const m = name.match(/tc_([a-z0-9]+)_([a-z0-9]+)_(\d{3})/i);
    const tcId = m ? `TC-${m[1].toUpperCase()}-${m[2].toUpperCase()}-${m[3]}` : NF;
    const failed = tc.querySelector("failure,error"), skipped = tc.querySelector("skipped");
    return { tcId, tcRef: (S.testCases.find(t => t.tcId === tcId) || {}).id || null, name, status: failed ? "FAILED" : skipped ? "BLOCKED" : "PASSED", message: failed ? (failed.getAttribute("message") || failed.textContent).slice(0, 500) : skipped ? (skipped.getAttribute("message") || "") : "", duration: Number(tc.getAttribute("time") || 0) };
  });
}
function parseNewman(json) {
  const runObj = json.run || json; const execs = runObj.executions || [];
  return execs.map(e => {
    const name = e.item ? e.item.name : "request"; const m = name.match(/TC-[A-Z0-9]+-[A-Z0-9]+-\d{3}/);
    const fails = (e.assertions || []).filter(a => a.error);
    return { tcId: m ? m[0] : NF, tcRef: m ? (S.testCases.find(t => t.tcId === m[0]) || {}).id : null, name, status: fails.length ? "FAILED" : "PASSED", message: fails.map(a => a.error.message).join("; ").slice(0, 500), duration: e.response ? (e.response.responseTime || 0) / 1000 : 0 };
  });
}

/* ============ Excel export (§37) ============ */
async function exportExcel(projectId) {
  await loadScript(LIB.xlsx);
  const p = S.projects.find(x => x.id === projectId);
  const reqs = S.requirements.filter(r => r.projectId === projectId && r.isLatest !== false);
  const tcs = S.testCases.filter(t => t.projectId === projectId);
  const scs = S.scenarios.filter(s => s.projectId === projectId);
  const rq = id => S.requirements.find(r => r.id === id) || {};
  const sheet = (rows, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = widths.map(w => ({ wch: w })); if (rows.length > 1) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) }; return ws; };
  const wb = XLSX.utils.book_new();
  const cnt = s => tcs.filter(t => t.status === s).length;
  XLSX.utils.book_append_sheet(wb, sheet([["Item", "Value"], ["Project", `${p.code} - ${p.name}`], ["Exported", fmtDate(now())], ["Exported by", me().username], ["Requirements", reqs.length], ["Needs Clarification", reqs.filter(r => r.status === "NEEDS_CLARIFICATION").length], ["Conflicts (open)", S.conflicts.filter(c => c.projectId === projectId && c.status === "OPEN").length], ["Test Scenarios", scs.length], ["Test Cases", tcs.length], ["Approved", cnt("APPROVED") + cnt("READY_FOR_AUTOMATION") + cnt("AUTOMATED")]], [26, 50]), "Summary");
  XLSX.utils.book_append_sheet(wb, sheet([["Requirement ID", "Version", "Type", "Module", "Title", "Original Text", "Expected Result", "Role", "Threshold", "Unit", "Date Range", "Inclusion", "Exclusion", "Source Doc", "Source Page", "Source Section", "Completeness", "Completeness Reasons", "Clarity", "Clarity Reasons", "Status"], ...reqs.map(r => [r.reqId, r.versions.length + 1, r.type, r.module, r.title, r.originalText, r.fields.expected, r.fields.role, r.fields.threshold, r.fields.unit, r.fields.dateRange, r.fields.inclusion, r.fields.exclusion, r.source.docName, r.source.page, r.source.section, r.completeness.score, r.completeness.reasons.map(x => (x.ok ? "✓ " : "✗ ") + x.text).join("\n"), r.clarity.score, r.clarity.reasons.map(x => (x.ok ? "✓ " : "✗ ") + x.text).join("\n"), r.status])], [24, 8, 18, 12, 36, 60, 36, 18, 14, 8, 18, 24, 24, 20, 10, 24, 12, 40, 8, 40, 20]), "Requirements");
  XLSX.utils.book_append_sheet(wb, sheet([["Requirement ID", "Question", "Answer", "Resolved", "Assumption", "Assumption State", "Source Page"], ...reqs.flatMap(r => r.questions.map(q => [r.reqId, q.text, q.answer, q.resolved ? "Yes" : "No", q.assumption ? "AI ASSUMPTION - NOT FOUND IN BRS: " + q.assumption.text : "", q.assumption ? q.assumption.state : "", r.source.page]))], [24, 50, 40, 10, 50, 14, 10]), "Clarification Questions");
  XLSX.utils.book_append_sheet(wb, sheet([["Requirement A", "Requirement B", "Differences", "Status", "Resolution", "Reason"], ...S.conflicts.filter(c => c.projectId === projectId).map(c => [rq(c.a).reqId, rq(c.b).reqId, c.diffs.map(d => `${d.field}: ${d.a} ≠ ${d.b}`).join("\n"), c.status, c.resolution || "", c.reason || ""])], [24, 24, 50, 12, 30, 40]), "Conflicts");
  XLSX.utils.book_append_sheet(wb, sheet([["Scenario ID", "Requirement ID", "Title", "Type", "Priority", "Risk", "Rationale", "Status"], ...scs.map(s => [s.tsId, rq(s.reqRef).reqId, s.title, s.type, s.priority, s.risk, s.rationale, s.status])], [24, 24, 50, 12, 10, 8, 50, 18]), "Test Scenarios");
  XLSX.utils.book_append_sheet(wb, sheet([["Test Case ID", "Version", "Scenario ID", "Requirement ID", "Requirement Version", "Title", "Business Explanation", "Given", "When", "Then", "Priority", "Risk", "Priority/Risk Reasons", "Origin", "Assumption", "Clarification", "Source Page", "Status", "Approved By", "Approved Date"], ...tcs.map(t => [t.tcId, t.version, (S.scenarios.find(s => s.id === t.scenarioRef) || {}).tsId, rq(t.reqRef).reqId, t.reqVersion, t.data.title, t.data.businessExplanation, t.data.given, t.data.when, t.data.then, t.data.priority, t.data.risk, (t.data.prReasons || []).join("\n"), t.data.origin, t.data.assumption, t.data.clarificationRef, t.source.page, t.status, t.approvedBy || "", t.approvedAt ? fmtDate(t.approvedAt) : ""])], [24, 8, 24, 24, 10, 40, 50, 40, 40, 40, 10, 8, 40, 18, 40, 40, 10, 20, 14, 16]), "Test Cases");
  XLSX.utils.book_append_sheet(wb, sheet([["Test Case ID", "Version", "Step", "Action", "Test Data", "Expected Result", "Origin/Label"], ...tcs.flatMap(t => t.data.steps.map(s => [t.tcId, t.version, s.n, s.action, s.data, s.expected, [s.origin, s.label].filter(Boolean).join(" | ")]))], [24, 8, 6, 50, 30, 40, 40]), "Test Steps");
  XLSX.utils.book_append_sheet(wb, sheet([["Test Case ID", "Value", "Expected", "Origin", "Label"], ...tcs.flatMap(t => (t.data.testData || []).map(d => [t.tcId, d.value, d.expected, d.origin, d.label || ""]))], [24, 20, 30, 20, 50]), "Test Data");
  XLSX.utils.book_append_sheet(wb, sheet([["Document", "Version", "Section", "Requirement ID", "Scenario ID", "Test Case ID", "Artifacts", "Last Run Result"], ...tcs.map(t => { const r = rq(t.reqRef); const arts = S.artifacts.filter(a => a.tcRefs.includes(t.id)); const lr = S.runs.filter(x => x.results.some(y => y.tcRef === t.id)).sort((a, b) => b.started.localeCompare(a.started))[0]; return [r.source?.docName, r.docVersion, r.source?.section, r.reqId, (S.scenarios.find(s => s.id === t.scenarioRef) || {}).tsId, t.tcId, arts.map(a => `${a.kind}:${a.name}`).join("\n"), lr ? lr.results.filter(y => y.tcRef === t.id).map(y => y.status).join(",") : ""]; })], [24, 8, 30, 24, 24, 24, 40, 20]), "Traceability");
  XLSX.utils.book_append_sheet(wb, sheet([["Test Case ID", "Status", "Automation Candidate", "Tool", "Artifacts", "Code (first artifact file)"], ...tcs.map(t => { const a = S.artifacts.find(x => x.tcRefs.includes(t.id) && x.kind === "pytest"); const code = a ? Object.entries(a.files).find(([p]) => p.startsWith("tests/unit")) : null; return [t.tcId, t.status, t.data.automationCandidate, t.data.automationTool, S.artifacts.filter(x => x.tcRefs.includes(t.id)).map(x => x.kind).join(", "), code ? code[1].slice(0, 32000) : ""]; })], [24, 20, 12, 18, 24, 80]), "Automation Status");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  audit("EXPORT", `${p.code} Excel`, `${tcs.length} test cases`);
  await downloadFile(`${p.code}_QA_TestCases_${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([buf]));
}
