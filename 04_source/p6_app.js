/* ============ Render dispatcher ============ */
let afterRender = null;
function render() {
  const root = $("#root"); afterRender = null;
  const { seg, q } = parseRoute();
  if (!session || !me()) { if (seg[0] !== "login") { history.replaceState(null, "", "#/login"); } root.innerHTML = pageLogin(); $("#loginForm").onsubmit = doLogin; return; }
  if (me().mustChange && !$("#np1")) { setTimeout(() => changePasswordDialog(true), 0); }
  let html;
  try {
    if (seg[0] === "login") { go(S.projects.length ? `#/p/${S.projects[0].id}/dashboard` : "#/projects"); return; }
    if (seg[0] === "settings") html = pageSettings();
    else if (seg[0] === "audit") html = pageAudit();
    else if (seg[0] === "p") {
      const p = S.projects.find(x => x.id === seg[1]);
      if (!p) html = layout(emptyBox("ไม่พบ Project", "Project อาจถูกลบ", `<a class="btn" href="#/projects">กลับไปหน้า Projects</a>`), [["Projects", "#/projects"]]);
      else {
        const k = seg[2] || "";
        if (k === "") html = pageProject(p);
        else if (k === "dashboard") html = pageDashboard(p);
        else if (k === "upload") { html = pageUpload(p); afterRender = () => bindUpload(p); }
        else if (k === "processing") html = pageProcessing(p, seg[3], q);
        else if (k === "compare") html = pageCompare(p, q);
        else if (k === "requirements") html = pageRequirements(p, q);
        else if (k === "clarifications") html = pageClarifications(p, q);
        else if (k === "scenarios") html = pageScenarios(p);
        else if (k === "testcases") html = pageTestCases(p, q);
        else if (k === "testcase") html = pageTestCase(p, seg[3]);
        else if (k === "auto") html = pageAuto(p, seg[3], q);
        else if (k === "runs") html = pageRuns(p);
        else if (k === "run") html = pageRun(p, seg[3]);
        else if (k === "github") html = pageGithub(p);
        else if (k === "trace") html = pageTrace(p, q);
        else html = layout(emptyBox("ไม่พบหน้า", ""), [["Projects", "#/projects"]]);
      }
    } else html = pageProjects();
  } catch (e) {
    const err = appError("RENDER_ERROR", "แสดงหน้านี้ไม่สำเร็จ", e.stack || e.message, true, "รีเฟรชหน้า หากยังพบปัญหาให้ Export Backup แล้วแจ้ง Admin");
    console.error(e);
    html = layout(`<div class="dangerbox"><b>${esc(err.code)}</b> ${esc(err.userMessage)} — ${esc(err.suggestedAction)}<br><span class="small">Correlation ID ${err.correlationId}${can("audit.view") ? "<br>" + esc(err.technical.slice(0, 400)) : ""}</span></div>`, [["Error"]]);
  }
  const sc = $("#content") ? $("#content").scrollTop : 0;
  root.innerHTML = html;
  if ($("#content")) $("#content").scrollTop = sc;
  if (afterRender) afterRender();
}
window.addEventListener("hashchange", () => { ui.sideOpen = false; const c = $("#content"); render(); if (c && $("#content")) $("#content").scrollTop = 0; });

/* ============ Actions ============ */
const findReq = id => S.requirements.find(r => r.id === id);
const findTc = id => S.testCases.find(t => t.id === id);
function b64ToBlob(dataUri) { const [h, d] = dataUri.split(","); const mime = (h.match(/data:([^;]+)/) || [])[1] || "image/png"; const bin = atob(d); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); }
const ACT = {
  "modal-bg": (el, ev) => { if (ev.target === el) closeModal(); },
  "close-modal": () => closeModal(),
  "toggle-side": () => { ui.sideOpen = !ui.sideOpen; $("#side").classList.toggle("open", ui.sideOpen); },
  logout: () => logout(),
  "change-pw": () => changePasswordDialog(false),
  nav: el => go(el.dataset.href),
  tab: el => { ui.tab[el.dataset.k] = el.dataset.v; render(); },
  "new-project": () => guard("project.manage") && projectDialog(null),
  "edit-project": () => guard("project.manage") && projectDialog(P()),
  "seed-demo": () => guard("project.manage") && seedDemo(),
  "add-member": () => { const p = P(); const id = $("#addMem").value; if (id && guard("project.manage")) { p.members = [...new Set([...(p.members || []), id])]; audit("MEMBER_ADD", p.code, id); save(); render(); } },
  "remove-member": el => { const p = P(); if (guard("project.manage")) { p.members = (p.members || []).filter(x => x !== el.dataset.id); audit("MEMBER_REMOVE", p.code, el.dataset.id); save(); render(); } },
  "do-paste": async () => {
    const p = P(); if (!guard("doc.upload")) return;
    const text = $("#pasteText").value; if (text.trim().length < 20) { toast("ข้อความสั้นเกินไป", true); return; }
    const name = safeFilename($("#pasteName").value || "pasted-text") + (/\.txt$/.test($("#pasteName").value) ? "" : ".txt");
    const buf = new TextEncoder().encode(text).buffer; const opts = { target: $("#upTarget").value, module: $("#upModule").value, mode: $("#upMode").value, auto: $("#upAuto").checked };
    try { const r = await ingestBuffer(p, { name, ext: "paste", size: buf.byteLength, checksum: await sha256(buf), buf }, opts); r.doc.type = r.doc.type === "paste" ? "paste" : r.doc.type; go(`#/p/${p.id}/processing/${r.doc.id}?v=${r.lastVersion.v}`); if (opts.auto) startAnalysis(r.doc.id, r.lastVersion.v, opts.mode); }
    catch (e) { toast((e.userMessage || e.message) + (e.suggestedAction ? " — " + e.suggestedAction : ""), true); }
  },
  "job-start": el => startAnalysis(el.dataset.doc, el.dataset.v),
  "job-cancel": async el => { if (await confirmDialog("Cancel Job?", "Section ที่เสร็จแล้วจะถูกเก็บไว้ สามารถ Resume ต่อได้ภายหลัง", "Cancel Job", true)) { const k = el.dataset.doc + ":" + el.dataset.v; if (jobCtl[k]) jobCtl[k].cancel = true; } },
  "job-retry-failed": el => { const { v } = findVersion(el.dataset.doc, el.dataset.v); startAnalysis(el.dataset.doc, el.dataset.v, null, v.sections.filter(s => s.status === "FAILED").map(s => s.id)); },
  "job-retry": el => startAnalysis(el.dataset.doc, el.dataset.v, null, [el.dataset.id]),
  "job-log": el => { const { d, v } = findVersion(el.dataset.doc, el.dataset.v); downloadFile(`${d.name}-v${v.v}-processing.log.txt`, v.job.log.join("\n") + "\n\n" + v.sections.filter(s => s.error).map(s => `Section ${s.seq} ${s.title}: ${JSON.stringify(s.error)}`).join("\n")); },
  "view-section": el => {
    const { v } = findVersion(el.dataset.doc, el.dataset.v); const s = v.sections.find(x => x.id === el.dataset.id);
    modal(`<h2>${esc(s.title)}</h2><p class="small muted">หน้า ${s.page ?? NF}${s.pageEnd && s.pageEnd !== s.page ? "–" + s.pageEnd : ""} · Sequence ${s.seq} · ${s.kind === "table" ? "ตาราง" : "ข้อความ"}</p>${s.kind === "table" ? `<div class="tblwrap"><table>${s.rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></div>${(s.comments || []).length ? `<h3 style="margin-top:10px">Cell Comments</h3>${s.comments.map(c => `<div class="small"><b>${esc(c.cell)}</b>: ${esc(c.text)}</div>`).join("")}` : ""}` : `<div class="src">${esc(s.original || s.text)}</div>`}<div class="acts"><button class="btn" data-act="close-modal">ปิด</button></div>`, true);
  },
  "view-error": el => { const { v } = findVersion(el.dataset.doc, el.dataset.v); const e = v.sections.find(x => x.id === el.dataset.id).error; modal(`<h2>Error: ${esc(e.code)}</h2><dl class="kv"><dt>ข้อความ</dt><dd>${esc(e.userMessage)}</dd><dt>Retryable</dt><dd>${e.retryable ? "ใช่" : "ไม่"}</dd><dt>แนะนำ</dt><dd>${esc(e.suggestedAction)}</dd><dt>เวลา</dt><dd>${fmtDate(e.timestamp)}</dd><dt>Correlation ID</dt><dd class="mono">${esc(e.correlationId)}</dd>${can("audit.view") ? `<dt>Technical</dt><dd class="mono small">${esc(e.technical)}</dd>` : ""}</dl><div class="acts"><button class="btn" data-act="close-modal">ปิด</button></div>`); },
  "img-view": async el => {
    const { v } = findVersion(el.dataset.doc, el.dataset.v); const im = v.images.find(x => x.id === el.dataset.id);
    let visionOk = false; if (S.settings.vision && capSample) { try { const lim = await capSample.limits(); visionOk = !!lim.images; } catch {} }
    modal(`<h2>Screenshot Evidence</h2><img src="${im.dataUri}" alt="${esc(im.alt || "screenshot")}" style="max-width:100%;border:1px solid var(--line);border-radius:6px"><p class="small">${badge(im.status)} ${esc(im.caption || "")} · Section: ${esc(im.sectionTitle || "")}</p>
    ${im.vision ? `<div class="card"><span class="label-rec">VISION MODEL OUTPUT — ต้องตรวจสอบ</span><div style="white-space:pre-wrap" class="small">${esc(im.vision)}</div></div>` : ""}
    ${visionOk ? `<button class="btn ai" id="visBtn">วิเคราะห์ด้วย Vision</button>` : `<p class="small muted">${S.settings.vision ? "Vision ไม่พร้อมใช้งานในมุมมองนี้" : "Vision ปิดอยู่ (เปิดได้ที่ Settings → AI)"} — ระบบไม่เดาข้อความในรูป</p>`}
    ${can("req.edit") ? `<button class="btn" id="visDone">Mark Visual Reviewed</button>` : ""}<div class="acts"><button class="btn" data-act="close-modal">ปิด</button></div>`, true);
    if ($("#visDone")) $("#visDone").onclick = () => { im.status = "DONE"; audit("VISUAL_REVIEW", im.id); save(); closeModal(); render(); };
    if ($("#visBtn")) $("#visBtn").onclick = async () => { $("#visBtn").textContent = "กำลังวิเคราะห์…"; $("#visBtn").disabled = true; try { const r = await capSample("Transcribe ONLY the text that is clearly visible in this UI screenshot, then list visible fields/buttons. Write 'UNREADABLE' for anything not legible. Do not infer or guess hidden values. Answer in the screenshot's language.", { images: [b64ToBlob(im.dataUri)] }); im.vision = r.text; im.status = "NEEDS_VISUAL_REVIEW"; audit("VISION_ANALYZE", im.id); save(); closeModal(); ACT["img-view"](el); } catch (e) { toast("Vision ไม่สำเร็จ: " + (e.message || e.code), true); } };
  },
  "impact-decide": el => { if (!guard("impact.approve")) return; applyImpact(S.impacts.find(i => i.id === el.dataset.id), el.dataset.v); save(); render(); },
  "impact-approve-all": async el => { if (!guard("impact.approve")) return; const list = S.impacts.filter(i => i.docId === el.dataset.doc && i.toV === Number(el.dataset.to) && i.status === "PROPOSED"); if (await confirmDialog("อนุมัติ Impact Proposal ทั้งหมด", `${list.length} รายการ · Test Case จะถูก Flag ให้ทำ Version ใหม่ ไม่ถูกแก้อัตโนมัติ`)) { list.forEach(i => applyImpact(i, "APPROVED")); save(); render(); } },
  "sel-req": el => { ui.sel.req = el.dataset.id; const p = P(); history.replaceState(null, "", `#/p/${p.id}/requirements`); render(); },
  "cmp-check": (el, ev) => { ev.stopPropagation(); const s = new Set(ui.sel.cmp || []); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); ui.sel.cmp = [...s].slice(-2); render(); },
  "compare-reqs": () => compareReqsDialog(),
  "edit-req": el => guard("req.edit") && editRequirementDialog(findReq(el.dataset.id)),
  "review-req": el => { if (!guard("req.approve")) return; const r = findReq(el.dataset.id); r.reviewedBy = me().username; if (r.status === "AI_GENERATED") r.status = "WAITING_FOR_REVIEW"; audit("REQUIREMENT_REVIEW", r.reqId); save(); render(); },
  "approve-req": async el => {
    if (!guard("req.approve")) return; const r = findReq(el.dataset.id);
    const open = r.questions.filter(x => !x.resolved);
    if (r.conflictStatus === "OPEN") { toast("มี Conflict ที่ยังไม่ Resolve", true); return; }
    if (open.length) { toast(`ยังมี Clarification ค้าง ${open.length} ข้อ — Resolve ก่อน Approve`, true); return; }
    if (r.sourceUnverified && !(await confirmDialog("Source ไม่ได้รับการยืนยัน", "AI อ้างข้อความที่ไม่พบตรงตัวในต้นฉบับ ยืนยันว่าตรวจแล้ว?", "ยืนยันและ Approve"))) return;
    r.status = "APPROVED"; r.approvedBy = me().username; r.reviewedBy = r.reviewedBy || me().username; r.approvedAt = now();
    audit("REQUIREMENT_APPROVE", r.reqId); save(); render(); toast(`Approve ${r.reqId} แล้ว`);
  },
  "gen-scenarios": el => { if (!guard("scenario.edit")) return; const res = generateScenarios(P().id, [el.dataset.id]); audit("SCENARIO_GENERATE", findReq(el.dataset.id).reqId, `${res.created} created`); toast(`สร้าง ${res.created} Scenario`); go(`#/p/${P().id}/scenarios`); },
  "gen-scenarios-all": () => { if (!guard("scenario.edit")) return; const p = P(); const ids = S.requirements.filter(r => r.projectId === p.id && r.status === "APPROVED" && r.isLatest !== false).map(r => r.id); const res = generateScenarios(p.id, ids); audit("SCENARIO_GENERATE", p.code, `${res.created} created`); toast(`สร้าง Scenario ใหม่ ${res.created} รายการ (ข้ามรายการซ้ำอัตโนมัติ)`); go(`#/p/${p.id}/scenarios`); render(); },
  comment: async el => { if (!guard("comment")) return; const text = await promptDialog("เพิ่ม Comment", "ข้อความ"); if (!text) return; const obj = el.dataset.kind === "req" ? findReq(el.dataset.id) : findTc(el.dataset.id); obj.comments = obj.comments || []; obj.comments.push({ id: uid(), by: me().username, role: me().role, at: now(), text: mask(text) }); audit("COMMENT", el.dataset.kind === "req" ? obj.reqId : obj.tcId); save(); render(); },
  "answer-q": el => { if (!guard("question.answer")) return; const r = findReq(el.dataset.req); answerQuestion(r, r.questions.find(x => x.id === el.dataset.id)); },
  "resolve-q": el => { if (!guard("question.resolve")) return; const r = findReq(el.dataset.req); resolveQuestion(r, r.questions.find(x => x.id === el.dataset.id)); save(); render(); toast(`Resolve แล้ว — ${r.reqId} สถานะ ${r.status}`); },
  "assume-edit": async el => { if (!guard("assumption.edit")) return; const r = findReq(el.dataset.req), x = r.questions.find(y => y.id === el.dataset.id); const t = await promptDialog("แก้ไข Assumption", "AI ASSUMPTION - NOT FOUND IN BRS", x.assumption.text); if (t) { x.assumption.text = t; x.assumption.editedBy = me().username; audit("ASSUMPTION_EDIT", r.reqId, t); save(); render(); } },
  "assume-set": el => { if (!guard("assumption.edit")) return; const r = findReq(el.dataset.req), x = r.questions.find(y => y.id === el.dataset.id); x.assumption.state = el.dataset.v; x.assumption.by = me().username; audit("ASSUMPTION_" + el.dataset.v, r.reqId, x.assumption.text); save(); render(); },
  "resolve-conflict": el => { if (!guard("conflict.resolve")) return; resolveConflict(S.conflicts.find(c => c.id === el.dataset.id), el.dataset.keep); },
  "sc-check": el => { const s = new Set(ui.sel.sc || []); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); ui.sel.sc = [...s]; render(); },
  "sc-select-all": () => { const p = P(); ui.sel.sc = S.scenarios.filter(s => s.projectId === p.id && s.status !== "DEPRECATED" && !S.testCases.some(t => t.scenarioRef === s.id)).map(s => s.id); render(); },
  "sc-approve": el => { if (!guard("scenario.edit")) return; const s = S.scenarios.find(x => x.id === el.dataset.id); s.status = "APPROVED"; s.reviewer = me().username; s.approvedAt = now(); audit("SCENARIO_APPROVE", s.tsId); save(); render(); },
  "sc-edit": async el => { if (!guard("scenario.edit")) return; const s = S.scenarios.find(x => x.id === el.dataset.id); const t = await promptDialog("แก้ไข Scenario " + s.tsId, "Title", s.title); if (t) { s.history = s.history || []; s.history.push({ at: now(), by: me().username, old: s.title, new: t }); s.title = t; s.status = "WAITING_FOR_REVIEW"; audit("SCENARIO_EDIT", s.tsId); save(); render(); } },
  "gen-tcs": () => { if (!guard("tc.edit")) return; const res = generateTestCases(ui.sel.sc || []); audit("TESTCASE_GENERATE", P().code, `${res.created} created`); ui.sel.sc = []; if (res.blocked.length) toast(`ข้าม ${res.blocked.length} Scenario: Requirement ยังไม่ Approved/มี Clarification ค้าง`, true); toast(`สร้าง Test Case ${res.created} รายการ`); go(`#/p/${P().id}/testcases`); render(); },
  "toggle-edit-tc": () => { ui.editTc = !ui.editTc; render(); },
  "tc-check": el => { const s = new Set(ui.sel.tc || []); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); ui.sel.tc = [...s]; render(); },
  "tc-bulk": async el => { if (!guard("tc.approve")) return; const list = (ui.sel.tc || []).map(findTc).filter(t => t && !t.locked); if (!list.length) { toast("ไม่มีรายการที่ Approve ได้", true); return; } if (!(await confirmDialog("Approve Test Case", `อนุมัติ ${list.length} รายการ · Test Case จะถูก Lock`, "Approve"))) return; let n = 0; list.forEach(t => { if (setTcStatus(t, el.dataset.v, "Bulk approve")) n++; }); ui.sel.tc = []; toast(`Approve ${n} รายการ`); render(); },
  "tc-edit": el => guard("tc.edit") && tcEditDialog(findTc(el.dataset.id)),
  "tc-newver": async el => {
    if (!guard("tc.edit")) return; const t = findTc(el.dataset.id);
    const reason = await promptDialog("สร้าง Version ใหม่", `${t.tcId} v${t.version} จะถูกเก็บไว้ (อ่านได้) และ v${t.version + 1} ต้อง Review/Approve ใหม่ — ระบุเหตุผล`); if (!reason) return;
    t.version++; t.locked = false; const prev = t.status; t.status = "REVISED"; t.impactFlag = null;
    t.history.push({ version: t.version, at: now(), by: me().username, kind: "New Version", reason, changes: [{ field: "version", old: t.version - 1, new: t.version }], snapshot: clone(t.data) });
    t.approvals.push({ at: now(), by: me().username, from: prev, to: "REVISED", comment: reason });
    audit("TESTCASE_NEW_VERSION", t.tcId, `v${t.version}: ${reason}`); save(); render();
  },
  "tc-status": async el => {
    const t = findTc(el.dataset.id), st = el.dataset.v;
    if (!(st === "READY_FOR_AUTOMATION" ? (can("tc.approve") || can("auto.generate")) : guard("tc.approve"))) return;
    let comment = "";
    if (st === "APPROVED" && !(await confirmDialog("Approve " + t.tcId, "Test Case จะถูก Lock หากต้องแก้ต้องสร้าง Version ใหม่", "Approve"))) return;
    if (st === "DRAFT" || st === "NEEDS_CLARIFICATION") { comment = await promptDialog(st === "DRAFT" ? "Reject" : "Needs Clarification", "เหตุผล/คำถาม"); if (!comment) return; }
    if (setTcStatus(t, st, comment)) render();
  },
  "export-excel": () => { if (guard("tc.export")) exportExcel(P().id).catch(e => toast("Export ไม่สำเร็จ: " + e.message, true)); },
  "auto-check": el => { const k = "auto_" + el.dataset.k; const s = new Set(ui.sel[k] || []); el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); ui.sel[k] = [...s]; render(); },
  "auto-all": el => { const p = P(); const draft = ui.f["draft_" + el.dataset.k]; ui.sel["auto_" + el.dataset.k] = S.testCases.filter(t => t.projectId === p.id && t.status !== "DEPRECATED" && (draft || ELIGIBLE.includes(t.status))).map(t => t.id); render(); },
  "auto-generate": el => generateArtifact(P(), el.dataset.k),
  "pw-advisor": () => locatorAdvisorDialog(),
  "pw-record": () => recordFlowDialog(),
  "file-sel": el => { stashEditor(); ui.sel["file_" + el.dataset.art] = el.dataset.path; render(); },
  "copy-code": async () => { const ed = $("#codeEd") || $(".codeview"); const txt = ed.value ?? ed.textContent; try { await navigator.clipboard.writeText(txt); toast("คัดลอกแล้ว"); } catch { ed.select && ed.select(); toast("กด Ctrl+C เพื่อคัดลอก"); } },
  "dl-file": el => { stashEditor(); const a = S.artifacts.find(x => x.id === el.dataset.art); const path = currentPath(a); const name = path.split("/").pop(); if (/\.(json|md|txt|csv)$/.test(name)) downloadFile(name, a.files[path]); else downloadZip(name.replace(/\.[^.]+$/, "") + ".zip", { [path]: a.files[path] }); },
  "dl-zip": el => { stashEditor(); const a = S.artifacts.find(x => x.id === el.dataset.art); const files = { ...a.files }; if (a.kind === "pytest" || a.kind === "playwright") files[".github/workflows/qa-automation.yml"] = genGithubWorkflow(P()); downloadZip(`${a.name}.zip`, files); },
  "code-diff": el => { stashEditor(); const a = S.artifacts.find(x => x.id === el.dataset.art); const path = currentPath(a); modal(`<h2>Code Diff: ${esc(path)}</h2><p class="small muted">- AI Version / + ฉบับแก้ไข</p>${renderDiff(a.aiFiles[path], a.files[path], 3)}<div class="acts"><button class="btn" data-act="close-modal">ปิด</button></div>`, true); },
  "code-reset": async el => { const a = S.artifacts.find(x => x.id === el.dataset.art); const path = currentPath(a); if (await confirmDialog("Reset กลับ AI Version", `การแก้ไขใน ${path} จะหายไป`, "Reset", true)) { a.files[path] = a.aiFiles[path]; audit("CODE_RESET", a.name, path); save(); render(); } },
  "code-save": el => { if (!guard("auto.edit")) return; if (stashEditor(true)) toast("บันทึก Code Draft แล้ว"); else toast("ไม่มีการเปลี่ยนแปลง"); render(); },
  "run-art": el => { stashEditor(); runArtifact(P(), S.artifacts.find(x => x.id === el.dataset.art)); },
  "run-cancel": el => { if (jobCtl[el.dataset.id]) jobCtl[el.dataset.id].cancel = true; else { const r = S.runs.find(x => x.id === el.dataset.id); r.status = "CANCELLED"; r.summary = summarize(r.results); save(); render(); } },
  "run-log-dl": el => { const r = S.runs.find(x => x.id === el.dataset.id); downloadFile(`${r.name}.log.txt`, `${r.stdout}\n\n--- stderr ---\n${r.stderr}\nexit code: ${r.exitCode}`); },
  "import-result": el => guard("run.execute") && importResultDialog(P(), el.dataset.v),
  "gh-propose": () => {
    if (!guard("github.propose")) return; const p = P();
    const ids = [...document.querySelectorAll(".ghArt:checked")].map(c => c.value); if (!ids.length) { toast("เลือก Artifact อย่างน้อย 1 รายการ", true); return; }
    const files = {}; ids.forEach(id => { const a = S.artifacts.find(x => x.id === id); Object.assign(files, a.files); });
    files[".github/workflows/qa-automation.yml"] = genGithubWorkflow(p);
    const prev = S.githubProposals.filter(g => g.projectId === p.id && ["APPROVED", "EXECUTED"].includes(g.status)).sort((a, b) => b.created.localeCompare(a.created))[0];
    const base = prev ? prev.files : {};
    const g = { id: uid(), projectId: p.id, repo: S.settings.githubOwner && S.settings.githubRepo ? `${S.settings.githubOwner}/${S.settings.githubRepo}` : "NEEDS_CONFIGURATION", branch: $("#ghBranch").value.trim().replace(/[^A-Za-z0-9._\/-]/g, "-"), message: $("#ghMsg").value.trim(), actionType: $("#ghType").value, files, base, artifactIds: ids, problems: scanFilesForSecrets(files), diffSummary: { added: Object.keys(files).filter(f => !(f in base)).length, modified: Object.keys(files).filter(f => f in base && base[f] !== files[f]).length }, status: "PROPOSED", created: now(), createdBy: me().username };
    if (/^(main|master)$/.test(g.branch)) { toast("ห้าม Push ตรงไป main/master — ใช้ Branch ใหม่", true); return; }
    S.githubProposals.push(g); audit("GITHUB_PROPOSE", g.branch, `${Object.keys(files).length} files`); save(); render();
  },
  "gh-approve": async el => { if (!guard("github.approve")) return; const g = S.githubProposals.find(x => x.id === el.dataset.id); if (await confirmDialog("อนุมัติ Git Action", `${esc(g.actionType)}<br>Repository: ${esc(g.repo)}<br>Branch: ${esc(g.branch)}<br>${Object.keys(g.files).length} ไฟล์ · ไม่มี Merge อัตโนมัติ`, "Approve")) { g.status = "APPROVED"; g.approvedBy = me().username; g.approvedAt = now(); audit("GITHUB_APPROVE", g.branch); save(); render(); } },
  "gh-reject": el => { const g = S.githubProposals.find(x => x.id === el.dataset.id); g.status = "REJECTED"; audit("GITHUB_REJECT", g.branch); save(); render(); },
  "gh-execute": async el => {
    const g = S.githubProposals.find(x => x.id === el.dataset.id);
    modal(`<h2>Execute: ${esc(g.actionType)}</h2><div class="warnbox">Backend GitHub App/Token ยังไม่ได้ตั้งค่า (NEEDS_CONFIGURATION) — หน้าเว็บนี้จะไม่รับ Token ระบบจึงเตรียม ZIP และคำสั่งให้คุณ Push เอง</div><pre class="codeview">git clone https://github.com/${esc(g.repo)}.git
cd ${esc(g.repo.split("/").pop())}
git checkout -b ${esc(g.branch)}
# แตกไฟล์ ZIP ลงในโฟลเดอร์นี้
git add .
git status          # ตรวจว่าไม่มี .env / .auth / session
git commit -m "${esc(g.message)}"
git push -u origin ${esc(g.branch)}
# เปิด Pull Request บน GitHub — ห้าม Merge อัตโนมัติ</pre><div class="acts"><button class="btn" data-act="close-modal">ปิด</button><button class="btn pri" id="ghZip">Download ZIP</button><button class="btn ok" id="ghDone">Push แล้ว (บันทึกผล)</button></div>`, true);
    $("#ghZip").onclick = () => downloadZip(`${g.branch.replace(/\//g, "-")}.zip`, g.files);
    $("#ghDone").onclick = () => { g.status = "EXECUTED"; g.executedBy = me().username; g.executedAt = now(); audit("GITHUB_EXECUTE", g.branch, "manual push"); save(); closeModal(); render(); };
  },
  "user-new": () => {
    if (!guard("settings")) return;
    modal(`<h2>เพิ่มผู้ใช้</h2><div class="field"><label>Username</label><input type="text" id="nuU"></div><div class="field"><label>ชื่อ</label><input type="text" id="nuN"></div><div class="field"><label>Role</label><select id="nuR">${Object.entries(ROLES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div><div class="field"><label>รหัสผ่านชั่วคราว (ผู้ใช้ต้องเปลี่ยนตอน Login ครั้งแรก)</label><input type="password" id="nuP"></div><div class="acts"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" id="nuOk">สร้าง</button></div>`);
    $("#nuOk").onclick = async () => { const un = $("#nuU").value.trim().toLowerCase(); if (!/^[a-z0-9._-]{3,32}$/.test(un)) { toast("Username 3–32 ตัว (a-z 0-9 . _ -)", true); return; } if (S.users.some(u => u.username === un)) { toast("Username ซ้ำ", true); return; } if ($("#nuP").value.length < 8) { toast("รหัสผ่านอย่างน้อย 8 ตัว", true); return; } S.users.push({ id: uid(), username: un, name: $("#nuN").value.trim() || un, role: $("#nuR").value, hash: await hashPassword($("#nuP").value), mustChange: true, active: true, created: now() }); audit("USER_CREATE", un, $("#nuR").value); save(); closeModal(); render(); };
  },
  "user-reset": async el => { const u = S.users.find(x => x.id === el.dataset.id); const pw = await promptDialog("Reset Password: " + u.username, "รหัสผ่านชั่วคราว (อย่างน้อย 8 ตัว)"); if (!pw || pw.length < 8) return; u.hash = await hashPassword(pw); u.mustChange = true; audit("USER_PASSWORD_RESET", u.username); save(); toast("Reset แล้ว"); },
  "user-toggle": el => { const u = S.users.find(x => x.id === el.dataset.id); u.active = !u.active; audit(u.active ? "USER_ENABLE" : "USER_DISABLE", u.username); save(); render(); },
  backup: () => { if (!guard("settings")) return; const data = clone(S); data.users = data.users.map(u => ({ ...u })); downloadFile(`brs-qa-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data)); audit("BACKUP_EXPORT", "all"); },
  restore: () => {
    if (!guard("settings")) return;
    modal(`<h2>Restore จาก Backup</h2><div class="dangerbox">ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่</div><input type="file" id="rsF" accept=".json"><div class="acts"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn danger" id="rsOk">Restore</button></div>`);
    $("#rsOk").onclick = async () => { const f = $("#rsF").files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (d.schema !== 1 || !Array.isArray(d.users) || !d.users.length) throw new Error("ไม่ใช่ไฟล์ Backup ที่ถูกต้อง"); S = Object.assign(emptyState(), d); await idbSet("state", S); audit("BACKUP_RESTORE", f.name); closeModal(); logout("Restore แล้ว กรุณาเข้าสู่ระบบใหม่"); } catch (e) { toast("Restore ไม่สำเร็จ: " + e.message, true); } };
  },
  "reset-all": async () => { if (!guard("settings")) return; if (await confirmDialog("ลบข้อมูลทั้งหมด", "ข้อมูลทุก Project, Requirement, Test Case และผู้ใช้จะถูกลบถาวร ควร Export Backup ก่อน", "ลบทั้งหมด", true)) { S = emptyState(); await seedIfEmpty(); await idbSet("state", S); logout("ลบข้อมูลแล้ว เข้าสู่ระบบด้วย admin / Admin@12345"); } },
  "audit-csv": () => { const rows = [["at", "user", "action", "entity", "detail", "correlationId"], ...S.audit.map(a => [a.at, a.user, a.action, a.entity, a.detail, a.correlationId])]; downloadFile(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")); audit("EXPORT", "audit-log"); }
};
function currentPath(a) { const ed = $("#codeEd"); return ed ? ed.dataset.path : (ui.sel["file_" + a.id] || Object.keys(a.files)[0]); }
function stashEditor(explicit) {
  const ed = $("#codeEd"); if (!ed) return false; const a = S.artifacts.find(x => x.id === ed.dataset.art); if (!a || !can("auto.edit")) return false;
  const path = ed.dataset.path; if (a.files[path] === ed.value) return false;
  a.files[path] = ed.value; a.edited = true; audit("CODE_EDIT", a.name, path); save(); return true;
}
const CHANGE = {
  "switch-project": el => { if (el.value) go(`#/p/${el.value}/dashboard`); else go("#/projects"); },
  "f-toggle": el => { ui.f[el.dataset.k] = el.checked; render(); },
  f: el => { ui.f[el.dataset.k] = el.value; render(); },
  cmp: el => { const { q } = parseRoute(); const n = { doc: q.doc || "", from: q.from || "", to: q.to || "" }; n[el.dataset.k] = el.value; if (el.dataset.k === "doc") { n.from = ""; n.to = ""; } go(`#/p/${P().id}/compare?doc=${n.doc}&from=${n.from}&to=${n.to}`); },
  "tc-cell": el => { if (!guard("tc.edit")) return; const t = findTc(el.dataset.id); editTcData(t, { [el.dataset.k]: el.value }, "แก้ไขในตาราง"); },
  "draft-mode": async el => { if (el.checked && !(await confirmDialog("เปิดโหมด Generate Draft Code", "Code จะถูกสร้างจาก Test Case ที่ยังไม่ Approved และติดป้าย DRAFT ใช้เพื่อดูตัวอย่างเท่านั้น", "เปิดโหมด Draft"))) { el.checked = false; return; } ui.f["draft_" + el.dataset.k] = el.checked; if (el.checked) audit("DRAFT_CODE_MODE", el.dataset.k); render(); },
  "art-select": el => { ui.sel["art_" + el.dataset.k] = el.value; history.replaceState(null, "", `#/p/${P().id}/auto/${el.dataset.k}`); render(); },
  opt: el => { const o = ui.f["opt_" + el.dataset.k] = ui.f["opt_" + el.dataset.k] || {}; o[el.dataset.o] = el.type === "number" ? Number(el.value) : el.value; render(); },
  "opt-bool": el => { const o = ui.f["opt_" + el.dataset.k] = ui.f["opt_" + el.dataset.k] || {}; o[el.dataset.o] = el.checked; render(); },
  "opt-multi": el => { const o = ui.f["opt_" + el.dataset.k] = ui.f["opt_" + el.dataset.k] || {}; const s = new Set(o[el.dataset.o] || ["duplicate", "aggregation"]); el.checked ? s.add(el.dataset.v) : s.delete(el.dataset.v); o[el.dataset.o] = [...s]; },
  "user-role": el => { if (!guard("settings")) return; const u = S.users.find(x => x.id === el.dataset.id); audit("USER_ROLE_CHANGE", u.username, `${u.role} → ${el.value}`); u.role = el.value; save(); render(); },
  setting: el => { if (!guard("settings")) return; S.settings[el.dataset.k] = el.value.trim(); audit("SETTINGS_CHANGE", el.dataset.k); save(); render(); },
  "setting-bool": el => { if (!guard("settings")) return; S.settings[el.dataset.k] = el.checked; audit("SETTINGS_CHANGE", el.dataset.k, String(el.checked)); save(); render(); },
  "setting-num": el => { if (!guard("settings")) return; const n = Number(el.value); if (!isFinite(n) || n < Number(el.min || 0) || n > Number(el.max || 1e9)) { toast("ค่าอยู่นอกช่วงที่อนุญาต", true); render(); return; } S.settings[el.dataset.k] = n; audit("SETTINGS_CHANGE", el.dataset.k, String(n)); save(); },
  "setting-list": el => { if (!guard("settings")) return; S.settings[el.dataset.k] = el.value.split("\n").map(x => x.trim()).filter(x => /^https?:\/\//.test(x)); audit("SETTINGS_CHANGE", el.dataset.k); save(); render(); }
};
document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-act]"); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === "A") ev.preventDefault();
  try { const r = fn(el, ev); if (r && r.catch) r.catch(e => toast(e.userMessage || e.message || String(e), true)); } catch (e) { console.error(e); toast(e.userMessage || e.message || String(e), true); }
});
document.addEventListener("change", ev => {
  const el = ev.target.closest("[data-change]"); if (!el) return;
  const fn = CHANGE[el.dataset.change]; if (fn) { try { fn(el, ev); } catch (e) { toast(e.message, true); } }
});
let inputTimer = null;
document.addEventListener("input", ev => {
  const el = ev.target; if (!el.dataset || el.dataset.input !== "f") return;
  ui.f[el.dataset.k] = el.value; clearTimeout(inputTimer);
  inputTimer = setTimeout(() => { const k = el.dataset.k, pos = el.selectionStart; render(); const n = document.querySelector(`[data-input="f"][data-k="${k}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }, 250);
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && $("#modal").innerHTML && !$("#np1")) closeModal(); });

/* ============ Demo project (synthetic data only, §45) ============ */
async function seedDemo() {
  let code = "CAM", i = 1; while (S.projects.some(p => p.code === code)) code = "CAM" + (++i);
  const p = { id: uid(), code, name: "Customer Activity Monitoring (Demo)", desc: "Demo Project — ข้อมูลสมมติทั้งหมด", modules: ["GENERAL", "RULE3", "RULE4"], members: [me().id], created: now() };
  S.projects.push(p); audit("PROJECT_CREATE", code, "demo");
  const buf = new TextEncoder().encode(DEMO_BRS).buffer;
  const r = await ingestBuffer(p, { name: "CAM-BRS-demo.txt", ext: "paste", size: buf.byteLength, checksum: await sha256(buf), buf }, { module: "GENERAL", mode: "rule" });
  save(); go(`#/p/${p.id}/processing/${r.doc.id}?v=1`);
  await startAnalysis(r.doc.id, 1, "rule");
  toast("สร้าง Demo Project แล้ว — ลองไปที่ Clarification & Conflict Center");
}

/* ============ Boot ============ */
(async function boot() {
  $("#root").innerHTML = `<div class="empty" style="padding-top:20vh">กำลังโหลด…</div>`;
  await loadState();
  try { await seedIfEmpty(); } catch (e) { $("#root").innerHTML = `<div class="dangerbox" style="margin:40px">โหลด Library สำหรับ Hash รหัสผ่านไม่สำเร็จ (${esc(e.message)}) — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วรีเฟรช</div>`; return; }
  S.documents.forEach(d => d.versions.forEach(v => { if (v.job && v.job.status === "RUNNING") { v.job.status = "PAUSED"; v.sections.forEach(s => { if (s.status === "RUNNING") s.status = "PENDING"; }); } }));
  S.runs.forEach(r => { if (r.status === "RUNNING") { r.status = "CANCELLED"; r.summary = summarize(r.results); } });
  restoreSession();
  render();
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("sample").then(s => { capSample = s; if (s) render(); }).catch(() => {});
    window.claude.use("downloads").then(d => { capDownloads = d; }).catch(() => {});
  }
})();
