"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, useFFError } from "./frame";
import { ff, fmt, type Fund, type Market, type Meta, type Order, type Portfolio } from "@/lib/fundflow";
import { useToast } from "@/lib/toast";

export function useCustomerData() {
  const qc = useQueryClient();
  const funds = useQuery({ queryKey: ["ff", "funds"], queryFn: () => ff<Fund[]>("customer", "/api/funds") });
  const meta = useQuery({ queryKey: ["ff", "meta"], queryFn: () => ff<Meta>("customer", "/api/fund-groups") });
  const portfolio = useQuery({ queryKey: ["ff", "portfolio"], queryFn: () => ff<Portfolio>("customer", "/api/portfolio") });
  const orders = useQuery({ queryKey: ["ff", "orders"], queryFn: () => ff<Order[]>("customer", "/api/orders") });
  const market = useQuery({ queryKey: ["ff", "market"], queryFn: () => ff<Market>("customer", "/api/market/status") });
  return { funds, meta, portfolio, orders, market, refresh: () => qc.invalidateQueries({ queryKey: ["ff"] }) };
}
export type CustomerData = ReturnType<typeof useCustomerData>;

export function CustomerBar({ d }: { d: CustomerData }) {
  const m = d.market.data;
  return (
    <div className="row-flex" style={{ marginBottom: 12 }}>
      <span className="badge b-blue">Wallet ฿<b data-testid="wallet-balance">{fmt(d.portfolio.data?.wallet)}</b></span>
      {m && <span className={`badge ${m.isOpen ? "b-green" : "b-orange"}`} data-testid="market-status">{m.isOpen ? "● ตลาดเปิด" : `○ ตลาดปิด (ทำรายการวันที่ ${m.tradeDate})`}</span>}
    </div>
  );
}

export const groupLabel = (meta: Meta | undefined, k: string) => meta?.groups.find(g => g.key === k)?.label ?? k;

export function OrderDialog({ action, fund, onClose, onDone }: { action: "buy" | "sell" | null; fund?: Fund; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const onErr = useFFError();
  const [value, setValue] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!action || !fund) return; setBusy(true);
    try {
      const n = Number(value);
      const o = await ff<Order>("customer", `/api/orders/${action}`, { method: "POST", body: action === "buy" ? { fundCode: fund.code, amount: n } : { fundCode: fund.code, units: n }, headers: { "Idempotency-Key": crypto.randomUUID() } });
      toast(`ส่งคำสั่ง ${o.id} สำเร็จ`); setValue(""); onClose(); onDone();
    } catch (x) { onErr(x); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!action} onOpenChange={o => { if (!o) onClose(); }} title={`${action === "buy" ? "ซื้อ" : "ขาย"} ${fund?.code ?? ""}`} description={fund ? `${fund.name} • NAV ${fmt(fund.nav, 4)}` : ""}>
      <form onSubmit={submit} data-testid="order-dialog">
        <Field label={action === "buy" ? "จำนวนเงิน (บาท)" : "จำนวนหน่วย"}><input type="number" step="0.0001" min="0" data-testid="order-amount-input" value={value} onChange={e => setValue(e.target.value)} required autoFocus /></Field>
        <div className="row-flex" style={{ justifyContent: "flex-end" }}><Button type="button" onClick={onClose}>ปิด</Button><Button variant="primary" type="submit" loading={busy} data-testid="order-submit-btn">ยืนยันคำสั่ง</Button></div>
      </form>
    </Dialog>
  );
}

export function SwitchDialog({ from, funds, meta, onClose, onDone }: { from: Fund | null; funds: Fund[]; meta?: Meta; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast(); const onErr = useFFError();
  const [to, setTo] = useState(""); const [units, setUnits] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!from) return; setBusy(true);
    try {
      const o = await ff<Order>("customer", "/api/orders/switch", { method: "POST", body: { fromFund: from.code, toFund: to, units: Number(units) }, headers: { "Idempotency-Key": crypto.randomUUID() } });
      toast(`ส่งคำสั่งสับเปลี่ยน ${o.id} สำเร็จ`); setTo(""); setUnits(""); onClose(); onDone();
    } catch (x) { onErr(x); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!from} onOpenChange={o => { if (!o) onClose(); }} title={`สับเปลี่ยนจาก ${from?.code ?? ""}`} description={from ? `${from.name} • Class ${from.shareClass} • NAV ${fmt(from.nav, 4)}` : ""}>
      <form onSubmit={submit} data-testid="switch-dialog">
        <Field label="กองทุนปลายทาง">
          <select data-testid="switch-target-select" value={to} onChange={e => setTo(e.target.value)} required>
            <option value="">— เลือกกองทุนปลายทาง —</option>
            {meta?.groups.map(g => <optgroup key={g.key} label={g.label}>
              {funds.filter(x => x.group === g.key && x.code !== from?.code).map(x => <option key={x.code} value={x.code} disabled={x.status !== "ACTIVE"}>{x.code} • Class {x.shareClass}{x.status !== "ACTIVE" ? " (ระงับ)" : ""}</option>)}
            </optgroup>)}
          </select>
        </Field>
        <Field label="จำนวนหน่วยที่สับเปลี่ยน" hint="ขั้นต่ำ 100 หน่วย"><input type="number" step="0.0001" data-testid="switch-units-input" value={units} onChange={e => setUnits(e.target.value)} required /></Field>
        <div className="row-flex" style={{ justifyContent: "flex-end" }}><Button type="button" onClick={onClose}>ปิด</Button><Button variant="primary" type="submit" loading={busy} data-testid="switch-submit-btn">ยืนยันสับเปลี่ยน</Button></div>
      </form>
    </Dialog>
  );
}

export function OrderAmount({ o }: { o: Order }) { return <>{o.type === "BUY" ? `฿${fmt(o.amount)}` : `${fmt(o.units, 4)} หน่วย`}</>; }
export function StatusBadge({ s, testid }: { s: string; testid?: string }) { return <span data-testid={testid}><Badge status={s} /></span>; }
