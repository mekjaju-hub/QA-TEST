"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { AuthImage } from "@/components/auth-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { ErrorState, Loading, Progress } from "@/components/ui/states";
import { api, download, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Run } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type Detail = Run & { artifact: { id: string; name: string; kind: string; is_draft: boolean } | null; artifacts: { id: string; kind: string; name: string; size: number }[] };

export default function RunDetail() {
  const { pid, runId } = useParams<{ pid: string; runId: string }>();
  const p = useProject(pid);
  const router = useRouter();
  const { can } = useAuth();
  const { toast, toastError } = useToast();
  const { confirm } = useConfirm();
  const [tab, setTab] = useState("results");
  const [log, setLog] = useState("");
  const offset = useRef(0);
  const logEl = useRef<HTMLPreElement>(null);
  const q = useQuery({ queryKey: ["run", runId], queryFn: () => api.get<Detail>(`/api/test-runs/${runId}`), refetchInterval: d => (["QUEUED", "RUNNING"].includes(d.state.data?.status ?? "") ? 2000 : false) });
  const live = ["QUEUED", "RUNNING"].includes(q.data?.status ?? "");
  // Log streaming: poll incremental chunks while the run is active
  useEffect(() => {
    offset.current = 0; setLog("");
    let stop = false;
    const tick = async () => {
      try {
        const r = await api.get<{ status: string; offset: number; stdout: string }>(`/api/test-runs/${runId}/logs${qs({ offset: offset.current })}`);
        if (r.stdout) { setLog(l => l + r.stdout); offset.current = r.offset; }
        if (!stop && ["QUEUED", "RUNNING"].includes(r.status)) setTimeout(tick, 1000);
      } catch { /* shown by main query */ }
    };
    void tick();
    return () => { stop = true; };
  }, [runId]);
  useEffect(() => { if (logEl.current) logEl.current.scrollTop = logEl.current.scrollHeight; }, [log]);
  const crumbs = projectCrumbs(pid, p.data?.code, ["Test Runs", `/projects/${pid}/test-runs`], [runId.slice(0, 8)]);
  if (q.isLoading) return <AppShell crumbs={crumbs}><Loading /></AppShell>;
  if (q.error || !q.data) return <AppShell crumbs={crumbs}><ErrorState error={q.error} onRetry={() => q.refetch()} /></AppShell>;
  const r = q.data;
  const s = r.summary as Record<string, number | string>;
  const rerun = async (failed: boolean) => { try { const n = await api.post<{ id: string }>(`/api/test-runs/${r.id}/rerun`, { failed_only: failed }); toast(failed ? "Retry เฉพาะ Test ที่ Fail" : "Re-run แล้ว"); router.push(`/projects/${pid}/test-runs/${n.id}`); } catch (e) { toastError(e); } };
  const shots = r.artifacts.filter(a => a.kind === "screenshot");
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title={`Test Run ${r.id.slice(0, 8)}`} sub={<>{r.source} · {r.artifact ? <Link href={`/projects/${pid}/automation/${r.artifact.kind}?artifact=${r.artifact.id}`}>{r.artifact.name}</Link> : "Imported"}{r.artifact?.is_draft && <> <Badge status="NEEDS_CLARIFICATION">DRAFT</Badge></>} · {fmtDate(r.started_at)} · โดย {r.triggered_by}</>}
        actions={<><Badge status={r.status} />
          {live && can("run.execute") && <Button variant="danger" onClick={async () => { if (await confirm({ title: "Cancel Run", danger: true, body: "หยุด Process ทันที (kill process group)" })) { try { await api.post(`/api/test-runs/${r.id}/cancel`); toast("ส่งคำขอ Cancel แล้ว"); } catch (e) { toastError(e); } } }}>Cancel</Button>}
          {!live && r.artifact && can("run.execute") && <><Button onClick={() => rerun(false)}>Re-run</Button>{(s.failed as number) > 0 && <Button variant="primary" onClick={() => rerun(true)}>Retry Failed Only ({s.failed})</Button>}</>}</>} />
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row-flex"><div className="sp"><Progress value={live ? r.progress : 100} /></div><b>{live ? r.progress : 100}%</b></div>
        <div className="grid g4" style={{ marginTop: 10 }}>
          <div className="kpi"><div className="v">{s.total ?? 0}</div><div className="k">ทั้งหมด</div></div>
          <div className="kpi"><div className="v" style={{ color: "var(--green)" }}>{s.passed ?? 0}</div><div className="k">Passed</div></div>
          <div className="kpi"><div className="v" style={{ color: "var(--red)" }}>{s.failed ?? 0}</div><div className="k">Failed</div></div>
          <div className="kpi"><div className="v" style={{ color: "var(--orange)" }}>{s.blocked ?? 0}</div><div className="k">Blocked (NEEDS_CONFIGURATION)</div></div>
        </div>
        <p className="small muted">Exit code {r.exit_code ?? "-"} · Duration {r.duration.toFixed(2)}s {s.error_code ? <>· <Badge status="FAILED">{String(s.error_code)}</Badge></> : null}</p>
      </div>
      <Tabs value={tab} onValueChange={setTab} items={[{ value: "results", label: `Results (${r.results.length})` }, { value: "logs", label: "Logs" }, { value: "evidence", label: `Evidence (${r.artifacts.length})` }]}>
        <TabPanel value="results">
          <div className="tblwrap"><table><thead><tr><th>Test Case</th><th>Test</th><th>สถานะ</th><th>ข้อความ</th><th>เวลา</th></tr></thead><tbody>
            {r.results.map(x => <tr key={x.id}><td className="mono small">{x.test_case_id ? <Link href={`/projects/${pid}/test-cases/${x.test_case_id}`}>{x.tc_id}</Link> : x.tc_id}</td>
              <td className="mono small">{x.name}</td><td><Badge status={x.status} /></td><td className="small">{x.message}</td><td className="small">{x.duration.toFixed(3)}s</td></tr>)}
          </tbody></table></div>
        </TabPanel>
        <TabPanel value="logs">
          <h3>stdout {live && <span className="small muted">(live)</span>}</h3><pre ref={logEl} className="codeview" data-testid="run-log">{log || r.stdout || "—"}</pre>
          {r.stderr && <><h3 style={{ marginTop: 10 }}>stderr</h3><pre className="codeview">{r.stderr}</pre></>}
          <p className="small muted">Log ถูก Mask Password/Token/Secret อัตโนมัติ และจำกัดขนาดตาม Runner Max Log</p>
        </TabPanel>
        <TabPanel value="evidence">
          <div className="tblwrap"><table><thead><tr><th>ไฟล์</th><th>ชนิด</th><th>ขนาด</th><th /></tr></thead><tbody>
            {r.artifacts.map(a => <tr key={a.id}><td className="mono small">{a.name}</td><td>{a.kind}</td><td className="small">{Math.ceil(a.size / 1024)} KB</td>
              <td><Button size="sm" onClick={() => download(`/api/test-runs/${r.id}/artifacts/${a.id}`, a.name.split("/").pop() ?? "file").catch(toastError)}>Download</Button></td></tr>)}
          </tbody></table></div>
          {shots.length > 0 && <div className="grid g3" style={{ marginTop: 12 }}>{shots.map(a => <div className="card" key={a.id}><AuthImage src={`/api/test-runs/${r.id}/artifacts/${a.id}`} alt={a.name} style={{ maxWidth: "100%" }} /><div className="small">{a.name}</div></div>)}</div>}
        </TabPanel>
      </Tabs>
    </AppShell>
  );
}
