import { STATUS_COLOR, cn } from "@/lib/utils";

export function Badge({ status, children, className }: { status?: string; children?: React.ReactNode; className?: string }) {
  const color = (status && STATUS_COLOR[status]) || "gray";
  return <span className={cn("badge", `b-${color}`, className)}>{children ?? status}</span>;
}

export function AiBadge() { return <span className="badge b-purple">AI-generated</span>; }

export function NFValue({ v }: { v?: string | number | null }) {
  if (v === undefined || v === null || v === "" || v === "NOT_FOUND") return <span className="nf">NOT_FOUND</span>;
  return <>{String(v)}</>;
}

export function AssumptionLabel() { return <span className="label-assume">AI ASSUMPTION - NOT FOUND IN BRS</span>; }
export function RecommendedLabel() { return <span className="label-rec">AI RECOMMENDED TEST - NOT EXPLICITLY DEFINED IN BRS</span>; }
