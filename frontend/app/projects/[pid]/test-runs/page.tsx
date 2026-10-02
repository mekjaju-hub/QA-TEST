"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead, Rail } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Run } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export default function RunsPage() {
  const { pid } = useParams<{ pid: string }>();
  const p = useProject(pid);
  const { can } = useAuth();
  const { toast, toastError } = useToast();
  const [kind, setKind] = useState("junit");
  const file = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["runs", pid], queryFn: () => api.get<(Run & { artifact_name: string | null })[]>(`/api/projects/${pid}/test-runs`), refetchInterval: 5000 });
  const crumbs = projectCrumbs(pid, p.data?.code, ["Test Runs"]);
  const importFile = async (f: File) => {
    const fd = new FormData(); fd.append("kind", kind); fd.append("file", f);
    try { const r = await api.upload<Run>(`/api/projects/${pid}/test-runs/import`, fd); toast(`Import แล้ว: ${r.summary.passed}/${r.summary.total} passed`); await q.refetch(); } catch (e) { toastError(e); }
  };
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title="Test Runs" sub="Run จาก Pytest Generator (Runner จำกัด CPU/RAM/Time/Output) หรือ Import ผล JUnit XML / Newman JSON"
        actions={can("run.execute") && <><select aria-label="ชนิดไฟล์" value={kind} onChange={e => setKind(e.target.value)}><option value="junit">JUnit XML (pytest)</option><option value="newman">Newman JSON (Postman)</option></select>
          <Button onClick={() => file.current?.click()}>Import Result</Button><input ref={file} type="file" className="hide" accept=".xml,.json" onChange={e => e.target.files?.[0] && void importFile(e.target.files[0])} /></>} />
      <Rail pid={pid} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Empty title="ยังไม่มี Test Run" body="Generate Pytest แล้วกด Run หรือ Import ผล" action={<Link className="btn" href={`/projects/${pid}/automation/pytest`}>ไปที่ Pytest Generator</Link>} /> :
        <div className="tblwrap"><table><thead><tr><th>Run</th><th>ที่มา</th><th>Artifact</th><th>สถานะ</th><th>Pass</th><th>Fail</th><th>Blocked</th><th>เวลา</th><th>ผู้ Run</th></tr></thead><tbody>
          {q.data.map(r => <tr key={r.id} className="click"><td className="mono small"><Link href={`/projects/${pid}/test-runs/${r.id}`}>{r.id.slice(0, 8)}</Link></td><td className="small">{r.source}</td><td className="small">{r.artifact_name ?? "-"}</td>
            <td><Badge status={r.status} /></td><td>{r.summary.passed ?? 0}</td><td>{r.summary.failed ?? 0}</td><td>{r.summary.blocked ?? 0}</td><td className="small">{fmtDate(r.started_at)} · {r.duration.toFixed(1)}s</td><td className="small">{r.triggered_by}</td></tr>)}
        </tbody></table></div>}
    </AppShell>
  );
}
