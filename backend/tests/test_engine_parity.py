"""Python port must behave like the original JS engine (golden file from tests/golden/make_golden.js)."""
import json
import re
from pathlib import Path

from app.services.engine.analysis import build_requirement, candidate_statements, detect_conflicts, module_from
from app.services.engine.text import blocks_to_sections, text_to_blocks
from app.services import testdesign

GOLD = json.loads((Path(__file__).parent / "golden" / "demo_js.json").read_text(encoding="utf-8"))
DEMO = re.search(r"`(.*)`", (Path(__file__).resolve().parents[2] / "04_source" / "demo.js").read_text(encoding="utf-8"), re.S).group(1)

KEYMAP = {"businessRule": "business_rule", "preconditions": "preconditions", "input": "input", "process": "process",
          "output": "output", "expected": "expected_result", "role": "role", "threshold": "threshold",
          "thresholdRaw": "threshold_raw", "thresholdOp": "threshold_op", "thresholdValue": "threshold_value",
          "thresholdAmbiguous": "threshold_ambiguous", "unit": "unit", "dateRange": "date_range",
          "inclusion": "inclusion", "exclusion": "exclusion"}


def run_python():
    seq = {}

    def next_seq(k):
        seq[k] = seq.get(k, 0) + 1
        return seq[k]

    sections = blocks_to_sections(text_to_blocks(DEMO), "demo.txt")
    reqs = []
    for s in sections:
        module = module_from(s["title"], "GENERAL")
        for st in candidate_statements(s):
            reqs.append(build_requirement({"project_code": "CAM", "module": module, "section": s, "doc_name": "demo.txt"}, st, None, None, next_seq))
    found, dups = detect_conflicts(reqs, [])
    byid = {r["id"]: r for r in reqs}
    for c in found:
        for rid in (c["a"], c["b"]):
            byid[rid]["conflict_status"] = "OPEN"
            byid[rid]["status"] = "CONFLICT"
    return sections, reqs, found, byid


def test_sections_match():
    sections, *_ = run_python()
    assert [(s["title"], s["text"]) for s in sections] == [(s["title"], s["text"]) for s in GOLD["sections"]]


def test_requirements_match():
    _, reqs, _, _ = run_python()
    assert len(reqs) == len(GOLD["requirements"])
    for py, js in zip(reqs, GOLD["requirements"]):
        assert py["req_id"] == js["reqId"]
        assert py["type"] == js["type"], py["req_id"]
        assert py["title"] == js["title"]
        for jk, pk in KEYMAP.items():
            assert py["fields"][pk] == js["fields"][jk], (py["req_id"], pk)
        assert py["completeness"]["score"] == js["completeness"], py["req_id"]
        assert py["clarity"]["score"] == js["clarity"], py["req_id"]
        assert [r["text"] for r in py["clarity"]["reasons"]] == js["clarityReasons"]
        assert py["status"] == js["status"], py["req_id"]
        assert [q["key"] for q in py["questions"]] == js["questions"], py["req_id"]


def test_conflicts_match():
    _, _, found, byid = run_python()
    got = [(byid[c["a"]]["req_id"], byid[c["b"]]["req_id"], c["similarity"], c["diffs"]) for c in found]
    exp = [(c["a"], c["b"], c["similarity"], c["diffs"]) for c in GOLD["conflicts"]]
    assert got == exp


def test_testdesign_match():
    _, reqs, _, _ = run_python()
    for r, g in zip(reqs, GOLD["boundaries"]):
        assert testdesign.scenario_types_for(r) == g["types"]
        pr = testdesign.assess_priority_risk(r, "Boundary")
        assert (pr["priority"], pr["risk"], pr["reasons"]) == (g["pr"]["priority"], g["pr"]["risk"], g["pr"]["reasons"])
        rows = testdesign.boundary_data(r)
        if g["rows"] is None:
            assert rows is None
        elif rows[0].get("kind") == "length":
            # Known Issue fixed: real strings instead of numbers; expectations at boundary must agree
            assert [x["expected"] for x in rows[:3]] == [x["expected"] for x in g["rows"][:3]]
            assert len(rows[1]["raw"]) == int(float(r["fields"]["threshold_value"]))
        else:
            assert [(x["value"], x["expected"], x["origin"], x["note"]) for x in rows] == \
                   [(x["value"], x["expected"], x["origin"], x["note"]) for x in g["rows"]]
