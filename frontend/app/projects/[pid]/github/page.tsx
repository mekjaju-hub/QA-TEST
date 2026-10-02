"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Artifact } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type GhReq = { id: string; artifact_id: string | null; action_type: string; repository: string; branch: string; base_branch: string; commit_message: string; files: string[]; diff: string;
  scan_problems: string[]; status: string; proposed_by: string; approved_by: string | null; approved_at: string | null; executed_at: string | null; result: Record<string, unknown>; created_at: string };
type Overview = { token_configured: boolean; integration: { owner: string; repo: string; default_branch: string; status: string } | null; requests: GhReq[] };

export default function GithubPage() {
  const { pid } = useParams<{ pid: string }>();
  const p = useProject(pid);
  const { can } = useAuth();
  const { toast, toastError } = useToast();
  const { confirm } = useConfirm();
  const q = useQuery({ queryKey: ["github", pid], queryFn: () => api.get<Overview>(`/api/projects/${pid}/github`), enabled: can("github.propose") });
  const arts = useQuery({ queryKey: ["artifacts", pid, "all"], queryFn: () => api.get<Artifact[]>(`/api/projects/${pid}/automation`), enabled: can("github.propose") });
  const [conn, setConn] = useState({ owner: "", repo: "", default_branch: "main" });
  const [prop, setProp] = useState<{ artifact_id: string; action_type: string; branch: string; commit_message: string } | null>(null);
  const [view, setView] = useState<GhReq | null>(null);
  const crumbs = projectCrumbs(pid, p.data?.code, ["GitHub"]);
  if (!can("github.propose")) return <AppShell crumbs={crumbs}><Empty title="ไม่มีสิทธิ์" body="เฉพาะ QA Automation/Admin" /></AppShell>;
  if (q.isLoading) return <AppShell crumbs={crumbs}><Loading /></AppShell>;
  if (q.error || !q.data) return <AppShell crumbs={crumbs}><ErrorState error={q.error} /></AppShell>;
  const gi = q.data.integration;
  const repo = gi ? `${gi.owner}/${gi.repo}` : "";
  const call = async (url: string, body: object, msg: string) => { try { await api.post(url, body); toast(msg); await q.refetch(); return true; } catch (e) { toastError(e); await q.refetch(); return false; } };
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title="GitHub Integration" sub="Token อยู่ที่ Backend เท่านั้น · ทุก Action ต้อง Preview + Approve ก่อน Execute · ไม่มี Merge อัตโนมัติ / Force Push / ลบ Branch · Block ไฟล์ .env/Session/Secret" />
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card"><h3>Connection</h3>
          <p>Token: {q.data.token_configured ? <Badge status="APPROVED">Configured (Backend)</Badge> : <Badge status="NEEDS_CONFIGURATION" />} · Repository: {gi ? <><span className="mono">{repo}</span> <Badge status={gi.status === "CONNECTED" ? "APPROVED" : "NEEDS_CONFIGURATION"}>{gi.status}</Badge></> : "—"}</p>
          <div className="grid g3"><div className="field"><label htmlFor="o">Owner</label><input id="o" type="text" value={conn.owner} onChange={e => setConn({ ...conn, owner: e.target.value })} placeholder={gi?.owner} /></div>
            <div className="field"><label htmlFor="r">Repository</label><input id="r" type="text" value={conn.repo} onChange={e => setConn({ ...conn, repo: e.target.value })} placeholder={gi?.repo} /></div>
            <div className="field"><label htmlFor="b">Default branch</label><input id="b" type="text" value={conn.default_branch} onChange={e => setConn({ ...conn, default_branch: e.target.value })} /></div></div>
          <Button onClick={() => call("/api/github/connect", { project_id: pid, ...conn }, "บันทึก Connection แล้ว")} disabled={!conn.owner || !conn.repo}>Connect / ตรวจสอบ</Button>
        </div>
        <div className="card"><h3>สร้าง Proposal</h3>
          <p className="small">เลือก Artifact (ที่ไม่ใช่ DRAFT) → ระบบสร้าง Preview: Repository, Branch, Files Changed, Diff, Commit Message, Action Type</p>
          <div className="row-flex"><Button variant="primary" disabled={!gi} onClick={() => setProp({ artifact_id: arts.data?.find(a => !a.is_draft)?.id ?? "", action_type: "CREATE_BRANCH_COMMIT_PR", branch: `qa/${p.data?.code.toLowerCase()}-${Date.now().toString(36)}`, commit_message: `Add ${p.data?.code} QA automation` })}>Branch + Commit + Pull Request</Button>
            <Button disabled={!gi} onClick={() => setProp({ artifact_id: "", action_type: "CREATE_REPOSITORY", branch: "", commit_message: "Create QA automation repository" })}>สร้าง Repository</Button></div>
        </div>
      </div>
      <h2>Proposals</h2>
      {!q.data.requests.length ? <Empty title="ยังไม่มี Proposal" /> : <div className="tblwrap"><table><thead><tr><th>เวลา</th><th>Action</th><th>Repository : Branch</th><th>Files</th><th>สถานะ</th><th>ผลลัพธ์</th><th></th></tr></thead><tbody>
        {q.data.requests.map(r => <tr key={r.id}><td className="small">{fmtDate(r.created_at)}<div className="muted">{r.proposed_by}</div></td><td className="small">{r.action_type}</td>
          <td className="mono small">{r.repository}{r.branch && ` : ${r.branch}`}</td><td>{r.files.length}</td><td><Badge status={r.status === "BLOCKED" ? "FAILED" : r.status}>{r.status}</Badge></td>
          <td className="small">{r.result?.pull_request ? <a href={String(r.result.pull_request)} target="_blank" rel="noreferrer">Pull Request</a> : r.result?.html_url ? <a href={String(r.result.html_url)} target="_blank" rel="noreferrer">Repository</a> : r.result?.error ? String((r.result.error as { user_message: string }).user_message) : "-"}</td>
          <td className="row-flex"><Button size="sm" onClick={() => setView(r)}>Preview</Button>
            {r.status === "PROPOSED" && can("github.approve") && <Button size="sm" variant="success" onClick={async () => { if (await confirm({ title: "Approve Git Action", body: `${r.action_type} → ${r.repository} ${r.branch}` })) await call("/api/github/action/approve", { request_id: r.id }, "อนุมัติแล้ว"); }}>Approve</Button>}
            {r.status === "APPROVED" && can("github.approve") && <Button size="sm" variant="primary" onClick={async () => { if (await confirm({ title: "Execute บน GitHub", body: "ระบบจะสร้าง Branch/Commit/Pull Request (ไม่ Merge, ไม่ Force Push)", confirmText: "Execute" })) await call("/api/github/action/execute", { request_id: r.id }, "Execute สำเร็จ"); }}>Execute</Button>}
            {["PROPOSED", "APPROVED", "BLOCKED"].includes(r.status) && can("github.approve") && <Button size="sm" onClick={() => call("/api/github/action/reject", { request_id: r.id }, "ปฏิเสธแล้ว")}>Reject</Button>}</td></tr>)}
      </tbody></table></div>}
      <Dialog open={!!prop} onOpenChange={o => !o && setProp(null)} title="สร้าง Proposal" footer={<><Button onClick={() => setProp(null)}>ยกเลิก</Button>
        <Button variant="primary" onClick={async () => { if (prop && await call("/api/github/repository/propose", { project_id: pid, repository: repo, ...prop, artifact_id: prop.artifact_id || null }, "สร้าง Proposal แล้ว — ตรวจ Preview แล้ว Approve")) setProp(null); }}>สร้าง Preview</Button></>}>
        {prop && <>{prop.action_type === "CREATE_BRANCH_COMMIT_PR" && <>
          <div className="field"><label htmlFor="pa">Artifact</label><select id="pa" value={prop.artifact_id} onChange={e => setProp({ ...prop, artifact_id: e.target.value })}>{arts.data?.filter(a => !a.is_draft).map(a => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}</select></div>
          <div className="field"><label htmlFor="pb">Branch ใหม่ (ห้าม main/master)</label><input id="pb" type="text" value={prop.branch} onChange={e => setProp({ ...prop, branch: e.target.value })} /></div></>}
          <div className="field"><label htmlFor="pm">Commit Message</label><textarea id="pm" value={prop.commit_message} onChange={e => setProp({ ...prop, commit_message: e.target.value })} /></div>
          <p className="small muted">Repository: <span className="mono">{repo}</span></p></>}
      </Dialog>
      <Dialog open={!!view} onOpenChange={o => !o && setView(null)} title={`Preview — ${view?.action_type}`} wide description={<>{view?.repository} · branch <span className="mono">{view?.branch || "-"}</span> · base {view?.base_branch} · {view?.files.length} files</>}>
        {view && <>{view.scan_problems.length > 0 && <div className="dangerbox small"><b>BLOCKED — พบไฟล์ต้องห้าม/Secret</b>{view.scan_problems.map((x, i) => <div key={i}>{x}</div>)}</div>}
          <p><b>Commit:</b> {view.commit_message}</p><details><summary className="small">Files Changed ({view.files.length})</summary><ul className="small mono">{view.files.map(f => <li key={f}>{f}</li>)}</ul></details>
          <div className="diff">{view.diff.split("\n").slice(0, 1500).map((l, i) => <span key={i} className={l.startsWith("+") ? "a" : l.startsWith("-") ? "d" : "c"}>{l}</span>)}</div></>}
      </Dialog>
    </AppShell>
  );
}
