"use client";
import Link from "next/link";
import { AppShell, PageHead } from "@/components/shell";
import { FF_MENU } from "@/components/fundflow/menu";

export default function FundFlowHub() {
  return (
    <AppShell crumbs={[["FundFlow"]]}>
      <PageHead title="FundFlow" sub="ระบบซื้อขายกองทุน (Mini) — ระบบตัวอย่างสำหรับฝึกทดสอบ QA · ต้องเปิด FundFlow API ด้วย RUN-FUNDFLOW.bat ก่อนใช้งาน" />
      {FF_MENU.map(g => (
        <section key={g.group} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>{g.group}</h2>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
            {g.items.map(i => <Link key={i.href} href={i.href} className="card kpi"><div className="v" style={{ fontSize: 16 }}>{i.label}</div><div className="k">{i.desc}</div></Link>)}
          </div>
        </section>
      ))}
    </AppShell>
  );
}
