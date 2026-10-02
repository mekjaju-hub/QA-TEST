import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { Button } from "./button";

export function Loading({ label = "กำลังโหลด…" }: { label?: string }) {
  return <div className="loading" role="status" aria-live="polite"><div className="skeleton" style={{ width: "60%", margin: "8px auto" }} /><div className="skeleton" style={{ width: "40%", margin: "8px auto" }} />{label}</div>;
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return <div className="card empty"><h3>{title}</h3>{body && <p>{body}</p>}{action}</div>;
}

// Error state (PAGE_SPEC 27.6): Error Code, User Message, Correlation ID, Retry
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error.body : { code: "ERROR", user_message: String(error), correlation_id: "-", suggested_action: "", retryable: true, technical: undefined };
  return (
    <div className="err-box" role="alert">
      <b>{e.user_message}</b>
      <div className="small">Error Code: <span className="mono">{e.code}</span> · Correlation ID: <span className="mono">{e.correlation_id}</span></div>
      {e.suggested_action && <div className="small">แนะนำ: {e.suggested_action}</div>}
      {e.technical && <details className="small"><summary>Technical Detail (Admin)</summary><pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{e.technical}</pre></details>}
      {onRetry && <div style={{ marginTop: 8 }}><Button size="sm" onClick={onRetry}>ลองใหม่</Button></div>}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function ScoreBar({ label, score }: { label: string; score: number }) {
  const col = score >= 80 ? "var(--green)" : score >= 60 ? "var(--orange)" : "var(--red)";
  return <div className="score"><span className="small" style={{ minWidth: 100 }}>{label}</span><span className="bar"><i style={{ width: `${score}%`, background: col }} /></span><b>{score}</b></div>;
}
