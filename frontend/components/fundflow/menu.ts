// FundFlow main menu + submenus (used by the sidebar in shell.tsx and the /fundflow hub page)
export type FFItem = { href: string; label: string; desc: string };
export const FF_MENU: { group: string; items: FFItem[] }[] = [
  { group: "ลูกค้า (Customer)", items: [
    { href: "/fundflow/funds", label: "ตลาดกองทุน", desc: "รายการกองทุน กรองตามกลุ่ม ซื้อกองทุน" },
    { href: "/fundflow/portfolio", label: "พอร์ตของฉัน", desc: "กองที่ถือ มูลค่า กำไร/ขาดทุน ขาย/สับเปลี่ยน" },
    { href: "/fundflow/orders", label: "คำสั่งซื้อขาย", desc: "ประวัติคำสั่ง ยกเลิก / ยืนยัน (BO)" },
  ] },
  { group: "Back-office (Staff)", items: [
    { href: "/fundflow/staff/dashboard", label: "ภาพรวมการซื้อขาย", desc: "KPI และรายการล่าสุด (ADMIN)" },
    { href: "/fundflow/staff/trade", label: "ซื้อ / ขาย / สับเปลี่ยน", desc: "ทำรายการแทนลูกค้า (ADMIN, SALE)" },
    { href: "/fundflow/staff/accounts", label: "เปิดบัญชี", desc: "เปิดบัญชีลูกค้าใหม่ (ADMIN)" },
    { href: "/fundflow/staff/add-fund", label: "สร้างกองทุน", desc: "เพิ่มกองทุนใหม่ (ADMIN)" },
    { href: "/fundflow/staff/reports", label: "รายงาน (.txt)", desc: "รายงานรายการซื้อขายตามบัญชี (ADMIN)" },
  ] },
];
