"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading } from "@/components/ui/states";
import { Field, FFPage, useFFError } from "@/components/fundflow/frame";
import { FFError, ff } from "@/lib/fundflow";
import { useToast } from "@/lib/toast";

type Opts = { types: Record<string, string>; amcs: string[]; groups: { key: string; label: string }[]; shareClasses: Record<string, string>; risk: { max: number }; noFrontFeeClasses: string[] };
const EMPTY = { name: "", type: "", code: "", amc: "", group: "", shareClass: "", status: "ACTIVE", risk: "", nav: "", minBuy: "", frontFee: "", backFee: "" };

function Body() {
  const { toast } = useToast(); const onErr = useFFError(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ff", "fund-options"], queryFn: () => ff<Opts>("staff", "/api/admin/fund-options") });
  const [f, setF] = useState(EMPTY); const [errs, setErrs] = useState<Record<string, string>>({});
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data!;
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v === "" ? null : Number(v));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErrs({});
    const body = { name: f.name, type: f.type, code: f.code.trim().toUpperCase(), amc: f.amc, group: f.group, shareClass: f.shareClass, status: f.status,
      risk: f.risk === "" ? null : parseInt(f.risk, 10), nav: num(f.nav), minBuy: num(f.minBuy), frontFee: num(f.frontFee), backFee: num(f.backFee) };
    try { const fund = await ff<{ code: string }>("staff", "/api/admin/funds", { method: "POST", body }); toast(`เพิ่มกองทุน ${fund.code} สำเร็จ`); setF(EMPTY); await qc.invalidateQueries({ queryKey: ["ff"] }); }
    catch (x) { if (x instanceof FFError && x.details) setErrs(x.details); onErr(x); }
  };
  const sel = (k: keyof typeof EMPTY, ph: string, items: [string, string][]) =>
    <select data-testid={`fund-${k}-input`} aria-invalid={!!errs[k]} value={f[k]} onChange={set(k)}><option value="">{ph}</option>{items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  const inp = (k: keyof typeof EMPTY, type = "text", ph?: string, step?: string) =>
    <input type={type} step={step} placeholder={ph} data-testid={`fund-${k}-input`} aria-invalid={!!errs[k]} value={f[k]} onChange={set(k)} style={k === "code" ? { textTransform: "uppercase" } : undefined} />;
  const sec = (t: string) => <div style={{ gridColumn: "1 / -1", fontWeight: 600, marginTop: 6 }}>{t}</div>;
  return (
    <div className="card" data-testid="add-fund-dialog">
      <form onSubmit={submit} noValidate>
        <p className="muted small">ช่องที่มี * ต้องกรอก • ระบบตรวจสอบข้อมูลก่อนบันทึก</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", columnGap: 14 }}>
          {sec("1. ข้อมูลหลัก")}
          <Field full label="ชื่อกองทุน *" error={errs.name}>{inp("name", "text", "เช่น SHZ Green Energy Fund — A")}</Field>
          <Field label="ประเภทกองทุน *" error={errs.type}>{sel("type", "— เลือกประเภท —", Object.entries(o.types).map(([k, v]) => [k, `${k} • ${v}`]))}</Field>
          <Field label="รหัสกองทุน *" error={errs.code}>{inp("code", "text", "เช่น SHZ-GREEN-A")}</Field>
          <Field label="บริษัทจัดการ (บลจ.) *" error={errs.amc}>{sel("amc", "— เลือก บลจ. —", o.amcs.map(a => [a, a]))}</Field>
          <Field label="กลุ่มกองทุน *" error={errs.group}>{sel("group", "— เลือกกลุ่ม —", o.groups.map(g => [g.key, `${g.label} (${g.key})`]))}</Field>
          <Field label="Share class *" error={errs.shareClass}>{sel("shareClass", "— เลือก Share class —", Object.entries(o.shareClasses).map(([k, v]) => [k, `${k} • ${v}`]))}</Field>
          <Field label="สถานะเปิดซื้อขาย" error={errs.status}>{sel("status", "", [["ACTIVE", "ACTIVE — เปิดซื้อขาย"], ["SUSPENDED", "SUSPENDED — ระงับชั่วคราว"]])}</Field>
          {sec("2. ความเสี่ยงและราคา")}
          <Field label="ระดับความเสี่ยง (1–8) *" error={errs.risk}>{sel("risk", "— เลือก —", Array.from({ length: o.risk.max }, (_, i) => [String(i + 1), `ระดับ ${i + 1}`]))}</Field>
          <Field label="NAV เริ่มต้น (บาท/หน่วย) *" error={errs.nav}>{inp("nav", "number", "10.0000", "0.0001")}</Field>
          <Field label="ซื้อขั้นต่ำ (บาท) *" error={errs.minBuy}>{inp("minBuy", "number", "1000", "0.01")}</Field>
          {sec("3. ค่าธรรมเนียม (% ของมูลค่า)")}
          <Field label="ค่าธรรมเนียมขาย (Front-end) *" error={errs.frontFee} hint={o.noFrontFeeClasses.includes(f.shareClass) ? `Class ${f.shareClass} ต้องไม่มีค่าธรรมเนียมขาย (0%)` : undefined}>{inp("frontFee", "number", "0.00", "0.01")}</Field>
          <Field label="ค่าธรรมเนียมรับซื้อคืน (Back-end) *" error={errs.backFee}>{inp("backFee", "number", "0.00", "0.01")}</Field>
        </div>
        <div className="row-flex" style={{ justifyContent: "flex-end" }}>
          <Button type="button" data-testid="add-fund-cancel-btn" onClick={() => { setF(EMPTY); setErrs({}); }}>ล้างฟอร์ม</Button>
          <Button variant="primary" type="submit" data-testid="add-fund-submit-btn">บันทึกกองทุน</Button>
        </div>
      </form>
    </div>
  );
}

export default function StaffAddFundPage() {
  return <FFPage kind="staff" perm="fund:create" crumbs={[["Back-office"]]} title="สร้างกองทุน" sub="เพิ่มกองทุนใหม่ (ADMIN)">{() => <Body />}</FFPage>;
}
