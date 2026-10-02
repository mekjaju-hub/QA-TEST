"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading } from "@/components/ui/states";
import { api, download, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { fmtDate } from "@/lib/utils";

type Log = { id: string; at: string; username: string; action: string; entity: string; detail: string; correlation_id: string; ip: string };

export default function AuditLogPage() {
  const { can } = useAuth();
  const { toastError } = useToast();
  const [f, setF] = useState({ q: "", action: "", username: "" });
  const q = useQuery({ queryKey: ["audit", f], queryFn: () => api.get<Log[]>(`/api/audit-logs${qs(f)}`), enabled: can("audit.view") });
  if (!can("audit.view")) return <AppShell crumbs={[["Audit Log"]]}><div className="err-box">เฉพาะ Admin</div></AppShell>;
  const actions = Array.from(new Set(q.data?.map(l => l.action) ?? [])).sort();
  return (
    <AppShell crumbs={[["Audit Log"]]}>
      <PageHead title="Audit Log" sub="ไม่บันทึก Password / Full Token / OTP / Session Cookie / Secret (ถูก Mask อัตโนมัติ)" actions={<Button onClick={() => download("/api/audit-logs/export", "audit_log.csv").catch(toastError)}>Export CSV</Button>} />
      <div className="toolbar">
        <input type="text" placeholder="ค้นหา Entity / Detail" aria-label="ค้นหา" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        <select aria-label="Action" value={f.action} onChange={e => setF({ ...f, action: e.target.value })}><option value="">ทุก Action</option>{actions.map(a => <option key={a}>{a}</option>)}</select>
        <input type="text" placeholder="User" aria-label="User" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} />
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> :
        <div className="tblwrap"><table><thead><tr><th>เวลา</th><th>User</th><th>Action</th><th>Entity</th><th>Detail</th><th>IP</th><th>Correlation</th></tr></thead><tbody>
          {q.data?.map(l => <tr key={l.id}><td className="small">{fmtDate(l.at)}</td><td>{l.username}</td><td className="mono small">{l.action}</td><td className="small">{l.entity}</td><td className="small">{l.detail}</td><td className="small">{l.ip}</td><td className="mono small">{l.correlation_id}</td></tr>)}
        </tbody></table></div>}
    </AppShell>
  );
}
