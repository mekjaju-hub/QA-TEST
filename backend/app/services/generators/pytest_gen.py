from __future__ import annotations

from ..engine.text import NF
from ..testdesign import is_length
from .common import GenTC, one_line, py_str, slug, tip
from .python_gen import gen_python_layer

EXPECT = {"เข้าเงื่อนไข": "True", "ไม่เข้าเงื่อนไข": "False", "Validation Error": "ValidationError", "Invalid Data Type": "InvalidDataTypeError"}


def _raw_literal(raw: object) -> str:
    s = "" if raw is None else str(raw)
    if len(s) > 20 and len(set(s)) == 1:
        return f"{py_str(s[0])} * {len(s)}"
    return py_str(s)


def gen_pytest_layer(tcs: list[GenTC], project: dict) -> dict:
    py = gen_python_layer(tcs, project)
    files, tips = dict(py["files"]), dict(py["tips"])
    by_module: dict[str, list[GenTC]] = {}
    for tc in tcs:
        by_module.setdefault(tc.req["module"] if tc.req else "GENERAL", []).append(tc)
    for m, lst in by_module.items():
        path = f"tests/unit/test_{slug(m)}.py"
        parts = [f'"""Tests for module {m} — generated from APPROVED test cases only."""\n'
                 "import pytest\nfrom decimal import Decimal  # noqa: F401\n\n"
                 "from app.services import rule_service\n"
                 "from app.validators.input_validator import parse_amount, parse_text, ValidationError, InvalidDataTypeError  # noqa: F401\n"]
        for tc in lst:
            r, f, d = tc.req, tc.f, tc.data
            fname = f"test_{slug(tc.tc_id)}_{slug(d['type'])}"
            header = (f"\n\n# {tc.tc_id} v{tc.version} | {tc.req_id} | {one_line(d['title'], 90)}\n"
                      f"# Given: {one_line(d['given'], 140)}\n# When: {one_line(d['when'], 140)}\n# Then: {one_line(d['then'], 140)}")
            if d["type"] == "Boundary" and r and f["threshold_op"] != NF:
                fn = "meets_" + slug(r["req_id"])
                length = is_length(f["unit"])
                cases = "\n".join(
                    f"        pytest.param({_raw_literal(x.get('raw'))}, {EXPECT.get(x['expected'], 'InvalidDataTypeError')}, "
                    f"id={py_str(x.get('note', '') + (' [AI RECOMMENDED]' if x.get('label') else ''))}),"
                    for x in d["test_data"])
                parser = "parse_text" if length else "parse_amount"
                parts.append(f"""{header}
@pytest.mark.testcase("{tc.tc_id}")
@pytest.mark.parametrize(
    "raw_value, expected",
    [
{cases}
    ],
)
def {fname}(raw_value, expected):
    if isinstance(expected, type) and issubclass(expected, Exception):
        with pytest.raises(expected):
            {parser}(raw_value)
        return
    assert rule_service.{fn}({parser}(raw_value)) is expected
""")
            else:
                steps = "\n".join(f"    # Step {s['n']}: {one_line(s['action'], 100)} | Data: {str(s['data'])[:60]} | Expected: {str(s['expected'])[:80]}"
                                  for s in d["steps"])
                reason = f"NEEDS_CONFIGURATION: {d['type']} test ต้องเชื่อม API/UI/DB จริงก่อน — ดู Steps ใน {tc.tc_id}"
                parts.append(f"""{header}
@pytest.mark.testcase("{tc.tc_id}")
@pytest.mark.skip(reason={py_str(reason)})
def {fname}(synthetic_transaction):
{steps}
    assert synthetic_transaction.customer.customer_id.startswith("CUST-TEST-")
""")
        files[path] = "".join(parts)
        ids = ", ".join(t.tc_id for t in lst)
        tips[path] = [
            tip("@pytest.mark.parametrize", "รันหลายค่าขอบด้วย Test Function เดียว", "รายการค่า Boundary จาก Test Case", "ผล Pass/Fail แยกตามค่า",
                "ใช้ parametrize เพราะ Test Case มี Boundary หลายค่าแต่ใช้ Logic เดียวกัน จึงลดการเขียน Test ซ้ำ",
                "แต่ละ pytest.param คือ 1 Step ใน Test Case และ id บอกว่าเป็นค่าขอบแบบไหน", ids,
                "ค่าที่ติด [AI RECOMMENDED] ไม่มีใน BRS ต้องให้ QA ยืนยัน", "ตรวจ Expected ของค่าว่างและค่าผิดชนิดกับ BA"),
            tip('@pytest.mark.testcase("TC-...")', "เชื่อม Test กับ Test Case ID", "Test Case ID", "Marker ใน Report",
                "ทำ Traceability จากผล Run กลับไปหา Test Case และ Requirement", "Marker นี้ลงทะเบียนใน pytest.ini แล้ว", ids, "ห้ามลบ Marker", "-"),
            tip('@pytest.mark.skip(reason="NEEDS_CONFIGURATION...")', "กัน Test ที่ยังเชื่อมระบบจริงไม่ได้", "-", "สถานะ Skipped (นับเป็น Blocked บน Dashboard)",
                "ห้ามเดา URL, Auth หรือชื่อตาราง จึงข้ามไว้จนกว่าจะตั้งค่า", "ใน Function มี Step จาก Test Case เป็น Comment ให้ QA เขียนต่อ", ids,
                "อย่าลบ skip ก่อนตั้งค่า .env", "ตั้งค่า BASE_URL/Auth แล้วลบ skip"),
        ]
    files["conftest.py"] = '''import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from test_data.factory import make_transaction  # noqa: E402


@pytest.fixture
def synthetic_transaction():
    """Shared synthetic transaction (no real customer data)."""
    return make_transaction("1000.00")
'''
    files["pytest.ini"] = """[pytest]
testpaths = tests
markers =
    testcase(id): link a test to a QA Test Case ID for traceability
addopts = -ra --junitxml=reports/junit.xml
# show Thai parametrize ids as readable Thai text
disable_test_id_escaping_and_forfeit_all_rights_to_community_support = True
# HTML report (pytest-html): pytest --html=reports/report.html --self-contained-html
"""
    files["requirements.txt"] = "pytest==8.3.3\npytest-html==4.1.1\nrequests==2.32.3\npython-dotenv==1.0.1\nplaywright==1.47.0\npytest-playwright==0.5.2\n"
    files[".env.example"] = "TEST_ENV=sit\nBASE_URL=\nAUTH_TYPE=none\nAPI_TOKEN=\nAPP_USERNAME=\nAPP_PASSWORD=\n"
    files[".gitignore"] = ".env\n.auth/\n__pycache__/\n.pytest_cache/\nreports/\nscreenshots/\n*.session\n*.har\n"
    files["README.md"] = (f"# {project['name']} — Automation ({project['code']})\n\nGenerated from APPROVED test cases: "
                          f"{', '.join(t.tc_id for t in tcs)}\n\n## Run\n\n```bash\npython -m venv .venv\n.venv\\Scripts\\activate   # Windows\n"
                          "pip install -r requirements.txt\ncopy .env.example .env\npytest\npytest --html=reports/report.html --self-contained-html   # HTML report\n```\n\n"
                          "Reports: reports/junit.xml (import back into the platform: Test Runs → Import JUnit XML).\n")
    for p in ["tests/__init__.py", "tests/unit/__init__.py", "tests/integration/.gitkeep", "tests/api/.gitkeep", "tests/ui/.gitkeep",
              "tests/data/.gitkeep", "pages/.gitkeep", "components/.gitkeep", "fixtures/.gitkeep", "reports/.gitkeep", "screenshots/.gitkeep"]:
        files.setdefault(p, "")
    all_ids = ", ".join(t.tc_id for t in tcs)
    tips["conftest.py"] = [tip("@pytest.fixture", "เตรียมข้อมูลพื้นฐานที่หลาย Test ใช้ร่วมกัน", "-", "synthetic_transaction",
                               "Fixture ทำให้แก้ข้อมูลกลางได้จากจุดเดียว", "ทุก Test ได้ Object ใหม่ จึงทำงานอิสระ ไม่พึ่งลำดับ", all_ids, "อย่าเก็บ State ข้าม Test", "-")]
    tips["pytest.ini"] = [tip("addopts = ... --junitxml", "ตั้งค่า Report", "-", "reports/junit.xml (+ report.html ด้วย pytest-html)",
                              "JUnit XML ให้ระบบนำเข้าผล และ HTML Report ให้คนอ่าน", "markers ลงทะเบียน testcase เพื่อไม่ให้เกิด Warning", "-", "-", "-")]
    return {"files": files, "tips": tips}
