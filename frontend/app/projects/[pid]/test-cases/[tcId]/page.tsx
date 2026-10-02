"use client";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { AssumptionLabel, Badge, NFValue, RecommendedLabel } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { ErrorState, Loading } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Step, TestCase } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export default function TestCaseDetail() {
  const { pid, tcId } = useParams<{ pid: string; tcId: string }>();
  const p = useProject(pid);
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const { prompt } = useConfirm();
  const [tab, setTab] = useState("detail");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const q = useQuery({ queryKey: ["testcase", tcId], queryFn: () => api.get<TestCase>(`/api/test-cases/${tcId}`) });
  const crumbs = projectCrumbs(pid, p.data?.code, ["Test Cases", `/projects/${pid}/test-cases`], [q.data?.tc_id ?? "…"]);
  if (q.isLoading) return <AppShell crumbs={crumbs}><Loading /></AppShell>;
  if (q.error || !q.data) return <AppShell crumbs={crumbs}><ErrorState error={q.error} onRetry={() => q.refetch()} /></AppShell>;
  const t = q.data;
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["testcase", tcId] }); await qc.invalidateQueries({ queryKey: ["testcases", pid] }); await qc.invalidateQueries({ queryKey: ["dashboard", pid] }); };
  const call = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); await refresh(); } catch (e) { toastError(e); } };
  const setStatus = async (status: string, label: string) => {
    const comment = await prompt({ title: `${label} ${t.tc_id}`, prompt: { label: "Comment", required: status !== "APPROVED" } });
    if (comment === null) return;
    await call(() => status === "APPROVED" ? api.post(`/api/test-cases/${t.id}/approve`, { status, comment }) : api.post(`/api/test-cases/${t.id}/status`, { status, comment }), `${label} แล้ว`);
  };
  const saveSteps = async () => {
    const reason = await prompt({ title: "บันทึก Test Steps", prompt: { label: "เหตุผล (บังคับ)", required: true } });
    if (!reason || !steps) return;
    await call(() => api.patch(`/api/test-cases/${t.id}`, { reason, steps: steps.map((s, i) => ({ ...s, n: i + 1 })) }), "บันทึก Steps แล้ว");
    setSteps(null);
  };
  const editable = can("tc.edit") && !t.locked;
  const rows = steps ?? t.steps;
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title={`${t.tc_id} · v${t.version}`} sub={<>{t.title} · Scenario {t.ts_id} · Requirement <Link href={`/projects/${pid}/requirements?sel=${t.requirement_id}`}>{t.req_id}</Link> (v{t.req_version})</>}
        actions={<>
          <Badge status={t.status} />{t.locked && <span className="locked">🔒 Locked (Approved)</span>}
          <Link className="btn" href={`/projects/${pid}/traceability?tc=${t.id}`}>Traceability</Link>
          {can("tc.approve") && !t.locked && <Button variant="success" onClick={() => setStatus("APPROVED", "Approve")}>Approve</Button>}
          {can("tc.approve") && !t.locked && <Button onClick={() => setStatus("WAITING_FOR_REVIEW", "Reject")}>Reject</Button>}
          {can("tc.approve") && !t.locked && <Button onClick={() => setStatus("NEEDS_CLARIFICATION", "Needs Clarification")}>Needs Clarification</Button>}
          {can("tc.approve") && t.status === "APPROVED" && <Button onClick={() => setStatus("READY_FOR_AUTOMATION", "Ready for Automation")}>Ready for Automation</Button>}
          {can("tc.edit") && t.locked && <Button variant="primary" onClick={async () => { const r = await prompt({ title: "Create New Version", body: `v${t.version} จะถูกเก็บไว้ (อ่านได้) และ v${t.version + 1} ต้อง Review/Approve ใหม่`, prompt: { label: "เหตุผล", required: true } }); if (r) await call(() => api.post(`/api/test-cases/${t.id}/new-version`, { text: r }), "สร้าง Version ใหม่แล้ว"); }}>Create New Version</Button>}
          {can("comment") && <Button onClick={async () => { const c = await prompt({ title: "Comment", prompt: { label: "ข้อความ", required: true, multiline: true } }); if (c) await call(() => api.post(`/api/test-cases/${t.id}/comments`, { text: c }), "เพิ่ม Comment แล้ว"); }}>Comment</Button>}
        </>} />
      <Tabs value={tab} onValueChange={setTab} items={[{ value: "detail", label: "รายละเอียด" }, { value: "history", label: `Version History (${t.history?.length ?? 0})` }, { value: "approvals", label: `Comments & Approvals (${(t.approvals?.length ?? 0) + (t.comments?.length ?? 0)})` }]}>
        <TabPanel value="detail">
          <div className="grid g2" style={{ marginBottom: 14 }}>
            <div className="card"><h3>Business Explanation (สำหรับ BA)</h3><p>{t.business_explanation}</p>
              <div className="gwt"><b>Given</b><span>{t.given}</span><b>When</b><span>{t.when}</span><b>Then</b><span>{t.then}</span></div></div>
            <div className="card"><h3>Priority / Risk</h3><p><Badge status={t.priority === "Critical" ? "FAILED" : "REVISED"}>{t.priority}</Badge> <Badge>{`Risk ${t.risk}`}</Badge> · ที่มา: {t.origin}</p>
              <ul className="small">{t.pr_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              <dl className="kv"><dt>Preconditions</dt><dd>{t.preconditions}</dd><dt>Automation</dt><dd>{t.automation_candidate} · {t.automation_tool}</dd><dt>Source</dt><dd>หน้า <NFValue v={t.source_page} /> · {t.source_section}</dd></dl>
              {t.assumption && <div style={{ marginTop: 8 }}>{t.assumption.split("\n").map((a, i) => <div key={i} className="small"><AssumptionLabel /> {a.replace("AI ASSUMPTION - NOT FOUND IN BRS: ", "")}</div>)}</div>}
              {t.clarification_ref && <div className="small" style={{ marginTop: 8 }}><b>Clarification:</b>{t.clarification_ref.split("\n").map((c, i) => <div key={i}>{c}</div>)}</div>}</div>
          </div>
          <div className="row-flex" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>Test Steps</h2><span className="sp" />
            {editable && (steps ? <><Button size="sm" onClick={() => setSteps([...steps, { n: steps.length + 1, action: "", data: "", expected: "", origin: "", label: "" }])}>+ Step</Button><Button size="sm" variant="primary" onClick={saveSteps}>บันทึก Steps</Button><Button size="sm" onClick={() => setSteps(null)}>ยกเลิก</Button></> : <Button size="sm" onClick={() => setSteps(t.steps.map(s => ({ ...s })))}>แก้ไข Steps</Button>)}</div>
          <div className="tblwrap"><table><thead><tr><th>#</th><th>Action</th><th>Test Data</th><th>Expected Result</th><th>ที่มา</th>{steps && <th />}</tr></thead><tbody>
            {rows.map((s, i) => <tr key={i}><td>{i + 1}</td>
              {steps ? (["action", "data", "expected"] as const).map(k => <td key={k}><textarea aria-label={`step ${i + 1} ${k}`} value={s[k]} rows={2} onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))} /></td>)
                : <><td>{s.action}</td><td className="mono small">{s.data}</td><td>{s.expected}</td></>}
              <td className="small">{s.origin}{s.label && <div><RecommendedLabel /></div>}</td>
              {steps && <td><Button size="sm" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>ลบ</Button></td>}</tr>)}
          </tbody></table></div>
          {t.test_data.length > 0 && <><h2 style={{ marginTop: 14 }}>Test Data</h2><div className="tblwrap"><table><thead><tr><th>Value</th><th>Expected</th><th>Origin</th><th>Label</th></tr></thead><tbody>
            {t.test_data.map((d, i) => <tr key={i}><td className="mono">{d.value}</td><td>{d.expected}</td><td className="small">{d.origin}</td><td>{d.label && <RecommendedLabel />}</td></tr>)}</tbody></table></div></>}
        </TabPanel>
        <TabPanel value="history">
          {t.history?.map((h, i) => <div key={i} className="card" style={{ marginBottom: 8 }}><b>v{h.version}</b> · {h.kind} · {h.changed_by} · {fmtDate(h.created_at)}<div className="small">{h.reason}</div>
            {h.changes.length > 0 && <table className="small"><tbody>{h.changes.map((c, j) => <tr key={j}><td>{c.field}</td><td className="diff"><span className="d">{typeof c.old === "string" ? c.old : JSON.stringify(c.old).slice(0, 300)}</span><span className="a">{typeof c.new === "string" ? c.new : JSON.stringify(c.new).slice(0, 300)}</span></td></tr>)}</tbody></table>}</div>)}
        </TabPanel>
        <TabPanel value="approvals">
          {t.approvals?.map((a, i) => <div key={i} className="small">{fmtDate(a.at)} · <b>{a.username}</b> · {a.action} (v{a.version}) — {a.comment}</div>)}
          <h3 style={{ marginTop: 12 }}>Comments</h3>{t.comments?.map((c, i) => <div key={i} className="small"><b>{c.username}</b> · {fmtDate(c.created_at)}<div>{c.text}</div></div>)}
          {!t.comments?.length && <p className="muted small">—</p>}
        </TabPanel>
      </Tabs>
    </AppShell>
  );
}
