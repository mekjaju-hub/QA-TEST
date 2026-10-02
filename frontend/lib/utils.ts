import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export const NF = "NOT_FOUND";

export function fmtDate(s?: string | null): string {
  if (!s) return "-";
  try { return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); } catch { return s; }
}

// Color convention (หัวข้อ 36): blue info, green approved/passed, orange review/assumption, red conflict/failed, purple AI, gray draft
export const STATUS_COLOR: Record<string, string> = {
  DRAFT: "gray", AI_GENERATED: "purple", WAITING_FOR_REVIEW: "orange", NEEDS_CLARIFICATION: "orange", CONFLICT: "red",
  REVISED: "blue", APPROVED: "green", READY_FOR_AUTOMATION: "green", AUTOMATED: "green", DEPRECATED: "gray",
  NEEDS_CONFIGURATION: "orange", NEEDS_VISUAL_REVIEW: "orange", PASSED: "green", FAILED: "red", BLOCKED: "orange", RUNNING: "blue",
  QUEUED: "gray", CANCELLED: "gray", DONE: "green", PENDING: "gray", OPEN: "orange", RESOLVED: "green", REJECTED: "red",
  PROPOSED: "purple", EXECUTED: "green", READY_FOR_REVIEW: "green", UPLOADED: "gray", EXTRACTED: "blue", DECIDED: "green",
  GENERATED: "purple", DRAFT_CODE: "orange", ACCEPTED: "green",
  "No Impact": "gray", "Review Required": "orange", "Update Required": "red", "New Test Required": "blue", "Deprecation Candidate": "gray",
};

export const TEST_TYPES = ["Positive", "Negative", "Boundary", "Integration", "Data", "API"];
