"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import type { Doc, RequirementBrief, Scenario, TestCaseBrief } from "@/lib/types";

export const docLabel = (d: Doc) => `${d.name} (v${d.latest_version})`;

/** Documents of a project (uploaded BRS files). */
export function useDocs(pid: string) {
  return useQuery({ queryKey: ["documents", pid], queryFn: () => api.get<Doc[]>(`/api/projects/${pid}/documents`) });
}

/** Latest, non-deprecated requirements of the project; `docId` filters by uploaded document ("" = all). */
export function useProjectReqs(pid: string) {
  return useQuery({ queryKey: ["requirements", pid, "all"], queryFn: () => api.get<{ items: RequirementBrief[] }>(`/api/projects/${pid}/requirements`).then(r => r.items.filter(x => x.status !== "DEPRECATED")) });
}
export const inDoc = (r: RequirementBrief, docId: string) => !docId || docId === "ALL" || r.document_id === docId;

/** Test Coverage box for one document (Requirement / Approved / Scenario / Test Case / % coverage) + Generate-all + blocked list. */
export function DocCoverage({ pid, docId, doc }: { pid: string; docId: string; doc?: Doc }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const reqsQ = useProjectReqs(pid);
  const scQ = useQuery({ queryKey: ["scenarios", pid], enabled: can("tc.view"), queryFn: () => api.get<{ items: Scenario[] }>(`/api/projects/${pid}/test-scenarios`).then(r => r.items) });
  const tcQ = useQuery({ queryKey: ["test-cases", pid, "all"], enabled: can("tc.view"), queryFn: () => api.get<{ items: TestCaseBrief[] }>(`/api/projects/${pid}/test-cases`).then(r => r.items) });

  const reqs = (reqsQ.data ?? []).filter(r => inDoc(r, docId));
  const ids = new Set(reqs.map(r => r.id));
  const scs = (scQ.data ?? []).filter(s => ids.has(s.requirement_id) && s.status !== "DEPRECATED");
  const tcs = (tcQ.data ?? []).filter(t => ids.has(t.requirement_id) && t.status !== "DEPRECATED");
  const withTc = reqs.filter(r => tcs.some(t => t.requirement_id === r.id));
  const approved = reqs.filter(r => r.status === "APPROVED");
  const notReady = reqs.filter(r => r.status !== "APPROVED");
  const nc = reqs.filter(r => r.status === "NEEDS_CLARIFICATION").length;
  const cf = reqs.filter(r => r.status === "CONFLICT").length;
  const pct = reqs.length ? Math.round((withTc.length / reqs.length) * 100) : 0;
  const docQ = docId && docId !== "ALL" ? `&doc=${docId}` : "";

  const action = (r: RequirementBrief) => r.status === "NEEDS_CLARIFICATION"
    ? <Link href={`/projects/${pid}/clarifications?tab=questions&req=${r.id}${docQ}`}>ตอบ Clarification ({r.open_questions} คำถามค้าง)</Link>
    : r.status === "CONFLICT" ? <Link href={`/projects/${pid}/clarifications?tab=conflicts${docQ}`}>Resolve Conflict</Link>
    : <Link href={`/projects/${pid}/requirements?sel=${r.id}${docId ? `&doc=${docId}` : ""}`}>รอ Review / Approve</Link>;
  const why = (r: RequirementBrief) => r.status === "NEEDS_CLARIFICATION" ? "ยังมีคำถามที่ต้องให้ BA ตอบ" : r.status === "CONFLICT" ? "ขัดแย้งกับ Requirement อื่น" : `สถานะ ${r.status} — ต้อง Approve ก่อน`;

  // One click: Scenario (all test types) then Test Case for every Approved requirement of the document. Both endpoints skip duplicates.
  const generate = async () => {
    setBusy(true);
    try {
      const rid = approved.map(r => r.id);
      const s = await api.post<{ created: number }>(`/api/projects/${pid}/test-scenarios/generate`, { requirement_ids: rid });
      const all = (await api.get<{ items: Scenario[] }>(`/api/projects/${pid}/test-scenarios`)).items;
      const sid = all.filter(x => rid.includes(x.requirement_id) && x.status !== "DEPRECATED").map(x => x.id);
      const t = sid.length ? await api.post<{ created: number; blocked: string[] }>(`/api/projects/${pid}/test-cases/generate`, { scenario_ids: sid }) : { created: 0, blocked: [] };
      toast(s.created + t.created ? `สร้าง Scenario ใหม่ ${s.created} · Test Case ใหม่ ${t.created} (ที่มีอยู่แล้วไม่สร้างซ้ำ)` : "ทุก Requirement ที่ Approved มี Scenario และ Test Case ครบแล้ว ไม่สร้างซ้ำ");
      await Promise.all(["requirements", "scenarios", "test-cases", "dashboard"].map(k => qc.invalidateQueries({ queryKey: [k, pid] })));
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }} data-testid="doc-coverage">
      <div className="row-flex" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Test Coverage: {docId === "ALL" || !doc ? "ทุกเอกสารใน Project" : docLabel(doc)}</h3><span className="sp" />
        {can("scenario.edit") && can("tc.edit") && <Button variant="primary" disabled={!approved.length || busy} onClick={generate} data-testid="gen-doc-tcs">{busy ? "กำลังสร้าง…" : `Generate Test Case ครบทุก Requirement ที่ Approved (${approved.length})`}</Button>}
        <Link className="btn" href={`/projects/${pid}/test-cases`}>ดู Test Cases</Link>
      </div>
      <div className="grid g4" style={{ marginBottom: 10 }}>
        <div className="card kpi"><div className="v">{reqs.length}</div><div className="k">Requirement</div></div>
        <div className="card kpi"><div className="v">{approved.length}</div><div className="k">Approved พร้อมสร้าง</div></div>
        <div className="card kpi"><div className="v">{scs.length}</div><div className="k">Test Scenario</div></div>
        <div className="card kpi"><div className="v">{tcs.length}</div><div className="k">Test Case</div></div>
      </div>
      <div className="small" style={{ marginBottom: 4 }} data-testid="coverage-pct">Requirement ที่มี Test Case แล้ว {withTc.length}/{reqs.length} ({pct}% coverage)</div>
      <Progress value={pct} />
      {notReady.length > 0 ? (
        <details style={{ marginTop: 10 }} open>
          <summary className="small">ยังสร้าง Test Case ไม่ได้ {notReady.length} รายการ (Needs Clarification {nc} · Conflict {cf}) — ต้องจัดการก่อนจึงจะครบถ้วน</summary>
          <div className="tblwrap" style={{ marginTop: 6 }}><table><thead><tr><th>Requirement</th><th>Status</th><th>เหตุผล</th><th>จัดการ</th></tr></thead><tbody>
            {notReady.map(r => <tr key={r.id}><td className="mono">{r.req_id}</td><td><Badge status={r.status} /></td><td className="small">{why(r)}</td><td className="small">{action(r)}</td></tr>)}
          </tbody></table></div>
        </details>
      ) : reqs.length > 0 && pct === 100 ? <p className="small" style={{ marginTop: 8 }}>ทุก Requirement ของเอกสารนี้มี Test Case ครบแล้ว</p> : null}
    </div>
  );
}
