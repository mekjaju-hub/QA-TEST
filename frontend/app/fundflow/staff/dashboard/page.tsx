"use client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Loading } from "@/components/ui/states";
import { FFPage } from "@/components/fundflow/frame";
import { ff, fmt, type Order } from "@/lib/fundflow";

type Dash = { totals: Record<string, number>; byType: Record<string, Record<string, number>>; recent: Order[] };

function Body() {
  const q = useQuery({ queryKey: ["ff", "dash"], queryFn: () => ff<Dash>("staff", "/api/admin/dashboard"), refetchInterval: 15000 });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data!; const t = d.totals;
  const kpis: [string, string | number, string][] = [
    ["คำสั่งทั้งหมด", t.orders, "kpi-orders"], ["ซื้อ / ขาย / สับเปลี่ยน", `${t.buy} / ${t.sell} / ${t.switch}`, "kpi-types"],
    ["ยอดซื้อ (บาท)", fmt(t.buyAmount), "kpi-buy-amount"], ["ยอดขายคืนสุทธิ (บาท)", fmt(t.sellAmount), "kpi-sell-amount"],
    ["รอยืนยัน", t.pending, "kpi-pending"], ["บัญชี / กองทุน", `${t.accounts} / ${t.funds}`, "kpi-accounts"],
  ];
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", marginBottom: 14 }}>
        {kpis.map(([k, v, id]) => <div key={id} className="card kpi"><div className="v" data-testid={id}>{v}</div><div className="k">{k}</div></div>)}
      </div>
      <h2 style={{ fontSize: 15 }}>สรุปตามประเภทและสถานะ</h2>
      <div className="tblwrap" style={{ marginBottom: 14 }}><table data-testid="dashboard-bytype"><thead><tr><th>ประเภท</th><th>PENDING</th><th>CONFIRMED</th><th>CANCELLED</th></tr></thead><tbody>
        {Object.entries(d.byType).map(([k, v]) => <tr key={k} data-testid={`bytype-${k}`}><td><b>{k}</b></td><td>{v.PENDING}</td><td>{v.CONFIRMED}</td><td>{v.CANCELLED}</td></tr>)}
      </tbody></table></div>
      <h2 style={{ fontSize: 15 }}>รายการล่าสุด (20 รายการ)</h2>
      <div className="tblwrap"><table data-testid="dashboard-recent"><thead><tr><th>เลขที่</th><th>บัญชี</th><th>Unitholder</th><th>ประเภท</th><th>กองทุน</th><th>จำนวน</th><th>สถานะ</th><th>ช่องทาง</th><th>ผู้ทำรายการ</th></tr></thead><tbody>
        {d.recent.map(o => <tr key={o.id}><td>{o.id}</td><td>{o.customerId}</td><td>{o.unitholderId || "-"}</td><td>{o.type}</td><td>{o.fundCode}{o.toFundCode ? ` → ${o.toFundCode}` : ""}</td>
          <td>{o.type === "BUY" ? fmt(o.amount) : `${fmt(o.units, 4)} หน่วย`}</td><td><Badge status={o.status} /></td><td>{o.channel}</td><td>{o.createdBy}</td></tr>)}
        {!d.recent.length && <tr><td colSpan={9} className="muted">ยังไม่มีรายการ</td></tr>}
      </tbody></table></div>
    </>
  );
}

export default function StaffDashboardPage() {
  return <FFPage kind="staff" perm="dashboard:view" crumbs={[["Back-office"]]} title="ภาพรวมการซื้อขาย" sub="เฉพาะ ADMIN">{() => <Body />}</FFPage>;
}
