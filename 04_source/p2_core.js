"use strict";
/* ============ Utilities ============ */
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const fmtDate = s => s ? new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-";
const NF = "NOT_FOUND";
const pad = (n, l = 3) => String(n).padStart(l, "0");
const clone = o => JSON.parse(JSON.stringify(o));
async function sha256(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const loadedScripts = {};
function loadScript(url) {
  if (loadedScripts[url]) return loadedScripts[url];
  loadedScripts[url] = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = url; s.onload = res;
    s.onerror = () => { delete loadedScripts[url]; rej(new Error("โหลด Library ไม่สำเร็จ: " + url)); };
    document.head.appendChild(s);
  });
  return loadedScripts[url];
}
const LIB = {
  mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  papa: "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js",
  pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  zip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  bcrypt: "https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js"
};
async function bcryptLib() { await loadScript(LIB.bcrypt); return window.dcodeIO.bcrypt; }
async function hashPassword(pw) { const b = await bcryptLib(); return new Promise((res, rej) => b.hash(pw, 10, (e, h) => e ? rej(e) : res(h))); }
async function verifyPassword(pw, h) { const b = await bcryptLib(); return new Promise((res, rej) => b.compare(pw, h, (e, ok) => e ? rej(e) : res(ok))); }

/* ============ Masking (Security §33) ============ */
function mask(text) {
  return String(text ?? "")
    .replace(/(password|passwd|pwd|รหัสผ่าน)\s*[:=]\s*\S+/gi, "$1=********")
    .replace(/(token|api[_-]?key|secret|otp|cookie|session)\s*[:=]\s*\S+/gi, "$1=********")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/g, "$1********")
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-********")
    .replace(/ghp_[A-Za-z0-9]{10,}/g, "ghp_********")
    .replace(/(mysql|postgres(?:ql)?|mongodb|jdbc:[a-z]+):\/\/[^\s"']+/gi, "$1://********")
    .replace(/\b\d{1}-?\d{4}-?\d{5}-?\d{2}-?\d{1}\b/g, m => "*".repeat(m.length - 4) + m.slice(-4))
    .replace(/\b(CUST|CIF|CUS)[-_]?\d{4,}\b/gi, m => m.slice(0, 4) + "****");
}

/* ============ Persistence (IndexedDB, local-first) ============ */
const DB_NAME = "brs-qa-platform", STORE = "kv";
let idb = null;
function openIdb() {
  return new Promise(res => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function idbGet(key) {
  if (!idb) return null;
  return new Promise(res => { try { const t = idb.transaction(STORE).objectStore(STORE).get(key); t.onsuccess = () => res(t.result ?? null); t.onerror = () => res(null); } catch { res(null); } });
}
async function idbSet(key, val) {
  if (!idb) { try { localStorage.setItem(DB_NAME + ":" + key, JSON.stringify(val)); } catch {} return; }
  return new Promise(res => { try { const t = idb.transaction(STORE, "readwrite"); t.objectStore(STORE).put(val, key); t.oncomplete = () => res(true); t.onerror = () => res(false); } catch { res(false); } });
}
const emptyState = () => ({
  schema: 1, seq: {}, users: [], projects: [], documents: [], requirements: [], conflicts: [],
  scenarios: [], testCases: [], artifacts: [], runs: [], githubProposals: [], impacts: [], comments: [], audit: [],
  settings: { sessionMinutes: 30, aiMode: "claude", vision: false, runnerTimeoutSec: 60, runnerMaxLogKb: 256,
    maxFileMb: 50, envAllowlist: ["https://sit.example.test", "https://uat.example.test"], jmeterMaxUsers: 50, jmeterMaxMinutes: 10,
    githubOwner: "", githubRepo: "", language: "th" }
});
let S = emptyState();
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => idbSet("state", S), 250); }
async function loadState() {
  idb = await openIdb();
  let st = await idbGet("state");
  if (!st && !idb) { try { st = JSON.parse(localStorage.getItem(DB_NAME + ":state") || "null"); } catch {} }
  if (st && st.schema === 1) { S = Object.assign(emptyState(), st); S.settings = Object.assign(emptyState().settings, st.settings || {}); }
}
function nextSeq(key) { S.seq[key] = (S.seq[key] || 0) + 1; return S.seq[key]; }

/* ============ Auth, Session, RBAC ============ */
const ROLES = { ADMIN: "Admin", QA_MANUAL: "QA Manual", QA_AUTOMATION: "QA Automation", BA: "Business Analyst" };
const PERMS = {
  "project.manage": ["ADMIN"],
  "doc.upload": ["ADMIN", "QA_MANUAL"],
  "doc.process": ["ADMIN", "QA_MANUAL"],
  "req.edit": ["ADMIN", "QA_MANUAL"],
  "req.approve": ["ADMIN", "QA_MANUAL"],
  "question.answer": ["ADMIN", "QA_MANUAL", "BA"],
  "question.resolve": ["ADMIN", "QA_MANUAL", "BA"],
  "assumption.edit": ["ADMIN", "QA_MANUAL"],
  "conflict.resolve": ["ADMIN", "QA_MANUAL", "BA"],
  "impact.approve": ["ADMIN", "QA_MANUAL"],
  "scenario.edit": ["ADMIN", "QA_MANUAL"],
  "tc.edit": ["ADMIN", "QA_MANUAL"],
  "tc.approve": ["ADMIN", "QA_MANUAL"],
  "tc.export": ["ADMIN", "QA_MANUAL", "QA_AUTOMATION"],
  "comment": ["ADMIN", "QA_MANUAL", "QA_AUTOMATION", "BA"],
  "auto.generate": ["ADMIN", "QA_AUTOMATION"],
  "auto.edit": ["ADMIN", "QA_AUTOMATION"],
  "auto.view": ["ADMIN", "QA_AUTOMATION", "QA_MANUAL"],
  "run.execute": ["ADMIN", "QA_AUTOMATION"],
  "run.view": ["ADMIN", "QA_AUTOMATION", "QA_MANUAL", "BA"],
  "github.propose": ["ADMIN", "QA_AUTOMATION"],
  "github.approve": ["ADMIN", "QA_AUTOMATION"],
  "settings": ["ADMIN"],
  "audit.view": ["ADMIN"]
};
let session = null; // {userId, lastActive}
const me = () => session && S.users.find(u => u.id === session.userId);
function can(perm) { const u = me(); return !!u && (PERMS[perm] || []).includes(u.role); }
function guard(perm) { if (!can(perm)) { toast("คุณไม่มีสิทธิ์ทำรายการนี้ (" + perm + ")", true); audit("PERMISSION_DENIED", perm); return false; } return true; }
function audit(action, entity, detail = "") {
  const u = me();
  S.audit.unshift({ id: uid(), at: now(), user: u ? u.username : "anonymous", action, entity: mask(entity), detail: mask(detail), correlationId: uid().slice(0, 8) });
  if (S.audit.length > 3000) S.audit.length = 3000;
  save();
}
function touchSession() { if (session) { session.lastActive = Date.now(); try { sessionStorage.setItem("brs-session", JSON.stringify(session)); } catch {} } }
function restoreSession() {
  try { const s = JSON.parse(sessionStorage.getItem("brs-session") || "null"); if (s && Date.now() - s.lastActive < S.settings.sessionMinutes * 60000 && S.users.find(u => u.id === s.userId && u.active)) session = s; } catch {}
}
function logout(reason) {
  if (session) audit("LOGOUT", me()?.username || "", reason || "");
  session = null; try { sessionStorage.removeItem("brs-session"); } catch {}
  location.hash = "#/login"; if (reason) toast(reason);
  render();
}
["click", "keydown"].forEach(ev => document.addEventListener(ev, () => touchSession(), true));
setInterval(() => { if (session && Date.now() - session.lastActive > S.settings.sessionMinutes * 60000) logout("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่"); }, 15000);
const loginAttempts = [];
async function seedIfEmpty() {
  if (S.users.length) return;
  S.users.push({ id: uid(), username: "admin", name: "System Admin", role: "ADMIN", hash: await hashPassword("Admin@12345"), mustChange: true, active: true, created: now() });
  save();
}

/* ============ Error model (§38) ============ */
function appError(code, userMessage, technical = "", retryable = false, action = "") {
  return { code, userMessage, technical: mask(technical), timestamp: now(), retryable, suggestedAction: action, correlationId: uid().slice(0, 8) };
}

/* ============ Toast & Modal ============ */
function toast(msg, err = false) {
  const d = document.createElement("div"); if (err) d.className = "err"; d.textContent = msg;
  $("#toast").appendChild(d); setTimeout(() => d.remove(), err ? 6000 : 3500);
}
function modal(html, wide = false) {
  $("#modal").innerHTML = `<div class="modal-bg" data-act="modal-bg"><div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div></div>`;
  const f = $("#modal").querySelector("input,textarea,select,button"); if (f) f.focus();
}
function closeModal() { $("#modal").innerHTML = ""; }
function confirmDialog(title, body, okLabel = "ยืนยัน", danger = false) {
  return new Promise(res => {
    modal(`<h2>${esc(title)}</h2><div>${body}</div><div class="acts"><button class="btn" id="cfNo">ยกเลิก</button><button class="btn ${danger ? "danger" : "pri"}" id="cfYes">${esc(okLabel)}</button></div>`);
    $("#cfNo").onclick = () => { closeModal(); res(false); };
    $("#cfYes").onclick = () => { closeModal(); res(true); };
  });
}
function promptDialog(title, label, def = "", required = true) {
  return new Promise(res => {
    modal(`<h2>${esc(title)}</h2><div class="field"><label>${esc(label)}</label><textarea id="pdIn">${esc(def)}</textarea></div><div class="acts"><button class="btn" id="pdNo">ยกเลิก</button><button class="btn pri" id="pdYes">บันทึก</button></div>`);
    $("#pdNo").onclick = () => { closeModal(); res(null); };
    $("#pdYes").onclick = () => { const v = $("#pdIn").value.trim(); if (required && !v) { toast("กรุณากรอกข้อมูล", true); return; } closeModal(); res(v); };
  });
}

/* ============ Status badges (§36 color convention) ============ */
const STATUS_COLOR = {
  DRAFT: "gray", AI_GENERATED: "purple", WAITING_FOR_REVIEW: "orange", NEEDS_CLARIFICATION: "orange", CONFLICT: "red",
  REVISED: "blue", APPROVED: "green", READY_FOR_AUTOMATION: "green", AUTOMATED: "green", DEPRECATED: "gray",
  NEEDS_CONFIGURATION: "orange", NEEDS_VISUAL_REVIEW: "orange", PASSED: "green", FAILED: "red", BLOCKED: "orange", RUNNING: "blue",
  QUEUED: "gray", CANCELLED: "gray", DONE: "green", PENDING: "gray", OPEN: "orange", RESOLVED: "green", REJECTED: "red",
  PROPOSED: "purple", EXECUTED: "green", "No Impact": "gray", "Review Required": "orange", "Update Required": "red", "New Test Required": "blue", "Deprecation Candidate": "gray"
};
const badge = (s, txt) => `<span class="badge b-${STATUS_COLOR[s] || "gray"}">${esc(txt || s)}</span>`;
const aiBadge = () => `<span class="badge b-purple">AI-generated</span>`;
const nfv = v => (v === undefined || v === null || v === "" || v === NF) ? `<span class="nf">${NF}</span>` : esc(v);

/* ============ Downloads ============ */
let capDownloads = null, capSample = null;
async function downloadFile(filename, data) {
  if (capDownloads) {
    try { await capDownloads.save({ filename, data }); audit("DOWNLOAD", filename); toast("บันทึกไฟล์ " + filename); return; }
    catch (e) { if (e && e.code === "declined") return; if (e && e.code === "rejected_extension") { toast("ไม่รองรับนามสกุลไฟล์นี้ — ใช้ Download ZIP แทน", true); return; } }
  }
  const blob = data instanceof Blob ? data : new Blob([data]);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  audit("DOWNLOAD", filename);
}
async function downloadZip(zipName, files) {
  await loadScript(LIB.zip);
  const z = new JSZip();
  Object.entries(files).forEach(([p, c]) => z.file(p, c));
  const blob = await z.generateAsync({ type: "blob" });
  await downloadFile(zipName, blob);
}
