"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, FFPage, useFFError } from "@/components/fundflow/frame";
import { FFError, ff, type Account } from "@/lib/fundflow";
import { useToast } from "@/lib/toast";

const EMPTY = { name: "", address: "", phone: "", email: "", unitholders: "", riskLevel: "" };

function Body() {
  const { toast } = useToast(); const onErr = useFFError(); const qc = useQueryClient();
  const list = useQuery({ queryKey: ["ff", "accounts"], queryFn: () => ff<Account[]>("staff", "/api/staff/accounts") });
  const [f, setF] = useState(EMPTY); const [errs, setErrs] = useState<Record<string, string>>({}); const [result, setResult] = useState("");
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErrs({});
    const body = { ...f, unitholders: f.unitholders.split(",").map(s => s.trim()).filter(Boolean), riskLevel: f.riskLevel ? parseInt(f.riskLevel, 10) : null };
    try {
      const acc = await ff<Account>("staff", "/api/admin/accounts", { method: "POST", body });
      setResult(`เปิดบัญชีสำเร็จ: ${acc.id} • Unitholder ${acc.unitholders?.map(u => u.id).join(", ")}`);
      toast(`เปิดบัญชี ${acc.id} สำเร็จ`); setF(EMPTY); await qc.invalidateQueries({ queryKey: ["ff", "accounts"] });
    } catch (x) { if (x instanceof FFError && x.details) setErrs(x.details); onErr(x); }
  };
  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15 }}>เปิดบัญชีใหม่</h2>
        <form onSubmit={submit} noValidate>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", columnGap: 14 }}>
            <Field full label="ชื่อ-นามสกุล *" error={errs.name}><input type="text" data-testid="acc-name-input" aria-invalid={!!errs.name} value={f.name} onChange={set("name")} /></Field>
            <Field full label="ที่อยู่ *" error={errs.address}><input type="text" data-testid="acc-address-input" placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" aria-invalid={!!errs.address} value={f.address} onChange={set("address")} /></Field>
            <Field label="เบอร์โทรศัพท์มือถือ *" error={errs.phone}><input type="text" data-testid="acc-phone-input" placeholder="0812345678" aria-invalid={!!errs.phone} value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Email *" error={errs.email}><input type="text" data-testid="acc-email-input" aria-invalid={!!errs.email} value={f.email} onChange={set("email")} /></Field>
            <Field label="เลข Unitholder *" hint="1 ID มีได้หลายเลข คั่นด้วยเครื่องหมาย ," error={errs.unitholders}><input type="text" data-testid="acc-unitholders-input" placeholder="SHZ-UH-000201, CPC-UH-000202" aria-invalid={!!errs.unitholders} value={f.unitholders} onChange={set("unitholders")} /></Field>
            <Field label="ระดับความเสี่ยงที่รับได้ (Risk level) *" error={errs.riskLevel}>
              <select data-testid="acc-riskLevel-input" aria-invalid={!!errs.riskLevel} value={f.riskLevel} onChange={set("riskLevel")}><option value="">— เลือก —</option>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>ระดับ {n}</option>)}</select></Field>
          </div>
          <Button variant="primary" type="submit" data-testid="acc-submit-btn">เปิดบัญชี</Button>
        </form>
        {result && <p className="muted" data-testid="acc-result" style={{ marginTop: 10 }}>{result}</p>}
      </div>
      <h2 style={{ fontSize: 15 }}>บัญชีทั้งหมด ({list.data?.length ?? 0})</h2>
      <div className="tblwrap"><table><thead><tr><th>ID</th><th>ชื่อ</th><th>Risk</th><th>โทร</th><th>Email</th></tr></thead><tbody>
        {list.data?.map(a => <tr key={a.id}><td>{a.id}</td><td>{a.name}</td><td>{a.riskLevel}</td><td>{a.phone ?? "-"}</td><td>{a.email ?? "-"}</td></tr>)}
      </tbody></table></div>
    </>
  );
}

export default function StaffAccountsPage() {
  return <FFPage kind="staff" perm="account:open" crumbs={[["Back-office"]]} title="เปิดบัญชี" sub="เปิดบัญชีลูกค้าใหม่ (ADMIN)">{() => <Body />}</FFPage>;
}
