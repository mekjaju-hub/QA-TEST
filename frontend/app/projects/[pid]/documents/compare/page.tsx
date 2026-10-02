"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Doc } from "@/lib/types";

type Item = { entity_type: string; entity_id: string; label: string; proposal: string; reason: string; status: string; decided_by: string | null };
type Cmp = { from: number; to: number; added: { id: string; title: string; text: string }[]; removed: { id: string; title: string; text: string }[];
  changed: { title: string; diff: { t: string; s: string }[] }[]; impact: { id: string; items: Item[]; retest: string[]; status: string } | null };

function Inner() {
  const { pid } = useParams<{ pid: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const p = useProject(pid);
  const { can } = useAuth();
  const { toast, toastError } = useToast();
  const { confirm } = useConfirm();
  const [tab, setTab] = useState("diff");
  const docs = useQuery({ queryKey: ["documents", pid], queryFn: () => api.get<Doc[]>(`/api/projects/${pid}/documents`) });
  const multi = docs.data?.filter(d => d.versions.length > 1) ?? [];
  const doc = multi.find(d => d.id === sp.get("doc")) ?? multi[0];
  const to = Number(sp.get("to")) || doc?.latest_version || 0;
  const from = Number(sp.get("from")) || to - 1;
  const cmp = useQuery({ queryKey: ["compare", doc?.id, from, to], enabled: !!doc && from > 0, queryFn: () => api.get<Cmp>(`/api/documents/${doc!.id}/compare${qs({ from_version: from, to_version: to })}`) });
  const crumbs = projectCrumbs(pid, p.data?.code, ["Version Compare"]);
  const setQ = (k: string, v: string) => { const u = new URLSearchParams(sp.toString()); u.set(k, v); if (k === "doc") { u.delete("from"); u.delete("to"); } router.replace(`?${u}`); };
  const decide = async (index: number | null, decision: string) => {
    if (index === null && !(await confirm({ title: "อนุมัติ Impact Proposal ทั้งหมด", body: "ระบบจะไม่แก้ Test Case ที่ Approved อัตโนมัติ — Test Case จะถูกติด Flag ให้สร้าง Version ใหม่เอง" }))) return;
    try { await api.post(`/api/impact/${cmp.data!.impact!.id}/decide`, { index, decision }); toast("บันทึกการตัดสินใจแล้ว"); await cmp.refetch(); } catch (e) { toastError(e); }
  };
  if (docs.isLoading) return <AppShell crumbs={crumbs}><Loading /></AppShell>;
  if (!doc) return <AppShell crumbs={crumbs}><PageHead title="BRS Version Comparison" /><Empty title="ยังไม่มีเอกสารที่มีมากกว่า 1 Version" body="อัปโหลด Version ใหม่โดยเลือก 'Version ใหม่ของเอกสารเดิม' ในหน้า Upload" action={can("doc.upload") && <Link className="btn pri" href={`/projects/${pid}/documents/upload`}>อัปโหลด Version ใหม่</Link>} /></AppShell>;
  const c = cmp.data;
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title="BRS Version Comparison & Impact Analysis" sub="ระบบไม่แก้ Test Case ที่ Approved อัตโนมัติ — ทุกผลกระทบเป็น Proposal ที่ QA ต้องอนุมัติ" />
      <div className="toolbar">
        <select aria-label="เอกสาร" value={doc.id} onChange={e => setQ("doc", e.target.value)}>{multi.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select aria-label="Version A" value={from} onChange={e => setQ("from", e.target.value)}>{doc.versions.map(v => <option key={v.version} value={v.version}>v{v.version}</option>)}</select> →
        <select aria-label="Version B" value={to} onChange={e => setQ("to", e.target.value)}>{doc.versions.map(v => <option key={v.version} value={v.version}>v{v.version}</option>)}</select>
      </div>
      {cmp.isLoading ? <Loading /> : cmp.error ? <ErrorState error={cmp.error} /> : c && <>
        <div className="grid g3" style={{ marginBottom: 14 }}>
          <div className="card kpi"><div className="v" style={{ color: "var(--green)" }}>{c.added.length}</div><div className="k">Section ที่เพิ่ม</div></div>
          <div className="card kpi"><div className="v" style={{ color: "var(--red)" }}>{c.removed.length}</div><div className="k">Section ที่ถูกลบ</div></div>
          <div className="card kpi"><div className="v" style={{ color: "var(--orange)" }}>{c.changed.length}</div><div className="k">Section ที่เปลี่ยน</div></div>
        </div>
        <Tabs value={tab} onValueChange={setTab} items={[{ value: "diff", label: "Section Diff" }, { value: "impact", label: `Impact Proposals (${c.impact?.items.length ?? 0})` }]}>
          <TabPanel value="diff">
            {c.added.map(s => <div key={s.id} className="card" style={{ marginBottom: 10, borderLeft: "3px solid var(--green)" }}><h3><Badge status="New Test Required">เพิ่ม</Badge> {s.title}</h3><div className="diff">{s.text.split("\n").map((l, i) => <span key={i} className="a">+ {l}</span>)}</div></div>)}
            {c.removed.map(s => <div key={s.id} className="card" style={{ marginBottom: 10, borderLeft: "3px solid var(--red)" }}><h3><Badge status="FAILED">ลบ</Badge> {s.title}</h3><div className="diff">{s.text.split("\n").map((l, i) => <span key={i} className="d">- {l}</span>)}</div></div>)}
            {c.changed.map(s => <div key={s.title} className="card" style={{ marginBottom: 10, borderLeft: "3px solid var(--orange)" }}><h3><Badge status="Review Required">เปลี่ยน</Badge> {s.title}</h3><div className="diff">{s.diff.map((d, i) => <span key={i} className={d.t}>{d.t === "a" ? "+ " : d.t === "d" ? "- " : "  "}{d.s}</span>)}</div></div>)}
            {!c.added.length && !c.removed.length && !c.changed.length && <Empty title="ไม่พบความแตกต่าง" body="ทั้งสอง Version มีเนื้อหาเหมือนกัน" />}
          </TabPanel>
          <TabPanel value="impact">
            {!c.impact ? <Empty title="ไม่มี Impact Proposal" body="ผลกระทบจะถูกสร้างหลังวิเคราะห์ Version ใหม่เสร็จ" /> : <>
              <div className="toolbar">{can("impact.approve") && <Button variant="success" onClick={() => decide(null, "APPROVED")}>อนุมัติ Proposal ทั้งหมดที่ยังค้าง</Button>}
                <span className="small muted">Retest ที่แนะนำ: {c.impact.retest.join(", ") || "-"}</span></div>
              <div className="tblwrap"><table><thead><tr><th>ประเภท</th><th>รายการ</th><th>Proposal</th><th>เหตุผล</th><th>สถานะ</th><th></th></tr></thead><tbody>
                {c.impact.items.map((i, idx) => <tr key={idx}><td>{i.entity_type}</td>
                  <td>{i.entity_type === "Test Case" ? <Link href={`/projects/${pid}/test-cases/${i.entity_id}`}>{i.label}</Link> : i.entity_type === "Requirement" ? <Link href={`/projects/${pid}/requirements?sel=${i.entity_id}`}>{i.label}</Link> : i.label}</td>
                  <td><Badge status={i.proposal} /></td><td className="small">{i.reason}</td><td><Badge status={i.status} /></td>
                  <td className="row-flex">{i.status === "PROPOSED" && can("impact.approve") && <><Button size="sm" variant="success" onClick={() => decide(idx, "APPROVED")}>อนุมัติ</Button><Button size="sm" onClick={() => decide(idx, "REJECTED")}>ปฏิเสธ</Button></>}</td></tr>)}
              </tbody></table></div></>}
          </TabPanel>
        </Tabs></>}
    </AppShell>
  );
}

export default function ComparePage() { return <Suspense><Inner /></Suspense>; }
