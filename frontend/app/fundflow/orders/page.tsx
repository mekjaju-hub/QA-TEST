"use client";
import { Button } from "@/components/ui/button";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { CustomerBar, OrderAmount, StatusBadge, useCustomerData } from "@/components/fundflow/customer";
import { FFPage, useFFError } from "@/components/fundflow/frame";
import { ff } from "@/lib/fundflow";
import { useToast } from "@/lib/toast";

function Body() {
  const d = useCustomerData(); const { toast } = useToast(); const onErr = useFFError();
  if (d.orders.isLoading) return <Loading />;
  if (d.orders.error) return <ErrorState error={d.orders.error} onRetry={() => void d.refresh()} />;
  const act = async (id: string, kind: "cancel" | "confirm") => {
    try {
      await ff("customer", kind === "cancel" ? `/api/orders/${id}/cancel` : `/api/admin/orders/${id}/confirm`, { method: "POST" });
      toast(kind === "cancel" ? `ยกเลิกคำสั่ง ${id} แล้ว` : `ยืนยันคำสั่ง ${id} แล้ว`); await d.refresh();
    } catch (e) { onErr(e); }
  };
  const orders = d.orders.data ?? [];
  return (
    <>
      <CustomerBar d={d} />
      {!orders.length ? <Empty title="ยังไม่มีคำสั่ง" body="สั่งซื้อกองทุนได้ที่เมนู ตลาดกองทุน" /> :
        <div className="tblwrap"><table data-testid="order-table"><thead><tr><th>เลขที่</th><th>ประเภท</th><th>กองทุน</th><th style={{ textAlign: "right" }}>จำนวน</th><th>สถานะ</th><th /></tr></thead><tbody>
          {orders.map(o => <tr key={o.id} data-testid={`order-row-${o.id}`}>
            <td>{o.id}</td><td>{o.type}</td><td>{o.fundCode}{o.toFundCode ? ` → ${o.toFundCode}` : ""}</td>
            <td style={{ textAlign: "right" }}><OrderAmount o={o} /></td><td><StatusBadge s={o.status} testid={`order-status-${o.id}`} /></td>
            <td>{o.status === "PENDING" && <div className="row-flex">
              <Button size="sm" variant="danger" data-testid={`cancel-btn-${o.id}`} onClick={() => void act(o.id, "cancel")}>ยกเลิก</Button>
              <Button size="sm" variant="success" data-testid={`confirm-btn-${o.id}`} title="จำลอง back-office" onClick={() => void act(o.id, "confirm")}>ยืนยัน (BO)</Button></div>}</td>
          </tr>)}
        </tbody></table></div>}
    </>
  );
}

export default function OrdersPage() {
  return <FFPage kind="customer" title="คำสั่งซื้อขาย" sub="ประวัติคำสั่งของลูกค้า">{() => <Body />}</FFPage>;
}
