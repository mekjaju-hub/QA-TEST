"use client";
import dynamic from "next/dynamic";
import { loader } from "@monaco-editor/react";

// Monaco served from /public/monaco (copied by scripts/copy-monaco.mjs) — works offline
if (typeof window !== "undefined") loader.config({ paths: { vs: "/monaco/vs" } });

const Monaco = dynamic(() => import("@monaco-editor/react").then(m => m.default), { ssr: false, loading: () => <pre className="codeview">กำลังโหลด Editor…</pre> });
const MonacoDiff = dynamic(() => import("@monaco-editor/react").then(m => m.DiffEditor), { ssr: false });

export function langOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return ({ py: "python", json: "json", sql: "sql", yml: "yaml", yaml: "yaml", md: "markdown", ini: "ini", jmx: "xml", xml: "xml", csv: "plaintext", txt: "plaintext" } as Record<string, string>)[ext || ""] || "plaintext";
}

export function CodeEditor({ path, value, onChange, readOnly, height = 520 }: { path: string; value: string; onChange?: (v: string) => void; readOnly?: boolean; height?: number }) {
  return (
    <div className="monaco-wrap" data-testid="code-editor">
      <Monaco height={height} path={path} language={langOf(path)} value={value} theme="vs-dark"
        options={{ readOnly, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: "off", tabSize: 4 }}
        onChange={v => onChange?.(v ?? "")} />
    </div>
  );
}

export function CodeDiff({ path, original, modified, height = 420 }: { path: string; original: string; modified: string; height?: number }) {
  return <div className="monaco-wrap"><MonacoDiff height={height} language={langOf(path)} original={original} modified={modified} theme="vs-dark" options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false } }} /></div>;
}
