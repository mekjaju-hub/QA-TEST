/* ============ P13–P18 Automation generators (shared layout) ============ */
const AUTO_META = {
  python: { title: "Python Generator", sub: "Business Logic, Validator, Date/File/API Helper, Test Data Factory (Service + Repository Pattern)" },
  pytest: { title: "Pytest Generator", sub: "Test ใช้ parametrize, fixture, marker testcase, Decimal · Run ได้จากหน้านี้" },
  postman: { title: "Postman Generator", sub: "Collection v2.1 + Environment Template · Auth แบบ Configurable" },
  sql: { title: "SQL Generator (MySQL)", sub: "Read-only Template พร้อม Placeholder · ไม่เชื่อม Database จริงใน Version นี้" },
  playwright: { title: "Playwright Generator", sub: "Page Object Model · Manual Checkpoint สำหรับ OTP/CAPTCHA · Screenshot on Failure" },
  jmeter: { title: "JMeter Generator", sub: "JMX Preview, Test Profile, CSV Data Template · Run ผ่าน Runner Interface ในอนาคต" }
};
const ELIGIBLE = ["APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED"];
function pageAuto(p, kind, q) {
  const meta = AUTO_META[kind]; if (!meta) return layout(emptyBox("ไม่พบหน้า", ""), [["Automation"]]);
  if (!can("auto.view") && !(kind === "python" && can("run.view"))) return layout(emptyBox("ไม่มีสิทธิ์", "Role ของคุณไม่มีสิทธิ์ดู Automation Code"), [["Automation"]]);
  const draftMode = !!ui.f["draft_" + kind];
  const all = S.testCases.filter(t => t.projectId === p.id && t.status !== "DEPRECATED");
  const eligible = all.filter(t => draftMode || ELIGIBLE.includes(t.status));
  const sel = (ui.sel["auto_" + kind] || []).filter(id => eligible.some(t => t.id === id));
  const arts = S.artifacts.filter(a => a.projectId === p.id && a.kind === kind).sort((a, b) => b.created.localeCompare(a.created));
  const art = arts.find(a => a.id === (q.a || ui.sel["art_" + kind])) || arts[0];
  const canGen = can("auto.generate");
  const picker = `<div class="card"><h3>1. เลือก Test Case</h3>
    <label class="row-flex small" style="margin-bottom:8px"><input type="checkbox" data-change="draft-mode" data-k="${kind}" ${draftMode ? "checked" : ""} ${canGen ? "" : "disabled"}> Generate Draft Code (รวม Test Case ที่ยังไม่ Approved)</label>
    ${draftMode ? `<div class="warnbox small">โหมด Draft: Code ที่ได้จะติดป้าย DRAFT และไม่ควรใช้ Run จริงจนกว่า Test Case จะ Approved</div>` : ""}
    ${eligible.length ? `<div class="list" style="max-height:260px">${eligible.map(t => `<label class="row-flex small" style="padding:3px 0"><input type="checkbox" data-act="auto-check" data-k="${kind}" data-id="${t.id}" ${sel.includes(t.id) ? "checked" : ""}> <span class="mono">${esc(t.tcId)}</span> ${esc(t.data.type)} ${badge(t.status)}</label>`).join("")}</div><button class="btn sm" data-act="auto-all" data-k="${kind}" style="margin-top:6px">เลือกทั้งหมด</button>`
      : `<p class="small muted">ยังไม่มี Test Case ที่ Approved — ห้ามสร้าง Automation จาก Test Case ที่ยังไม่อนุมัติ</p><a class="btn sm" href="#/p/${p.id}/testcases">ไปที่ Test Case Review</a>`}
  </div>`;
  const options = autoOptions(p, kind);
  const genBtn = canGen ? `<button class="btn ${draftMode ? "" : "pri"}" data-act="auto-generate" data-k="${kind}" ${sel.length ? "" : "disabled"}>${draftMode ? "Generate Draft Code" : "Generate"} (${sel.length})</button>` : `<p class="small muted">เฉพาะ QA Automation/Admin ที่ Generate ได้</p>`;
  const artSel = arts.length ? `<select data-change="art-select" data-k="${kind}">${arts.map(a => `<option value="${a.id}" ${art && a.id === art.id ? "selected" : ""}>${esc(a.name)}${a.draft ? " [DRAFT]" : ""} · ${fmtDate(a.created)}</option>`).join("")}</select>` : "";
  return layout(pageHead(meta.title, meta.sub) + `<div class="grid g2" style="margin-bottom:14px">${picker}<div class="card"><h3>2. ตั้งค่าและ Generate</h3>${options}<div style="margin-top:10px">${genBtn}</div></div></div>
    ${art ? `<div class="row-flex" style="margin-bottom:10px"><h2 style="margin:0">Artifact</h2>${artSel}${art.draft ? badge("NEEDS_CLARIFICATION", "DRAFT") : badge("APPROVED", "จาก Test Case ที่ Approved")}<span class="small muted">Test Case: ${art.tcRefs.map(id => esc((S.testCases.find(t => t.id === id) || {}).tcId)).join(", ")}</span></div>${artifactViewer(p, art)}` : emptyBox("ยังไม่มี Artifact", "เลือก Test Case แล้วกด Generate")}`,
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Automation"], [meta.title]]);
}
function autoOptions(p, kind) {
  const o = ui.f["opt_" + kind] || {};
  if (kind === "postman") return `<div class="field"><label>Authentication (ห้ามเดา — ถ้าไม่ทราบให้เลือก NEEDS_CONFIGURATION)</label><select data-change="opt" data-k="${kind}" data-o="auth">${[["none", "NEEDS_CONFIGURATION / No Auth"], ["basic", "Basic Auth"], ["bearer", "Bearer Token"], ["apikey", "API Key"], ["oauth2", "OAuth 2.0"], ["cookie", "Cookie Session"]].map(([v, l]) => `<option value="${v}" ${o.auth === v ? "selected" : ""}>${l}</option>`).join("")}</select></div><p class="small muted">Credential ทั้งหมดเป็น Variable ใน Environment Template ไม่มีค่าจริงในไฟล์</p>`;
  if (kind === "sql") return `<div class="field"><label>ประเภท Query</label>${Object.entries(SQL_TYPES).map(([k, l]) => `<label class="row-flex small"><input type="checkbox" data-change="opt-multi" data-k="${kind}" data-o="types" data-v="${k}" ${(o.types || ["duplicate", "aggregation"]).includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div><p class="small muted">Dialect = MySQL · SELECT เท่านั้น</p>`;
  if (kind === "playwright") {
    const locs = o.locators || [];
    return `<div class="grid g2"><div class="field"><label>ชื่อหน้า (Page Object)</label><input type="text" data-change="opt" data-k="${kind}" data-o="pageName" value="${esc(o.pageName || "CustomerSearch")}"></div><div class="field"><label>Login Path</label><input type="text" data-change="opt" data-k="${kind}" data-o="loginPath" value="${esc(o.loginPath || "/login")}"></div></div>
    <div class="field"><label>Browser</label><select data-change="opt" data-k="${kind}" data-o="browser">${[["chromium", "Chromium"], ["msedge", "Microsoft Edge"], ["firefox", "Firefox"]].map(([v, l]) => `<option value="${v}" ${o.browser === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <label class="row-flex small"><input type="checkbox" data-change="opt-bool" data-k="${kind}" data-o="otp" ${o.otp ? "checked" : ""}> มี OTP (Manual Checkpoint)</label>
    <label class="row-flex small"><input type="checkbox" data-change="opt-bool" data-k="${kind}" data-o="captcha" ${o.captcha ? "checked" : ""}> มี CAPTCHA (ผู้ใช้ทำเอง — ระบบไม่อ่าน/ไม่ข้าม)</label>
    <div class="row-flex" style="margin-top:8px"><button class="btn sm" data-act="pw-advisor">Locator Advisor / AI Exploration</button><button class="btn sm" data-act="pw-record">แปลง Recorded Flow</button><span class="small muted">Locator ที่อนุมัติ: ${locs.length || "ค่าเริ่มต้น (NEEDS_CONFIGURATION)"}</span></div>`;
  }
  if (kind === "jmeter") {
    const url = o.url || ""; const chk = jmeterSafety(url, o);
    return `<div class="dangerbox"><b>คำเตือน: Load/Stress/Spike Test สร้างภาระสูงต่อระบบเป้าหมาย</b><br>ห้ามยิง Production · URL ต้องอยู่ใน Environment Allowlist · ต้องได้รับอนุมัติก่อน Run</div>
    <div class="grid g2"><div class="field"><label>Profile</label><select data-change="opt" data-k="${kind}" data-o="type">${["Load", "Stress", "Spike"].map(t => `<option ${o.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div><div class="field"><label>Target URL</label><input type="url" data-change="opt" data-k="${kind}" data-o="url" value="${esc(url)}" placeholder="${esc(S.settings.envAllowlist[0] || "https://sit.example.test")}"></div>
    <div class="field"><label>Concurrent Users (สูงสุด ${S.settings.jmeterMaxUsers})</label><input type="number" min="1" max="${S.settings.jmeterMaxUsers}" data-change="opt" data-k="${kind}" data-o="users" value="${o.users || 10}"></div><div class="field"><label>Duration นาที (สูงสุด ${S.settings.jmeterMaxMinutes})</label><input type="number" min="1" max="${S.settings.jmeterMaxMinutes}" data-change="opt" data-k="${kind}" data-o="minutes" value="${o.minutes || 5}"></div>
    <div class="field"><label>Ramp-up วินาที</label><input type="number" min="0" data-change="opt" data-k="${kind}" data-o="ramp" value="${o.ramp ?? 30}"></div></div>
    <label class="row-flex small"><input type="checkbox" data-change="opt-bool" data-k="${kind}" data-o="confirm" ${o.confirm ? "checked" : ""}> ยืนยัน Target URL และรับทราบความเสี่ยง</label>
    ${chk.length ? `<div class="warnbox small" style="margin-top:8px">${chk.map(esc).join("<br>")}</div>` : `<p class="small" style="color:var(--green)">ผ่าน Safety Check</p>`}
    <p class="small muted">Metric: TPS, Error Rate, Response Time, Concurrent Users, Throughput (Summary Report ใน JMX) · Run/Emergency Stop จะเปิดเมื่อมี Runner Interface</p>`;
  }
  if (kind === "pytest" || kind === "python") return `<p class="small">ระบบจะสร้างโครงสร้าง automation_project ตามมาตรฐาน: app/services, validators, utilities, repositories, test_data/factory${kind === "pytest" ? ", tests/unit, conftest.py, pytest.ini, requirements.txt" : ""} พร้อม Code Tips ภาษาไทย</p><p class="small muted">ค่าจาก BRS ทุกค่ามี Comment อ้าง Requirement ID และหน้าที่มา</p>`;
  return "";
}
function jmeterSafety(url, o) {
  const issues = [];
  let u = null; try { u = new URL(url); } catch { issues.push("Target URL ไม่ถูกต้องหรือว่าง"); }
  if (u && !S.settings.envAllowlist.some(a => { try { return new URL(a).host === u.host; } catch { return false; } })) issues.push(`Host ${u.host} ไม่อยู่ใน Environment Allowlist (ตั้งค่าใน Settings)`);
  if (u && /(^|\.)(prod|production|www)\.|prd/i.test(u.host)) issues.push("URL ดูเหมือน Production — ถูก Block โดยค่าเริ่มต้น");
  if ((o.users || 10) > S.settings.jmeterMaxUsers) issues.push(`Users เกิน Limit ${S.settings.jmeterMaxUsers}`);
  if ((o.minutes || 5) > S.settings.jmeterMaxMinutes) issues.push(`Duration เกิน Limit ${S.settings.jmeterMaxMinutes} นาที`);
  if (!o.confirm) issues.push("ยังไม่ได้ยืนยัน Target URL");
  return issues;
}
function artifactViewer(p, art) {
  const paths = Object.keys(art.files).sort();
  const cur = paths.includes(ui.sel["file_" + art.id]) ? ui.sel["file_" + art.id] : (paths.find(x => /test_|rule_service|collection|\.sql|\.jmx|_page\.py/.test(x)) || paths[0]);
  const tips = (art.tips || {})[cur] || [];
  const edited = art.files[cur] !== (art.aiFiles || {})[cur];
  const canEdit = can("auto.edit"), runnable = art.kind === "pytest" || art.kind === "python";
  return `<div class="editor">
    <div class="card tree" style="padding:8px">${paths.map(x => `<div class="${x === cur ? "on" : ""}" data-act="file-sel" data-art="${art.id}" data-path="${esc(x)}" title="${esc(x)}">${esc(x)}${art.files[x] !== (art.aiFiles || {})[x] ? " •" : ""}</div>`).join("")}</div>
    <div>
      <div class="row-flex" style="margin-bottom:8px"><b class="mono small">${esc(cur)}</b>${edited ? badge("REVISED", "Human-edited") : aiBadge()}<span class="sp"></span>
        <button class="btn sm" data-act="copy-code" data-art="${art.id}">Copy</button>
        <button class="btn sm" data-act="dl-file" data-art="${art.id}">Download File</button>
        <button class="btn sm" data-act="dl-zip" data-art="${art.id}">Download Project ZIP</button>
        ${edited ? `<button class="btn sm" data-act="code-diff" data-art="${art.id}">Code Diff</button>` : ""}
        ${canEdit && edited ? `<button class="btn sm" data-act="code-reset" data-art="${art.id}">Reset กลับ AI Version</button>` : ""}
        ${runnable && can("run.execute") ? `<button class="btn sm pri" data-act="run-art" data-art="${art.id}">Run</button>` : ""}
      </div>
      ${canEdit ? `<textarea class="code" id="codeEd" data-art="${art.id}" data-path="${esc(cur)}" spellcheck="false" aria-label="Code editor">${esc(art.files[cur])}</textarea><div class="row-flex" style="margin-top:6px"><button class="btn sm" data-act="code-save" data-art="${art.id}">บันทึกการแก้ไข Code Draft</button><span class="small muted">การแก้ไขเก็บเป็น Draft แยกจาก AI Version</span></div>` : `<pre class="codeview">${esc(art.files[cur])}</pre>`}
      ${runnable ? `<div class="infobox small" style="margin-top:10px">ปุ่ม Run ใช้ Browser Rule Engine ตรวจ Test Data ของทุก Test Case กับ Business Rule เดียวกับใน rule_service.py (Boundary = Pass/Fail จริง, Test ที่ต้องเชื่อมระบบจริง = Blocked) · ถ้าต้องการผล Pytest จริง ให้ Download ZIP แล้วรัน <code>pytest</code> บนเครื่อง จากนั้น Import <code>reports/junit.xml</code> ที่หน้า Test Runs</div>` : ""}
    </div>
    <div><h3>Code Tips ภาษาไทย</h3>${tips.length ? tips.map(tp => `<div class="tip"><b>${esc(tp.code)}</b><dl><dt>จุดประสงค์</dt><dd>${esc(tp.purpose)}</dd><dt>Input</dt><dd>${esc(tp.input)}</dd><dt>Output</dt><dd>${esc(tp.output)}</dd><dt>เหตุผลที่ใช้</dt><dd>${esc(tp.why)}</dd><dt>อธิบายทีละส่วน</dt><dd>${esc(tp.explain)}</dd><dt>Test Case ที่เชื่อมโยง</dt><dd class="mono">${esc(tp.tc)}</dd><dt>ข้อควรระวัง</dt><dd>${esc(tp.caution)}</dd><dt>สิ่งที่ QA ต้องแก้ก่อน Run</dt><dd>${esc(tp.fix)}</dd></dl></div>`).join("") : `<p class="small muted">ไฟล์นี้ไม่มี Tip เฉพาะ (ไฟล์ตั้งค่า/โครงสร้าง) — เลือกไฟล์ที่มีเครื่องหมาย Code หลัก เช่น tests/unit/*.py</p>`}</div>
  </div>`;
}
function generateArtifact(p, kind) {
  if (!guard("auto.generate")) return;
  const draft = !!ui.f["draft_" + kind];
  const tcs = (ui.sel["auto_" + kind] || []).map(id => S.testCases.find(t => t.id === id)).filter(Boolean);
  if (!tcs.length) { toast("เลือก Test Case ก่อน", true); return; }
  if (!draft && tcs.some(t => !ELIGIBLE.includes(t.status))) { toast("มี Test Case ที่ยังไม่ Approved — เปิดโหมด Generate Draft Code ถ้าต้องการ", true); return; }
  const o = ui.f["opt_" + kind] || {};
  let out;
  if (kind === "python") out = genPythonLayer(tcs, p);
  else if (kind === "pytest") out = genPytestLayer(tcs, p);
  else if (kind === "postman") out = genPostman(tcs, p, o.auth || "none");
  else if (kind === "sql") out = genSql(tcs, p, o.types || ["duplicate", "aggregation"]);
  else if (kind === "playwright") out = genPlaywright(tcs, p, { pageName: o.pageName || "CustomerSearch", loginPath: o.loginPath || "/login", browser: o.browser || "chromium", otp: o.otp, captcha: o.captcha, locators: o.locators || [] });
  else if (kind === "jmeter") {
    const issues = jmeterSafety(o.url || "", o); if (issues.length) { toast("ไม่ผ่าน Safety Check: " + issues[0], true); return; }
    out = genJmeter(tcs, p, { type: o.type || "Load", url: o.url, users: Number(o.users || 10), minutes: Number(o.minutes || 5), ramp: Number(o.ramp ?? 30) });
  }
  if (draft) Object.keys(out.files).forEach(k => { if (/\.py$/.test(k) && out.files[k]) out.files[k] = "# DRAFT — generated from test cases that are NOT approved. Do not run as final.\n" + out.files[k]; });
  const probs = scanFilesForSecrets(out.files);
  const a = { id: uid(), projectId: p.id, kind, name: `${p.code}-${kind}-${pad(nextSeq("ART-" + p.code + kind))}`, tcRefs: tcs.map(t => t.id), files: out.files, aiFiles: clone(out.files), tips: out.tips, draft, created: now(), createdBy: me().username, options: clone(o), secretWarnings: probs };
  S.artifacts.push(a);
  if (!draft) tcs.forEach(t => { if (t.status !== "AUTOMATED") setTcStatus(t, "AUTOMATED", `Generated ${kind} artifact ${a.name}`); });
  ui.sel["art_" + kind] = a.id; ui.sel["file_" + a.id] = null;
  audit("AUTOMATION_GENERATE", a.name, `${kind} for ${tcs.map(t => t.tcId).join(",")}${draft ? " [DRAFT]" : ""}`);
  save(); render(); toast(`สร้าง ${a.name} แล้ว (${Object.keys(a.files).length} ไฟล์)`);
}
function locatorAdvisorDialog() {
  modal(`<h2>Locator Advisor / AI Exploration</h2>
  <p class="small">ขั้นตอนที่ผู้ใช้ควบคุม: เปิดหน้าเว็บใน Browser ของคุณ (Login เองรวมถึง OTP/CAPTCHA) → คัดลอก HTML ของส่วนที่ต้องการ (DevTools → Copy outerHTML) → วางที่นี่ ระบบอ่านเฉพาะ DOM ที่คุณวาง แล้วเสนอ Locator ตามลำดับ data-testid → role → label → text → CSS → XPath คุณต้องเลือกอนุมัติก่อนนำไปสร้าง Script</p>
  <div class="field"><label>HTML / DOM ที่อนุญาตให้อ่าน</label><textarea id="advHtml" style="min-height:160px;font-family:var(--mono);font-size:12px"></textarea></div>
  <div class="row-flex"><button class="btn" id="advRun">วิเคราะห์ Locator</button>${capSample ? `<button class="btn ai" id="advAi">ให้ Claude แนะนำ Page/Component</button>` : ""}</div>
  <div id="advOut" style="margin-top:12px"></div>
  <div class="acts"><button class="btn" data-act="close-modal">ปิด</button><button class="btn pri" id="advOk">อนุมัติ Locator ที่เลือก</button></div>`, true);
  let found = [];
  const show = () => { $("#advOut").innerHTML = found.length ? `<div class="tblwrap"><table><thead><tr><th>ใช้</th><th>ชื่อ</th><th>Strategy</th><th>Value</th><th>หมายเหตุ</th></tr></thead><tbody>${found.map((l, i) => `<tr><td><input type="checkbox" data-adv="${i}" ${l.strategy !== "xpath" ? "checked" : ""}></td><td class="mono">${esc(l.name)}</td><td>${esc(l.strategy)}</td><td class="mono small">${esc(l.value)}</td><td class="small">${esc(l.note || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">ไม่พบ Element ที่โต้ตอบได้</p>`; };
  $("#advRun").onclick = () => { found = suggestLocators($("#advHtml").value); show(); };
  if ($("#advAi")) $("#advAi").onclick = async () => {
    const html = $("#advHtml").value.slice(0, 15000); if (!html.trim()) { toast("วาง HTML ก่อน", true); return; }
    $("#advOut").textContent = "Claude กำลังวิเคราะห์…";
    try {
      const res = await capSample.json(`Suggest Playwright locators for interactive elements in this HTML. Only use attributes/text that literally exist in the HTML. Priority: data-testid > role+name > label > text > css > xpath (last resort). Return ONLY JSON: {"page":"","components":[""],"locators":[{"name":"snake_case","strategy":"get_by_test_id|get_by_role|get_by_label|get_by_text|css|xpath","value":"for get_by_role use role|name","note":""}]}\n\nHTML:\n${html}`, { modelTier: "default" });
      const valid = (res.locators || []).filter(l => ["get_by_test_id", "get_by_role", "get_by_label", "get_by_text", "css", "xpath"].includes(l.strategy) && String(l.value).split("|").every(part => !part || html.includes(part) || l.strategy === "get_by_role"));
      found = valid.map(l => ({ ...l, note: "AI RECOMMENDATION · " + (l.note || "") })); show();
      audit("AI_EXPLORATION", "playwright", `${found.length} locators, page=${res.page || ""}`);
    } catch (e) { $("#advOut").textContent = "AI ไม่พร้อม: " + (e.message || e.code) + " — ใช้ปุ่มวิเคราะห์ Locator แทน"; }
  };
  $("#advOk").onclick = () => {
    const chosen = [...document.querySelectorAll("[data-adv]")].filter(c => c.checked).map(c => found[Number(c.dataset.adv)]);
    const o = ui.f.opt_playwright = ui.f.opt_playwright || {};
    const base = o.locators && o.locators.length ? o.locators : [{ name: "username_input", strategy: "get_by_label", value: "Username" }, { name: "password_input", strategy: "get_by_label", value: "Password" }, { name: "login_button", strategy: "get_by_role", value: "button|Login" }, { name: "result_table", strategy: "get_by_test_id", value: "NEEDS_CONFIGURATION" }];
    const merged = base.slice(); chosen.forEach(c => { const i = merged.findIndex(m => m.name === c.name); if (i >= 0) merged[i] = c; else merged.push(c); });
    o.locators = merged; closeModal(); render(); toast(`อนุมัติ ${chosen.length} Locator`);
  };
}
function suggestLocators(html) {
  const doc = new DOMParser().parseFromString(html, "text/html"); const out = []; const used = new Set();
  const nm = s => { let n = slug(s).slice(0, 30) || "element"; while (used.has(n)) n += "_2"; used.add(n); return n; };
  doc.querySelectorAll("input,button,a,select,textarea,[role],[data-testid],table").forEach(el => {
    const tid = el.getAttribute("data-testid"), aria = el.getAttribute("aria-label"), role = el.getAttribute("role") || ({ BUTTON: "button", A: "link", SELECT: "combobox", TEXTAREA: "textbox", TABLE: "table" }[el.tagName] || (el.tagName === "INPUT" ? (["checkbox", "radio"].includes(el.type) ? el.type : el.type === "submit" ? "button" : "textbox") : null));
    const id = el.id, lab = id ? doc.querySelector(`label[for="${CSS.escape(id)}"]`) : el.closest("label"); const labText = lab ? lab.textContent.trim() : "";
    const text = (el.textContent || el.value || "").trim().slice(0, 40);
    if (tid) out.push({ name: nm(tid), strategy: "get_by_test_id", value: tid, note: "1 data-testid (เสถียรที่สุด)" });
    else if (role && (aria || text) && ["button", "link", "checkbox", "radio", "tab", "table"].includes(role)) out.push({ name: nm((aria || text) + "_" + role), strategy: "get_by_role", value: `${role}|${aria || text}`, note: "2 role + accessible name" });
    else if (labText || aria) out.push({ name: nm((labText || aria) + "_input"), strategy: "get_by_label", value: labText || aria, note: "3 label" });
    else if (text && el.tagName !== "INPUT") out.push({ name: nm(text), strategy: "get_by_text", value: text, note: "4 text" });
    else if (id || el.getAttribute("name")) out.push({ name: nm(id || el.getAttribute("name")), strategy: "css", value: id ? `#${id}` : `${el.tagName.toLowerCase()}[name="${el.getAttribute("name")}"]`, note: "5 CSS — ควรขอให้ Dev เพิ่ม data-testid" });
    else { const idx = [...el.parentNode.children].filter(c => c.tagName === el.tagName).indexOf(el) + 1; out.push({ name: nm(el.tagName + "_" + idx), strategy: "xpath", value: `//${el.tagName.toLowerCase()}[${idx}]`, note: "6 XPath — ตัวเลือกสุดท้าย เปราะบาง" }); }
  });
  return out.slice(0, 60);
}
function recordFlowDialog() {
  modal(`<h2>แปลง Recorded User Flow เป็น Page Object</h2>
  <p class="small">บนเครื่องของคุณ รัน <code>playwright codegen --target python-pytest https://your-sit-url</code> แล้วทำ Flow เอง (Login/OTP/CAPTCHA ด้วยตนเอง) จากนั้นคัดลอก Script ที่ได้มาวางที่นี่ ระบบจะดึง Locator ออกมาเป็น Page Object — ระบบจะตัดค่าที่พิมพ์ลงในช่อง Password/OTP ออกเสมอ</p>
  <div class="field"><label>Recorded Script</label><textarea id="recIn" style="min-height:180px;font-family:var(--mono);font-size:12px"></textarea></div>
  <div class="acts"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" id="recOk">แปลงเป็น Locator</button></div>`, true);
  $("#recOk").onclick = () => {
    const src = $("#recIn").value; const locs = []; const used = new Set();
    const re = /page\.(get_by_test_id|get_by_role|get_by_label|get_by_text|get_by_placeholder|locator)\(([^)]*)\)/g; let m;
    while ((m = re.exec(src))) {
      const args = [...m[2].matchAll(/"([^"]*)"|'([^']*)'/g)].map(x => x[1] ?? x[2]);
      if (!args.length) continue;
      let strategy = m[1] === "locator" ? (args[0].startsWith("xpath=") || args[0].startsWith("//") ? "xpath" : "css") : m[1] === "get_by_placeholder" ? "get_by_label" : m[1];
      let value = strategy === "get_by_role" ? `${args[0]}|${args[1] || ""}` : args[0].replace(/^xpath=/, "");
      let name = slug((args[1] || args[0]) + (strategy === "get_by_role" ? "_" + args[0] : "")).slice(0, 30) || "element";
      if (used.has(strategy + value)) continue; used.add(strategy + value);
      locs.push({ name, strategy, value });
    }
    if (!locs.length) { toast("ไม่พบคำสั่ง page.get_by_* ใน Script", true); return; }
    const o = ui.f.opt_playwright = ui.f.opt_playwright || {}; o.locators = locs;
    closeModal(); render(); toast(`ดึง ${locs.length} Locator จาก Recorded Flow`);
  };
}

/* ============ P19/P20 Test Runs ============ */
function summarize(results) { const c = s => results.filter(r => r.status === s).length; return { total: results.length, passed: c("PASSED"), failed: c("FAILED"), blocked: c("BLOCKED") }; }
async function runArtifact(p, art) {
  if (!guard("run.execute")) return;
  if (art.draft && !(await confirmDialog("Run Draft Code?", "Artifact นี้สร้างจาก Test Case ที่ยังไม่ Approved ผลลัพธ์ใช้อ้างอิงไม่ได้", "Run ต่อ"))) return;
  const run = { id: uid(), projectId: p.id, artifactId: art.id, name: `RUN-${p.code}-${pad(nextSeq("RUN-" + p.code), 4)}`, runner: "Browser Rule Engine", status: "RUNNING", progress: 0, results: [], stdout: "", stderr: "", exitCode: null, started: now(), finished: null, duration: 0, triggeredBy: me().username, summary: { total: 0, passed: 0, failed: 0, blocked: 0 } };
  S.runs.push(run); jobCtl[run.id] = { cancel: false }; audit("TEST_RUN", run.name, art.name); save();
  go(`#/p/${p.id}/run/${run.id}`); render();
  const t0 = Date.now();
  const res = await runRuleEngine(art, (pct, log) => { run.progress = pct; run.stdout = log.join("\n"); const { seg } = parseRoute(); if (seg[3] === run.id) { const el = $("#runLog"); if (el) { el.textContent = run.stdout; el.scrollTop = el.scrollHeight; } const pr = $("#runProg"); if (pr) pr.style.width = pct + "%"; } }, () => jobCtl[run.id].cancel);
  Object.assign(run, res, { finished: now(), duration: (Date.now() - t0) / 1000, progress: 100, summary: summarize(res.results) });
  save(); render();
}
function pageRuns(p) {
  const runs = S.runs.filter(r => r.projectId === p.id).sort((a, b) => b.started.localeCompare(a.started));
  const f = ui.f; const list = runs.filter(r => !f.runStatus || r.status === f.runStatus);
  return layout(pageHead("Test Runs", "ผลการ Run จาก Browser Runner และผลที่ Import จาก Pytest (JUnit XML) หรือ Newman", can("run.execute") ? `<button class="btn" data-act="import-result" data-v="junit">Import JUnit XML (pytest)</button><button class="btn" data-act="import-result" data-v="newman">Import Newman JSON</button>` : "") + rail(p) +
    `<div class="toolbar"><select data-change="f" data-k="runStatus"><option value="">ทุก Status</option>${["RUNNING", "PASSED", "FAILED", "CANCELLED"].map(s => `<option ${f.runStatus === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>` +
    (list.length ? `<div class="tblwrap"><table><thead><tr><th>Run</th><th>Runner</th><th>Artifact</th><th>Status</th><th>Pass</th><th>Fail</th><th>Blocked</th><th>Duration</th><th>เริ่ม</th><th>โดย</th></tr></thead><tbody>${list.map(r => { const a = S.artifacts.find(x => x.id === r.artifactId); return `<tr class="click" data-act="nav" data-href="#/p/${p.id}/run/${r.id}"><td class="mono">${esc(r.name)}</td><td class="small">${esc(r.runner)}</td><td class="small">${esc(a ? a.name : r.source || "-")}</td><td>${badge(r.status)}</td><td>${r.summary.passed}</td><td>${r.summary.failed}</td><td>${r.summary.blocked}</td><td>${r.duration ? r.duration.toFixed(2) + "s" : "-"}</td><td class="small">${fmtDate(r.started)}</td><td>${esc(r.triggeredBy)}</td></tr>`; }).join("")}</tbody></table></div>`
      : emptyBox("ยังไม่มี Test Run", "Generate Pytest แล้วกด Run หรือ Import ผลจากการรัน pytest บนเครื่อง", `<a class="btn pri" href="#/p/${p.id}/auto/pytest">ไปที่ Pytest Generator</a>`)),
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Test Runs"]]);
}
function pageRun(p, id) {
  const r = S.runs.find(x => x.id === id); if (!r) return layout(emptyBox("ไม่พบ Test Run", ""), [["Test Runs"]]);
  const tab = ui.tab.run || "results"; const a = S.artifacts.find(x => x.id === r.artifactId);
  return layout(pageHead(r.name, `${esc(r.runner)} · ${a ? esc(a.name) : esc(r.source || "")} · เริ่ม ${fmtDate(r.started)} · โดย ${esc(r.triggeredBy)}`,
    `${r.status === "RUNNING" && can("run.execute") ? `<button class="btn danger" data-act="run-cancel" data-id="${r.id}">Cancel</button>` : ""}${a && r.status !== "RUNNING" && can("run.execute") ? `<button class="btn" data-act="run-art" data-art="${a.id}">Re-run</button>` : ""}<button class="btn" data-act="run-log-dl" data-id="${r.id}">Download Log</button>`) + `
  <div class="grid g4" style="margin-bottom:14px"><div class="card kpi"><div class="v">${badge(r.status)}</div><div class="k">Exit code ${r.exitCode ?? "-"}</div></div><div class="card kpi"><div class="v" style="color:var(--green)">${r.summary.passed}</div><div class="k">Passed</div></div><div class="card kpi"><div class="v" style="color:var(--red)">${r.summary.failed}</div><div class="k">Failed</div></div><div class="card kpi"><div class="v" style="color:var(--orange)">${r.summary.blocked}</div><div class="k">Blocked</div></div></div>
  ${r.status === "RUNNING" ? `<div class="progress" style="margin-bottom:12px"><i id="runProg" style="width:${r.progress}%"></i></div>` : ""}
  <div class="tabs">${[["results", "Results"], ["logs", "Logs"], ["evidence", "Evidence"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="tab" data-k="run" data-v="${k}">${l}</button>`).join("")}</div>
  ${tab === "results" ? (r.results.length ? `<div class="tblwrap"><table><thead><tr><th>Test Case</th><th>Test</th><th>Status</th><th>Message</th><th>Duration</th></tr></thead><tbody>${r.results.map(x => `<tr><td class="mono">${x.tcRef ? `<a href="#/p/${p.id}/testcase/${x.tcRef}">${esc(x.tcId)}</a>` : esc(x.tcId)}</td><td class="mono small">${esc(x.name)}</td><td>${badge(x.status)}</td><td class="small">${esc(x.message)}</td><td>${x.duration.toFixed(3)}s</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">ยังไม่มีผล</p>`)
      : tab === "logs" ? `<h3>stdout</h3><pre class="codeview" id="runLog">${esc(r.stdout)}</pre><h3 style="margin-top:10px">stderr</h3><pre class="codeview">${esc(r.stderr || "(ว่าง)")}</pre>`
        : `<div class="card">${(r.evidence || []).length ? r.evidence.map(e => `<div class="small">${esc(e)}</div>`).join("") : `<p class="muted">Browser Runner ไม่สร้าง Screenshot — Screenshot on Failure ของ Playwright จะอยู่ในโฟลเดอร์ screenshots/ เมื่อรันบนเครื่องหรือ GitHub Actions (Artifact Upload)</p>`}</div>`}`,
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Test Runs", `#/p/${p.id}/runs`], [r.name]]);
}
function importResultDialog(p, kind) {
  modal(`<h2>Import ${kind === "junit" ? "JUnit XML (pytest --junitxml)" : "Newman JSON (newman run -r json)"}</h2>
  <p class="small">ระบบจับคู่ผลกับ Test Case จากชื่อ Test (${kind === "junit" ? "test_tc_cam_rule3_001_…" : "ชื่อ Request ที่ขึ้นต้นด้วย TC-…"})</p>
  <input type="file" id="impFile" accept="${kind === "junit" ? ".xml" : ".json"}">
  <div class="acts"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" id="impOk">Import</button></div>`);
  $("#impOk").onclick = async () => {
    const f = $("#impFile").files[0]; if (!f) { toast("เลือกไฟล์ก่อน", true); return; }
    if (f.size > 20 * 1048576) { toast("ไฟล์ใหญ่เกิน 20 MB", true); return; }
    try {
      const txt = await f.text();
      const results = kind === "junit" ? parseJUnit(txt) : parseNewman(JSON.parse(txt));
      const sm = summarize(results);
      const run = { id: uid(), projectId: p.id, artifactId: null, source: safeFilename(f.name), name: `RUN-${p.code}-${pad(nextSeq("RUN-" + p.code), 4)}`, runner: kind === "junit" ? "Pytest (imported)" : "Newman (imported)", status: sm.failed ? "FAILED" : "PASSED", progress: 100, results, stdout: mask(txt.slice(0, S.settings.runnerMaxLogKb * 1024)), stderr: "", exitCode: sm.failed ? 1 : 0, started: now(), finished: now(), duration: results.reduce((a, b) => a + b.duration, 0), triggeredBy: me().username, summary: sm };
      S.runs.push(run); audit("TEST_RUN_IMPORT", run.name, f.name); save(); closeModal(); go(`#/p/${p.id}/run/${run.id}`);
    } catch (e) { toast("Import ไม่สำเร็จ: " + (e.userMessage || e.message), true); }
  };
}

/* ============ P21 GitHub Integration (§24, §25) ============ */
function pageGithub(p) {
  if (!can("github.propose")) return layout(emptyBox("ไม่มีสิทธิ์", "เฉพาะ QA Automation และ Admin"), [["GitHub"]]);
  const tab = ui.tab.gh || "proposals";
  const props = S.githubProposals.filter(x => x.projectId === p.id).sort((a, b) => b.created.localeCompare(a.created));
  const arts = S.artifacts.filter(a => a.projectId === p.id && !a.draft);
  const configured = S.settings.githubOwner && S.settings.githubRepo;
  return layout(pageHead("GitHub Integration", "ทุก Action ต้องมี Preview และได้รับอนุมัติ · ไม่มี Merge อัตโนมัติ · ไม่มี Force Push") +
    `<div class="tabs">${[["proposals", `Proposals (${props.length})`], ["connection", "Connection"], ["workflow", "GitHub Actions"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="tab" data-k="gh" data-v="${k}">${l}</button>`).join("")}</div>` +
    (tab === "connection" ? `<div class="card"><dl class="kv"><dt>Repository</dt><dd>${configured ? esc(S.settings.githubOwner + "/" + S.settings.githubRepo) : badge("NEEDS_CONFIGURATION")}</dd><dt>Token</dt><dd>${badge("NEEDS_CONFIGURATION", "จัดการที่ Backend เท่านั้น")} — หน้าเว็บนี้ไม่รับและไม่เก็บ Personal Access Token</dd><dt>Execute</dt><dd>Proposal ที่อนุมัติแล้วส่งออกเป็น ZIP พร้อมคำสั่ง git ให้คุณ Push เอง (Branch ใหม่ + Pull Request) จนกว่าจะเชื่อม Backend GitHub App</dd></dl>${can("settings") ? `<p style="margin-top:10px"><a class="btn" href="#/settings">ตั้งค่า Owner/Repository</a></p>` : ""}</div>`
      : tab === "workflow" ? `<div class="card"><p class="small">Workflow ใช้ <code>workflow_dispatch</code> เท่านั้น (ไม่มี Scheduled Run) · Secret อ่านจาก GitHub Secrets · Upload HTML Report และ Screenshot เป็น Artifact · ไฟล์นี้จะถูกรวมใน Proposal อัตโนมัติ</p><pre class="codeview">${esc(genGithubWorkflow(p))}</pre></div>`
        : `<div class="card" style="margin-bottom:14px"><h3>สร้าง Proposal ใหม่</h3>${arts.length ? `<div class="grid g2"><div>${arts.map(a => `<label class="row-flex small"><input type="checkbox" class="ghArt" value="${a.id}"> ${esc(a.name)} (${a.kind}, ${Object.keys(a.files).length} ไฟล์)</label>`).join("")}</div><div><div class="field"><label>Branch</label><input type="text" id="ghBranch" value="qa/automation-${new Date().toISOString().slice(0, 10)}"></div><div class="field"><label>Commit Message</label><input type="text" id="ghMsg" value="test(${esc(p.code.toLowerCase())}): add generated QA automation"></div><div class="field"><label>Action Type</label><select id="ghType"><option>Create Branch + Commit + Pull Request</option><option>Create Repository</option></select></div><button class="btn pri" data-act="gh-propose">สร้าง Proposal (Preview)</button></div></div>` : `<p class="muted">ยังไม่มี Artifact ที่ไม่ใช่ Draft</p>`}</div>` +
          (props.length ? props.map(g => `<div class="card" style="margin-bottom:12px"><div class="row-flex"><b>${esc(g.actionType)}</b> ${badge(g.status)} <span class="small muted">${fmtDate(g.created)} · ${esc(g.createdBy)}</span></div>
          <dl class="kv" style="margin-top:8px"><dt>Repository</dt><dd>${esc(g.repo)}</dd><dt>Branch</dt><dd class="mono">${esc(g.branch)}</dd><dt>Commit Message</dt><dd>${esc(g.message)}</dd><dt>Files Changed</dt><dd>${Object.keys(g.files).length} ไฟล์ (${g.diffSummary.added} ใหม่, ${g.diffSummary.modified} แก้ไข)</dd></dl>
          ${g.problems.length ? `<div class="dangerbox">ถูก Block: ${g.problems.map(esc).join("<br>")}</div>` : ""}
          <details><summary class="small">ดู Diff</summary>${Object.keys(g.files).slice(0, 40).map(f => `<div class="small mono" style="margin-top:6px">${esc(f)}</div>${renderDiff(g.base[f] || "", g.files[f], 1)}`).join("")}</details>
          <div class="row-flex" style="margin-top:10px">${g.status === "PROPOSED" && can("github.approve") && !g.problems.length ? `<button class="btn ok" data-act="gh-approve" data-id="${g.id}">Approve</button><button class="btn" data-act="gh-reject" data-id="${g.id}">Reject</button>` : ""}${g.status === "APPROVED" ? `<button class="btn pri" data-act="gh-execute" data-id="${g.id}">Execute</button>` : ""}</div></div>`).join("") : emptyBox("ยังไม่มี Proposal", "เลือก Artifact แล้วสร้าง Proposal เพื่อดู Preview ก่อน Push"))),
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["GitHub"]]);
}

/* ============ P23 Settings, P24 Audit Log ============ */
function pageSettings() {
  if (!can("settings")) return layout(emptyBox("ไม่มีสิทธิ์", "เฉพาะ Admin"), [["Settings"]]);
  const tab = ui.tab.settings || "users"; const st = S.settings;
  const tabs = [["users", "Users & Roles"], ["ai", "AI"], ["runner", "Test Runner"], ["env", "Environments"], ["github", "GitHub"], ["security", "Security & Network"], ["data", "Data & Backup"]];
  let body = "";
  if (tab === "users") body = `<div class="toolbar"><button class="btn pri" data-act="user-new">เพิ่มผู้ใช้</button></div><div class="tblwrap"><table><thead><tr><th>Username</th><th>ชื่อ</th><th>Role</th><th>สถานะ</th><th></th></tr></thead><tbody>${S.users.map(u => `<tr><td class="mono">${esc(u.username)}</td><td>${esc(u.name)}</td><td><select data-change="user-role" data-id="${u.id}" ${u.id === me().id ? "disabled" : ""}>${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${l}</option>`).join("")}</select></td><td>${u.active ? badge("APPROVED", "Active") : badge("DEPRECATED", "Inactive")}${u.mustChange ? " " + badge("NEEDS_CONFIGURATION", "ต้องเปลี่ยนรหัส") : ""}</td><td class="row-flex">${u.id !== me().id ? `<button class="btn sm" data-act="user-reset" data-id="${u.id}">Reset Password</button><button class="btn sm" data-act="user-toggle" data-id="${u.id}">${u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>` : ""}</td></tr>`).join("")}</tbody></table></div><p class="small muted" style="margin-top:8px">รหัสผ่าน Hash ด้วย bcrypt (cost 10) · Architecture แยก Auth Provider เพื่อเปลี่ยนเป็น Microsoft Entra ID/SSO ได้ในอนาคต</p>`;
  if (tab === "ai") body = `<div class="card"><div class="field"><label>วิธีวิเคราะห์ Requirement เริ่มต้น</label><select data-change="setting" data-k="aiMode"><option value="claude" ${st.aiMode === "claude" ? "selected" : ""}>Claude AI</option><option value="rule" ${st.aiMode === "rule" ? "selected" : ""}>Rule Engine</option></select></div>
    <p>สถานะ Claude ในมุมมองนี้: ${capSample ? badge("APPROVED", "พร้อมใช้งาน") : badge("NEEDS_CONFIGURATION", "ไม่พร้อมใช้งาน")}</p>
    <label class="row-flex"><input type="checkbox" data-change="setting-bool" data-k="vision" ${st.vision ? "checked" : ""}> เปิดใช้ Vision วิเคราะห์รูปหน้าจอ</label>
    <p class="small muted" style="margin-top:8px">การเรียก Claude ใช้บัญชี Claude ของผู้ดูหน้าเว็บ (ขออนุญาตก่อนครั้งแรก) ไม่มี API Key อยู่ในหน้าเว็บ · บันทึก Model, Prompt Version (${PROMPT_VERSION}) และ Input Hash ในทุก Requirement · Token Usage ไม่ได้เปิดเผยจาก Runtime · ห้ามส่ง Secret ไปยัง AI: ข้อความถูกส่งเฉพาะเนื้อหา Section</p></div>`;
  if (tab === "runner") body = `<div class="card grid g2"><div class="field"><label>Timeout ต่อ Run (วินาที)</label><input type="number" min="5" max="600" data-change="setting-num" data-k="runnerTimeoutSec" value="${st.runnerTimeoutSec}"></div><div class="field"><label>ขนาด Log สูงสุด (KB)</label><input type="number" min="16" max="4096" data-change="setting-num" data-k="runnerMaxLogKb" value="${st.runnerMaxLogKb}"></div><div class="field"><label>ขนาดไฟล์อัปโหลดสูงสุด (MB)</label><input type="number" min="1" max="200" data-change="setting-num" data-k="maxFileMb" value="${st.maxFileMb}"></div><p class="small muted">CPU/RAM Limit ใช้ได้กับ automation-runner ฝั่ง Server (Docker) — Browser Runner จำกัดด้วยเวลาและขนาด Log</p></div>`;
  if (tab === "env") body = `<div class="card"><div class="field"><label>Environment Allowlist (1 URL ต่อบรรทัด) — ใช้กับ JMeter และ Playwright</label><textarea data-change="setting-list" data-k="envAllowlist">${esc(st.envAllowlist.join("\n"))}</textarea></div><div class="grid g2"><div class="field"><label>JMeter Concurrent Users สูงสุด</label><input type="number" min="1" max="1000" data-change="setting-num" data-k="jmeterMaxUsers" value="${st.jmeterMaxUsers}"></div><div class="field"><label>JMeter Duration สูงสุด (นาที)</label><input type="number" min="1" max="120" data-change="setting-num" data-k="jmeterMaxMinutes" value="${st.jmeterMaxMinutes}"></div></div><p class="small muted">URL ที่ดูเหมือน Production จะถูก Block เสมอ</p></div>`;
  if (tab === "github") body = `<div class="card grid g2"><div class="field"><label>Owner / Organization</label><input type="text" data-change="setting" data-k="githubOwner" value="${esc(st.githubOwner)}"></div><div class="field"><label>Repository</label><input type="text" data-change="setting" data-k="githubRepo" value="${esc(st.githubRepo)}"></div><p class="small muted">Token/GitHub App ต้องตั้งที่ Backend เท่านั้น ห้ามกรอกในหน้าเว็บ</p></div>`;
  if (tab === "security") body = `<div class="card"><div class="field" style="max-width:260px"><label>Session Timeout (นาที)</label><input type="number" min="5" max="480" data-change="setting-num" data-k="sessionMinutes" value="${st.sessionMinutes}"></div>
    <h3>Network Sharing</h3><div class="warnbox">หน้าเว็บนี้เป็น Published Page ข้อมูลเก็บใน Browser ของแต่ละคน (IndexedDB) คนอื่นที่เปิดลิงก์จะเห็นข้อมูลของตนเองเท่านั้น การเปิด Host 0.0.0.0 ให้คนใน LAN เข้าดูข้อมูลชุดเดียวกันต้องใช้ Backend (Docker Compose) ตาม Master Prompt</div>
    <h3>สิ่งที่ Mask ในทุก Log และ Audit</h3><p class="small">Customer ID, Password, Token, API Key, Connection String, OTP, Session Cookie</p></div>`;
  if (tab === "data") body = `<div class="card"><p>ข้อมูลทั้งหมด (${S.requirements.length} Requirement, ${S.testCases.length} Test Case, ${S.audit.length} Audit) เก็บใน IndexedDB ของ Browser นี้ ข้อมูลไม่หายเมื่อปิดหรือ Restart เครื่อง</p><div class="row-flex"><button class="btn" data-act="backup">Export Backup (JSON)</button><button class="btn" data-act="restore">Restore จาก Backup</button><button class="btn danger" data-act="reset-all">ลบข้อมูลทั้งหมด</button></div></div>`;
  return layout(pageHead("Settings", "ตั้งค่าระบบ (Admin)") + `<div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="tab" data-k="settings" data-v="${k}">${l}</button>`).join("")}</div>` + body, [["Settings"]]);
}
function pageAudit() {
  if (!can("audit.view")) return layout(emptyBox("ไม่มีสิทธิ์", "เฉพาะ Admin"), [["Audit Log"]]);
  const f = ui.f; const s = (f.aq || "").toLowerCase();
  const list = S.audit.filter(a => (!s || (a.user + a.action + a.entity + a.detail).toLowerCase().includes(s)) && (!f.aAction || a.action === f.aAction));
  const actions = [...new Set(S.audit.map(a => a.action))].sort();
  return layout(pageHead("Audit Log", `${S.audit.length} รายการ · ไม่บันทึก Password, Token, OTP, Session Cookie`, `<button class="btn" data-act="audit-csv">Export CSV</button>`) +
    `<div class="toolbar"><input type="text" placeholder="ค้นหา" value="${esc(f.aq || "")}" data-input="f" data-k="aq"><select data-change="f" data-k="aAction"><option value="">ทุก Action</option>${actions.map(a => `<option ${f.aAction === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></div>
    <div class="tblwrap"><table><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>Action</th><th>Entity</th><th>รายละเอียด</th><th>Correlation ID</th></tr></thead><tbody>${list.slice(0, 500).map(a => `<tr><td class="small">${fmtDate(a.at)}</td><td>${esc(a.user)}</td><td>${badge(/FAIL|DENIED/.test(a.action) ? "FAILED" : "", a.action)}</td><td class="small">${esc(a.entity)}</td><td class="small">${esc(a.detail)}</td><td class="mono small">${esc(a.correlationId)}</td></tr>`).join("")}</tbody></table></div>`, [["Audit Log"]]);
}
