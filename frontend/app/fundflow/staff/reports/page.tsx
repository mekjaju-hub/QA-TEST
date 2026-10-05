"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading } from "@/components/ui/states";
import { Field, FFPage, useFFError } from "@/components/fundflow/frame";
import { ff, ffDownload, type Account } from "@/lib/fundflow";
import { useToast } from "@/lib/toast";

function Body() {
  const { toast } = useToast(); const onErr = useFFError();
  const q = useQuery({ queryKey: ["ff", "accounts"], queryFn: () => ff<Account[]>("staff", "/api/staff/accounts") });
  const [id, setId] = useState(""); const [text, setText] = useState("เลือกบัญชีแล้วกด “แสดงตัวอย่าง”");
  useEffect(() => { if (!id && q.data?.length) setId(q.data[0].id); }, [q.data, id]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const path = `/api/admin/reports/transactions/${id}`;
  return (
    <div className="card">
      <h2 style={{ fontSize: 15 }}>รายงานรายการซื้อขายตาม ID (.txt)</h2>
      <div className="row-flex" style={{ alignItems: "flex-end", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}><Field label="บัญชี (ID)"><select data-testid="report-account-select" value={id} onChange={e => setId(e.target.value)}>{q.data?.map(a => <option key={a.id} value={a.id}>{a.id} • {a.name}</option>)}</select></Field></div>
        <div className="row-flex" style={{ marginBottom: 12 }}>
          <Button data-testid="report-preview-btn" onClick={() => void ff<string>("staff", `${path}?preview=1`).then(setText).catch(onErr)}>แสดงตัวอย่าง</Button>
          <Button variant="primary" data-testid="report-download-btn" onClick={() => void ffDownload(path, "transactions.txt").then(n => toast(`ดาวน์โหลด ${n} แล้ว`)).catch(onErr)}>ดาวน์โหลด .txt</Button>
        </div>
      </div>
      <pre className="mono" data-testid="report-preview" style={{ whiteSpace: "pre-wrap", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, minHeight: 120 }}>{text}</pre>
    </div>
  );
}

export default function StaffReportsPage() {
  return <FFPage kind="staff" perm="report:export" crumbs={[["Back-office"]]} title="รายงาน (.txt)" sub="รายงานรายการซื้อขายตามบัญชี (ADMIN)">{() => <Body />}</FFPage>;
}
