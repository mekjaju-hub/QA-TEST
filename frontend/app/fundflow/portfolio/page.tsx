"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading } from "@/components/ui/states";
import { CustomerBar, OrderDialog, SwitchDialog, useCustomerData } from "@/components/fundflow/customer";
import { FFPage } from "@/components/fundflow/frame";
import { fmt, type Fund } from "@/lib/fundflow";

function Body() {
  const d = useCustomerData();
  const [sell, setSell] = useState<Fund | null>(null);
  const [sw, setSw] = useState<Fund | null>(null);
  if (d.portfolio.isLoading || d.funds.isLoading) return <Loading />;
  if (d.portfolio.error) return <ErrorState error={d.portfolio.error} onRetry={() => void d.refresh()} />;
  const pf = d.portfolio.data!; const funds = d.funds.data ?? [];
  const find = (code: string) => funds.find(f => f.code === code) ?? null;
  return (
    <>
      <CustomerBar d={d} />
      <div className="tblwrap"><table data-testid="portfolio-table"><thead><tr><th>กองทุน</th><th style={{ textAlign: "right" }}>หน่วย</th><th style={{ textAlign: "right" }}>NAV</th><th style={{ textAlign: "right" }}>มูลค่า</th><th style={{ textAlign: "right" }}>กำไร/ขาดทุน</th><th /></tr></thead><tbody>
        {pf.holdings.map(h => <tr key={h.fundCode} data-testid={`holding-row-${h.fundCode}`}>
          <td><b>{h.fundCode}</b></td>
          <td style={{ textAlign: "right" }} data-testid={`holding-units-${h.fundCode}`}>{fmt(h.units, 4)}</td>
          <td style={{ textAlign: "right" }}>{fmt(h.nav, 4)}</td>
          <td style={{ textAlign: "right" }} data-testid={`holding-value-${h.fundCode}`}>{fmt(h.marketValue)}</td>
          <td style={{ textAlign: "right", color: h.unrealizedPL >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(h.unrealizedPL)} ({fmt(h.unrealizedPLPct)}%)</td>
          <td><div className="row-flex"><Button size="sm" data-testid={`sell-btn-${h.fundCode}`} onClick={() => setSell(find(h.fundCode))}>ขาย</Button><Button size="sm" data-testid={`switch-btn-${h.fundCode}`} onClick={() => setSw(find(h.fundCode))}>สับเปลี่ยน</Button></div></td>
        </tr>)}
        {!pf.holdings.length && <tr><td colSpan={6} className="muted">ยังไม่มีกองทุนในพอร์ต</td></tr>}
      </tbody></table></div>
      <p style={{ marginTop: 10 }}>มูลค่ารวม ฿<b data-testid="portfolio-total">{fmt(pf.totalMarketValue)}</b></p>
      <OrderDialog action={sell ? "sell" : null} fund={sell ?? undefined} onClose={() => setSell(null)} onDone={() => void d.refresh()} />
      <SwitchDialog from={sw} funds={funds} meta={d.meta.data} onClose={() => setSw(null)} onDone={() => void d.refresh()} />
    </>
  );
}

export default function PortfolioPage() {
  return <FFPage kind="customer" title="พอร์ตของฉัน" sub="กองทุนที่ถือ มูลค่าปัจจุบัน และกำไร/ขาดทุน">{() => <Body />}</FFPage>;
}
