/* ============ Document parsing (§5, §6) ============ */
const ALLOWED_EXT = ["docx", "xlsx", "csv", "pdf", "txt"];
function safeFilename(name) {
  const base = String(name).split(/[\\/]/).pop().replace(/\.\.+/g, ".").replace(/[<>:"|?*\x00-\x1F]/g, "_").trim();
  return base.slice(0, 180) || "document";
}
function extOf(name) { return (String(name).split(".").pop() || "").toLowerCase(); }
async function sniffType(buf, ext) {
  const b = new Uint8Array(buf.slice(0, 8));
  const isZip = b[0] === 0x50 && b[1] === 0x4B;
  const isPdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  if (ext === "docx" || ext === "xlsx") return isZip;
  if (ext === "pdf") return isPdf;
  if (ext === "csv" || ext === "txt") return !isZip && !isPdf && !b.slice(0, 8).some(x => x === 0);
  return false;
}
function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return { text: new TextDecoder("utf-8").decode(u8.slice(3)), encoding: "UTF-8 (BOM)" };
  if (u8[0] === 0xFF && u8[1] === 0xFE) return { text: new TextDecoder("utf-16le").decode(u8.slice(2)), encoding: "UTF-16LE" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(u8), encoding: "UTF-8" }; }
  catch { return { text: new TextDecoder("windows-874").decode(u8), encoding: "Windows-874 (TIS-620)" }; }
}
function normalizeText(t) {
  return String(t || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\u0E4D\u0E32/g, "\u0E33").replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00A0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
const HEADING_RE = /^(?:#{1,4}\s+.+|(?:\d+(?:\.\d+){0,3})[.)]?\s+\S.{0,120}|(?:ส่วนที่|หมวด|บทที่|Section|Chapter|Rule|กฎข้อ)\s*\d+.{0,120})$/i;
function isHeading(line) { const l = line.trim(); if (l.length < 2 || l.length > 130 || /[.;:]$/.test(l)) return false; if (!HEADING_RE.test(l)) return false; if (l.length > 45 && /(ต้อง|จะ|shall|must|should|ให้ระบบ)/i.test(l)) return false; return true; }

/* Build sections from blocks: [{type:'heading'|'para'|'table', text, rows, page}] */
function blocksToSections(blocks, docName) {
  const sections = []; let cur = null; let seq = 0;
  const open = (title, page) => { cur = { id: uid(), seq: ++seq, title: title || docName, page, pageEnd: page, kind: "text", text: "", original: "", status: "PENDING", attempts: 0, error: null, reqRefs: [] }; sections.push(cur); };
  for (const b of blocks) {
    if (b.type === "heading") { open(b.text.replace(/^#+\s*/, ""), b.page); continue; }
    if (b.type === "table") {
      const parent = cur ? cur.title : (b.caption && /^Worksheet/.test(b.caption) ? b.caption.replace(/^Worksheet:\s*/, "").replace(/\s*\(merged.*$/, "") : docName);
      sections.push({ id: uid(), seq: ++seq, title: (b.caption || ("ตาราง: " + parent)), parentTitle: parent, page: b.page, pageEnd: b.page, kind: "table", rows: b.rows, comments: b.comments || [], text: b.rows.map(r => r.join(" | ")).join("\n"), original: b.rows.map(r => r.join(" | ")).join("\n"), status: "PENDING", attempts: 0, error: null, reqRefs: [] });
      cur = null; continue;
    }
    if (!cur) open(null, b.page);
    cur.text += (cur.text ? "\n" : "") + b.text; cur.original += (cur.original ? "\n" : "") + (b.original || b.text);
    cur.pageEnd = b.page ?? cur.pageEnd;
  }
  return chunkSections(sections.filter(s => s.text.trim()));
}
/* Chunk: split big text sections at sentence/line boundaries with 1-line overlap; tables by rows (never mid-row) */
function chunkSections(sections, maxChars = 6000, maxRows = 40) {
  const out = []; let seq = 0;
  for (const s of sections) {
    if (s.kind === "table" && s.rows.length > maxRows + 1) {
      const header = s.rows[0];
      for (let i = 1, part = 1; i < s.rows.length; i += maxRows, part++) {
        const rows = [header, ...s.rows.slice(i, i + maxRows)];
        out.push({ ...s, id: uid(), seq: ++seq, title: s.title + ` (ส่วน ${part})`, rows, text: rows.map(r => r.join(" | ")).join("\n"), original: rows.map(r => r.join(" | ")).join("\n"), rowOffset: i });
      }
    } else if (s.kind === "text" && s.text.length > maxChars) {
      const lines = s.text.split("\n"); let buf = [], part = 1, prevLast = null;
      const flush = () => { const t = (prevLast ? [prevLast] : []).concat(buf).join("\n"); out.push({ ...s, id: uid(), seq: ++seq, title: s.title + ` (ส่วน ${part++})`, text: t, original: t, overlap: !!prevLast }); prevLast = buf[buf.length - 1]; buf = []; };
      for (const l of lines) { if (buf.join("\n").length + l.length > maxChars && buf.length) flush(); buf.push(l); }
      if (buf.length) flush();
    } else out.push({ ...s, seq: ++seq });
  }
  return out;
}
function textToBlocks(text, page = null) {
  const blocks = [];
  normalizeText(text).split("\n").forEach(line => {
    const l = line.trim(); if (!l) return;
    blocks.push({ type: isHeading(l) ? "heading" : "para", text: l, page });
  });
  return blocks;
}
async function parseDocx(buf) {
  await loadScript(LIB.mammoth);
  const images = [];
  const res = await window.mammoth.convertToHtml({ arrayBuffer: buf }, {
    convertImage: window.mammoth.images.imgElement(img => img.read("base64").then(data => {
      const id = uid(); images.push({ id, contentType: img.contentType, dataUri: `data:${img.contentType};base64,${data}`, alt: img.altText || "", status: "NEEDS_VISUAL_REVIEW" });
      return { src: "img:" + id, alt: img.altText || "" };
    }))
  });
  const dom = new DOMParser().parseFromString(res.value, "text/html");
  const blocks = []; let lastImgCaption = null;
  dom.body.childNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase(), txt = normalizeText(n.textContent);
    n.querySelectorAll("img").forEach(im => { const id = (im.getAttribute("src") || "").replace("img:", ""); const rec = images.find(x => x.id === id); if (rec) { rec.nearText = blocks.length ? blocks[blocks.length - 1].text.slice(0, 200) : ""; lastImgCaption = rec; } });
    if (/^h[1-6]$/.test(tag)) { if (txt) blocks.push({ type: "heading", text: txt, page: null }); }
    else if (tag === "table") {
      const rows = [...n.querySelectorAll("tr")].map(tr => [...tr.children].map(td => normalizeText(td.textContent)));
      if (rows.length) blocks.push({ type: "table", rows, page: null });
    } else if (tag === "ul" || tag === "ol") {
      n.querySelectorAll("li").forEach(li => { const t = normalizeText(li.textContent); if (t) blocks.push({ type: "para", text: "- " + t, page: null }); });
    } else if (txt) {
      if (lastImgCaption && /^(รูป|ภาพ|Figure|Screen|หน้าจอ)/i.test(txt)) { lastImgCaption.caption = txt; lastImgCaption = null; }
      blocks.push({ type: isHeading(txt) && tag !== "p" ? "heading" : (isHeading(txt) && txt.length < 90 && !/ต้อง|shall|must|ระบบ/i.test(txt) ? "heading" : "para"), text: txt, page: null });
    }
  });
  return { blocks, images, warnings: res.messages.map(m => m.message).slice(0, 20) };
}
async function parseXlsx(buf) {
  await loadScript(LIB.xlsx);
  const wb = XLSX.read(buf, { type: "array", cellComments: true });
  const blocks = [];
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }).map(r => r.map(c => normalizeText(c)));
    const merges = (ws["!merges"] || []).length;
    const comments = [];
    Object.keys(ws).forEach(addr => { if (addr[0] !== "!" && ws[addr].c) ws[addr].c.forEach(c => comments.push({ cell: addr, text: normalizeText(c.t) })); });
    const nonEmpty = rows.filter(r => r.some(c => c));
    if (nonEmpty.length) blocks.push({ type: "table", rows: nonEmpty, caption: `Worksheet: ${name}` + (merges ? ` (merged cells: ${merges})` : ""), comments, page: null });
  });
  return { blocks, images: [], warnings: [] };
}
async function parseCsv(buf) {
  await loadScript(LIB.papa);
  const { text, encoding } = decodeText(buf);
  const r = Papa.parse(text, { skipEmptyLines: true });
  const rows = r.data.map(row => row.map(c => normalizeText(c)));
  return { blocks: [{ type: "table", rows, caption: "CSV", page: null }], images: [], warnings: [`Encoding: ${encoding}`, `Delimiter: "${r.meta.delimiter}"`] };
}
async function parsePdf(buf) {
  await loadScript(LIB.pdfWorker); await loadScript(LIB.pdf);
  const pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let lines = [], line = "", lastY = null;
    tc.items.forEach(it => { const y = Math.round(it.transform[5]); if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line); line = ""; } line += it.str; lastY = y; if (it.hasEOL) { lines.push(line); line = ""; lastY = null; } });
    if (line) lines.push(line);
    pages.push(lines.map(l => normalizeText(l)).filter(Boolean));
  }
  // remove repeated header/footer lines: exact repeats in top/bottom 2 lines on > 50% of pages; page-number lines by pattern
  const PAGE_NO = /^(?:page|หน้า|p\.)?\s*\d+(?:\s*(?:of|\/|จาก)\s*\d+)?$/i;
  const keyOf = l => PAGE_NO.test(l) ? "#PAGE#" : l;
  const freq = {}; pages.forEach(ls => new Set([...ls.slice(0, 2), ...ls.slice(-2)].map(keyOf)).forEach(k => { freq[k] = (freq[k] || 0) + 1; }));
  const removed = new Set(Object.keys(freq).filter(k => pages.length >= 3 && freq[k] / pages.length > 0.5));
  const blocks = []; const emptyPages = pages.filter(ls => !ls.length).length;
  pages.forEach((ls, i) => {
    const kept = ls.filter((l, idx) => !((idx < 2 || idx >= ls.length - 2) && removed.has(keyOf(l))));
    kept.forEach(l => blocks.push({ type: isHeading(l) ? "heading" : "para", text: l, page: i + 1 }));
  });
  const warnings = [`${doc.numPages} หน้า`, removed.size ? `ลบ Header/Footer ซ้ำ ${removed.size} รูปแบบ` : ""].filter(Boolean);
  if (emptyPages > doc.numPages * 0.5) throw appError("PDF_NO_TEXT", "PDF นี้ไม่มีข้อความที่เลือกได้ (อาจเป็น PDF Scan)", "empty pages: " + emptyPages, false, "Version นี้ยังไม่รองรับ OCR — ใช้ไฟล์ DOCX หรือ PDF ที่เลือกข้อความได้");
  return { blocks, images: [], warnings, pageCount: doc.numPages };
}
async function parseTxt(buf) { const { text, encoding } = decodeText(buf); return { blocks: textToBlocks(text), images: [], warnings: [`Encoding: ${encoding}`] }; }
async function parseDocument(buf, ext) {
  if (ext === "docx") return parseDocx(buf);
  if (ext === "xlsx") return parseXlsx(buf);
  if (ext === "csv") return parseCsv(buf);
  if (ext === "pdf") return parsePdf(buf);
  if (ext === "txt" || ext === "paste") return parseTxt(buf);
  throw appError("UNSUPPORTED_FILE", "ไม่รองรับไฟล์ประเภทนี้", ext, false, "ใช้ DOCX, XLSX, CSV, PDF หรือ TXT");
}

/* ============ Requirement analysis (§7, §8) ============ */
const REQ_KW = /(ต้อง|จะต้อง|ให้ระบบ|ระบบจะ|ระบบต้อง|สามารถ|ไม่อนุญาต|ห้าม|ไม่นำ|ไม่รวม|เฉพาะ|แสดง|คำนวณ|ตรวจสอบ|บังคับ|shall|must|should|will\s|required|mandatory|validate|only|exclude|display|calculate)/i;
const OP_PATTERNS = [
  [/(มากกว่าหรือเท่ากับ|ไม่น้อยกว่า|ตั้งแต่|>=|≥|greater than or equal to|at least|no less than)/i, ">="],
  [/(น้อยกว่าหรือเท่ากับ|ไม่เกิน|ไม่มากกว่า|<=|≤|less than or equal to|at most|not exceed(?:ing)?|no more than|up to)/i, "<="],
  [/(มากกว่า|เกินกว่า|สูงกว่า|greater than|more than|above|exceed(?:s|ing)?|>)/i, ">"],
  [/(น้อยกว่า|ต่ำกว่า|less than|below|<)/i, "<"],
  [/(เท่ากับ|equal to|equals|=)/i, "="]
];
const UNIT_RE = "(บาท|THB|USD|วันทำการ|วัน|days?|business days?|%|เปอร์เซ็นต์|ตัวอักษร|characters?|หลัก|digits?|รายการ|ครั้ง|ชั่วโมง|hours?|นาที|minutes?|เดือน|months?|ปี|years?)";
const NUM_RE = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)";
function parseThreshold(text) {
  const t = String(text);
  const dateSpan = t.match(new RegExp("(ย้อนหลัง|ภายใน|ล่วงหน้า|within|last|past|previous)\\s*" + NUM_RE + "\\s*(วันทำการ|วัน|days?|business days?|เดือน|months?|ชั่วโมง|hours?)", "i"));
  const scan = dateSpan ? t.replace(dateSpan[0], " ") : t;
  for (const [re, op] of OP_PATTERNS) {
    const m = scan.match(new RegExp(re.source + "\\s*" + NUM_RE + "\\s*" + UNIT_RE + "?", "i"));
    if (m) return { op, value: m[2].replace(/,/g, ""), unit: m[3] || NF, raw: m[0], opWord: m[1], ambiguous: false };
  }
  const up = scan.match(new RegExp(NUM_RE + "\\s*" + UNIT_RE + "?\\s*(ขึ้นไป|or more|and above)", "i"));
  if (up) return { op: ">=", value: up[1].replace(/,/g, ""), unit: up[2] || NF, raw: up[0], opWord: up[3], ambiguous: false };
  const bare = scan.match(new RegExp("(?:ยอด|จำนวน|วงเงิน|amount|total|limit|ความยาว|length)[^\\d]{0,30}" + NUM_RE + "\\s*" + UNIT_RE + "?", "i"));
  if (bare) return { op: NF, value: bare[1].replace(/,/g, ""), unit: bare[2] || NF, raw: bare[0], opWord: NF, ambiguous: true };
  return null;
}
function parseDateRange(text) {
  const m = String(text).match(new RegExp("(ย้อนหลัง|ภายใน|ล่วงหน้า|within|last|past|previous)\\s*" + NUM_RE + "\\s*(วันทำการ|วัน|days?|business days?|เดือน|months?|ชั่วโมง|hours?)", "i"));
  if (m) return m[0];
  const r = String(text).match(/(ระหว่างวันที่|ตั้งแต่วันที่|from)\s*[^,;\n]{3,40}(ถึง|to|until)\s*[^,;\n]{3,30}/i);
  return r ? r[0] : NF;
}
const pick = (text, re) => { const m = String(text).match(re); return m ? m[0].trim().slice(0, 200) : NF; };
const ROLE_RE = /(ผู้ดูแลระบบ|Admin(?:istrator)?|Maker|Checker|Approver|ผู้อนุมัติ|ผู้บันทึก|เจ้าหน้าที่[^\s,.;]*|Supervisor|หัวหน้า[^\s,.;]*|Operator|Teller|Compliance(?: Officer)?|RM\b|Relationship Manager|Role\s*[:=]?\s*[A-Za-z_]+|ผู้ใช้(?:งาน)?ที่มีสิทธิ์[^\s,.;]*|ผู้ใช้งานกลุ่ม[^\s,.;]*)/i;
const TYPE_RULES = [
  ["API Requirement", /(\bAPI\b|endpoint|request|response|REST|JSON|HTTP|status code)/i],
  ["Integration Requirement", /(interface|เชื่อมต่อ|ส่งข้อมูลไปยัง|รับข้อมูลจาก|integration|ระบบภายนอก|core banking)/i],
  ["Batch Requirement", /(batch|ทุกวันเวลา|รอบการประมวลผล|schedule|end of day|EOD|job)/i],
  ["Report Requirement", /(รายงาน|report)/i],
  ["File Requirement", /(ไฟล์|file|CSV|export|import|อัปโหลด|upload|download)/i],
  ["Validation Rule", /(ตรวจสอบ|validate|validation|บังคับกรอก|required|mandatory|รูปแบบ|format|ไม่ถูกต้อง|invalid|ความยาว|length)/i],
  ["UI Requirement", /(หน้าจอ|ปุ่ม|screen|button|dropdown|popup|เมนู|menu|คลิก|click)/i],
  ["Process Flow", /(ขั้นตอน|flow|จากนั้น|ส่งต่อ|workflow|อนุมัติ|approve|สถานะ.*เปลี่ยน)/i],
  ["Field Requirement", /(ฟิลด์|field|ช่อง|column|คอลัมน์)/i],
  ["Text Condition", /(ข้อความ|message|คำว่า|label)/i],
  ["Data Requirement", /(ข้อมูล|data|database|table|record|ฐานข้อมูล)/i]
];
function classify(text, hasRule) {
  if (hasRule) { for (const [t, re] of TYPE_RULES.slice(0, 6)) if (re.test(text)) return t; return "Business Rule"; }
  for (const [t, re] of TYPE_RULES) if (re.test(text)) return t;
  return "Business Rule";
}
const VAGUE_RE = /(เหมาะสม|ประมาณ|รวดเร็ว|ถ้าเป็นไปได้|อาจจะ|บางกรณี|ฯลฯ|และอื่นๆ|และอื่น ๆ|ตามความเหมาะสม|โดยทั่วไป|\betc\b|\bTBD\b|appropriate|user[- ]friendly|as needed|fast|quickly|some cases|if possible)/gi;
function moduleFrom(title, fallback) {
  const m = String(title || "").match(/(Rule|Module|โมดูล|กฎข้อ)\s*(\d+)/i);
  if (m) return (/(rule|กฎ)/i.test(m[1]) ? "RULE" : "MOD") + m[2];
  const w = String(title || "").match(/[A-Za-z]{3,}/g);
  if (w) { const cand = w.find(x => !/^(section|chapter|table|the|and|for)$/i.test(x)); if (cand) return cand.toUpperCase().slice(0, 16); }
  return fallback;
}
/* Split section into candidate requirement statements */
function candidateStatements(section) {
  if (section.kind === "table") {
    const [header, ...rows] = section.rows;
    const fieldTable = header && header.some(h => /(field|ฟิลด์|ชื่อข้อมูล|column|rule|เงื่อนไข|requirement|ความต้องการ|description|คำอธิบาย|validation)/i.test(h));
    return rows.map((r, i) => {
      const text = header ? r.map((c, j) => c ? `${header[j] || "Col" + (j + 1)}: ${c}` : "").filter(Boolean).join("; ") : r.join(" | ");
      return { text, row: (section.rowOffset || 1) + i, fieldTable };
    }).filter(x => x.text && (x.fieldTable || REQ_KW.test(x.text)));
  }
  const lines = section.text.split("\n"); const out = []; let lead = null;
  lines.forEach(l => {
    const t = l.trim(); if (!t) return;
    if (/[:：]$/.test(t) && t.length < 200) { lead = t; return; }
    const isBullet = /^[-•*]\s|^\(?[a-zก-ฮ0-9]{1,2}[.)]\s/i.test(t);
    const text = (isBullet && lead) ? lead + " " + t.replace(/^[-•*]\s*/, "") : t;
    if (!isBullet) lead = null;
    const parts = text.length > 350 ? text.split(/(?<=[.;])\s+(?=\S)/) : [text];
    parts.forEach(p => { if (REQ_KW.test(p) && p.length > 12) out.push({ text: p.trim() }); });
  });
  return out;
}
function extractFields(text, fieldTable) {
  const th = parseThreshold(text);
  const hasCond = /(ถ้า|หาก|เมื่อ|กรณี|if|when|where)/i.test(text) || !!th;
  const expM = text.match(/(ต้อง|จะต้อง|ให้ระบบ|ระบบจะ|ระบบต้อง|shall|must|will)\s*(.{4,220})/i);
  const expected = expM && /(แสดง|ไม่แสดง|ได้|บันทึก|ส่ง|คำนวณ|สร้าง|แจ้ง|ปฏิเสธ|reject|return|display|show|calculate|save|send|generate|error|ข้อความ|นำมา|ไม่นำ|รวม|ไม่รวม|เปลี่ยนสถานะ|block|บล็อก|ห้าม|export|ส่งออก|ตอบกลับ|HTTP|สามารถ)/i.test(expM[2]) ? expM[2].trim() : NF;
  return {
    businessRule: hasCond ? text.slice(0, 300) : NF,
    preconditions: pick(text, /(เมื่อ|หาก|ถ้า|กรณีที่|when|if)\s*(?:[^,;]|,(?=\d)){3,120}/i),
    input: fieldTable ? text.split(";")[0] : pick(text, /(กรอก|ระบุ|รับค่า|อัปโหลด|upload|ค้นหา|เลือก|ฟิลด์|field|parameter|request|ข้อมูล(?:รายการ|ธุรกรรม|ลูกค้า)[^\s,;]*|transaction[s]?|ยอด[^\s,;]*)(?:[^,;]|,(?=\d)){0,80}/i),
    process: pick(text, /(คำนวณ|รวม|sum|ตรวจสอบ|validate|กรอง|filter|จัดกลุ่ม|group|เปรียบเทียบ|compare|นับ|count)(?:[^,;]|,(?=\d)){0,100}/i),
    output: pick(text, /(แสดง|รายงาน|report|output|ไฟล์|export|response|ผลลัพธ์|ส่งออก|แจ้งเตือน|alert|display)(?:[^,;]|,(?=\d)){0,100}/i),
    expected,
    role: pick(text, ROLE_RE),
    threshold: th ? (th.op === NF ? th.value : `${th.op} ${th.value}`) : NF,
    thresholdRaw: th ? th.raw.trim() : NF, thresholdOp: th ? th.op : NF, thresholdValue: th ? th.value : NF, thresholdAmbiguous: th ? th.ambiguous : false,
    unit: th ? th.unit : NF,
    dateRange: parseDateRange(text),
    inclusion: pick(text, /(เฉพาะ|รวมถึง|include[sd]?|only)\s*(?:[^,;]|,(?=\d)){2,100}/i),
    exclusion: pick(text, /(ไม่นำ|ไม่รวม|ยกเว้น|exclude[sd]?|except)\s*(?:[^,;]|,(?=\d)){2,100}/i)
  };
}
function analyzeQuality(r) {
  const f = r.fields, t = r.originalText, has = v => v && v !== NF;
  const money = /(บาท|THB|USD|ยอด|amount|เงิน)/i.test(t);
  const timeish = /(เวลา|time|timestamp|วันที่|date|ชั่วโมง|hour|cut-?off)/i.test(t);
  const numeric = has(f.thresholdValue) || /(มากกว่า|น้อยกว่า|เกิน|ไม่เกิน|ขั้นต่ำ|สูงสุด|limit|threshold|at least|more than|less than)/i.test(t);
  const dateish = has(f.dateRange) || /(ย้อนหลัง|ช่วงวันที่|รายเดือน|monthly|daily|รายวัน|period)/i.test(t);
  const checks = [
    ["มี Input", has(f.input), 15, true],
    ["มี Output", has(f.output), 10, true],
    ["มี Expected Result", has(f.expected), 25, true],
    ["ระบุ Role", has(f.role), 15, !/(Batch|Data Requirement|Field Requirement)/.test(r.type)],
    ["มี Business Rule / เงื่อนไข", has(f.businessRule), 10, true],
    ["มี Threshold", has(f.thresholdValue), 10, numeric],
    ["ระบุหน่วยของ Threshold", has(f.unit), 5, has(f.thresholdValue)],
    ["มี Date Range", has(f.dateRange), 10, dateish]
  ];
  const app = checks.filter(c => c[3]);
  const total = app.reduce((a, c) => a + c[2], 0), got = app.filter(c => c[1]).reduce((a, c) => a + c[2], 0);
  const completeness = { score: total ? Math.round(got / total * 100) : 0, reasons: app.map(c => ({ ok: c[1], text: c[1] ? c[0] : c[0].replace(/^มี |^ระบุ/, "ไม่มี ").replace("ไม่มี หน่วย", "ไม่ระบุหน่วย").replace("ไม่มี Role", "ไม่ระบุ Role") })) };
  const issues = []; let clarity = 100;
  const resolved = new Set((r.questions || []).filter(q => q.resolved).map(q => q.key));
  const confirmed = [];
  const pen = (key, p, text) => { if (resolved.has(key)) { confirmed.push({ ok: true, text: text.replace(/\s*\(-\d+\)$/, "") + " → ยืนยันแล้วจาก Clarification" }); return; } clarity -= p; issues.push({ key, text }); };
  const vague = [...new Set((t.match(VAGUE_RE) || []).map(x => x.toLowerCase()))];
  if (vague.length) { const p = Math.min(30, 10 * vague.length); pen("vague", p, `ใช้คำกำกวม: ${vague.join(", ")} (-${p})`); }
  if (f.thresholdAmbiguous && f.thresholdOp === NF) pen("operator", 20, "มีตัวเลขแต่ไม่ระบุเครื่องหมายเปรียบเทียบ (> / >= / < / <=) (-20)");
  if (has(f.thresholdValue) && !has(f.unit)) pen("unit", 10, "Threshold ไม่มีหน่วย (-10)");
  if (has(f.thresholdValue) && /(ตั้งแต่.*ถึง|ระหว่าง)/.test(t) && !/(รวม|inclusive|exclusive)/i.test(t)) pen("inclusive", 5, "ไม่ระบุชัดว่ารวมค่าขอบหรือไม่ (-5)");
  if (dateish && !/(วันทำการ|business day|calendar|วันปฏิทิน)/i.test(t)) pen("daytype", 10, "ไม่ระบุว่าเป็น Calendar Day หรือ Business Day (-10)");
  if (dateish && !/(รวมวัน|inclusive|exclusive|ไม่รวมวัน)/i.test(t)) pen("dateinclusive", 5, "ไม่ระบุ Inclusive/Exclusive ของช่วงวันที่ (-5)");
  if (money && numeric && !/(ปัดเศษ|ทศนิยม|round|decimal)/i.test(t)) pen("rounding", 5, "ไม่ระบุการปัดเศษ (-5)");
  if (timeish && !/(timezone|time zone|GMT|UTC|ICT|เวลาประเทศไทย|\+0?7)/i.test(t)) pen("timezone", 5, "ไม่ระบุ Timezone (-5)");
  if (/Validation/.test(r.type) && !/(ข้อความ|message|แจ้งเตือนว่า|error)/i.test(t)) pen("errormsg", 10, "ไม่ระบุ Error Message (-10)");
  if (!has(f.expected) && !has(f.thresholdValue) && !has(f.output)) pen("untestable", 15, "ไม่สามารถทดสอบได้: ไม่มีผลลัพธ์ที่ตรวจวัดได้ (-15)");
  if (t.length > 400) pen("compound", 10, "ประโยคยาว อาจรวมหลาย Requirement (-10)");
  if (r.duplicateOf) pen("duplicate", 10, `ซ้ำกับ ${r.duplicateOf} (-10)`);
  if (r.sourceUnverified) pen("unverified", 20, "AI อ้างข้อความที่ไม่พบในต้นฉบับ (-20)");
  clarity = Math.max(0, Math.min(100, clarity));
  return { completeness, clarity: { score: clarity, reasons: (issues.length ? issues.map(i => ({ ok: false, text: i.text })) : [{ ok: true, text: "ไม่พบคำกำกวมหรือเงื่อนไขที่ขาด" }]).concat(confirmed) }, issueKeys: issues.map(i => i.key), money, timeish, dateish };
}
const QUESTION_BANK = {
  expected: { q: "Requirement นี้ต้องได้ผลลัพธ์ (Expected Result) อะไรที่ตรวจสอบได้?", a: null, field: "expected" },
  role: { q: "Role ใดมีสิทธิ์ทำรายการนี้?", a: "สมมติว่าเฉพาะผู้ใช้ที่ได้รับสิทธิ์ของ Module นี้เท่านั้น", field: "role" },
  input: { q: "Input ของ Requirement นี้คืออะไร (Field / แหล่งข้อมูล)?", a: null, field: "input" },
  operator: { q: v => `Threshold ${v} ต้องใช้เงื่อนไขใด (> / >= / < / <=) และรวมค่าที่เท่ากับ ${v} หรือไม่?`, a: v => `สมมติว่ารวมค่าที่เท่ากับ ${v} (>=)`, field: "thresholdOp" },
  unit: { q: "Threshold นี้ใช้หน่วยอะไร?", a: "สมมติว่าเป็นบาท (THB) หากเป็นจำนวนเงิน", field: "unit" },
  daytype: { q: "ช่วงวันที่นี้ใช้ Calendar Day หรือ Business Day?", a: "สมมติว่าใช้ Calendar Day", field: null },
  dateinclusive: { q: "ช่วงวันที่รวมวันเริ่มต้นและวันสิ้นสุดหรือไม่?", a: "สมมติว่ารวมทั้งวันเริ่มต้นและวันสิ้นสุด (Inclusive)", field: null },
  inclusive: { q: "ช่วงค่าที่ระบุรวมค่าขอบบนและขอบล่างหรือไม่?", a: "สมมติว่ารวมค่าขอบทั้งสองด้าน", field: null },
  rounding: { q: "การคำนวณจำนวนเงินต้องปัดเศษอย่างไร (กี่ตำแหน่ง, ROUND_HALF_UP?)", a: "สมมติว่าปัดทศนิยม 2 ตำแหน่งแบบ ROUND_HALF_UP", field: null },
  timezone: { q: "วันที่และเวลาอ้างอิง Timezone ใด?", a: "สมมติว่าใช้ Asia/Bangkok (UTC+07:00)", field: null },
  errormsg: { q: "เมื่อข้อมูลไม่ผ่าน Validation ระบบต้องแสดง Error Message อะไร?", a: null, field: null },
  untestable: { q: "จะวัดผลว่า Requirement นี้ผ่านได้อย่างไร (ผลลัพธ์ที่ตรวจสอบได้)?", a: null, field: "expected" },
  vague: { q: t => `คำว่า "${t}" หมายถึงอะไรในเชิงตัวเลขหรือเงื่อนไขที่วัดได้?`, a: null, field: null },
  nullcase: { q: "หากข้อมูลเป็น Null หรือว่าง ระบบต้องแสดงอะไร?", a: "สมมติว่าระบบแสดง Validation Error", field: null }
};
function buildQuestions(r, q) {
  const out = [], f = r.fields;
  const add = (key, qt, at, field) => out.push({ id: uid(), key, text: qt, answer: "", resolved: false, field, assumption: at ? { id: uid(), text: at, state: "DRAFT" } : null, created: now() });
  if (f.expected === NF) add("expected", QUESTION_BANK.expected.q, null, "expected");
  if (f.role === NF && q.completeness.reasons.some(x => !x.ok && /Role/.test(x.text))) add("role", QUESTION_BANK.role.q, QUESTION_BANK.role.a, "role");
  q.issueKeys.forEach(k => {
    if (k === "operator") add(k, QUESTION_BANK.operator.q(Number(f.thresholdValue).toLocaleString("en-US")), QUESTION_BANK.operator.a(Number(f.thresholdValue).toLocaleString("en-US")), "thresholdOp");
    else if (k === "vague") { const v = [...new Set((r.originalText.match(VAGUE_RE) || []))]; v.slice(0, 2).forEach(w => add(k, QUESTION_BANK.vague.q(w), null, null)); }
    else if (QUESTION_BANK[k] && !["duplicate", "compound", "unverified"].includes(k)) { const b = QUESTION_BANK[k]; if (!out.some(o => o.key === k)) add(k, b.q, b.a, b.field); }
  });
  if (/Validation|Field/.test(r.type) && !/(null|ค่าว่าง|ว่าง|blank|empty)/i.test(r.originalText)) add("nullcase", QUESTION_BANK.nullcase.q, QUESTION_BANK.nullcase.a, null);
  return out;
}
function decideStatus(r) {
  if (r.conflictStatus === "OPEN") return "CONFLICT";
  const openQ = r.questions.filter(q => !q.resolved);
  const blocking = openQ.some(q => ["expected", "operator", "untestable", "vague", "role", "unit", "errormsg"].includes(q.key));
  if (blocking || r.clarity.score < 70 || r.completeness.score < 50) return openQ.length ? "NEEDS_CLARIFICATION" : "WAITING_FOR_REVIEW";
  return "WAITING_FOR_REVIEW";
}
/* Character bigram Dice similarity (works for Thai without word segmentation) */
function bigrams(s) { const t = String(s).toLowerCase().replace(/[\d,.]+/g, "#").replace(/(มากกว่าหรือเท่ากับ|น้อยกว่าหรือเท่ากับ|มากกว่า|น้อยกว่า|ไม่เกิน|ไม่น้อยกว่า|เท่ากับ|>=|<=|>|<|=)/g, "").replace(/\s+/g, ""); const set = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.substr(i, 2); set.set(g, (set.get(g) || 0) + 1); } return set; }
function dice(a, b) { let inter = 0, na = 0, nb = 0; a.forEach(v => na += v); b.forEach(v => nb += v); a.forEach((v, k) => { if (b.has(k)) inter += Math.min(v, b.get(k)); }); return na + nb ? 2 * inter / (na + nb) : 0; }
function detectConflicts(projectId) {
  const reqs = S.requirements.filter(r => r.projectId === projectId && r.status !== "DEPRECATED" && r.isLatest !== false);
  const grams = reqs.map(r => bigrams(r.normalizedText));
  const found = [];
  for (let i = 0; i < reqs.length; i++) for (let j = i + 1; j < reqs.length; j++) {
    const a = reqs[i], b = reqs[j];
        if ((a.supersedes || []).includes(b.id) || (b.supersedes || []).includes(a.id)) continue;
    if (S.conflicts.some(c => c.status === "RESOLVED" && ((c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id)))) continue;
    const sim = dice(grams[i], grams[j]); if (sim < 0.72) continue;
    const diffs = [];
    const fa = a.fields, fb = b.fields;
    if (fa.thresholdValue !== NF && fb.thresholdValue !== NF && Number(fa.thresholdValue) !== Number(fb.thresholdValue)) diffs.push({ field: "Threshold", a: fa.threshold, b: fb.threshold });
    else if (fa.thresholdOp !== NF && fb.thresholdOp !== NF && fa.thresholdOp !== fb.thresholdOp) diffs.push({ field: "Operator (> vs >=)", a: fa.thresholdOp, b: fb.thresholdOp });
    if (fa.dateRange !== NF && fb.dateRange !== NF && fa.dateRange.replace(/\s/g, "") !== fb.dateRange.replace(/\s/g, "")) diffs.push({ field: "Date Range", a: fa.dateRange, b: fb.dateRange });
    if (fa.role !== NF && fb.role !== NF && fa.role.toLowerCase() !== fb.role.toLowerCase()) diffs.push({ field: "Role", a: fa.role, b: fb.role });
    const mand = t => /(ไม่บังคับ|optional)/i.test(t) ? "Optional" : (/(บังคับ|mandatory|required)/i.test(t) ? "Mandatory" : null);
    const ma = mand(a.originalText), mb = mand(b.originalText);
    if (ma && mb && ma !== mb) diffs.push({ field: "Mandatory/Optional", a: ma, b: mb });
    const neg = t => /(ไม่แสดง|ไม่นำ|ไม่รวม|ห้าม|must not|shall not|exclude)/i.test(t);
    if (sim > 0.8 && neg(a.originalText) !== neg(b.originalText)) diffs.push({ field: "Expected Result", a: fa.expected, b: fb.expected });
    if (diffs.length) {
      const exists = S.conflicts.find(c => c.projectId === projectId && ((c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id)));
      if (!exists) found.push({ id: uid(), projectId, a: a.id, b: b.id, similarity: Math.round(sim * 100), diffs, status: "OPEN", history: [{ at: now(), by: "system", action: "DETECTED" }], created: now() });
    } else if (sim >= 0.95 && !a.duplicateOf && !b.duplicateOf) { b.duplicateOf = a.reqId; }
  }
  found.forEach(c => { S.conflicts.push(c); [c.a, c.b].forEach(id => { const r = S.requirements.find(x => x.id === id); r.conflictStatus = "OPEN"; r.status = "CONFLICT"; }); });
  return found.length;
}
function buildRequirement(ctx, stmt, fieldsOverride, aiMeta) {
  const fields = Object.assign(extractFields(stmt.text, stmt.fieldTable), fieldsOverride || {});
  const hasRule = fields.thresholdValue !== NF || fields.exclusion !== NF || fields.inclusion !== NF;
  const type = (fieldsOverride && fieldsOverride.__type) || classify(stmt.text, hasRule);
  delete fields.__type;
  const module = ctx.module;
  const n = nextSeq(`REQ-${ctx.project.code}-${module}`);
  const r = {
    id: uid(), reqId: `REQ-${ctx.project.code}-${module}-${pad(n)}`, projectId: ctx.project.id, docId: ctx.doc.id, docVersion: ctx.version.v,
    type, module, submodule: ctx.section.parentTitle || NF, title: (fieldsOverride && fieldsOverride.__title) || stmt.text.replace(/^[-•*]\s*/, "").slice(0, 90),
    originalText: stmt.text, normalizedText: normalizeText(stmt.text).toLowerCase(), fields,
    source: { page: ctx.section.page ?? NF, pageEnd: ctx.section.pageEnd ?? null, section: ctx.section.title, sectionId: ctx.section.id, table: ctx.section.kind === "table" ? `${ctx.section.title} แถว ${stmt.row}` : NF, screenshot: NF, docName: ctx.doc.name },
    ai: aiMeta || { engine: "rule-based", model: "deterministic-extractor", promptVersion: "n/a" },
    confidence: aiMeta && aiMeta.confidence != null ? aiMeta.confidence : 0.6, sourceUnverified: !!(aiMeta && aiMeta.unverified),
    status: "AI_GENERATED", conflictStatus: "NONE", questions: [], versions: [], comments: [],
    createdBy: me()?.username || "system", reviewedBy: null, approvedBy: null, created: now(), updated: now(), isLatest: true, origin: aiMeta && aiMeta.engine === "claude" ? "AI" : "RULE_ENGINE"
  };
  const img = (ctx.version.images || []).find(im => im.sectionId === ctx.section.id);
  if (img) r.source.screenshot = img.id;
  const q = analyzeQuality(r); r.completeness = q.completeness; r.clarity = q.clarity;
  r.questions = buildQuestions(r, q);
  r.status = decideStatus(r);
  return r;
}
function reanalyze(r) {
  const q = analyzeQuality(r); r.completeness = q.completeness; r.clarity = q.clarity;
  const kept = r.questions.filter(x => x.resolved || x.answer);
  const fresh = buildQuestions(r, q).filter(n => !kept.some(k => k.key === n.key));
  r.questions = kept.concat(fresh.filter(n => !r.questions.some(o => o.key === n.key && o.resolved)));
  if (!["APPROVED", "DEPRECATED"].includes(r.status)) r.status = decideStatus(r);
}

/* ============ Claude extraction via sample capability (§32 hallucination control) ============ */
const PROMPT_VERSION = "req-extract-v1.2";
async function aiExtractSection(ctx) {
  const sec = ctx.section;
  const body = sec.text.slice(0, 12000);
  const prompt = `You are a QA business analyst. Extract testable requirements from ONE section of a Business Requirement Specification (Thai/English).
RULES:
- Only use facts written in the section. Never invent values. Use "NOT_FOUND" for anything not written.
- "original_text" MUST be copied verbatim from the section (an exact substring).
- threshold_value must be a number that literally appears in original_text, else "NOT_FOUND".
- threshold_operator one of ">", ">=", "<", "<=", "=", or "NOT_FOUND" when the text does not state it.
- type one of: Field Requirement, Validation Rule, Business Rule, Text Condition, Process Flow, Data Requirement, API Requirement, Integration Requirement, Report Requirement, File Requirement, Batch Requirement, UI Requirement.
- Put anything inferred in "assumptions" (never inside requirement fields).
Return ONLY JSON, no markdown:
{"requirements":[{"original_text":"","title":"","type":"","business_rule":"","preconditions":"","input":"","process":"","output":"","expected_result":"","role":"","threshold_operator":"","threshold_value":"","unit":"","date_range":"","inclusion":"","exclusion":"","confidence":0.0}],
"found_in_brs":[],"assumptions":[],"recommendations":[],"clarification_questions":[],"conflicts":[],"source_references":[],"confidence":0}

SECTION TITLE: ${sec.title}
SOURCE PAGE: ${sec.page ?? "NOT_FOUND"}
SECTION TEXT:
<<<
${body}
>>>`;
  const inputHash = await sha256(new TextEncoder().encode(prompt));
  const out = await capSample.json(prompt, { modelTier: "default" });
  if (!out || !Array.isArray(out.requirements)) throw appError("AI_INVALID_JSON", "AI ตอบกลับในรูปแบบที่ไม่ถูกต้อง", JSON.stringify(out).slice(0, 300), true, "กด Retry Section");
  const norm = s => String(s || "").replace(/\s+/g, "");
  const secNorm = norm(sec.text);
  return out.requirements.map(x => {
    const orig = String(x.original_text || "").trim();
    const verified = orig && secNorm.includes(norm(orig));
    const val = x.threshold_value && x.threshold_value !== NF && orig.replace(/,/g, "").includes(String(x.threshold_value).replace(/,/g, "")) ? String(x.threshold_value).replace(/,/g, "") : NF;
    const f = v => (v && String(v).trim() && v !== "null") ? String(v).trim() : NF;
    const op = [">", ">=", "<", "<=", "="].includes(x.threshold_operator) ? x.threshold_operator : NF;
    return {
      stmt: { text: verified ? orig : (orig || "(ไม่มีข้อความ)"), fieldTable: sec.kind === "table" },
      fields: { __title: f(x.title).slice(0, 90), __type: f(x.type) !== NF ? x.type : undefined, businessRule: f(x.business_rule), preconditions: f(x.preconditions), input: f(x.input), process: f(x.process), output: f(x.output), expected: f(x.expected_result), role: f(x.role), thresholdOp: op, thresholdValue: val, threshold: val !== NF ? (op !== NF ? `${op} ${val}` : val) : NF, thresholdAmbiguous: val !== NF && op === NF, unit: f(x.unit), dateRange: f(x.date_range), inclusion: f(x.inclusion), exclusion: f(x.exclusion) },
      meta: { engine: "claude", model: "Claude (claude.ai sample capability)", promptVersion: PROMPT_VERSION, inputHash, tokenUsage: "runtime ไม่เปิดเผย", confidence: typeof x.confidence === "number" ? x.confidence : (out.confidence || 0.5), unverified: !verified, assumptions: out.assumptions || [], recommendations: out.recommendations || [] }
    };
  });
}
