/* ============ P08 Requirement Explorer (§29) ============ */
const REQ_TYPES = ["Field Requirement", "Validation Rule", "Business Rule", "Text Condition", "Process Flow", "Data Requirement", "API Requirement", "Integration Requirement", "Report Requirement", "File Requirement", "Batch Requirement", "UI Requirement"];
const scoreBar = (label, sc) => `<div class="score"><span style="min-width:120px">${label}</span><div class="bar"><i style="width:${sc.score}%;background:${sc.score >= 80 ? "var(--green)" : sc.score >= 60 ? "var(--orange)" : "var(--red)"}"></i></div><b>${sc.score}</b></div><ul class="reasons">${sc.reasons.map(x => `<li class="${x.ok ? "y" : "n"}">${esc(x.text)}</li>`).join("")}</ul>`;
function highlight(text, needles) {
  let h = esc(text);
  needles.filter(n => n && n !== NF && n.length > 1).sort((a, b) => b.length - a.length).slice(0, 6).forEach(n => { const e = esc(n); const i = h.indexOf(e); if (i >= 0) h = h.slice(0, i) + "<mark>" + e + "</mark>" + h.slice(i + e.length); });
  return h;
}
function filteredReqs(p) {
  const f = ui.f; const s = (f.rq || "").toLowerCase();
  return S.requirements.filter(r => r.projectId === p.id && (f.rShowOld || r.isLatest !== false) &&
    (!s || (r.reqId + " " + r.title + " " + r.originalText).toLowerCase().includes(s)) &&
    (!f.rType || r.type === f.rType) && (!f.rStatus || r.status === f.rStatus) &&
    (!f.rScore || Math.min(r.completeness.score, r.clarity.score) < Number(f.rScore)) &&
    (!f.rConflict || r.conflictStatus === "OPEN") && (!f.rNc || r.status === "NEEDS_CLARIFICATION"));
}
function pageRequirements(p, q) {
  if (q.sel) { ui.sel.req = q.sel; }
  const list = filteredReqs(p);
  const r = S.requirements.find(x => x.id === ui.sel.req && x.projectId === p.id) || list[0];
  const f = ui.f;
  const toolbar = `<div class="toolbar">
    <input type="text" placeholder="ค้นหา ID / ข้อความ" value="${esc(f.rq || "")}" data-input="f" data-k="rq" aria-label="ค้นหา">
    <select data-change="f" data-k="rType"><option value="">ทุก Type</option>${REQ_TYPES.map(t => `<option ${f.rType === t ? "selected" : ""}>${t}</option>`).join("")}</select>
    <select data-change="f" data-k="rStatus"><option value="">ทุก Status</option>${["AI_GENERATED", "WAITING_FOR_REVIEW", "NEEDS_CLARIFICATION", "CONFLICT", "REVISED", "APPROVED", "DEPRECATED"].map(t => `<option ${f.rStatus === t ? "selected" : ""}>${t}</option>`).join("")}</select>
    <select data-change="f" data-k="rScore"><option value="">ทุก Score</option>${[50, 70, 90].map(n => `<option value="${n}" ${f.rScore == n ? "selected" : ""}>Score ต่ำกว่า ${n}</option>`).join("")}</select>
    <label class="row-flex small"><input type="checkbox" data-change="f-toggle" data-k="rConflict" ${f.rConflict ? "checked" : ""}> Conflict</label>
    <label class="row-flex small"><input type="checkbox" data-change="f-toggle" data-k="rNc" ${f.rNc ? "checked" : ""}> Needs Clarification</label>
    <label class="row-flex small"><input type="checkbox" data-change="f-toggle" data-k="rShowOld" ${f.rShowOld ? "checked" : ""}> แสดง Version เก่า</label>
    <span class="sp"></span><span class="small muted">${list.length} รายการ</span>
    <button class="btn" data-act="compare-reqs">Compare 2 รายการ</button>
    ${can("scenario.edit") ? `<button class="btn pri" data-act="gen-scenarios-all">สร้าง Scenario จาก Requirement ที่ Approved</button>` : ""}
  </div>`;
  if (!S.requirements.some(x => x.projectId === p.id)) return layout(pageHead("Requirement Explorer") + emptyBox("ยังไม่มี Requirement", "อัปโหลดและวิเคราะห์ BRS ก่อน", `<a class="btn pri" href="#/p/${p.id}/upload">อัปโหลด BRS</a>`), [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Requirements"]]);
  const table = `<div class="tblwrap list" style="max-height:300px;margin-bottom:14px"><table><thead><tr><th><span class="hide">เลือก</span></th><th>Requirement ID</th><th>Type</th><th>Title</th><th>Complete</th><th>Clarity</th><th>หน้า</th><th>Status</th></tr></thead><tbody>
    ${list.map(x => `<tr class="click ${r && x.id === r.id ? "sel" : ""}" data-act="sel-req" data-id="${x.id}"><td><input type="checkbox" data-act="cmp-check" data-id="${x.id}" ${(ui.sel.cmp || []).includes(x.id) ? "checked" : ""} aria-label="เลือกเพื่อเปรียบเทียบ"></td><td class="mono">${esc(x.reqId)}</td><td class="small">${esc(x.type)}</td><td>${esc(x.title.slice(0, 70))}</td><td>${x.completeness.score}</td><td>${x.clarity.score}</td><td>${nfv(x.source.page)}</td><td>${badge(x.status)}</td></tr>`).join("")}
  </tbody></table></div>`;
  if (!r) return layout(pageHead("Requirement Explorer") + toolbar + table + emptyBox("ไม่พบรายการตาม Filter", "ลองล้าง Filter"), [["Requirements"]]);
  const fx = r.fields; const src = S.documents.find(d => d.id === r.docId); const ver = src && src.versions.find(v => v.v === r.docVersion);
  const sec = ver && ver.sections.find(s => s.id === r.source.sectionId);
  const img = ver && r.source.screenshot !== NF && ver.images.find(i => i.id === r.source.screenshot);
  const conflicts = S.conflicts.filter(c => (c.a === r.id || c.b === r.id));
  const fs = r.fieldSources || {};
  const fieldRow = (label, key) => `<dt>${label}</dt><dd>${nfv(fx[key])}${fs[key] ? ` <span class="badge b-blue">จาก Clarification</span>` : ""}</dd>`;
  const aiAssume = r.ai && r.ai.assumptions ? r.ai.assumptions : [];
  const aiRec = r.ai && r.ai.recommendations ? r.ai.recommendations : [];
  const canEdit = can("req.edit") && r.status !== "APPROVED" && r.status !== "DEPRECATED";
  return layout(pageHead("Requirement Explorer", `${esc(p.code)} · Source ซ้าย · Requirement กลาง · AI Analysis ขวา`) + toolbar + table + `
  <div class="split3">
    <section class="card" aria-label="Source">
      <h3>Source</h3>
      <p class="small muted">${esc(r.source.docName)} v${r.docVersion} · หน้า ${r.source.page === NF || r.source.page == null ? "<span class='nf'>NOT_FOUND</span>" : esc(r.source.page)} · ${esc(r.source.section)}</p>
      <div class="src">${highlight(r.originalText, [fx.thresholdRaw, fx.role, fx.exclusion, fx.inclusion, fx.dateRange])}</div>
      <div class="row-flex" style="margin-top:10px">
        ${sec ? `<button class="btn sm" data-act="view-section" data-doc="${r.docId}" data-v="${r.docVersion}" data-id="${sec.id}">ดู Source ${sec.kind === "table" ? "Table" : "Section"}</button>` : ""}
        ${r.source.table !== NF ? `<span class="badge b-blue">${esc(r.source.table)}</span>` : ""}
        ${img ? `<button class="btn sm" data-act="img-view" data-doc="${r.docId}" data-v="${r.docVersion}" data-id="${img.id}">ดู Screenshot</button>` : ""}
        <a class="btn sm" href="#/p/${p.id}/trace?req=${r.id}">Traceability</a>
      </div>
      ${r.versions.length ? `<h3 style="margin-top:14px">ประวัติ Version</h3>${r.versions.map(v => `<div class="small">v${v.version} · ${esc(v.by)} · ${fmtDate(v.at)} — ${esc(v.reason)}</div>`).join("")}` : ""}
    </section>
    <section class="card" aria-label="Requirement">
      <div class="row-flex" style="margin-bottom:6px"><b class="mono">${esc(r.reqId)}</b> ${badge(r.status)} ${r.origin === "AI" ? aiBadge() : `<span class="badge b-gray">Rule Engine</span>`} ${r.duplicateOf ? badge("NEEDS_CLARIFICATION", "ซ้ำกับ " + r.duplicateOf) : ""}</div>
      <h3>${esc(r.title)}</h3>
      <dl class="kv">
        <dt>Type</dt><dd>${esc(r.type)}</dd><dt>Module</dt><dd>${esc(r.module)}${r.submodule !== NF ? " / " + esc(r.submodule) : ""}</dd>
        ${fieldRow("Business Rule", "businessRule")}${fieldRow("Preconditions", "preconditions")}${fieldRow("Input", "input")}${fieldRow("Process", "process")}${fieldRow("Output", "output")}${fieldRow("Expected Result", "expected")}${fieldRow("Role", "role")}${fieldRow("Threshold", "threshold")}${fieldRow("Unit", "unit")}${fieldRow("Date Range", "dateRange")}${fieldRow("Inclusion", "inclusion")}${fieldRow("Exclusion", "exclusion")}
        <dt>Reviewed / Approved</dt><dd>${esc(r.reviewedBy || "-")} / ${esc(r.approvedBy || "-")}</dd>
      </dl>
      <div class="row-flex" style="margin-top:14px">
        ${canEdit ? `<button class="btn" data-act="edit-req" data-id="${r.id}">แก้ไข</button>` : ""}
        ${can("req.approve") && ["AI_GENERATED", "WAITING_FOR_REVIEW", "REVISED"].includes(r.status) && !r.reviewedBy ? `<button class="btn" data-act="review-req" data-id="${r.id}">Mark Reviewed</button>` : ""}
        ${can("req.approve") && ["WAITING_FOR_REVIEW", "REVISED", "AI_GENERATED"].includes(r.status) ? `<button class="btn ok" data-act="approve-req" data-id="${r.id}">Approve Requirement</button>` : ""}
        ${r.status === "NEEDS_CLARIFICATION" ? `<a class="btn" href="#/p/${p.id}/clarifications?tab=questions&req=${r.id}">ตอบคำถาม (${r.questions.filter(x => !x.resolved).length})</a>` : ""}
        ${r.status === "CONFLICT" ? `<a class="btn danger" href="#/p/${p.id}/clarifications?tab=conflicts">Resolve Conflict</a>` : ""}
        ${r.status === "APPROVED" && can("scenario.edit") ? `<button class="btn pri" data-act="gen-scenarios" data-id="${r.id}">สร้าง Test Scenario</button>` : ""}
      </div>
      <h3 style="margin-top:16px">Comments</h3>
      ${(r.comments || []).map(c => `<div class="small" style="margin-bottom:4px"><b>${esc(c.by)}</b> <span class="muted">${fmtDate(c.at)}</span><br>${esc(c.text)}</div>`).join("") || `<p class="small muted">ยังไม่มี Comment</p>`}
      ${can("comment") ? `<button class="btn sm" data-act="comment" data-kind="req" data-id="${r.id}">เพิ่ม Comment</button>` : ""}
    </section>
    <section class="card" aria-label="AI Analysis">
      <h3>AI Analysis</h3>
      ${scoreBar("Completeness", r.completeness)}
      <div style="height:10px"></div>
      ${scoreBar("Clarity", r.clarity)}
      <p class="small" style="margin-top:10px">Confidence: <b>${Math.round((r.confidence || 0) * 100)}%</b> · Engine: ${esc(r.ai.model || r.ai.engine)}${r.ai.promptVersion && r.ai.promptVersion !== "n/a" ? ` · Prompt ${esc(r.ai.promptVersion)}` : ""}${r.ai.inputHash ? ` · Input hash <span class="mono">${esc(r.ai.inputHash.slice(0, 10))}…</span>` : ""}</p>
      ${r.sourceUnverified ? `<div class="warnbox">AI อ้างข้อความที่ไม่พบตรงตัวในต้นฉบับ — ต้องตรวจก่อน Approve</div>` : ""}
      <h3 style="margin-top:12px">Found in BRS</h3><p class="small">${esc(r.originalText.slice(0, 200))}</p>
      ${r.questions.length ? `<h3>Clarification Questions</h3>${r.questions.map(x => `<div class="small" style="margin-bottom:6px">${x.resolved ? badge("RESOLVED") : badge("OPEN")} ${esc(x.text)}${x.answer ? `<br><span class="muted">คำตอบ:</span> ${esc(x.answer)}` : ""}</div>`).join("")}` : ""}
      ${r.questions.some(x => x.assumption) || aiAssume.length ? `<h3>Assumptions</h3>${r.questions.filter(x => x.assumption).map(x => `<div style="margin-bottom:6px"><span class="label-assume">AI ASSUMPTION - NOT FOUND IN BRS</span> ${badge(x.assumption.state === "ACCEPTED" ? "APPROVED" : x.assumption.state === "REJECTED" ? "REJECTED" : "DRAFT", x.assumption.state)}<div class="small">${esc(x.assumption.text)}</div></div>`).join("")}${aiAssume.map(a => `<div><span class="label-assume">AI ASSUMPTION - NOT FOUND IN BRS</span><div class="small">${esc(typeof a === "string" ? a : JSON.stringify(a))}</div></div>`).join("")}` : ""}
      ${aiRec.length ? `<h3>AI Recommendations</h3>${aiRec.map(a => `<div><span class="label-rec">AI RECOMMENDATION</span><div class="small">${esc(typeof a === "string" ? a : JSON.stringify(a))}</div></div>`).join("")}` : ""}
      ${conflicts.length ? `<h3>Conflicts</h3>${conflicts.map(c => { const o = S.requirements.find(x => x.id === (c.a === r.id ? c.b : c.a)); return `<div class="small">${badge(c.status === "OPEN" ? "CONFLICT" : "RESOLVED", c.status)} กับ ${esc(o ? o.reqId : "?")}: ${c.diffs.map(dd => esc(dd.field)).join(", ")}</div>`; }).join("")}` : ""}
    </section>
  </div>`, [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Requirements", `#/p/${p.id}/requirements`], [r.reqId]]);
}
function editRequirementDialog(r) {
  const keys = [["title", "Title"], ["type", "Type"], ["businessRule", "Business Rule"], ["preconditions", "Preconditions"], ["input", "Input"], ["process", "Process"], ["output", "Output"], ["expected", "Expected Result"], ["role", "Role"], ["thresholdOp", "Threshold Operator"], ["thresholdValue", "Threshold Value"], ["unit", "Unit"], ["dateRange", "Date Range"], ["inclusion", "Inclusion"], ["exclusion", "Exclusion"]];
  const val = k => k === "title" ? r.title : k === "type" ? r.type : r.fields[k];
  modal(`<h2>แก้ไข ${esc(r.reqId)}</h2><p class="small muted">การแก้ไขจะสร้าง Requirement Version ใหม่ เก็บค่าเดิมไว้ และเปลี่ยนสถานะเป็น REVISED · ค่าที่ไม่พบใน BRS ให้ใช้ NOT_FOUND</p>
  <div class="grid g2">${keys.map(([k, l]) => `<div class="field"><label>${l}</label>${k === "type" ? `<select id="re_${k}">${REQ_TYPES.map(t => `<option ${t === r.type ? "selected" : ""}>${t}</option>`).join("")}</select>` : k === "thresholdOp" ? `<select id="re_${k}">${[NF, ">", ">=", "<", "<=", "="].map(o => `<option ${o === val(k) ? "selected" : ""}>${o}</option>`).join("")}</select>` : `<input type="text" id="re_${k}" value="${esc(val(k))}">`}</div>`).join("")}</div>
  <div class="field"><label>เหตุผลในการแก้ไข (บังคับ)</label><input type="text" id="re_reason"></div>
  <div class="acts"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" id="reOk">บันทึก Version ใหม่</button></div>`, true);
  $("#reOk").onclick = () => {
    const reason = $("#re_reason").value.trim(); if (!reason) { toast("กรุณาระบุเหตุผล", true); return; }
    const before = { title: r.title, type: r.type, fields: clone(r.fields) };
    const changes = [];
    keys.forEach(([k]) => { const nv = $("#re_" + k).value.trim() || NF; const ov = val(k); if (String(nv) !== String(ov)) { changes.push({ field: k, old: ov, new: nv }); if (k === "title") r.title = nv; else if (k === "type") r.type = nv; else r.fields[k] = nv; } });
    if (!changes.length) { closeModal(); return; }
    r.fields.threshold = r.fields.thresholdValue !== NF ? (r.fields.thresholdOp !== NF ? `${r.fields.thresholdOp} ${r.fields.thresholdValue}` : r.fields.thresholdValue) : NF;
    r.fields.thresholdAmbiguous = r.fields.thresholdValue !== NF && r.fields.thresholdOp === NF;
    r.versions.push({ version: r.versions.length + 1, at: now(), by: me().username, reason, kind: "Human-edited", before, changes });
    r.updated = now(); r.status = "REVISED"; r.reviewedBy = null; reanalyze(r); if (r.status === "WAITING_FOR_REVIEW") r.status = "REVISED";
    audit("REQUIREMENT_EDIT", r.reqId, changes.map(c => `${c.field}: ${c.old} → ${c.new}`).join("; "));
    save(); closeModal(); render();
  };
}
function compareReqsDialog() {
  const ids = ui.sel.cmp || []; if (ids.length !== 2) { toast("เลือก Requirement 2 รายการด้วย Checkbox ในตาราง", true); return; }
  const [a, b] = ids.map(id => S.requirements.find(x => x.id === id));
  const keys = ["type", "expected", "role", "threshold", "unit", "dateRange", "inclusion", "exclusion"];
  modal(`<h2>Compare Requirement</h2><div class="tblwrap"><table><thead><tr><th>Field</th><th>${esc(a.reqId)}</th><th>${esc(b.reqId)}</th></tr></thead><tbody>
  <tr><td>Source</td><td>${esc(a.source.docName)} หน้า ${esc(a.source.page)} · ${esc(a.source.section)}</td><td>${esc(b.source.docName)} หน้า ${esc(b.source.page)} · ${esc(b.source.section)}</td></tr>
  <tr><td>Original</td><td>${esc(a.originalText)}</td><td>${esc(b.originalText)}</td></tr>
  ${keys.map(k => { const va = k === "type" ? a.type : a.fields[k], vb = k === "type" ? b.type : b.fields[k]; const diff = va !== vb; return `<tr><td>${k}</td><td ${diff ? 'style="background:var(--orange-bg)"' : ""}>${nfv(va)}</td><td ${diff ? 'style="background:var(--orange-bg)"' : ""}>${nfv(vb)}</td></tr>`; }).join("")}
  </tbody></table></div><h3 style="margin-top:12px">Text Diff</h3>${renderDiff(a.originalText, b.originalText, 5)}<div class="acts"><button class="btn" data-act="close-modal">ปิด</button></div>`, true);
}

/* ============ P09 Clarification & Conflict Center (§9, §10) ============ */
function pageClarifications(p, q) {
  const tab = q.tab || ui.tab.clar || "questions"; ui.tab.clar = tab;
  const reqs = S.requirements.filter(r => r.projectId === p.id && r.isLatest !== false && r.status !== "DEPRECATED" && (!q.req || r.id === q.req));
  const qs = reqs.flatMap(r => r.questions.map(x => ({ r, x })));
  const showResolved = ui.f.showResolved;
  const openQ = qs.filter(o => showResolved || !o.x.resolved);
  const assumps = qs.filter(o => o.x.assumption);
  const cons = S.conflicts.filter(c => c.projectId === p.id && (showResolved || c.status === "OPEN"));
  const tabs = `<div class="tabs">${[["questions", `Questions (${qs.filter(o => !o.x.resolved).length})`], ["assumptions", `Assumptions (${assumps.filter(o => o.x.assumption.state === "DRAFT").length})`], ["conflicts", `Conflicts (${S.conflicts.filter(c => c.projectId === p.id && c.status === "OPEN").length})`]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="nav" data-href="#/p/${p.id}/clarifications?tab=${k}">${l}</button>`).join("")}</div>
  <div class="toolbar"><label class="row-flex small"><input type="checkbox" data-change="f-toggle" data-k="showResolved" ${showResolved ? "checked" : ""}> แสดงรายการที่ Resolve แล้ว</label>${q.req ? `<a class="btn sm" href="#/p/${p.id}/clarifications?tab=${tab}">ล้าง Filter Requirement</a>` : ""}</div>`;
  let body = "";
  if (tab === "questions") {
    body = openQ.length ? openQ.map(({ r, x }) => `<div class="card" style="margin-bottom:10px;border-left:3px solid ${x.resolved ? "var(--green)" : "var(--orange)"}">
      <div class="row-flex"><a class="mono" href="#/p/${p.id}/requirements?sel=${r.id}">${esc(r.reqId)}</a> ${badge(x.resolved ? "RESOLVED" : "OPEN")} <span class="small muted">Source: ${esc(r.source.docName)} หน้า ${esc(r.source.page)} · ${esc(r.source.section)}</span></div>
      <p style="margin-top:6px"><b>${esc(x.text)}</b></p>
      <div class="src small">${esc(r.originalText)}</div>
      ${x.answer ? `<p class="small" style="margin-top:6px"><span class="muted">คำตอบ (${esc(x.answeredBy || "")}):</span> ${esc(x.answer)}</p>` : ""}
      ${!x.resolved && can("question.answer") ? `<div class="row-flex" style="margin-top:8px"><button class="btn sm" data-act="answer-q" data-req="${r.id}" data-id="${x.id}">ตอบคำถาม</button>${x.answer && can("question.resolve") ? `<button class="btn sm ok" data-act="resolve-q" data-req="${r.id}" data-id="${x.id}">Resolve Clarification</button>` : ""}</div>` : ""}
    </div>`).join("") : emptyBox("ไม่มีคำถามค้าง", "Requirement ทุกข้อมีข้อมูลครบสำหรับสร้าง Test Case");
  } else if (tab === "assumptions") {
    body = assumps.length ? `<div class="tblwrap"><table><thead><tr><th>Requirement</th><th>คำถามที่เกี่ยวข้อง</th><th>Assumption</th><th>สถานะ</th><th></th></tr></thead><tbody>${assumps.map(({ r, x }) => `<tr><td class="mono"><a href="#/p/${p.id}/requirements?sel=${r.id}">${esc(r.reqId)}</a></td><td class="small">${esc(x.text)}</td><td><span class="label-assume">AI ASSUMPTION - NOT FOUND IN BRS</span><div>${esc(x.assumption.text)}</div></td><td>${badge(x.assumption.state === "ACCEPTED" ? "APPROVED" : x.assumption.state === "REJECTED" ? "REJECTED" : "DRAFT", x.assumption.state)}</td><td class="row-flex">${can("assumption.edit") ? `<button class="btn sm" data-act="assume-edit" data-req="${r.id}" data-id="${x.id}">แก้ไข</button><button class="btn sm ok" data-act="assume-set" data-req="${r.id}" data-id="${x.id}" data-v="ACCEPTED">ยอมรับ</button><button class="btn sm" data-act="assume-set" data-req="${r.id}" data-id="${x.id}" data-v="REJECTED">ปฏิเสธ</button>` : ""}</td></tr>`).join("")}</tbody></table></div><p class="small muted" style="margin-top:8px">Assumption ที่ยอมรับแล้วจะแนบกับ Test Case พร้อม Label เสมอ และไม่ถือว่าเป็น Requirement ที่ยืนยันแล้ว — ต้อง Resolve คำถามกับ BA ก่อนสร้าง Test Case</p>` : emptyBox("ไม่มี Assumption", "");
  } else {
    body = cons.length ? cons.map(c => {
      const a = S.requirements.find(x => x.id === c.a), b = S.requirements.find(x => x.id === c.b);
      const side = (r, other) => `<div class="card" style="border-top:3px solid var(--red)"><div class="row-flex"><a class="mono" href="#/p/${p.id}/requirements?sel=${r.id}">${esc(r.reqId)}</a> ${badge(r.status)}</div><p class="small muted">${esc(r.source.docName)} v${r.docVersion} · หน้า ${esc(r.source.page)} · ${esc(r.source.section)}</p><div class="src">${highlight(r.originalText, c.diffs.map(d => r === a ? d.a : d.b).map(String))}</div></div>`;
      return `<div class="card" style="margin-bottom:14px"><div class="row-flex" style="margin-bottom:8px">${badge(c.status === "OPEN" ? "CONFLICT" : "RESOLVED", c.status)} <b>ความคล้าย ${c.similarity}%</b> <span class="small muted">พบเมื่อ ${fmtDate(c.created)}</span></div>
      <div class="tblwrap" style="margin-bottom:10px"><table><thead><tr><th>จุดที่ต่าง</th><th>${esc(a.reqId)}</th><th>${esc(b.reqId)}</th></tr></thead><tbody>${c.diffs.map(d => `<tr><td>${esc(d.field)}</td><td><mark>${esc(d.a)}</mark></td><td><mark>${esc(d.b)}</mark></td></tr>`).join("")}</tbody></table></div>
      <div class="split2">${side(a, b)}${side(b, a)}</div>
      ${c.status === "OPEN" ? (can("conflict.resolve") ? `<div class="row-flex" style="margin-top:10px"><button class="btn" data-act="resolve-conflict" data-id="${c.id}" data-keep="a">${esc(a.reqId)} ถูกต้อง</button><button class="btn" data-act="resolve-conflict" data-id="${c.id}" data-keep="b">${esc(b.reqId)} ถูกต้อง</button><button class="btn" data-act="resolve-conflict" data-id="${c.id}" data-keep="both">ไม่ขัดแย้ง (ใช้ทั้งสอง)</button><span class="small muted">ระบบไม่เลือกข้อมูลล่าสุดให้อัตโนมัติ</span></div>` : "") : `<p class="small" style="margin-top:8px"><b>ผลการ Resolve:</b> ${esc(c.resolution)} — ${esc(c.reason)}</p>`}
      <details style="margin-top:8px"><summary class="small">ประวัติ</summary>${c.history.map(h => `<div class="small">${fmtDate(h.at)} · ${esc(h.by)} · ${esc(h.action)}${h.reason ? " — " + esc(h.reason) : ""}</div>`).join("")}</details></div>`;
    }).join("") : emptyBox("ไม่มี Conflict ที่ค้างอยู่", "ระบบตรวจ Threshold, Operator, Role, Date Range, Mandatory/Optional และ Expected Result ที่ขัดกันหลังวิเคราะห์เอกสาร");
  }
  return layout(pageHead("Clarification & Conflict Center", "คำถามถึง BA · Assumption ให้ QA ตรวจ · Requirement ที่ขัดแย้งกัน") + rail(p) + tabs + body, [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Clarification & Conflict"]]);
}
function answerQuestion(r, x) {
  const fieldInput = x.field === "thresholdOp" ? `<div class="field"><label>อัปเดต Threshold Operator ตามคำตอบ (ไม่บังคับ)</label><select id="aqField"><option value="">ไม่เปลี่ยน</option>${[">", ">=", "<", "<=", "="].map(o => `<option>${o}</option>`).join("")}</select></div>`
    : x.field ? `<div class="field"><label>อัปเดตค่า ${esc(x.field)} ตามคำตอบ (ไม่บังคับ)</label><input type="text" id="aqField" placeholder="ปัจจุบัน: ${esc(r.fields[x.field])}"></div>` : "";
  modal(`<h2>ตอบคำถาม ${esc(r.reqId)}</h2><p><b>${esc(x.text)}</b></p><div class="src small">${esc(r.originalText)}</div>
  <div class="field" style="margin-top:10px"><label>คำตอบจาก Business Analyst</label><textarea id="aqAns">${esc(x.answer)}</textarea></div>${fieldInput}
  <div class="acts"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" id="aqOk">บันทึกคำตอบ</button></div>`);
  $("#aqOk").onclick = () => {
    const ans = $("#aqAns").value.trim(); if (!ans) { toast("กรุณากรอกคำตอบ", true); return; }
    x.answer = ans; x.answeredBy = me().username; x.answeredAt = now();
    const fv = $("#aqField") ? $("#aqField").value.trim() : "";
    if (fv && x.field) { x.fieldUpdate = { field: x.field, value: fv }; }
    audit("CLARIFICATION_ANSWER", r.reqId, x.text); save(); closeModal(); render();
  };
}
function resolveQuestion(r, x) {
  x.resolved = true; x.resolvedBy = me().username; x.resolvedAt = now();
  if (x.fieldUpdate) {
    const { field, value } = x.fieldUpdate; const before = clone(r.fields);
    r.fields[field] = value; r.fieldSources = r.fieldSources || {}; r.fieldSources[field] = x.id;
    if (field === "thresholdOp" || field === "thresholdValue") { r.fields.threshold = r.fields.thresholdValue !== NF ? `${r.fields.thresholdOp !== NF ? r.fields.thresholdOp + " " : ""}${r.fields.thresholdValue}` : NF; r.fields.thresholdAmbiguous = r.fields.thresholdOp === NF; r.fieldSources.threshold = x.id; }
    r.versions.push({ version: r.versions.length + 1, at: now(), by: me().username, reason: "Clarification: " + x.text, kind: "Clarification", before: { fields: before }, changes: [{ field, old: before[field], new: value }] });
  }
  reanalyze(r);
  audit("CLARIFICATION_RESOLVE", r.reqId, x.text + " → " + x.answer);
}
async function resolveConflict(c, keep) {
  const a = S.requirements.find(x => x.id === c.a), b = S.requirements.find(x => x.id === c.b);
  const label = keep === "both" ? "ไม่ขัดแย้ง ใช้ทั้งสอง Requirement" : `เลือก ${(keep === "a" ? a : b).reqId} · ${(keep === "a" ? b : a).reqId} → DEPRECATED`;
  const reason = await promptDialog("Resolve Conflict", `${label} — ระบุเหตุผลในการเลือก (บังคับ, เก็บในประวัติ)`);
  if (!reason) return;
  c.status = "RESOLVED"; c.resolution = label; c.reason = reason; c.resolvedBy = me().username; c.resolvedAt = now();
  c.history.push({ at: now(), by: me().username, action: "RESOLVED: " + label, reason });
  [a, b].forEach(r => { const other = S.conflicts.some(x => x.id !== c.id && x.status === "OPEN" && (x.a === r.id || x.b === r.id)); r.conflictStatus = other ? "OPEN" : "RESOLVED"; });
  if (keep === "a") { b.status = "DEPRECATED"; b.isLatest = false; b.deprecatedReason = "Conflict resolved: " + reason; }
  if (keep === "b") { a.status = "DEPRECATED"; a.isLatest = false; a.deprecatedReason = "Conflict resolved: " + reason; }
  [a, b].filter(r => r.status !== "DEPRECATED").forEach(r => { r.status = decideStatus(r); });
  audit("CONFLICT_RESOLVE", `${a.reqId} vs ${b.reqId}`, label + " | " + reason); save(); render();
}

/* ============ P10 Test Scenario Review (§11) ============ */
function pageScenarios(p) {
  const f = ui.f; const s = (f.sq || "").toLowerCase();
  const list = S.scenarios.filter(x => x.projectId === p.id && (!s || (x.tsId + x.title).toLowerCase().includes(s)) && (!f.sType || x.type === f.sType) && (!f.sStatus || x.status === f.sStatus));
  const approvedReqs = S.requirements.filter(r => r.projectId === p.id && r.status === "APPROVED" && r.isLatest !== false);
  const blockedReqs = S.requirements.filter(r => r.projectId === p.id && ["NEEDS_CLARIFICATION", "CONFLICT"].includes(r.status) && r.isLatest !== false);
  const sel = ui.sel.sc || [];
  return layout(pageHead("Test Scenario Review", "สร้างจาก Requirement ที่ Approved เท่านั้น · ระบบป้องกัน Scenario ซ้ำ (Requirement + Test Type)", `${can("scenario.edit") ? `<button class="btn" data-act="gen-scenarios-all" ${approvedReqs.length ? "" : "disabled"}>Generate Scenarios (${approvedReqs.length} Requirement)</button><button class="btn pri" data-act="gen-tcs" ${sel.length ? "" : "disabled"}>สร้าง Test Case จาก Scenario ที่เลือก (${sel.length})</button>` : ""}`) + rail(p) +
    (blockedReqs.length ? `<div class="warnbox">${blockedReqs.length} Requirement ยังเป็น NEEDS_CLARIFICATION หรือ CONFLICT จึงยังสร้าง Scenario/Test Case ไม่ได้ <a href="#/p/${p.id}/clarifications">ไปที่ Clarification Center</a></div>` : "") +
    `<div class="toolbar"><input type="text" placeholder="ค้นหา" value="${esc(f.sq || "")}" data-input="f" data-k="sq"><select data-change="f" data-k="sType"><option value="">ทุก Test Type</option>${["Positive", "Negative", "Boundary", "Integration", "Data", "API"].map(t => `<option ${f.sType === t ? "selected" : ""}>${t}</option>`).join("")}</select><select data-change="f" data-k="sStatus"><option value="">ทุก Status</option>${["AI_GENERATED", "WAITING_FOR_REVIEW", "APPROVED", "DEPRECATED"].map(t => `<option ${f.sStatus === t ? "selected" : ""}>${t}</option>`).join("")}</select><button class="btn sm" data-act="sc-select-all">เลือกทั้งหมดที่ยังไม่มี Test Case</button></div>` +
    (list.length ? `<div class="tblwrap"><table><thead><tr><th><span class="hide">เลือก</span></th><th>Scenario ID</th><th>Requirement</th><th>Title</th><th>Type</th><th>Priority</th><th>Risk</th><th>Test Case</th><th>Status</th><th></th></tr></thead><tbody>${list.map(x => { const r = S.requirements.find(y => y.id === x.reqRef) || {}; const nTc = S.testCases.filter(t => t.scenarioRef === x.id).length; return `<tr><td><input type="checkbox" data-act="sc-check" data-id="${x.id}" ${sel.includes(x.id) ? "checked" : ""} aria-label="เลือก ${esc(x.tsId)}"></td><td class="mono">${esc(x.tsId)}</td><td class="mono small"><a href="#/p/${p.id}/requirements?sel=${r.id}">${esc(r.reqId)}</a></td><td>${esc(x.title)}<details><summary class="small muted">AI Rationale</summary><div class="small">${esc(x.rationale)}<br>${(x.prReasons || []).map(esc).join("<br>")}</div></details></td><td>${esc(x.type)}</td><td>${esc(x.priority)}</td><td>${esc(x.risk)}</td><td>${nTc}</td><td>${badge(x.status)}</td><td class="row-flex">${can("scenario.edit") && x.status !== "APPROVED" && x.status !== "DEPRECATED" ? `<button class="btn sm ok" data-act="sc-approve" data-id="${x.id}">Approve</button>` : ""}${can("scenario.edit") && x.status !== "DEPRECATED" ? `<button class="btn sm" data-act="sc-edit" data-id="${x.id}">แก้ไข</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
      : emptyBox("ยังไม่มี Test Scenario", approvedReqs.length ? "กด Generate Scenarios เพื่อสร้างจาก Requirement ที่ Approved" : "ต้อง Approve Requirement ใน Requirement Explorer ก่อน", `<a class="btn" href="#/p/${p.id}/requirements">ไปที่ Requirement Explorer</a>`)),
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Test Scenarios"]]);
}

/* ============ P11 Test Case Review (§30) ============ */
function pageTestCases(p, q) {
  if (q.status && ui.f.tStatus === undefined) ui.f.tStatus = q.status;
  const f = ui.f; const s = (f.tq || "").toLowerCase();
  let list = S.testCases.filter(t => t.projectId === p.id && (!s || (t.tcId + t.data.title + t.data.businessExplanation).toLowerCase().includes(s)) && (!f.tStatus || t.status === f.tStatus) && (!f.tType || t.data.type === f.tType) && (!f.tPri || t.data.priority === f.tPri));
  const sortKey = f.tSort || "tcId"; const PRI = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  list.sort((a, b) => sortKey === "priority" ? PRI[a.data.priority] - PRI[b.data.priority] : sortKey === "status" ? a.status.localeCompare(b.status) : a.tcId.localeCompare(b.tcId));
  const edit = ui.editTc && can("tc.edit");
  const sel = ui.sel.tc || [];
  const cell = (t, k, opts) => edit && !t.locked ? (opts ? `<select data-change="tc-cell" data-id="${t.id}" data-k="${k}">${opts.map(o => `<option ${t.data[k] === o ? "selected" : ""}>${o}</option>`).join("")}</select>` : `<input type="text" data-change="tc-cell" data-id="${t.id}" data-k="${k}" value="${esc(t.data[k])}">`) : esc(t.data[k]);
  return layout(pageHead("Test Case Review", "QA แก้ไขในตาราง Review และ Approve · Test Case ที่ Approved จะถูก Lock", `${can("tc.export") ? `<button class="btn" data-act="export-excel">Export Excel</button>` : ""}${can("tc.edit") ? `<button class="btn ${edit ? "pri" : ""}" data-act="toggle-edit-tc">${edit ? "ปิดโหมดแก้ไขในตาราง" : "แก้ไขในตาราง"}</button>` : ""}${can("tc.approve") ? `<button class="btn ok" data-act="tc-bulk" data-v="APPROVED" ${sel.length ? "" : "disabled"}>Approve ที่เลือก (${sel.length})</button>` : ""}`) + rail(p) +
    `<div class="toolbar"><input type="text" placeholder="ค้นหา ID / ชื่อ / คำอธิบาย" value="${esc(f.tq || "")}" data-input="f" data-k="tq"><select data-change="f" data-k="tStatus"><option value="">ทุก Status</option>${["AI_GENERATED", "WAITING_FOR_REVIEW", "NEEDS_CLARIFICATION", "REVISED", "DRAFT", "APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED", "DEPRECATED"].map(x => `<option ${f.tStatus === x ? "selected" : ""}>${x}</option>`).join("")}</select><select data-change="f" data-k="tType"><option value="">ทุก Type</option>${["Positive", "Negative", "Boundary", "Integration", "Data", "API"].map(x => `<option ${f.tType === x ? "selected" : ""}>${x}</option>`).join("")}</select><select data-change="f" data-k="tPri"><option value="">ทุก Priority</option>${["Critical", "High", "Medium", "Low"].map(x => `<option ${f.tPri === x ? "selected" : ""}>${x}</option>`).join("")}</select><select data-change="f" data-k="tSort"><option value="tcId" ${sortKey === "tcId" ? "selected" : ""}>เรียงตาม ID</option><option value="priority" ${sortKey === "priority" ? "selected" : ""}>เรียงตาม Priority</option><option value="status" ${sortKey === "status" ? "selected" : ""}>เรียงตาม Status</option></select><span class="small muted">${list.length} รายการ</span></div>` +
    (list.length ? `<div class="tblwrap"><table><thead><tr><th><span class="hide">เลือก</span></th><th>Test Case ID</th><th>Title</th><th>Type</th><th>Priority</th><th>Risk</th><th>Automation</th><th>Ver.</th><th>Status</th><th></th></tr></thead><tbody>${list.map(t => `<tr><td><input type="checkbox" data-act="tc-check" data-id="${t.id}" ${sel.includes(t.id) ? "checked" : ""} aria-label="เลือก ${esc(t.tcId)}"></td><td class="mono"><a href="#/p/${p.id}/testcase/${t.id}">${esc(t.tcId)}</a>${t.locked ? ` <span class="locked" title="Locked">🔒</span>` : ""}${t.impactFlag ? ` ${badge("Update Required", "Impact")}` : ""}</td><td>${cell(t, "title")}<div class="small muted">${esc(t.data.businessExplanation.slice(0, 110))}</div></td><td>${esc(t.data.type)}</td><td>${cell(t, "priority", ["Critical", "High", "Medium", "Low"])}</td><td>${cell(t, "risk", ["High", "Medium", "Low"])}</td><td>${cell(t, "automationCandidate", ["Yes", "Maybe", "No"])}</td><td>v${t.version}</td><td>${badge(t.status)}</td><td><a class="btn sm" href="#/p/${p.id}/testcase/${t.id}">เปิด</a></td></tr>`).join("")}</tbody></table></div>`
      : emptyBox("ยังไม่มี Test Case", "สร้าง Test Case จากหน้า Test Scenario Review", `<a class="btn pri" href="#/p/${p.id}/scenarios">ไปที่ Test Scenarios</a>`)),
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Test Cases"]]);
}
function editTcData(t, changes, reason) {
  if (t.locked) { toast("Test Case ที่ Approved ถูก Lock — สร้าง Version ใหม่ก่อนแก้ไข", true); return false; }
  const before = clone(t.data); const diffs = [];
  Object.entries(changes).forEach(([k, v]) => { if (JSON.stringify(t.data[k]) !== JSON.stringify(v)) { diffs.push({ field: k, old: t.data[k], new: v }); t.data[k] = v; } });
  if (!diffs.length) return false;
  t.editedBy = me().username; t.updated = now();
  if (["AI_GENERATED", "DRAFT"].includes(t.status)) t.status = "WAITING_FOR_REVIEW";
  t.history.push({ version: t.version, at: now(), by: me().username, kind: "Human-edited", reason: reason || "แก้ไขในตาราง", changes: diffs.map(d => ({ field: d.field, old: typeof d.old === "string" ? d.old : JSON.stringify(d.old), new: typeof d.new === "string" ? d.new : JSON.stringify(d.new) })), snapshot: clone(t.data), before });
  audit("TESTCASE_EDIT", t.tcId, diffs.map(d => d.field).join(", ")); save(); return true;
}
function setTcStatus(t, st, comment) {
  const prev = t.status;
  if (st === "APPROVED") {
    const r = S.requirements.find(x => x.id === t.reqRef);
    if (!r || r.status !== "APPROVED") { toast(`${t.tcId}: Requirement ยังไม่ Approved (${r ? r.status : "-"}) จึงอนุมัติไม่ได้`, true); return false; }
    t.status = "APPROVED"; t.locked = true; t.approvedBy = me().username; t.approvedAt = now(); t.reviewer = me().username;
  } else { t.status = st; if (st !== "READY_FOR_AUTOMATION" && st !== "AUTOMATED") t.locked = false; }
  t.approvals.push({ at: now(), by: me().username, from: prev, to: st, comment: comment || "" });
  audit("TESTCASE_" + st, t.tcId, comment || ""); save(); return true;
}

/* ============ P12 Test Case Detail ============ */
function pageTestCase(p, id) {
  const t = S.testCases.find(x => x.id === id); if (!t) return layout(emptyBox("ไม่พบ Test Case", ""), [["Test Cases"]]);
  const r = S.requirements.find(x => x.id === t.reqRef) || { reqId: "-", source: {} }; const s = S.scenarios.find(x => x.id === t.scenarioRef) || {};
  const d = t.data; const tab = ui.tab.tc || "detail";
  const canE = can("tc.edit"), canA = can("tc.approve");
  const acts = [
    canE && !t.locked ? `<button class="btn" data-act="tc-edit" data-id="${t.id}">แก้ไข</button>` : "",
    canE && t.locked ? `<button class="btn" data-act="tc-newver" data-id="${t.id}">สร้าง Version ใหม่เพื่อแก้ไข</button>` : "",
    canA && !t.locked && t.status !== "DEPRECATED" ? `<button class="btn ok" data-act="tc-status" data-id="${t.id}" data-v="APPROVED">Approve</button><button class="btn" data-act="tc-status" data-id="${t.id}" data-v="NEEDS_CLARIFICATION">Needs Clarification</button><button class="btn" data-act="tc-status" data-id="${t.id}" data-v="DRAFT">Reject</button>` : "",
    (canA || can("auto.generate")) && t.status === "APPROVED" ? `<button class="btn pri" data-act="tc-status" data-id="${t.id}" data-v="READY_FOR_AUTOMATION">Ready for Automation</button>` : "",
    `<a class="btn" href="#/p/${p.id}/trace?tc=${t.id}">Traceability</a>`
  ].join("");
  const detail = `<div class="grid g2">
    <div class="card"><h3>Business Explanation <span class="small muted">(สำหรับ BA)</span></h3><p>${esc(d.businessExplanation)}</p>
      <div class="gwt" style="margin-top:10px"><b>Given</b><span>${esc(d.given)}</span><b>When</b><span>${esc(d.when)}</span><b>Then</b><span>${esc(d.then)}</span></div></div>
    <div class="card"><dl class="kv"><dt>Scenario</dt><dd class="mono">${esc(s.tsId || "-")}</dd><dt>Requirement</dt><dd class="mono"><a href="#/p/${p.id}/requirements?sel=${r.id}">${esc(r.reqId)}</a> (v${t.reqVersion})</dd><dt>Source</dt><dd>${esc(r.source.docName || "")} หน้า ${nfv(r.source.page)} · ${esc(r.source.section || "")}</dd><dt>Type / ที่มา</dt><dd>${esc(d.type)} · ${esc(d.origin)}</dd><dt>Priority / Risk</dt><dd>${esc(d.priority)} / ${esc(d.risk)}</dd><dt>เหตุผล</dt><dd><ul class="reasons">${(d.prReasons || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></dd><dt>Automation</dt><dd>${esc(d.automationCandidate)} · ${esc(d.automationTool)}</dd><dt>Preconditions</dt><dd>${esc(d.preconditions)}</dd><dt>Approved</dt><dd>${esc(t.approvedBy || "-")} ${t.approvedAt ? fmtDate(t.approvedAt) : ""}</dd></dl></div>
  </div>
  ${d.assumption ? `<div class="warnbox" style="margin-top:12px"><span class="label-assume">AI ASSUMPTION - NOT FOUND IN BRS</span><div style="white-space:pre-wrap">${esc(d.assumption.replace(/AI ASSUMPTION - NOT FOUND IN BRS: /g, ""))}</div></div>` : ""}
  ${d.clarificationRef ? `<div class="infobox"><b>Clarification Reference</b><div style="white-space:pre-wrap" class="small">${esc(d.clarificationRef)}</div></div>` : ""}
  <h2 style="margin-top:16px">Test Steps</h2>
  <div class="tblwrap"><table><thead><tr><th>Step</th><th>Action</th><th>Test Data</th><th>Expected Result</th><th>ที่มา</th></tr></thead><tbody>${d.steps.map(st => `<tr><td>${st.n}</td><td>${esc(st.action)}</td><td class="mono">${esc(st.data)}</td><td>${esc(st.expected)}</td><td>${st.label ? `<span class="label-rec">${esc(st.label)}</span>` : ""} <span class="small muted">${esc(st.origin || "")}</span></td></tr>`).join("")}</tbody></table></div>
  <p style="margin-top:10px"><b>Overall Expected Result:</b> ${esc(d.overallExpected)}</p>`;
  const history = `<div class="tblwrap"><table><thead><tr><th>Version</th><th>เวลา</th><th>ผู้แก้ไข</th><th>ประเภท</th><th>เหตุผล</th><th>ค่าเดิม → ค่าใหม่</th></tr></thead><tbody>${t.history.slice().reverse().map(h => `<tr><td>v${h.version}</td><td class="small">${fmtDate(h.at)}</td><td>${esc(h.by)}</td><td>${h.kind === "AI-generated" ? aiBadge() : badge("REVISED", h.kind)}</td><td class="small">${esc(h.reason)}</td><td class="small">${(h.changes || []).map(c => `<div><b>${esc(c.field)}</b>: <span style="text-decoration:line-through;color:var(--red)">${esc(String(c.old).slice(0, 80))}</span> → <span style="color:var(--green)">${esc(String(c.new).slice(0, 80))}</span></div>`).join("") || "-"}</td></tr>`).join("")}</tbody></table></div>
  <h3 style="margin-top:14px">Approval History</h3>${t.approvals.length ? t.approvals.map(a => `<div class="small">${fmtDate(a.at)} · ${esc(a.by)} · ${esc(a.from)} → ${esc(a.to)}${a.comment ? " — " + esc(a.comment) : ""}</div>`).join("") : `<p class="small muted">ยังไม่มี</p>`}`;
  const comments = `${(t.comments || []).map(c => `<div class="card" style="margin-bottom:8px"><b>${esc(c.by)}</b> <span class="small muted">${fmtDate(c.at)}</span><p>${esc(c.text)}</p></div>`).join("") || `<p class="muted">ยังไม่มี Comment</p>`}${can("comment") ? `<button class="btn" data-act="comment" data-kind="tc" data-id="${t.id}">เพิ่ม Comment</button>` : ""}`;
  return layout(pageHead(`${t.tcId} · v${t.version}`, `${badge(t.status)} ${t.editedBy === "AI" ? aiBadge() : badge("REVISED", "Human-edited")} ${t.locked ? `<span class="locked">🔒 Locked</span>` : ""} ${esc(d.title)}`, acts) +
    (t.impactFlag ? `<div class="dangerbox"><b>Impact Analysis:</b> ${esc(t.impactFlag)} — ระบบไม่แก้ Test Case นี้อัตโนมัติ กด "สร้าง Version ใหม่เพื่อแก้ไข" แล้ว Review/Approve ใหม่</div>` : "") +
    `<div class="tabs">${[["detail", "รายละเอียด"], ["history", `Version History (${t.history.length})`], ["comments", `Comments (${(t.comments || []).length})`]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="tab" data-k="tc" data-v="${k}">${l}</button>`).join("")}</div>` +
    (tab === "detail" ? detail : tab === "history" ? history : comments),
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Test Cases", `#/p/${p.id}/testcases`], [t.tcId]]);
}
function tcEditDialog(t) {
  const d = t.data;
  modal(`<h2>แก้ไข ${esc(t.tcId)}</h2>
  <div class="grid g2"><div class="field"><label>Title</label><input type="text" id="te_title" value="${esc(d.title)}"></div><div class="field"><label>Priority / Risk</label><div class="row-flex"><select id="te_priority">${["Critical", "High", "Medium", "Low"].map(o => `<option ${o === d.priority ? "selected" : ""}>${o}</option>`).join("")}</select><select id="te_risk">${["High", "Medium", "Low"].map(o => `<option ${o === d.risk ? "selected" : ""}>${o}</option>`).join("")}</select></div></div></div>
  <div class="field"><label>Business Explanation</label><textarea id="te_be">${esc(d.businessExplanation)}</textarea></div>
  <div class="grid g3"><div class="field"><label>Given</label><textarea id="te_given">${esc(d.given)}</textarea></div><div class="field"><label>When</label><textarea id="te_when">${esc(d.when)}</textarea></div><div class="field"><label>Then</label><textarea id="te_then">${esc(d.then)}</textarea></div></div>
  <h3>Steps</h3><div id="te_steps">${d.steps.map((s, i) => `<div class="grid g3" style="margin-bottom:6px" data-step="${i}"><input type="text" value="${esc(s.action)}" aria-label="Action ${s.n}"><input type="text" value="${esc(s.data)}" aria-label="Test Data ${s.n}"><input type="text" value="${esc(s.expected)}" aria-label="Expected ${s.n}"></div>`).join("")}</div>
  <div class="field"><label>เหตุผลในการแก้ไข (บังคับ)</label><input type="text" id="te_reason"></div>
  <div class="acts"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" id="teOk">บันทึก</button></div>`, true);
  $("#teOk").onclick = () => {
    const reason = $("#te_reason").value.trim(); if (!reason) { toast("กรุณาระบุเหตุผล", true); return; }
    const steps = d.steps.map((s, i) => { const ins = document.querySelectorAll(`[data-step="${i}"] input`); return { ...s, action: ins[0].value, data: ins[1].value, expected: ins[2].value }; });
    const testData = d.type === "Boundary" ? d.testData.map((td, i) => { const st = steps[i + 1]; return st ? { ...td, value: st.data, raw: st.data === "(ว่าง)" ? "" : st.data.replace(/^"|"$/g, "").replace(/,/g, ""), expected: st.expected } : td; }) : d.testData;
    editTcData(t, { title: $("#te_title").value, priority: $("#te_priority").value, risk: $("#te_risk").value, businessExplanation: $("#te_be").value, given: $("#te_given").value, when: $("#te_when").value, then: $("#te_then").value, overallExpected: $("#te_then").value, steps, testData }, reason);
    closeModal(); render();
  };
}

/* ============ P22 Traceability Viewer (§15) ============ */
function pageTrace(p, q) {
  let reqs = [];
  if (q.req) reqs = [S.requirements.find(r => r.id === q.req)].filter(Boolean);
  if (q.tc) { const t = S.testCases.find(x => x.id === q.tc); if (t) reqs = [S.requirements.find(r => r.id === t.reqRef)].filter(Boolean); }
  if (!reqs.length) return layout(pageHead("Traceability Viewer") + emptyBox("เปิดจาก Requirement หรือ Test Case", "หน้านี้เปิดผ่านปุ่ม Traceability ใน Requirement Explorer หรือ Test Case Detail"), [["Traceability"]]);
  const r = reqs[0]; const doc = S.documents.find(d => d.id === r.docId) || {}; const ver = (doc.versions || []).find(v => v.v === r.docVersion) || {};
  const scs = S.scenarios.filter(s => s.reqRef === r.id); const tcs = S.testCases.filter(t => t.reqRef === r.id && (!q.tc || t.id === q.tc));
  const arts = S.artifacts.filter(a => a.tcRefs.some(id => tcs.some(t => t.id === id)));
  const runs = S.runs.filter(x => x.results.some(y => tcs.some(t => t.id === y.tcRef)));
  const node = (txt, sub, href, col, hi) => `<div class="node" style="--c:${col}${hi ? ";background:var(--blue-bg)" : ""}" ${href ? `data-act="nav" data-href="${href}"` : ""}><b>${esc(txt)}</b>${sub ? `<div class="small muted">${sub}</div>` : ""}</div>`;
  const kinds = ["python", "pytest", "postman", "sql", "playwright", "jmeter"];
  const cols = [
    ["Document", [node(doc.name || "-", esc(doc.type || ""), `#/p/${p.id}`, "var(--gray)")]],
    ["Version", [node("v" + r.docVersion, `sha ${esc((ver.checksum || "").slice(0, 8))}`, `#/p/${p.id}/processing/${doc.id}?v=${r.docVersion}`, "var(--gray)")]],
    ["Section", [node(r.source.section, `หน้า ${esc(r.source.page)}`, null, "var(--gray)")]],
    ["Requirement", [node(r.reqId, badge(r.status), `#/p/${p.id}/requirements?sel=${r.id}`, "var(--purple)", true)]],
    ["Test Scenario", scs.map(s => node(s.tsId, esc(s.type) + " " + badge(s.status), `#/p/${p.id}/scenarios`, "var(--blue)"))],
    ["Test Case", tcs.map(t => node(t.tcId, `v${t.version} ${badge(t.status)}`, `#/p/${p.id}/testcase/${t.id}`, "var(--green)", q.tc === t.id))],
    ...kinds.map(k => [k[0].toUpperCase() + k.slice(1), arts.filter(a => a.kind === k).map(a => node(a.name, `${Object.keys(a.files).length} files`, `#/p/${p.id}/auto/${k}?a=${a.id}`, "var(--blue)"))]),
    ["Test Run", runs.map(x => node(x.name, badge(x.status), `#/p/${p.id}/run/${x.id}`, x.status === "PASSED" ? "var(--green)" : "var(--red)"))],
    ["Test Result", runs.flatMap(x => x.results.filter(y => tcs.some(t => t.id === y.tcRef)).slice(0, 8).map(y => node(y.tcId, badge(y.status) + " " + esc(y.name.split("::").pop().slice(0, 40)), `#/p/${p.id}/run/${x.id}`, y.status === "PASSED" ? "var(--green)" : y.status === "FAILED" ? "var(--red)" : "var(--orange)")))]
  ];
  return layout(pageHead("Traceability Viewer", `Document → Version → Section → Requirement → Scenario → Test Case → Automation → Run → Result`) +
    `<div class="card"><div class="trace">${cols.map(([h, ns]) => `<div class="col"><h4>${esc(h)}</h4>${ns.length ? ns.join("") : `<div class="small muted">—</div>`}</div>`).join("")}</div></div>`,
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Traceability"], [r.reqId]]);
}
