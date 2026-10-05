"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading } from "@/components/ui/states";
import { CustomerBar, OrderDialog, groupLabel, useCustomerData } from "@/components/fundflow/customer";
import { FFPage } from "@/components/fundflow/frame";
import { fmt, type Fund } from "@/lib/fundflow";

function Body() {
  const d = useCustomerData();
  const [group, setGroup] = useState("ALL");
  const [buy, setBuy] = useState<Fund | null>(null);
  if (d.funds.isLoading) return <Loading />;
  if (d.funds.error) return <ErrorState error={d.funds.error} onRetry={() => void d.refresh()} />;
  const funds = d.funds.data ?? [];
  const counts = funds.reduce<Record<string, number>>((a, x) => ({ ...a, [x.group]: (a[x.group] || 0) + 1 }), {});
  const shown = group === "ALL" ? funds : funds.filter(x => x.group === group);
  return (
    <>
      <CustomerBar d={d} />
      <div className="toolbar" data-testid="group-filters">
        {[{ key: "ALL", label: "ทั้งหมด" }, ...(d.meta.data?.groups ?? [])].map(g =>
          <Button key={g.key} size="sm" variant={group === g.key ? "primary" : "default"} data-testid={`group-filter-${g.key}`} onClick={() => setGroup(g.key)}>{g.label} ({g.key === "ALL" ? funds.length : counts[g.key] || 0})</Button>)}
      </div>
      <div className="tblwrap"><table data-testid="fund-table"><thead><tr><th>รหัส</th><th>ชื่อกองทุน</th><th>กลุ่ม</th><th>Class</th><th>ความเสี่ยง</th><th style={{ textAlign: "right" }}>NAV</th><th style={{ textAlign: "right" }}>ขั้นต่ำ</th><th>สถานะ</th><th /></tr></thead><tbody>
        {shown.map(x => <tr key={x.code} data-testid={`fund-row-${x.code}`}>
          <td><b>{x.code}</b></td><td>{x.name}</td><td>{groupLabel(d.meta.data, x.group)}</td>
          <td title={d.meta.data?.shareClasses[x.shareClass] ?? ""}>{x.shareClass}</td><td>{x.risk}</td>
          <td style={{ textAlign: "right" }}>{fmt(x.nav, 4)}</td><td style={{ textAlign: "right" }}>{fmt(x.minBuy)}</td>
          <td><Badge status={x.status} /></td>
          <td><Button size="sm" data-testid={`buy-btn-${x.code}`} disabled={x.status !== "ACTIVE"} onClick={() => setBuy(x)}>ซื้อ</Button></td>
        </tr>)}
      </tbody></table></div>
      <OrderDialog action={buy ? "buy" : null} fund={buy ?? undefined} onClose={() => setBuy(null)} onDone={() => void d.refresh()} />
    </>
  );
}

export default function FundsPage() {
  return <FFPage kind="customer" title="ตลาดกองทุน" sub="รายการกองทุนทั้งหมด (Login ลูกค้า: demo / OTP 123456)">{() => <Body />}</FFPage>;
}
