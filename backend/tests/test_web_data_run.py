"""Click x/y tracking + data-driven replay (CSV) for Web Explorer recordings."""
import time

import pytest

from app.services import web_recorder as wr
from app.services import web_replay as wrp

from .test_web_explorer import needs_browser, site  # noqa: F401  (fixture)


def _rec_steps():
    el = lambda lb, tag="input", **k: {"tag": tag, "type": k.get("type", ""), "label": lb, "text": "", "placeholder": "", "name": "", "id": "",
                                       "locator": {"by": "label", "value": lb}, "pos": {}}
    raw = [
        {"type": "nav", "url": "http://t/r.html", "initial": True, "t": 1},
        {"type": "fill", "el": el("ชื่อ-นามสกุล"), "value": "สมชาย ใจดี", "t": 2},
        {"type": "fill", "el": el("รหัสผ่าน", type="password"), "value": "x", "secret": True, "t": 3},
        {"type": "select", "el": el("จังหวัด", "select"), "value": "cnx", "option": "เชียงใหม่", "t": 4},
        {"type": "check", "el": el("ยอมรับเงื่อนไข", type="checkbox"), "checked": True, "t": 5},
        {"type": "click", "el": {**el("Submit", "button"), "locator": {"by": "role", "role": "button", "value": "Submit"}},
         "pt": {"x": 120, "y": 340, "vx": 120, "vy": 300}, "t": 6},
        {"type": "dialog", "kind": "alert", "message": "ลงทะเบียนสำเร็จ: สมชาย ใจดี", "t": 7},
    ]
    return wr.to_steps("http://t/r.html", raw)


def test_click_point_is_kept_and_shown():
    steps = _rec_steps()
    click = next(s for s in steps if s["action"] == "click")
    assert click["pt"]["x"] == 120 and click["pos_text"] == "x=120, y=340"
    assert wr.pt_text({"action": "click"}) == ""          # older recordings without a point still work


def test_fields_template_and_rows_apply_new_data():
    steps = _rec_steps()
    cols = [f["column"] for f in wrp.data_fields(steps)]
    assert cols == ["ชื่อ-นามสกุล", "จังหวัด", "ยอมรับเงื่อนไข"]         # password is never a CSV column
    tpl = wrp.template_csv(steps)
    assert tpl.startswith("﻿") and "สมชาย ใจดี" in tpl and wrp.EXPECT_COL in tpl.splitlines()[0]
    rows = wrp.parse_csv("ชื่อ-นามสกุล,จังหวัด,ยอมรับเงื่อนไข,_expect_text\nสมหญิง รักดี,กรุงเทพฯ,0,สำเร็จ\n,,,\n", steps)
    assert len(rows) == 1                                                  # blank rows ignored
    new = wrp.apply_row(steps, rows[0])
    by = {s["action"]: s for s in new}
    assert by["fill"]["value"] == "สมหญิง รักดี" and by["select"]["value"] == "กรุงเทพฯ" and by["check"]["checked"] is False
    assert by["dialog"]["message"] == "ลงทะเบียนสำเร็จ: สมหญิง รักดี"      # popup that echoes the input follows the new data
    assert new[-1]["action"] == "assert_text" and new[-1]["check"] == "สำเร็จ"
    assert steps[1]["value"] == "สมชาย ใจดี"                              # the recording itself is unchanged
    kept = wrp.apply_row(steps, {"ชื่อ-นามสกุล": ""})
    assert kept[1]["value"] == "สมชาย ใจดี"                               # empty cell = keep recorded value


def test_csv_with_wrong_columns_is_refused():
    with pytest.raises(Exception, match="คอลัมน์"):
        wrp.parse_csv("foo,bar\n1,2\n", _rec_steps())


@needs_browser
def test_record_register_then_replay_with_csv_rows(client, admin, site):  # noqa: F811
    from app.api.web_explorer import save_recording
    from app.db import SessionLocal
    url = site.replace("index.html", "register.html")

    def user(page):
        page.get_by_role("button", name="ลงทะเบียน").click()
        page.get_by_label("ชื่อ-นามสกุล").fill("สมชาย ใจดี")
        page.get_by_label("อีเมล").fill("somchai@example.test")
        page.get_by_label("รหัสผ่าน").fill("Secret-123")
        page.get_by_label("จังหวัด").select_option("cnx")
        page.get_by_label("ยอมรับเงื่อนไข").check()
        page.get_by_role("button", name="Submit").click()
        page.wait_for_timeout(800)

    rec = wr.Recording(url, "admin", headless=True, actions=user, save_password=False).start()
    rec.stop()
    steps = rec.steps()
    assert all(s.get("pos_text", "").startswith("x=") for s in steps if s["action"] == "click")
    with SessionLocal() as db:
        save_recording(rec, "admin", db)
    eid = rec.exploration_id
    f = client.get(f"/api/web-explorer/{eid}/data-fields", headers=admin).json()
    assert [x["column"] for x in f["fields"]][:2] == ["ชื่อ-นามสกุล", "อีเมล"]
    t = client.get(f"/api/web-explorer/{eid}/data-template.csv", headers=admin)
    assert t.status_code == 200 and "สมชาย ใจดี" in t.content.decode("utf-8-sig")
    csv_text = ("ชื่อ-นามสกุล,อีเมล,จังหวัด,ยอมรับเงื่อนไข,_expect_text\n"
                "สมหญิง รักดี,somying@example.test,กรุงเทพฯ,1,\n"
                "มานะ ขยัน,mana@example.test,cnx,1,ข้อความที่ไม่มีจริง\n")
    run = client.post(f"/api/web-explorer/{eid}/data-run", headers=admin,
                      json={"csv_text": csv_text, "password": "Secret-123", "slow_ms": 0}).json()
    for _ in range(240):
        v = client.get(f"/api/web-data-run/{run['id']}", headers=admin).json()
        if v["status"] not in ("starting", "running"):
            break
        time.sleep(0.5)
    assert [r["status"] for r in v["rows"]] == ["passed", "failed"], v
    assert v["summary"] == {"total": 2, "passed": 1, "failed": 1}
    rp = client.get(f"/api/web-replay/{v['rows'][0]['replay_id']}", headers=admin).json()
    assert any("สมหญิง รักดี" in r["text"] for r in rp["results"]) and any(r.get("click_at", "").startswith("x=") for r in rp["results"])
    shot = next(r["shot"] for r in rp["results"] if r.get("shot"))
    assert client.get(f"/api/web-replay/{rp['id']}/shot/{shot}", headers=admin).content[:4] == b"\x89PNG"
    res = client.get(f"/api/web-data-run/{run['id']}/results.csv", headers=admin).content.decode("utf-8-sig")
    assert "passed" in res and "failed" in res and "Secret-123" not in res
