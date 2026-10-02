"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Images require the Bearer token, so fetch → blob URL instead of <img src="/api/...">
export function AuthImage({ src, alt, style, onClick }: { src: string; alt: string; style?: React.CSSProperties; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    api.raw(src).then(r => r.blob()).then(b => { u = URL.createObjectURL(b); setUrl(u); }).catch(() => setUrl(null));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [src]);
  return url ? <img src={url} alt={alt} style={style} onClick={onClick} /> : <div className="skeleton" style={{ height: 100 }} aria-label={alt} />;
}
