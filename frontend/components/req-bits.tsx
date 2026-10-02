import type { Reason } from "@/lib/types";
import { NF } from "@/lib/utils";

export function Reasons({ items }: { items: Reason[] }) {
  return <ul className="reasons">{items.map((x, i) => <li key={i} className={x.ok ? "y" : "n"}>{x.text}</li>)}</ul>;
}

/** Highlight threshold/role/exclusion substrings inside the original text (Source panel). */
export function Highlight({ text, needles }: { text: string; needles: (string | undefined)[] }) {
  const ns = needles.filter((n): n is string => !!n && n !== NF && n.length > 1).sort((a, b) => b.length - a.length).slice(0, 6);
  const parts: { s: string; m: boolean }[] = [{ s: text, m: false }];
  for (const n of ns) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.m) continue;
      const k = p.s.indexOf(n);
      if (k >= 0) { parts.splice(i, 1, { s: p.s.slice(0, k), m: false }, { s: n, m: true }, { s: p.s.slice(k + n.length), m: false }); break; }
    }
  }
  return <>{parts.map((p, i) => p.m ? <mark key={i}>{p.s}</mark> : <span key={i}>{p.s}</span>)}</>;
}
