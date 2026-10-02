from __future__ import annotations

import json
import re
from urllib.parse import urlparse
from xml.sax.saxutils import escape

from .common import GenTC, slug

PROD_RE = re.compile(r"(^|\.)(prod|production|www)\.|prd", re.I)


def jmeter_safety(url: str, prof: dict, allowlist: list[str], max_users: int, max_minutes: int) -> list[str]:
    """Safety Control (หัวข้อ 26): allowlist, block production, limits, explicit confirmation."""
    issues = []
    u = urlparse(url or "")
    if not u.scheme or not u.netloc:
        issues.append("Target URL ไม่ถูกต้องหรือว่าง")
    else:
        if not any(urlparse(a).netloc == u.netloc for a in allowlist):
            issues.append(f"Host {u.netloc} ไม่อยู่ใน Environment Allowlist (ตั้งค่าใน Settings)")
        if PROD_RE.search(u.netloc):
            issues.append("URL ดูเหมือน Production — ถูก Block โดยค่าเริ่มต้น")
    if int(prof.get("users", 10)) > max_users:
        issues.append(f"Users เกิน Limit {max_users}")
    if int(prof.get("minutes", 5)) > max_minutes:
        issues.append(f"Duration เกิน Limit {max_minutes} นาที")
    if not prof.get("confirm"):
        issues.append("ยังไม่ได้ยืนยัน Target URL")
    return issues


def gen_jmeter(tcs: list[GenTC], project: dict, prof: dict) -> dict:
    x = lambda s: escape(str(s), {'"': "&quot;"})  # noqa: E731
    samplers = "\n".join(f"""        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="{x(tc.tc_id)}" enabled="true">
          <stringProp name="HTTPSampler.domain">${{target_host}}</stringProp>
          <stringProp name="HTTPSampler.protocol">https</stringProp>
          <stringProp name="HTTPSampler.path">${{endpoint_{slug(tc.tc_id)}}}</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments"><elementProp name="" elementType="HTTPArgument"><boolProp name="HTTPArgument.always_encode">false</boolProp><stringProp name="Argument.value">{{"customer_id":"${{customer_id}}","amount":"${{amount}}"}}</stringProp></elementProp></collectionProp></elementProp>
        </HTTPSamplerProxy>
        <hashTree>
          <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Status 2xx" enabled="true"><collectionProp name="Asserion.test_strings"><stringProp name="0">2\\d\\d</stringProp></collectionProp><stringProp name="Assertion.test_field">Assertion.response_code</stringProp><intProp name="Assertion.test_type">1</intProp></ResponseAssertion>
          <hashTree/>
        </hashTree>""" for tc in tcs)
    host = urlparse(prof.get("url") or "").netloc or "NEEDS_CONFIGURATION"
    endpoints = "\n".join(f'        <elementProp name="endpoint_{slug(tc.tc_id)}" elementType="Argument"><stringProp name="Argument.name">endpoint_{slug(tc.tc_id)}</stringProp>'
                          f'<stringProp name="Argument.value">/NEEDS_CONFIGURATION</stringProp></elementProp>' for tc in tcs)
    ptype = prof.get("type", "Load")
    users, ramp, minutes = int(prof.get("users", 10)), int(prof.get("ramp", 30)), int(prof.get("minutes", 5))
    jmx = f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- {project['code']} {ptype} test | Target: {x(prof.get('url', ''))} | Generated for review only — requires approval before run -->
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="{x(project['code'])} {x(ptype)} Test" enabled="true">
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments"><collectionProp name="Arguments.arguments">
        <elementProp name="target_host" elementType="Argument"><stringProp name="Argument.name">target_host</stringProp><stringProp name="Argument.value">{x(host)}</stringProp></elementProp>
{endpoints}
      </collectionProp></elementProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="{x(ptype)} Users" enabled="true">
        <stringProp name="ThreadGroup.num_threads">{users}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">{ramp}</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">{minutes * 60}</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController"><boolProp name="LoopController.continue_forever">false</boolProp><intProp name="LoopController.loops">-1</intProp></elementProp>
      </ThreadGroup>
      <hashTree>
        <CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="Synthetic data" enabled="true"><stringProp name="filename">test_data.csv</stringProp><stringProp name="variableNames">customer_id,amount</stringProp><stringProp name="delimiter">,</stringProp><boolProp name="recycle">true</boolProp></CSVDataSet>
        <hashTree/>
{samplers}
        <ResultCollector guiclass="SummaryReport" testclass="ResultCollector" testname="Summary (TPS, Error %, Response Time, Throughput)" enabled="true"><stringProp name="filename">results.jtl</stringProp></ResultCollector>
        <hashTree/>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>
"""
    csv = "customer_id,amount\n" + "\n".join(f"CUST-TEST-{i + 1:04d},{1000 + i * 250:.2f}" for i in range(20)) + "\n"
    profile = {k: prof.get(k) for k in ("type", "url", "users", "ramp", "minutes")}
    profile["metrics"] = ["Transaction per Second", "Error Rate", "Response Time", "Concurrent Users", "Throughput"]
    return {"files": {f"jmeter/{project['code']}_{slug(ptype)}.jmx": jmx, "jmeter/test_data.csv": csv,
                      "jmeter/profile.json": json.dumps(profile, ensure_ascii=False, indent=2),
                      "jmeter/README.md": "Run (after approval, non-production only):\n\n    jmeter -n -t jmeter/*.jmx -l results.jtl -e -o report/\n"}, "tips": {}}
