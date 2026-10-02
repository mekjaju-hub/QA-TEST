from __future__ import annotations

from ..engine.text import NF
from .common import GenTC, tip

SQL_TYPES = {"duplicate": "Duplicate Check", "missing": "Missing Record", "api_db": "API กับ Database ตรงกัน", "ui_db": "UI กับ Database ตรงกัน",
             "aggregation": "Aggregation", "status": "Status", "event": "Event", "persistence": "Data Persistence", "mapping": "Field Mapping"}
TMPL = {
    "duplicate": "SELECT {{key_column}}, COUNT(*) AS dup_count\nFROM {{table_name}}\nWHERE {{date_column}} BETWEEN {{start_date}} AND {{end_date}}\nGROUP BY {{key_column}}\nHAVING COUNT(*) > 1;",
    "missing": "SELECT s.{{key_column}}\nFROM {{source_table}} s\nLEFT JOIN {{target_table}} t ON t.{{key_column}} = s.{{key_column}}\nWHERE t.{{key_column}} IS NULL\n  AND s.{{date_column}} BETWEEN {{start_date}} AND {{end_date}};",
    "api_db": "-- เปรียบเทียบกับ API Response ของ {{customer_id}}\nSELECT {{field_list}}\nFROM {{table_name}}\nWHERE customer_id = {{customer_id}};",
    "ui_db": "-- ค่าที่ต้องตรงกับหน้าจอ\nSELECT {{display_columns}}\nFROM {{table_name}}\nWHERE customer_id = {{customer_id}}\nORDER BY {{date_column}} DESC\nLIMIT 50;",
    "aggregation": "SELECT customer_id, SUM({{amount_column}}) AS total_amount, COUNT(*) AS txn_count\nFROM {{table_name}}\nWHERE {{date_column}} BETWEEN {{start_date}} AND {{end_date}}\n  AND {{exclusion_condition}}\nGROUP BY customer_id\nHAVING SUM({{amount_column}}) {{operator}} {{threshold}};",
    "status": "SELECT {{key_column}}, status\nFROM {{table_name}}\nWHERE {{key_column}} = {{record_id}}\n  AND status = {{expected_status}};",
    "event": "SELECT event_type, created_at\nFROM {{event_table}}\nWHERE {{key_column}} = {{record_id}}\nORDER BY created_at;",
    "persistence": "SELECT *\nFROM {{table_name}}\nWHERE {{key_column}} = {{record_id}};",
    "mapping": "SELECT {{source_column}} AS source_value, {{target_column}} AS target_value\nFROM {{table_name}}\nWHERE {{source_column}} <> {{target_column}};",
}
WRITE_RE = r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE)\b"


def gen_sql(tcs: list[GenTC], project: dict, types: list[str] | None = None) -> dict:
    types = [t for t in (types or ["duplicate", "aggregation"]) if t in TMPL] or ["duplicate"]
    out = [f"-- Dialect: MySQL 8.x | Read-only templates | Project: {project['code']}\n-- ห้ามใส่ Password / Connection String / Customer ID จริง\n"
           "-- Placeholder {{...}} ทั้งหมดต้องแทนค่าก่อน Run\n-- AI ASSUMPTION - NOT FOUND IN BRS: ชื่อตารางและคอลัมน์ทั้งหมดเป็น Placeholder (NEEDS_CONFIGURATION)\n"]
    for tc in tcs:
        r, f = tc.req, tc.f
        for t in types:
            q = TMPL[t]
            if t == "aggregation" and r and f["threshold_op"] != NF:
                q = q.replace("{{operator}}", f["threshold_op"]).replace("{{threshold}}", f"{f['threshold_value']} /* {r['req_id']} หน้า {r['source'].get('page')} */")
            out.append(f"\n-- {tc.tc_id} | {tc.req_id} | {SQL_TYPES[t]}\n{q}")
    path = f"sql/{project['code']}_mysql_templates.sql"
    return {"files": {path: "\n".join(out) + "\n"},
            "tips": {path: [tip("{{placeholder}}", "ตำแหน่งที่ต้องแทนค่าก่อน Run", "ค่าจริงจาก Environment ทดสอบ", "SQL ที่พร้อม Run",
                                "ป้องกันการใส่ข้อมูลลูกค้าจริงและ Connection String ลงใน Script", "ทุก Query เป็น SELECT (Read-only)",
                                ", ".join(t.tc_id for t in tcs), "ชื่อตารางเป็น Assumption", "ยืนยันชื่อตาราง/คอลัมน์กับ DBA")]}}
