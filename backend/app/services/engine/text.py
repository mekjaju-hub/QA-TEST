"""Normalize + section building + chunking — port of 04_source/p3_engine.js (§6 Step 3–4)."""
from __future__ import annotations

import re
import uuid

NF = "NOT_FOUND"


def uid() -> str:
    return str(uuid.uuid4())


def normalize_text(t: object) -> str:
    s = "" if t is None else str(t)
    s = re.sub(r"[​-‍﻿]", "", s)
    s = s.replace("ํา", "ำ")  # นิคหิต + สระอา → สระอำ
    s = re.sub(r"\r\n?", "\n", s)
    s = re.sub(r"[ \t ]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


HEADING_RE = re.compile(
    r"^(?:#{1,4}\s+.+|(?:\d+(?:\.\d+){0,3})[.)]?\s+\S.{0,120}|(?:ส่วนที่|หมวด|บทที่|Section|Chapter|Rule|กฎข้อ)\s*\d+.{0,120})$",
    re.I,
)
_HEADING_VERB = re.compile(r"(ต้อง|จะ|shall|must|should|ให้ระบบ)", re.I)


def is_heading(line: str) -> bool:
    ln = line.strip()
    if len(ln) < 2 or len(ln) > 130 or re.search(r"[.;:]$", ln):
        return False
    if not HEADING_RE.match(ln):
        return False
    if len(ln) > 45 and _HEADING_VERB.search(ln):
        return False
    return True


def text_to_blocks(text: str, page: int | None = None) -> list[dict]:
    blocks = []
    for line in normalize_text(text).split("\n"):
        ln = line.strip()
        if ln:
            blocks.append({"type": "heading" if is_heading(ln) else "para", "text": ln, "page": page})
    return blocks


def _rows_text(rows: list[list[str]]) -> str:
    return "\n".join(" | ".join(r) for r in rows)


def blocks_to_sections(blocks: list[dict], doc_name: str) -> list[dict]:
    sections: list[dict] = []
    cur: dict | None = None
    seq = 0

    def open_section(title: str | None, page):
        nonlocal cur, seq
        seq += 1
        cur = {"id": uid(), "seq": seq, "title": title or doc_name, "parent_title": None, "page": page, "page_end": page,
               "kind": "text", "text": "", "original_text": "", "rows": None, "comments": [], "row_offset": 1, "overlap": False, "image_ids": []}
        sections.append(cur)

    for b in blocks:
        if b["type"] == "image":
            if cur is None:
                open_section(None, b.get("page"))
            assert cur is not None
            cur["image_ids"].append(b["image_id"])
            continue
        if b["type"] == "heading":
            open_section(re.sub(r"^#+\s*", "", b["text"]), b.get("page"))
            continue
        if b["type"] == "table":
            cap = b.get("caption")
            if cur:
                parent = cur["title"]
            elif cap and cap.startswith("Worksheet"):
                parent = re.sub(r"\s*\(merged.*$", "", re.sub(r"^Worksheet:\s*", "", cap))
            else:
                parent = doc_name
            seq += 1
            txt = _rows_text(b["rows"])
            sections.append({"id": uid(), "seq": seq, "title": cap or f"ตาราง: {parent}", "parent_title": parent,
                             "page": b.get("page"), "page_end": b.get("page"), "kind": "table", "rows": b["rows"],
                             "comments": b.get("comments", []), "text": txt, "original_text": txt, "row_offset": 1, "overlap": False, "image_ids": []})
            cur = None
            continue
        if cur is None:
            open_section(None, b.get("page"))
        assert cur is not None
        cur["text"] += ("\n" if cur["text"] else "") + b["text"]
        cur["original_text"] += ("\n" if cur["original_text"] else "") + (b.get("original") or b["text"])
        if b.get("page") is not None:
            cur["page_end"] = b["page"]
    # keep text-less sections only when they carry screenshots (Needs Visual Review)
    return chunk_sections([s for s in sections if s["text"].strip() or s.get("image_ids")])


def chunk_sections(sections: list[dict], max_chars: int = 6000, max_rows: int = 40) -> list[dict]:
    """Split large text sections at line boundaries with 1-line overlap; tables by rows (never mid-row)."""
    out: list[dict] = []
    seq = 0
    for s in sections:
        if s["kind"] == "table" and len(s["rows"]) > max_rows + 1:
            header = s["rows"][0]
            part = 1
            for i in range(1, len(s["rows"]), max_rows):
                rows = [header, *s["rows"][i:i + max_rows]]
                seq += 1
                txt = _rows_text(rows)
                out.append({**s, "id": uid(), "seq": seq, "title": f"{s['title']} (ส่วน {part})", "rows": rows,
                            "text": txt, "original_text": txt, "row_offset": i})
                part += 1
        elif s["kind"] == "text" and len(s["text"]) > max_chars:
            lines = s["text"].split("\n")
            buf: list[str] = []
            part = 1
            prev_last: str | None = None

            def flush():
                nonlocal buf, part, prev_last, seq
                t = "\n".join(([prev_last] if prev_last else []) + buf)
                seq += 1
                out.append({**s, "id": uid(), "seq": seq, "title": f"{s['title']} (ส่วน {part})", "text": t,
                            "original_text": t, "overlap": bool(prev_last)})
                part += 1
                prev_last = buf[-1]
                buf = []

            for ln in lines:
                if len("\n".join(buf)) + len(ln) > max_chars and buf:
                    flush()
                buf.append(ln)
            if buf:
                flush()
        else:
            seq += 1
            out.append({**s, "seq": seq})
    return out
