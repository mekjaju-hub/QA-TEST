"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading } from "@/components/ui/states";
import { Field, FFPage, useFFError, type FFSession } from "@/components/fundflow/frame";
import { ff, fmt, type Account, type Fund, type Holding, type Order } from "@/lib/fundflow";
import { useToast } from "@/lib/toast";

type Detail = Account & { portfolio: { holdings: Holding[] }; orders: Order[] };

function Body({ s }: { s: FFSession }) {
  const { toast } = useToast(); const onErr = useFFError(); const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["ff", "accounts"], queryFn: () => ff<Account[]>("staff", "/api/staff/accounts") });
  const funds = useQuery({ queryKey: ["ff", "sfunds"], queryFn: () => ff<Fund[]>("staff", "/api/funds") });
  const [accId, setAccId] = useState("");
  useEffect(() => { if (!accId && accounts.data?.length) setAccId(accounts.data[0].id); }, [accounts.data, accId]);
  const det = useQuery({ queryKey: ["ff", "account", accId], queryFn: () => ff<Detail>("staff", `/api/staff/accounts/${accId}`), enabled: !!accId });
  const [f, setF] = useState({ unitholderId: "", type: "buy", fundCode: "", toFund: "", value: "", ack: false });
  const c = det.data;
  useEffect(() => { if (c && !c.unitholders?.some(u => u.id === f.unitholderId)) setF(x => ({ ...x, unitholderId: c.unitholders?.[0]?.id ?? "" })); }, [c]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = funds.data ?? [];
  const src = useMemo(() => {
    const amc = f.unitholderId.slice(0, 3);
    const held = new Set(c?.portfolio.holdings.map(h => h.fundCode));
    const ofAmc = all.filter(x => x.code.startsWith(`${amc}-`) && x.status === "ACTIVE");
    return f.type === "buy" ? ofAmc : ofAmc.filter(x => held.has(x.code));
  }, [all, c, f.unitholderId, f.type]);
  useEffect(() => { if (!src.some(x => x.code === f.fundCode)) setF(x => ({ ...x, fundCode: src[0]?.code ?? "" })); }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const dest = all.filter(x => x.status === "ACTIVE" && x.code !== f.fundCode);
  useEffect(() => { if (f.type === "switch" && !dest.some(x => x.code === f.toFund)) setF(x => ({ ...x, toFund: dest[0]?.code ?? "" })); }, [dest, f.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = all.find(x => x.code === (f.type === "switch" ? f.toFund : f.fundCode));
  const overRisk = !!c && f.type !== "sell" && !!target && target.risk > c.riskLevel;
  useEffect(() => { setF(x => ({ ...x, ack: false })); }, [target?.code, f.type]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!c) return;
    const n = Number(f.value);
    const body: Record<string, unknown> = { accountId: c.id, unitholderId: f.unitholderId, fundCode: f.fundCode, acknowledgeRisk: f.ack };
    if (f.type === "buy") body.amount = n; else body.units = n;
    if (f.type === "switch") { body.fromFund = f.fundCode; body.toFund = f.toFund; }
    try {
      const o = await ff<Order>("staff", `/api/staff/orders/${f.type}`, { method: "POST", body, headers: { "Idempotency-Key": crypto.randomUUID() } });
      toast(`ส่งคำสั่ง ${o.id} สำเร็จ`); setF(x => ({ ...x, value: "" })); await qc.invalidateQueries({ queryKey: ["ff"] });
    } catch (x) { onErr(x); }
  };
  const confirm = async (id: string) => {
    try { await ff("staff", `/api/staff/orders/${id}/confirm`, { method: "POST" }); toast(`ยืนยันคำสั่ง ${id} แล้ว`); await qc.invalidateQueries({ queryKey: ["ff"] }); } catch (x) { onErr(x); }
  };

  if (accounts.isLoading || funds.isLoading) return <Loading />;
  if (accounts.error) return <ErrorState error={accounts.error} />;
  const opt = (x: Fund) => <option key={x.code} value={x.code}>{x.code} • Risk {x.risk} • NAV {fmt(x.nav, 4)}</option>;
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", marginBottom: 14 }}>
        <div className="card">
          <h2 style={{ fontSize: 15 }}>1. เลือกบัญชีลูกค้า</h2>
          <Field label="บัญชี (ID)"><select data-testid="trade-account-select" value={accId} onChange={e => setAccId(e.target.value)}>{accounts.data?.map(a => <option key={a.id} value={a.id}>{a.id} • {a.name} (Risk {a.riskLevel})</option>)}</select></Field>
          {c && <div className="small" style={{ display: "grid", gap: 4 }}>
            <div><b>ชื่อ</b> <span data-testid="account-name">{c.name}</span></div>
            <div><b>Risk level</b> <span data-testid="account-risk">{c.riskLevel}</span></div>
            <div><b>Wallet (บาท)</b> <span data-testid="account-wallet">{fmt(c.wallet)}</span></div>
            <div><b>โทร / Email</b> {c.phone} • {c.email}</div>
            <div><b>Unitholders ({c.unitholders?.length ?? 0})</b> <span data-testid="account-unitholders">{c.unitholders?.map(u => u.id).join(", ")}</span></div>
            <div><b>กองที่ถือ</b> {c.portfolio.holdings.map(h => `${h.fundCode} ${fmt(h.units, 4)}`).join(", ") || "-"}</div>
          </div>}
        </div>
        <div className="card">
          <h2 style={{ fontSize: 15 }}>2. ทำรายการ</h2>
          <form onSubmit={submit} noValidate>
            <Field label="Unitholder"><select data-testid="trade-unitholder-select" value={f.unitholderId} onChange={e => setF({ ...f, unitholderId: e.target.value })}>{c?.unitholders?.map(u => <option key={u.id} value={u.id}>{u.id} (บลจ. {u.amc})</option>)}</select></Field>
            <Field label="ประเภทรายการ"><select data-testid="trade-type-select" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="buy">ซื้อ (BUY)</option><option value="sell">ขาย (SELL)</option><option value="switch">สับเปลี่ยน (SWITCH)</option></select></Field>
            <Field label={f.type === "switch" ? "กองทุนต้นทาง" : "กองทุน"}><select data-testid="trade-fund-select" value={f.fundCode} onChange={e => setF({ ...f, fundCode: e.target.value })}>{src.length ? src.map(opt) : <option value="">— ไม่มีกองที่ทำรายการได้ —</option>}</select></Field>
            {f.type === "switch" && <Field label="กองทุนปลายทาง"><select data-testid="trade-tofund-select" value={f.toFund} onChange={e => setF({ ...f, toFund: e.target.value })}>{dest.map(opt)}</select></Field>}
            <Field label={f.type === "buy" ? "จำนวนเงิน (บาท)" : "จำนวนหน่วย"}><input type="number" step="0.0001" data-testid="trade-value-input" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} /></Field>
            {overRisk && target && c && <div className="err-box" data-testid="trade-risk-warning" style={{ borderColor: "var(--orange)", background: "var(--orange-bg)" }}>
              กองทุน {target.code} ความเสี่ยงระดับ {target.risk} สูงกว่าระดับของลูกค้า ({c.riskLevel})
              <label style={{ display: "flex", gap: 6, marginTop: 6 }}><input type="checkbox" data-testid="trade-ack-risk" checked={f.ack} onChange={e => setF({ ...f, ack: e.target.checked })} /> ลูกค้ารับทราบและยอมรับความเสี่ยงที่สูงกว่าระดับของตนเอง</label></div>}
            <Button variant="primary" type="submit" data-testid="trade-submit-btn">ส่งคำสั่ง</Button>
          </form>
        </div>
      </div>
      <h2 style={{ fontSize: 15 }}>คำสั่งของบัญชีนี้</h2>
      <div className="tblwrap"><table data-testid="staff-order-table"><thead><tr><th>เลขที่</th><th>Unitholder</th><th>ประเภท</th><th>กองทุน</th><th>จำนวน</th><th>สถานะ</th><th>ผู้ทำรายการ</th><th /></tr></thead><tbody>
        {c?.orders.map(o => <tr key={o.id} data-testid={`staff-order-row-${o.id}`}><td>{o.id}</td><td>{o.unitholderId || "-"}</td><td>{o.type}{o.riskAcknowledged ? " ⚠" : ""}</td>
          <td>{o.fundCode}{o.toFundCode ? ` → ${o.toFundCode}` : ""}</td><td>{o.type === "BUY" ? fmt(o.amount) : `${fmt(o.units, 4)} หน่วย`}</td>
          <td data-testid={`staff-order-status-${o.id}`}><Badge status={o.status} /></td><td>{o.createdBy}</td>
          <td>{o.status === "PENDING" && s.can("order:confirm") && <Button size="sm" variant="success" data-testid={`staff-confirm-btn-${o.id}`} onClick={() => void confirm(o.id)}>ยืนยัน (BO)</Button>}</td></tr>)}
        {!c?.orders.length && <tr><td colSpan={8} className="muted">ยังไม่มีคำสั่ง</td></tr>}
      </tbody></table></div>
    </>
  );
}

export default function StaffTradePage() {
  return <FFPage kind="staff" perm="order:trade" crumbs={[["Back-office"]]} title="ซื้อ / ขาย / สับเปลี่ยน" sub="ทำรายการแทนลูกค้า (ADMIN, SALE)">{s => <Body s={s} />}</FFPage>;
}
