/* ============ Router & Layout (§27, §36) ============ */
const ui = { f: {}, tab: {}, sel: {}, editTc: false, sideOpen: false };
function parseRoute() {
  const h = location.hash.replace(/^#/, "") || "/projects";
  const [path, qs] = h.split("?"); const q = Object.fromEntries(new URLSearchParams(qs || ""));
  const seg = path.split("/").filter(Boolean);
  return { seg, q, path };
}
const go = h => { location.hash = h; };
const P = () => { const { seg } = parseRoute(); return seg[0] === "p" ? S.projects.find(x => x.id === seg[1]) : null; };
const NAV = [
  ["ภาพรวม", [["dashboard", "Dashboard", null], ["", "Project Detail", "project.view"]]],
  ["เอกสาร", [["upload", "Upload เอกสาร", "doc.upload"], ["processing", "Processing", null], ["compare", "Version Compare", null]]],
  ["Requirement", [["requirements", "Requirement Explorer", null], ["clarifications", "Clarification & Conflict", null]]],
  ["Test Design", [["scenarios", "Test Scenarios", null], ["testcases", "Test Cases", null]]],
  ["Automation", [["auto/python", "Python", "auto.view"], ["auto/pytest", "Pytest", "auto.view"], ["auto/postman", "Postman", "auto.view"], ["auto/sql", "SQL (MySQL)", "auto.view"], ["auto/playwright", "Playwright", "auto.view"], ["auto/jmeter", "JMeter", "auto.view"]]],
  ["Execution", [["runs", "Test Runs", "run.view"]]],
  ["Integration", [["github", "GitHub", "github.propose"]]]
];
function projectCounts(pid) {
  const reqs = S.requirements.filter(r => r.projectId === pid && r.isLatest !== false && r.status !== "DEPRECATED");
  const tcs = S.testCases.filter(t => t.projectId === pid && t.status !== "DEPRECATED");
  return {
    reqs, tcs, nc: reqs.filter(r => r.status === "NEEDS_CLARIFICATION").length, conflicts: S.conflicts.filter(c => c.projectId === pid && c.status === "OPEN").length,
    waiting: reqs.filter(r => r.status === "WAITING_FOR_REVIEW" || r.status === "REVISED").length, approvedReq: reqs.filter(r => r.status === "APPROVED").length,
    scenarios: S.scenarios.filter(s => s.projectId === pid && s.status !== "DEPRECATED").length,
    tcReview: tcs.filter(t => ["AI_GENERATED", "WAITING_FOR_REVIEW", "REVISED", "DRAFT"].includes(t.status)).length,
    tcApproved: tcs.filter(t => ["APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED"].includes(t.status)).length,
    ready: tcs.filter(t => t.status === "READY_FOR_AUTOMATION").length, automated: tcs.filter(t => t.status === "AUTOMATED").length,
    runs: S.runs.filter(r => r.projectId === pid)
  };
}
function layout(inner, crumbs) {
  const u = me(), p = P(), { path } = parseRoute();
  const nav = p ? NAV.map(([g, items]) => {
    const visible = items.filter(([, , perm]) => !perm || perm === "project.view" || can(perm));
    if (!visible.length) return "";
    const c = projectCounts(p.id);
    return `<div class="grp">${esc(g)}</div>` + visible.map(([k, label]) => {
      const href = `#/p/${p.id}${k ? "/" + k : ""}`; const on = path === `/p/${p.id}${k ? "/" + k : ""}` || (k && path.startsWith(`/p/${p.id}/${k}`)) || (k === "testcases" && path.startsWith(`/p/${p.id}/testcase/`)) || (k === "runs" && path.startsWith(`/p/${p.id}/run/`));
      const cnt = k === "clarifications" && (c.nc + c.conflicts) ? `<span class="cnt ${c.conflicts ? "bad" : "warn"}">${c.nc + c.conflicts}</span>` : k === "testcases" && c.tcReview ? `<span class="cnt warn">${c.tcReview}</span>` : "";
      return `<a href="${href}" class="${on ? "on" : ""}">${esc(label)}${cnt}</a>`;
    }).join("");
  }).join("") : "";
  const admin = (can("settings") ? `<a href="#/settings" class="${path === "/settings" ? "on" : ""}">Settings</a>` : "") + (can("audit.view") ? `<a href="#/audit" class="${path === "/audit" ? "on" : ""}">Audit Log</a>` : "");
  return `<div class="app">
  <aside class="side ${ui.sideOpen ? "open" : ""}" id="side">
    <div class="brand"><b>BRS → QA Automation</b><span>Local-first MVP</span></div>
    <nav class="nav" aria-label="เมนูหลัก">
      <a href="#/projects" class="${path === "/projects" ? "on" : ""}">Projects</a>
      ${nav}
      ${admin ? `<div class="grp">ระบบ</div>${admin}` : ""}
    </nav>
  </aside>
  <div class="main">
    <header class="top">
      <button class="btn sm menu-btn" data-act="toggle-side" aria-label="เปิดเมนู">☰</button>
      <div class="crumb">${crumbs.map((c, i) => i < crumbs.length - 1 && c[1] ? `<a href="${c[1]}">${esc(c[0])}</a>` : esc(c[0])).join(" / ")}</div>
      <label class="small muted" for="projSel">Project</label>
      <select id="projSel" data-change="switch-project"><option value="">— เลือก Project —</option>${S.projects.map(x => `<option value="${x.id}" ${p && p.id === x.id ? "selected" : ""}>${esc(x.code)} · ${esc(x.name)}</option>`).join("")}</select>
      <div class="userchip">${esc(u.name || u.username)} ${badge("", ROLES[u.role])}<button class="btn sm" data-act="change-pw">เปลี่ยนรหัสผ่าน</button><button class="btn sm" data-act="logout">ออกจากระบบ</button></div>
    </header>
    <main class="content" id="content">${inner}</main>
  </div></div>`;
}
function rail(p) {
  const c = projectCounts(p.id); const lr = c.runs.sort((a, b) => b.started.localeCompare(a.started))[0];
  const items = [
    ["requirements", c.reqs.length, "Requirement (AI Draft)", "var(--purple)"],
    ["clarifications", c.nc + c.conflicts, "รอ Clarify / Conflict", c.conflicts ? "var(--red)" : "var(--orange)"],
    ["testcases", c.tcReview, "Test Case รอ QA Review", "var(--orange)"],
    ["testcases", c.tcApproved, "Approved", "var(--green)"],
    ["auto/pytest", c.automated, "Automated", "var(--blue)"],
    [lr ? "run/" + lr.id : "runs", lr ? `${lr.summary.passed}/${lr.summary.total}` : "–", "Run ล่าสุด (Pass)", lr ? (lr.summary.failed ? "var(--red)" : "var(--green)") : "var(--gray)"]
  ];
  return `<nav class="rail" aria-label="Workflow">${items.map(([k, n, l, col]) => `<a href="#/p/${p.id}/${k}" style="--c:${col}"><span class="n">${n}</span><span class="l">${esc(l)}</span></a>`).join("")}</nav>`;
}
const pageHead = (title, sub, acts = "") => `<div class="pagehead"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div><div class="acts">${acts}</div></div>`;
const emptyBox = (title, body, act = "") => `<div class="card empty"><h3>${esc(title)}</h3><p>${body}</p>${act}</div>`;

/* ============ P01 Login ============ */
function pageLogin() {
  return `<div class="login">
  <div class="l"><h1>BRS to QA Automation Platform</h1><p>อ่าน BRS แยก Requirement ตรวจความชัดเจน แล้วสร้าง Test Case และ Automation ที่ย้อนกลับไปหาต้นฉบับได้ทุกบรรทัด</p>
    <div class="flow"><div>AI Draft — แยก Requirement พร้อม Source Page</div><div>QA Review — Clarify, Resolve Conflict</div><div>Approved — Lock Version</div><div>Generate Automation — Python, Pytest, Playwright</div><div>Run Test — Review Result</div></div></div>
  <div class="r"><form id="loginForm" autocomplete="off">
    <h2>เข้าสู่ระบบ</h2>
    <div class="field"><label for="lu">Username</label><input type="text" id="lu" required autocomplete="username"></div>
    <div class="field"><label for="lp">Password</label><input type="password" id="lp" required autocomplete="current-password"></div>
    <div id="lerr" class="small" style="color:var(--red);min-height:20px"></div>
    <button class="btn pri" style="width:100%;justify-content:center" type="submit">เข้าสู่ระบบ</button>
    <p class="small muted" style="margin-top:14px">บัญชีเริ่มต้น: <code>admin</code> / <code>Admin@12345</code> — ระบบจะบังคับเปลี่ยนรหัสผ่านทันทีหลังเข้าสู่ระบบครั้งแรก ข้อมูลทั้งหมดเก็บใน Browser ของเครื่องนี้ (IndexedDB)</p>
  </form></div></div>`;
}
async function doLogin(e) {
  e.preventDefault();
  const un = $("#lu").value.trim(), pw = $("#lp").value;
  const t = Date.now(); while (loginAttempts.length && t - loginAttempts[0] > 60000) loginAttempts.shift();
  if (loginAttempts.length >= 5) { $("#lerr").textContent = "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 1 นาที (Rate limit)"; return; }
  loginAttempts.push(t);
  $("#lerr").textContent = "กำลังตรวจสอบ…";
  try {
    const u = S.users.find(x => x.username === un && x.active);
    const ok = u ? await verifyPassword(pw, u.hash) : (await hashPassword("x"), false);
    if (!ok) { $("#lerr").textContent = "Username หรือ Password ไม่ถูกต้อง"; S.audit.unshift({ id: uid(), at: now(), user: un.slice(0, 40), action: "LOGIN_FAILED", entity: "auth", detail: "", correlationId: uid().slice(0, 8) }); save(); return; }
    session = { userId: u.id, lastActive: Date.now() }; touchSession();
    audit("LOGIN", u.username);
    if (u.mustChange) { render(); changePasswordDialog(true); return; }
    go(S.projects.length ? `#/p/${S.projects[0].id}/dashboard` : "#/projects");
    render();
  } catch (err) { $("#lerr").textContent = "เข้าสู่ระบบไม่สำเร็จ: " + (err.userMessage || err.message); }
}
function changePasswordDialog(forced) {
  modal(`<h2>${forced ? "ตั้งรหัสผ่านใหม่ก่อนใช้งาน" : "เปลี่ยนรหัสผ่าน"}</h2>
  ${forced ? `<div class="warnbox">บัญชีนี้ใช้รหัสผ่านเริ่มต้น ต้องเปลี่ยนก่อนใช้งานต่อ</div>` : ""}
  <div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 10 ตัว มีตัวพิมพ์ใหญ่ ตัวเลข และสัญลักษณ์)</label><input type="password" id="np1"></div>
  <div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input type="password" id="np2"></div>
  <div class="acts">${forced ? "" : `<button class="btn" data-act="close-modal">ยกเลิก</button>`}<button class="btn pri" id="npOk">บันทึกรหัสผ่าน</button></div>`);
  $("#npOk").onclick = async () => {
    const a = $("#np1").value, b = $("#np2").value;
    if (a.length < 10 || !/[A-Z]/.test(a) || !/\d/.test(a) || !/[^A-Za-z0-9]/.test(a)) { toast("รหัสผ่านไม่ตรงตามเงื่อนไข", true); return; }
    if (a !== b) { toast("รหัสผ่านทั้งสองช่องไม่ตรงกัน", true); return; }
    const u = me(); u.hash = await hashPassword(a); u.mustChange = false; save(); audit("PASSWORD_CHANGED", u.username); closeModal(); toast("เปลี่ยนรหัสผ่านแล้ว");
    if (forced) { go(S.projects.length ? `#/p/${S.projects[0].id}/dashboard` : "#/projects"); render(); }
  };
}

/* ============ P02 Projects ============ */
function pageProjects() {
  const rows = S.projects.map(p => { const c = projectCounts(p.id); const lastDoc = S.documents.filter(d => d.projectId === p.id).map(d => d.versions.length).reduce((a, b) => Math.max(a, b), 0); return `<tr class="click" data-act="nav" data-href="#/p/${p.id}/dashboard"><td><b>${esc(p.code)}</b></td><td>${esc(p.name)}</td><td>${lastDoc ? "v" + lastDoc : "-"}</td><td>${c.reqs.length}</td><td>${c.tcs.length}</td><td>${fmtDate(p.updated || p.created)}</td></tr>`; }).join("");
  return layout(pageHead("Projects", "เลือก Project เพื่อเริ่มทำงาน หรือสร้าง Project ใหม่", `${can("project.manage") ? `<button class="btn" data-act="seed-demo">สร้าง Demo Project (Synthetic)</button><button class="btn pri" data-act="new-project">สร้าง Project</button>` : ""}`) +
    (S.projects.length ? `<div class="tblwrap"><table><thead><tr><th>Code</th><th>ชื่อ Project</th><th>BRS Version ล่าสุด</th><th>Requirement</th><th>Test Case</th><th>อัปเดตล่าสุด</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : emptyBox("ยังไม่มี Project", "สร้าง Project ใหม่ หรือลองใช้ Demo Project ที่มี BRS ตัวอย่าง (ข้อมูลสมมติทั้งหมด) เพื่อดู Workflow ครบทุกขั้น", can("project.manage") ? `<button class="btn pri" data-act="seed-demo">สร้าง Demo Project</button>` : `<p class="small">ติดต่อ Admin เพื่อสร้าง Project</p>`)), [["Projects"]]);
}
function projectDialog(p) {
  modal(`<h2>${p ? "แก้ไข Project" : "สร้าง Project"}</h2>
  <div class="field"><label>Project Code (A–Z, 0–9 ใช้ใน REQ/TS/TC ID)</label><input type="text" id="pc" value="${esc(p ? p.code : "")}" ${p && S.requirements.some(r => r.projectId === p.id) ? "disabled" : ""} maxlength="12"></div>
  <div class="field"><label>ชื่อ Project</label><input type="text" id="pn" value="${esc(p ? p.name : "")}"></div>
  <div class="field"><label>คำอธิบาย</label><textarea id="pd">${esc(p ? p.desc : "")}</textarea></div>
  <div class="field"><label>Module Codes (คั่นด้วย ,)</label><input type="text" id="pm" value="${esc(p ? (p.modules || []).join(", ") : "GENERAL")}"></div>
  <div class="acts"><button class="btn" data-act="close-modal">ยกเลิก</button><button class="btn pri" id="pOk">บันทึก</button></div>`);
  $("#pOk").onclick = () => {
    const code = $("#pc").value.trim().toUpperCase(), name = $("#pn").value.trim();
    if (!/^[A-Z][A-Z0-9]{1,11}$/.test(code)) { toast("Project Code ต้องเป็น A–Z/0–9 ขึ้นต้นด้วยตัวอักษร 2–12 ตัว", true); return; }
    if (!name) { toast("กรุณาระบุชื่อ Project", true); return; }
    if (S.projects.some(x => x.code === code && (!p || x.id !== p.id))) { toast("Project Code ซ้ำ", true); return; }
    const modules = $("#pm").value.split(",").map(x => x.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
    if (p) { Object.assign(p, { code, name, desc: $("#pd").value, modules, updated: now() }); audit("PROJECT_UPDATE", code); }
    else { const np = { id: uid(), code, name, desc: $("#pd").value, modules: modules.length ? modules : ["GENERAL"], members: [me().id], created: now() }; S.projects.push(np); audit("PROJECT_CREATE", code); save(); closeModal(); go(`#/p/${np.id}/upload`); return; }
    save(); closeModal(); render();
  };
}

/* ============ P03 Dashboard (§28) ============ */
function barRows(rows, total) {
  const mx = total || Math.max(1, ...rows.map(r => r[1]));
  return `<div class="chart">${rows.map(([l, v, col]) => `<div class="row"><span>${esc(l)}</span><div class="bar"><i style="width:${mx ? v / mx * 100 : 0}%;background:${col}"></i></div><b>${v}</b></div>`).join("")}</div>`;
}
function pageDashboard(p) {
  const c = projectCounts(p.id);
  const docs = S.documents.filter(d => d.projectId === p.id);
  const jobs = docs.flatMap(d => d.versions.map(v => ({ d, v }))).filter(x => x.v.job && !["READY_FOR_REVIEW"].includes(x.v.job.status)).slice(0, 5);
  const latestDoc = docs.map(d => ({ d, v: d.versions[d.versions.length - 1] })).sort((a, b) => (b.v.created || "").localeCompare(a.v.created || ""))[0];
  const runs = c.runs.sort((a, b) => b.started.localeCompare(a.started));
  const tcBy = s => c.tcs.filter(t => t.status === s).length;
  const lr = runs[0];
  const coverage = c.tcApproved ? Math.round(c.automated / c.tcApproved * 100) : 0;
  const manual = c.tcs.filter(t => t.status !== "AUTOMATED").length;
  const kpi = (v, k, href, col) => `<a class="card kpi" href="${href}" style="border-top:3px solid ${col}"><div class="v">${v}</div><div class="k">${esc(k)}</div></a>`;
  if (!docs.length) return layout(pageHead("Dashboard", `${esc(p.code)} · ${esc(p.name)}`) + rail(p) + emptyBox("ยังไม่มีเอกสาร BRS", "อัปโหลด BRS (DOCX, XLSX, CSV, PDF, TXT) หรือวางข้อความ เพื่อเริ่มแยก Requirement", can("doc.upload") ? `<a class="btn pri" href="#/p/${p.id}/upload">อัปโหลด BRS</a>` : ""), [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Dashboard"]]);
  return layout(pageHead("Dashboard", `${esc(p.code)} · ${esc(p.name)}`, `<button class="btn" data-act="export-excel">Export Excel</button>`) + `
  <div class="grid g4">
    ${kpi(c.reqs.length, "Requirement ทั้งหมด", `#/p/${p.id}/requirements`, "var(--purple)")}
    ${kpi(c.nc, "Needs Clarification", `#/p/${p.id}/clarifications?tab=questions`, "var(--orange)")}
    ${kpi(c.conflicts, "Conflict ที่ยังเปิดอยู่", `#/p/${p.id}/clarifications?tab=conflicts`, "var(--red)")}
    ${kpi(c.scenarios, "Test Scenario", `#/p/${p.id}/scenarios`, "var(--blue)")}
    ${kpi(c.tcs.length, "Test Case", `#/p/${p.id}/testcases`, "var(--blue)")}
    ${kpi(c.tcApproved, "Approved Test Case", `#/p/${p.id}/testcases?status=APPROVED`, "var(--green)")}
    ${kpi(c.ready, "Ready for Automation", `#/p/${p.id}/testcases?status=READY_FOR_AUTOMATION`, "var(--green)")}
    ${kpi(coverage + "%", "Automation Coverage (Automated ÷ Approved)", `#/p/${p.id}/auto/pytest`, "var(--gray)")}
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>Test Case ตามสถานะ</h3>${barRows([["AI Generated", tcBy("AI_GENERATED"), "var(--purple)"], ["รอ Review / Revised", tcBy("WAITING_FOR_REVIEW") + tcBy("REVISED") + tcBy("DRAFT"), "var(--orange)"], ["Needs Clarification", tcBy("NEEDS_CLARIFICATION"), "var(--orange)"], ["Approved", tcBy("APPROVED"), "var(--green)"], ["Ready for Automation", tcBy("READY_FOR_AUTOMATION"), "var(--green)"], ["Automated", tcBy("AUTOMATED"), "var(--blue)"]], c.tcs.length)}
      <p class="small muted" style="margin-top:10px">Automated ${c.automated} · Manual ${manual}</p></div>
    <div class="card"><h3>ผล Run ล่าสุด ${lr ? `<a class="small" href="#/p/${p.id}/run/${lr.id}">${esc(lr.name)}</a>` : ""}</h3>${lr ? barRows([["Passed", lr.summary.passed, "var(--green)"], ["Failed", lr.summary.failed, "var(--red)"], ["Blocked", lr.summary.blocked, "var(--orange)"]], lr.summary.total) : `<p class="muted">ยังไม่มีการ Run</p>`}</div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>Test Run ล่าสุด</h3>${runs.length ? `<table><tbody>${runs.slice(0, 5).map(r => `<tr class="click" data-act="nav" data-href="#/p/${p.id}/run/${r.id}"><td>${esc(r.name)}</td><td>${badge(r.status)}</td><td class="small">${r.summary.passed}/${r.summary.failed}/${r.summary.blocked}</td><td class="small muted">${fmtDate(r.started)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">ยังไม่มี</p>`}</div>
    <div class="card"><h3>Document Processing</h3>${jobs.length ? jobs.map(({ d, v }) => `<div style="margin-bottom:10px"><a href="#/p/${p.id}/processing/${d.id}?v=${v.v}">${esc(d.name)} v${v.v}</a> ${badge(v.job.status)}<div class="progress" style="margin-top:4px"><i style="width:${v.job.progress || 0}%"></i></div></div>`).join("") : `<p class="muted">ไม่มีงานค้าง ทุกเอกสารพร้อม Review</p>`}
      ${latestDoc ? `<p class="small" style="margin-top:8px">BRS Version ล่าสุด: <b>${esc(latestDoc.d.name)} v${latestDoc.v.v}</b> (${fmtDate(latestDoc.v.created)})</p>` : ""}</div>
  </div>`, [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Dashboard"]]);
}

/* ============ P04 Project Detail ============ */
function pageProject(p) {
  const docs = S.documents.filter(d => d.projectId === p.id);
  const tab = ui.tab.project || "docs";
  const members = S.users.filter(u => (p.members || []).includes(u.id) || u.role === "ADMIN");
  return layout(pageHead(p.name, `Project Code: <b>${esc(p.code)}</b> · สร้างเมื่อ ${fmtDate(p.created)}`, can("project.manage") ? `<button class="btn" data-act="edit-project">แก้ไข Project</button>` : "") + rail(p) +
    `<div class="tabs">${[["docs", "Documents & Versions"], ["members", "Members"], ["modules", "Module Codes"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" data-act="tab" data-k="project" data-v="${k}">${l}</button>`).join("")}</div>` +
    (tab === "docs" ? (docs.length ? `<div class="tblwrap"><table><thead><tr><th>เอกสาร</th><th>ชนิด</th><th>Versions</th><th>SHA-256 (ล่าสุด)</th><th>สถานะล่าสุด</th><th></th></tr></thead><tbody>${docs.map(d => { const v = d.versions[d.versions.length - 1]; return `<tr><td>${esc(d.name)}</td><td>${esc(d.type.toUpperCase())}</td><td>${d.versions.map(x => `<a href="#/p/${p.id}/processing/${d.id}?v=${x.v}">v${x.v}</a>`).join(" ")}</td><td class="mono small">${esc((v.checksum || "").slice(0, 16))}…</td><td>${badge(v.job.status)}</td><td>${d.versions.length > 1 ? `<a class="btn sm" href="#/p/${p.id}/compare?doc=${d.id}">Compare</a>` : ""}</td></tr>`; }).join("")}</tbody></table></div>` : emptyBox("ยังไม่มีเอกสาร", "อัปโหลด BRS เพื่อเริ่มต้น", `<a class="btn pri" href="#/p/${p.id}/upload">อัปโหลด</a>`))
      : tab === "members" ? `<div class="tblwrap"><table><thead><tr><th>ผู้ใช้</th><th>Role</th><th></th></tr></thead><tbody>${members.map(u => `<tr><td>${esc(u.name)} <span class="muted small">(${esc(u.username)})</span></td><td>${esc(ROLES[u.role])}</td><td>${can("project.manage") && u.role !== "ADMIN" ? `<button class="btn sm" data-act="remove-member" data-id="${u.id}">นำออก</button>` : ""}</td></tr>`).join("")}</tbody></table></div>${can("project.manage") ? `<div class="row-flex" style="margin-top:10px"><select id="addMem" style="max-width:280px">${S.users.filter(u => !members.includes(u)).map(u => `<option value="${u.id}">${esc(u.name)} (${esc(ROLES[u.role])})</option>`).join("")}</select><button class="btn" data-act="add-member">เพิ่มสมาชิก</button></div>` : ""}`
        : `<div class="card"><p>Module Code ใช้สร้าง ID รูปแบบ <code>REQ-${esc(p.code)}-{MODULE}-001</code> ระบบจะดึงจากหัวข้อ Section อัตโนมัติ (เช่น "Rule 3" → RULE3) หากไม่พบจะใช้ค่าเริ่มต้นที่เลือกตอนอัปโหลด</p><p>${(p.modules || []).map(m => badge("", m)).join(" ")}</p><p class="small muted">Module ที่พบใน Requirement: ${[...new Set(S.requirements.filter(r => r.projectId === p.id).map(r => r.module))].map(esc).join(", ") || "-"}</p></div>`),
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Project Detail"]]);
}

/* ============ P05 Upload (§5, §6 Step 1–4) ============ */
function pageUpload(p) {
  if (!can("doc.upload")) return layout(emptyBox("ไม่มีสิทธิ์", "เฉพาะ Admin และ QA Manual ที่อัปโหลด BRS ได้"), [["Upload"]]);
  const docs = S.documents.filter(d => d.projectId === p.id);
  const tab = ui.tab.upload || "file";
  const aiOk = !!capSample && S.settings.aiMode === "claude";
  return layout(pageHead("Upload เอกสาร BRS", "รองรับ DOCX, XLSX, CSV, PDF ที่เลือกข้อความได้ และ TXT · หลายไฟล์ต่อครั้ง") + `
  <div class="grid g2">
  <div>
    <div class="tabs"><button class="${tab === "file" ? "on" : ""}" data-act="tab" data-k="upload" data-v="file">Upload File</button><button class="${tab === "paste" ? "on" : ""}" data-act="tab" data-k="upload" data-v="paste">Paste Text</button></div>
    ${tab === "file" ? `<div class="drop" id="drop" tabindex="0" role="button" aria-label="เลือกไฟล์"><b>ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</b><div class="small muted">ไม่เกิน ${S.settings.maxFileMb} MB ต่อไฟล์ · ระบบตรวจชนิดไฟล์จากเนื้อหา ไม่ใช่แค่นามสกุล</div><input type="file" id="fileIn" multiple accept=".docx,.xlsx,.csv,.pdf,.txt" class="hide"></div>`
      : `<div class="field"><label>ชื่อเอกสาร (Virtual Document)</label><input type="text" id="pasteName" value="BRS-paste-${new Date().toISOString().slice(0, 10)}"></div><div class="field"><label>ข้อความ BRS</label><textarea id="pasteText" style="min-height:260px" placeholder="วางเนื้อหา BRS ที่นี่ หัวข้อแบบ '1. …' หรือ '## …' จะถูกใช้แบ่ง Section"></textarea></div>`}
  </div>
  <div class="card">
    <h3>ตัวเลือกการประมวลผล</h3>
    <div class="field"><label>เป็นเอกสารใหม่ หรือ Version ใหม่ของเอกสารเดิม</label><select id="upTarget"><option value="">เอกสารใหม่</option>${docs.map(d => `<option value="${d.id}">Version ใหม่ของ: ${esc(d.name)} (ปัจจุบัน v${d.versions.length})</option>`).join("")}</select></div>
    <div class="field"><label>Module Code เริ่มต้น (ใช้เมื่อหัวข้อ Section ไม่มี Module)</label><select id="upModule">${(p.modules || ["GENERAL"]).map(m => `<option>${esc(m)}</option>`).join("")}</select></div>
    <div class="field"><label>วิธีวิเคราะห์ Requirement</label><select id="upMode"><option value="claude" ${aiOk ? "selected" : ""} ${capSample ? "" : "disabled"}>Claude AI (ต่อ Section, ตรวจ Source อัตโนมัติ)${capSample ? "" : " — ไม่พร้อมใช้งานในมุมมองนี้"}</option><option value="rule" ${aiOk ? "" : "selected"}>Rule Engine (ไม่ใช้ AI, ทำงานทันที)</option></select></div>
    <label class="row-flex small"><input type="checkbox" id="upAuto" checked> เริ่มวิเคราะห์ทันทีหลังอัปโหลด</label>
    <div class="infobox small" style="margin-top:12px">ทุก Requirement จะเก็บ Original Text, Source Page/Section และค่าที่ไม่พบจะเป็น <code>NOT_FOUND</code> — ระบบไม่เดาค่า รูปภาพหน้าจอจะถูกเก็บเป็น Evidence สถานะ Needs Visual Review</div>
    ${tab === "paste" ? `<button class="btn pri" data-act="do-paste">บันทึกและประมวลผล</button>` : ""}
  </div></div>
  <div id="upList" style="margin-top:16px"></div>`, [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Upload"]]);
}
function bindUpload(p) {
  const drop = $("#drop"), inp = $("#fileIn"); if (!drop) return;
  drop.onclick = () => inp.click(); drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); }; drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); handleFiles(p, [...e.dataTransfer.files]); };
  inp.onchange = () => handleFiles(p, [...inp.files]);
}
async function handleFiles(p, files) {
  if (!guard("doc.upload")) return;
  const list = $("#upList"); const opts = { target: $("#upTarget").value, module: $("#upModule").value, mode: $("#upMode").value, auto: $("#upAuto").checked };
  list.innerHTML = `<div class="tblwrap"><table><thead><tr><th>ไฟล์</th><th>ขนาด</th><th>สถานะ</th><th>รายละเอียด</th></tr></thead><tbody id="upRows"></tbody></table></div>`;
  let lastDoc = null;
  for (const f of files) {
    const rowId = "r" + uid().slice(0, 6);
    $("#upRows").insertAdjacentHTML("beforeend", `<tr id="${rowId}"><td>${esc(safeFilename(f.name))}</td><td>${(f.size / 1048576).toFixed(2)} MB</td><td>${badge("RUNNING", "Uploaded")}</td><td class="small"></td></tr>`);
    const set = (st, txt, detail = "") => { const tr = $("#" + rowId); if (tr) { tr.children[2].innerHTML = badge(st, txt); tr.children[3].innerHTML = detail; } };
    try {
      const d = await ingestFile(p, f, opts, (st, txt) => set("RUNNING", txt));
      lastDoc = d; set("DONE", "Extracted", `${d.lastVersion.sections.length} Sections · ${d.lastVersion.images.length} รูป · SHA-256 ${d.lastVersion.checksum.slice(0, 12)}…${d.lastVersion.warnings.length ? "<br>" + d.lastVersion.warnings.map(esc).join(" · ") : ""} <a href="#/p/${p.id}/processing/${d.doc.id}?v=${d.lastVersion.v}">เปิด Processing</a>`);
    } catch (e) {
      const err = e.code ? e : appError("CORRUPT_FILE", "อ่านไฟล์ไม่สำเร็จ ไฟล์อาจเสียหาย", e.message || String(e), false, "ตรวจไฟล์แล้วอัปโหลดใหม่");
      set("FAILED", err.code, `${esc(err.userMessage)} — ${esc(err.suggestedAction)} <span class="muted">(Correlation ID ${err.correlationId})</span>`);
      audit("UPLOAD_FAILED", safeFilename(f.name), err.code + " " + err.technical);
    }
  }
  if (lastDoc && opts.auto) { go(`#/p/${p.id}/processing/${lastDoc.doc.id}?v=${lastDoc.lastVersion.v}`); startAnalysis(lastDoc.doc.id, lastDoc.lastVersion.v, opts.mode); }
}
async function ingestFile(p, file, opts, onStage) {
  const name = safeFilename(file.name), ext = extOf(name);
  if (!ALLOWED_EXT.includes(ext)) throw appError("UNSUPPORTED_FILE", `ไม่รองรับไฟล์ .${ext}`, name, false, "ใช้ DOCX, XLSX, CSV, PDF หรือ TXT");
  if (file.size > S.settings.maxFileMb * 1048576) throw appError("FILE_TOO_LARGE", `ไฟล์ใหญ่เกิน ${S.settings.maxFileMb} MB`, String(file.size), false, "แยกไฟล์หรือเพิ่ม Limit ใน Settings");
  if (!file.size) throw appError("CORRUPT_FILE", "ไฟล์ว่าง", name, false, "ตรวจไฟล์ต้นฉบับ");
  const buf = await file.arrayBuffer();
  if (!(await sniffType(buf, ext))) throw appError("UNSUPPORTED_FILE", "เนื้อหาไฟล์ไม่ตรงกับนามสกุล", ext, false, "ตรวจว่าไฟล์ไม่ได้ถูกเปลี่ยนนามสกุล");
  const checksum = await sha256(buf);
  return ingestBuffer(p, { name, ext, size: file.size, checksum, buf }, opts, onStage);
}
async function ingestBuffer(p, meta, opts, onStage = () => {}) {
  onStage("RUNNING", "Extracting");
  const parsed = await parseDocument(meta.buf, meta.ext);
  onStage("RUNNING", "Normalizing");
  onStage("RUNNING", "Creating Sections");
  const sections = blocksToSections(parsed.blocks, meta.name);
  if (!sections.length) throw appError("CORRUPT_FILE", "ไม่พบข้อความในเอกสาร", meta.name, false, "ตรวจว่าเป็นเอกสารที่มีข้อความ");
  const images = (parsed.images || []).slice(0, 80).filter(im => im.dataUri.length < 1.5e6);
  images.forEach(im => { const sec = sections.find(s => im.nearText && s.text.includes(im.nearText.slice(0, 60))) || sections[0]; im.sectionId = sec.id; im.sectionTitle = sec.title; });
  let doc = opts.target ? S.documents.find(d => d.id === opts.target) : null;
  if (doc && doc.versions.some(v => v.checksum === meta.checksum)) throw appError("DUPLICATE_DOCUMENT", "Version นี้มีอยู่แล้ว (Checksum ซ้ำ)", meta.checksum, false, "ไม่ต้องอัปโหลดซ้ำ");
  if (!doc) { doc = { id: uid(), projectId: p.id, name: meta.name, type: meta.ext, versions: [], created: now() }; S.documents.push(doc); }
  const v = { v: doc.versions.length + 1, fileName: meta.name, size: meta.size, checksum: meta.checksum, sections, images, warnings: parsed.warnings || [], pageCount: parsed.pageCount || null, created: now(), uploadedBy: me().username, module: opts.module, mode: opts.mode, job: { status: "EXTRACTED", stage: "Creating Sections", progress: 0, log: [`${now()} Uploaded ${meta.name} (${meta.checksum})`, `${now()} Extracted ${sections.length} sections, ${images.length} images`] } };
  doc.versions.push(v); p.updated = now();
  audit("UPLOAD", meta.name, `v${v.v} sha256=${meta.checksum}`);
  save();
  return { doc, lastVersion: v };
}

/* ============ Processing job controller (§6 Step 5, §31) ============ */
const jobCtl = {};
function findVersion(docId, vn) { const d = S.documents.find(x => x.id === docId); return d ? { d, v: d.versions.find(x => x.v === Number(vn)) || d.versions[d.versions.length - 1] } : {}; }
function jobLog(v, msg) { v.job.log.push(`${now()} ${mask(msg)}`); if (v.job.log.length > 2000) v.job.log.splice(0, 200); }
async function startAnalysis(docId, vn, mode, onlyIds) {
  if (!guard("doc.process")) return;
  const { d, v } = findVersion(docId, vn); if (!v) return;
  const key = d.id + ":" + v.v; if (jobCtl[key] && jobCtl[key].running) { toast("งานนี้กำลังทำงานอยู่"); return; }
  const p = S.projects.find(x => x.id === d.projectId);
  mode = mode || v.mode || "rule"; if (mode === "claude" && !capSample) { mode = "rule"; toast("Claude AI ไม่พร้อมใช้งานในมุมมองนี้ — ใช้ Rule Engine แทน"); }
  v.mode = mode; jobCtl[key] = { running: true, cancel: false };
  v.job.status = "RUNNING"; v.job.stage = "Analyzing Requirements"; jobLog(v, `Start analysis (mode=${mode}${onlyIds ? ", sections=" + onlyIds.length : ""})`);
  audit(onlyIds ? "PROCESS_RETRY" : "PROCESS", d.name, `v${v.v} mode=${mode}`); save(); render();
  const prev = d.versions.find(x => x.v === v.v - 1);
  const targets = v.sections.filter(s => onlyIds ? onlyIds.includes(s.id) : s.status !== "DONE");
  for (const sec of targets) {
    if (jobCtl[key].cancel) { v.job.status = "CANCELLED"; jobLog(v, "Cancelled by user"); break; }
    sec.status = "RUNNING"; sec.attempts++; sec.error = null; const t0 = Date.now(); rerenderProcessing();
    try {
      // remove previous non-approved requirements from this section (retry)
      const old = S.requirements.filter(r => r.source.sectionId === sec.id && r.docVersion === v.v);
      if (old.some(r => r.status === "APPROVED")) throw appError("SECTION_HAS_APPROVED", "Section นี้มี Requirement ที่ Approved แล้ว จึงไม่ประมวลผลซ้ำ", sec.id, false, "แก้ไข Requirement ผ่าน Requirement Explorer แทน");
      S.requirements = S.requirements.filter(r => !old.includes(r));
      const module = moduleFrom(sec.parentTitle || sec.title, v.module || "GENERAL");
      const ctx = { project: p, doc: d, version: v, section: sec, module };
      // carry over unchanged sections from previous version (version comparison)
      const same = prev && prev.sections.find(ps => ps.title === sec.title && ps.text === sec.text);
      if (same) {
        const carried = S.requirements.filter(r => r.docId === d.id && r.source.sectionId === same.id && r.isLatest !== false);
        carried.forEach(r => { r.source.sectionId = sec.id; r.docVersion = v.v; r.source.page = sec.page ?? r.source.page; });
        sec.reqRefs = carried.map(r => r.id); sec.carried = true;
        jobLog(v, `Section ${sec.seq} unchanged from v${prev.v}: carried ${carried.length} requirements`);
      } else {
        let created = [];
        if (mode === "claude") {
          const items = await aiExtractSection(ctx);
          created = items.map(it => buildRequirement(ctx, it.stmt, it.fields, it.meta));
        } else {
          created = candidateStatements(sec).map(st => buildRequirement(ctx, st));
        }
        const kept = [];
        if (prev) {
          const prevSec = prev.sections.find(ps => ps.title === sec.title);
          if (prevSec) {
            const olds = S.requirements.filter(r => r.docId === d.id && r.source.sectionId === prevSec.id && r.isLatest !== false);
            const norm = t => String(t).replace(/\s+/g, " ").trim();
            created = created.filter(c => { const o = olds.find(x => norm(x.originalText) === norm(c.originalText)); if (o) { o.source.sectionId = sec.id; o.docVersion = v.v; kept.push(o); return false; } return true; });
            const unmatched = olds.filter(o => !kept.includes(o));
            created.forEach(c => c.supersedes = unmatched.map(o => o.id));
          }
        }
        S.requirements.push(...created); sec.reqRefs = created.map(r => r.id).concat(kept.map(r => r.id));
        if (kept.length) jobLog(v, `Section ${sec.seq}: ${kept.length} requirements unchanged (carried over)`);
        jobLog(v, `Section ${sec.seq} "${sec.title}" → ${created.length} requirements (${Date.now() - t0} ms)`);
      }
      sec.status = "DONE"; sec.duration = Date.now() - t0;
    } catch (e) {
      const err = e.code && e.userMessage ? e : (e.code === "rate_limited" ? appError("AI_RATE_LIMIT", "AI ถูกจำกัดอัตราการเรียกใช้", e.message, true, "รอสักครู่แล้ว Retry Failed Only") : e.code === "not_granted" ? appError("AI_NOT_GRANTED", "ไม่ได้รับอนุญาตให้ใช้ Claude", e.message, true, "อนุญาตการใช้งาน หรือเปลี่ยนเป็น Rule Engine") : appError(e.code === "timeout" ? "AI_TIMEOUT" : "DOCUMENT_SECTION_FAILED", "วิเคราะห์ Section ไม่สำเร็จ", e.message || String(e), true, "กด Retry Section"));
      sec.status = "FAILED"; sec.error = err; sec.duration = Date.now() - t0;
      jobLog(v, `Section ${sec.seq} FAILED ${err.code}: ${err.technical}`);
    }
    v.job.progress = Math.round(v.sections.filter(s => s.status === "DONE").length / v.sections.length * 100);
    save(); rerenderProcessing();
  }
  if (v.job.status !== "CANCELLED") {
    v.job.stage = "Detecting Conflicts"; rerenderProcessing();
    const n = detectConflicts(p.id); jobLog(v, `Conflict detection: ${n} new conflicts`);
    S.requirements.filter(r => r.projectId === p.id && !["APPROVED", "DEPRECATED"].includes(r.status)).forEach(r => { const q = analyzeQuality(r); r.completeness = q.completeness; r.clarity = q.clarity; });
    v.job.stage = "Generating Questions";
    const failed = v.sections.filter(s => s.status === "FAILED").length;
    v.job.status = failed ? "FAILED" : "READY_FOR_REVIEW"; v.job.stage = failed ? "Failed" : "Ready for Review";
    if (prev) buildImpactProposals(d, prev, v);
    jobLog(v, failed ? `${failed} sections failed — use Retry Failed Only` : "Ready for Review");
  }
  jobCtl[key].running = false; save(); render();
}
function rerenderProcessing() { const { seg } = parseRoute(); if (seg[2] === "processing") render(); }
const STAGES = ["Uploaded", "Extracting", "Normalizing", "Creating Sections", "Analyzing Requirements", "Detecting Conflicts", "Generating Questions", "Ready for Review"];

/* ============ P06 Processing ============ */
function pageProcessing(p, docId, q) {
  const docs = S.documents.filter(d => d.projectId === p.id);
  if (!docId) {
    return layout(pageHead("Document Processing", "สถานะการประมวลผลของทุกเอกสาร") + (docs.length ? `<div class="tblwrap"><table><thead><tr><th>เอกสาร</th><th>Version</th><th>Sections</th><th>สถานะ</th><th>Progress</th></tr></thead><tbody>${docs.flatMap(d => d.versions.map(v => `<tr class="click" data-act="nav" data-href="#/p/${p.id}/processing/${d.id}?v=${v.v}"><td>${esc(d.name)}</td><td>v${v.v}</td><td>${v.sections.length}</td><td>${badge(v.job.status)}</td><td style="min-width:140px"><div class="progress"><i style="width:${v.job.progress}%"></i></div></td></tr>`)).join("")}</tbody></table></div>` : emptyBox("ยังไม่มีเอกสาร", "อัปโหลด BRS ก่อน", `<a class="btn pri" href="#/p/${p.id}/upload">อัปโหลด</a>`)), [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Processing"]]);
  }
  const { d, v } = findVersion(docId, q.v); if (!v) return layout(emptyBox("ไม่พบเอกสาร", ""), [["Processing"]]);
  const key = d.id + ":" + v.v, running = jobCtl[key] && jobCtl[key].running;
  if (v.job.status === "RUNNING" && !running) { v.job.status = "PAUSED"; v.job.stage = "Analyzing Requirements"; }
  const failed = v.sections.filter(s => s.status === "FAILED");
  const stIdx = v.job.status === "EXTRACTED" ? 3 : v.job.status === "READY_FOR_REVIEW" ? 7 : Math.max(4, STAGES.indexOf(v.job.stage));
  const filt = ui.f.procFailed;
  const secs = v.sections.filter(s => !filt || s.status === "FAILED");
  const canP = can("doc.process");
  return layout(pageHead(`${d.name} · v${v.v}`, `${v.sections.length} Sections · ${v.images.length} รูปภาพ · SHA-256 <span class="mono">${esc(v.checksum.slice(0, 16))}…</span> · วิธีวิเคราะห์: ${v.mode === "claude" ? "Claude AI" : "Rule Engine"}`,
    `${canP && ["EXTRACTED"].includes(v.job.status) ? `<button class="btn pri" data-act="job-start" data-doc="${d.id}" data-v="${v.v}">เริ่มวิเคราะห์</button>` : ""}
     ${canP && ["PAUSED", "CANCELLED"].includes(v.job.status) ? `<button class="btn pri" data-act="job-start" data-doc="${d.id}" data-v="${v.v}">Resume Job</button>` : ""}
     ${canP && running ? `<button class="btn danger" data-act="job-cancel" data-doc="${d.id}" data-v="${v.v}">Cancel Job</button>` : ""}
     ${canP && failed.length && !running ? `<button class="btn" data-act="job-retry-failed" data-doc="${d.id}" data-v="${v.v}">Retry Failed Only (${failed.length})</button>` : ""}
     <button class="btn" data-act="job-log" data-doc="${d.id}" data-v="${v.v}">Download Processing Log</button>
     ${v.v > 1 ? `<a class="btn" href="#/p/${p.id}/compare?doc=${d.id}&from=${v.v - 1}&to=${v.v}">Compare กับ v${v.v - 1}</a>` : ""}`) + `
  <div class="card" style="margin-bottom:14px">
    <div class="stepper">${STAGES.map((s, i) => `<span class="${v.job.status === "FAILED" && i === 7 ? "fail" : i < stIdx ? "done" : i === stIdx ? "cur" : ""}">${v.job.status === "FAILED" && i === 7 ? "Failed" : s}</span>`).join("")}</div>
    <div class="row-flex"><div class="progress sp"><i style="width:${v.job.progress}%"></i></div><b>${v.job.progress}%</b> ${badge(v.job.status)}</div>
    ${v.warnings.length ? `<p class="small muted" style="margin-top:8px">${v.warnings.map(esc).join(" · ")}</p>` : ""}
  </div>
  <div class="toolbar"><label class="row-flex small"><input type="checkbox" data-change="f-toggle" data-k="procFailed" ${filt ? "checked" : ""}> แสดงเฉพาะ Section ที่ Fail</label><span class="sp"></span>${v.job.status === "READY_FOR_REVIEW" ? `<a class="btn pri" href="#/p/${p.id}/requirements">ไปที่ Requirement Explorer</a>` : ""}</div>
  <div class="tblwrap"><table><thead><tr><th>#</th><th>Section</th><th>หน้า</th><th>ชนิด</th><th>สถานะ</th><th>Requirement</th><th>ครั้งที่ทำ</th><th>เวลา</th><th></th></tr></thead><tbody>
  ${secs.map(s => `<tr><td>${s.seq}</td><td>${esc(s.title)}${s.carried ? ` <span class="badge b-gray">คงเดิมจาก v${v.v - 1}</span>` : ""}${s.overlap ? ` <span class="badge b-gray">overlap</span>` : ""}${s.error ? `<div class="small" style="color:var(--red)">${esc(s.error.code)}: ${esc(s.error.userMessage)} — ${esc(s.error.suggestedAction)}</div>` : ""}</td><td>${s.page ?? `<span class="nf">${NF}</span>`}${s.pageEnd && s.pageEnd !== s.page ? "–" + s.pageEnd : ""}</td><td>${s.kind === "table" ? "ตาราง" : "ข้อความ"}</td><td>${badge(s.status)}</td><td>${(s.reqRefs || []).length}</td><td>${s.attempts}</td><td class="small">${s.duration ? s.duration + " ms" : "-"}</td>
  <td class="row-flex"><button class="btn sm" data-act="view-section" data-doc="${d.id}" data-v="${v.v}" data-id="${s.id}">ดู</button>${canP && !running && s.status !== "RUNNING" ? `<button class="btn sm" data-act="job-retry" data-doc="${d.id}" data-v="${v.v}" data-id="${s.id}">Retry Section</button>` : ""}${s.error ? `<button class="btn sm" data-act="view-error" data-doc="${d.id}" data-v="${v.v}" data-id="${s.id}">Error</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div>
  ${v.images.length ? `<h2 style="margin-top:18px">รูปภาพจากเอกสาร (${v.images.length})</h2><div class="grid g4">${v.images.map(im => `<div class="card"><img src="${im.dataUri}" alt="${esc(im.alt || "screenshot")}" style="max-width:100%;max-height:140px;display:block;margin-bottom:6px;cursor:zoom-in" data-act="img-view" data-doc="${d.id}" data-v="${v.v}" data-id="${im.id}">${badge(im.status)}<div class="small muted">${esc(im.caption || im.sectionTitle || "")}</div></div>`).join("")}</div>` : ""}`,
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Processing", `#/p/${p.id}/processing`], [`${d.name} v${v.v}`]]);
}

/* ============ P07 Version Compare & Impact (§17) ============ */
function sectionDiff(prev, cur) {
  const added = cur.sections.filter(s => !prev.sections.some(p => p.title === s.title));
  const removed = prev.sections.filter(s => !cur.sections.some(c => c.title === s.title));
  const changed = cur.sections.filter(s => { const p = prev.sections.find(x => x.title === s.title); return p && p.text !== s.text; }).map(s => ({ cur: s, prev: prev.sections.find(x => x.title === s.title) }));
  return { added, removed, changed };
}
function buildImpactProposals(d, prev, cur) {
  const { added, removed, changed } = sectionDiff(prev, cur);
  const exists = (type, ref) => S.impacts.some(i => i.docId === d.id && i.toV === cur.v && i.entityType === type && i.entityRef === ref);
  const push = (entityType, entityRef, label, proposal, reason) => { if (!exists(entityType, entityRef)) S.impacts.push({ id: uid(), projectId: d.projectId, docId: d.id, fromV: prev.v, toV: cur.v, entityType, entityRef, label, proposal, reason, status: "PROPOSED", created: now() }); };
  const reqsOf = sec => S.requirements.filter(r => r.docId === d.id && (r.source.sectionId === sec.id));
  const cascade = (r, proposal, why) => {
    push("Requirement", r.id, r.reqId, proposal, why);
    S.scenarios.filter(s => s.reqRef === r.id).forEach(s => push("Test Scenario", s.id, s.tsId, proposal === "Deprecation Candidate" ? "Deprecation Candidate" : "Review Required", `Requirement ${r.reqId} ${why}`));
    S.testCases.filter(t => t.reqRef === r.id && t.status !== "DEPRECATED").forEach(t => {
      push("Test Case", t.id, t.tcId, proposal === "Deprecation Candidate" ? "Deprecation Candidate" : (["APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED"].includes(t.status) ? "Update Required" : "Review Required"), `Requirement ${r.reqId} ${why} — Retest แนะนำ`);
      S.artifacts.filter(a => a.tcRefs.includes(t.id)).forEach(a => push("Automation Script", a.id, `${a.kind}: ${a.name}`, "Review Required", `ใช้ Test Case ${t.tcId}`));
    });
  };
  const norm = t => String(t).replace(/\s+/g, " ").trim();
  changed.forEach(({ prev: ps, cur: cs }) => {
    S.requirements.filter(r => r.docId === d.id && (r.source.sectionId === ps.id || r.source.sectionId === cs.id) && !(r.supersedes || []).length && r.docVersion <= cur.v).forEach(r => {
      if (norm(cs.text).includes(norm(r.originalText))) push("Requirement", r.id, r.reqId, "No Impact", `ข้อความเดิมยังอยู่ใน Section "${cs.title}" v${cur.v}`);
      else cascade(r, "Update Required", `ข้อความใน Section "${ps.title}" ถูกแก้ไขใน v${cur.v}`);
    });
    S.requirements.filter(r => r.docId === d.id && r.source.sectionId === cs.id && (r.supersedes || []).length).forEach(r => push("Requirement", r.id, r.reqId, "New Test Required", `Requirement ใหม่จากการแก้ไข Section "${cs.title}" (แทน ${r.supersedes.map(id => (S.requirements.find(x => x.id === id) || {}).reqId).join(", ")})`));
  });
  removed.forEach(ps => reqsOf(ps).forEach(r => cascade(r, "Deprecation Candidate", `อยู่ใน Section "${ps.title}" ที่ถูกลบ`)));
  added.forEach(cs => push("Section", cs.id, cs.title, "New Test Required", "Section ใหม่ใน v" + cur.v));
  save();
}
function pageCompare(p, q) {
  const docs = S.documents.filter(d => d.projectId === p.id && d.versions.length > 1);
  if (!docs.length) return layout(pageHead("BRS Version Comparison") + emptyBox("ยังไม่มีเอกสารที่มีมากกว่า 1 Version", "อัปโหลด Version ใหม่โดยเลือก 'Version ใหม่ของเอกสารเดิม' ในหน้า Upload", can("doc.upload") ? `<a class="btn pri" href="#/p/${p.id}/upload">อัปโหลด Version ใหม่</a>` : ""), [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Version Compare"]]);
  const d = S.documents.find(x => x.id === q.doc) || docs[0];
  const toV = Number(q.to) || d.versions.length, fromV = Number(q.from) || toV - 1;
  const A = d.versions.find(v => v.v === fromV), B = d.versions.find(v => v.v === toV);
  const tab = ui.tab.compare || "diff";
  const { added, removed, changed } = A && B ? sectionDiff(A, B) : { added: [], removed: [], changed: [] };
  const imps = S.impacts.filter(i => i.docId === d.id && i.toV === toV);
  const sel = `<select data-change="cmp" data-k="doc">${docs.map(x => `<option value="${x.id}" ${x.id === d.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
  <select data-change="cmp" data-k="from">${d.versions.map(v => `<option ${v.v === fromV ? "selected" : ""}>${v.v}</option>`).join("")}</select> → <select data-change="cmp" data-k="to">${d.versions.map(v => `<option ${v.v === toV ? "selected" : ""}>${v.v}</option>`).join("")}</select>`;
  return layout(pageHead("BRS Version Comparison & Impact Analysis", "ระบบไม่แก้ Test Case ที่ Approved อัตโนมัติ — ทุกผลกระทบเป็น Proposal ที่ QA ต้องอนุมัติ") + `<div class="toolbar">${sel}</div>
  <div class="grid g3" style="margin-bottom:14px"><div class="card kpi"><div class="v" style="color:var(--green)">${added.length}</div><div class="k">Section ที่เพิ่ม</div></div><div class="card kpi"><div class="v" style="color:var(--red)">${removed.length}</div><div class="k">Section ที่ถูกลบ</div></div><div class="card kpi"><div class="v" style="color:var(--orange)">${changed.length}</div><div class="k">Section ที่เปลี่ยน</div></div></div>
  <div class="tabs"><button class="${tab === "diff" ? "on" : ""}" data-act="tab" data-k="compare" data-v="diff">Section Diff</button><button class="${tab === "impact" ? "on" : ""}" data-act="tab" data-k="compare" data-v="impact">Impact Proposals (${imps.length})</button></div>
  ${tab === "diff" ? `
    ${added.map(s => `<div class="card" style="margin-bottom:10px;border-left:3px solid var(--green)"><h3>${badge("New Test Required", "เพิ่ม")} ${esc(s.title)}</h3><div class="diff">${s.text.split("\n").map(l => `<span class="a">+ ${esc(l)}</span>`).join("")}</div></div>`).join("")}
    ${removed.map(s => `<div class="card" style="margin-bottom:10px;border-left:3px solid var(--red)"><h3>${badge("FAILED", "ลบ")} ${esc(s.title)}</h3><div class="diff">${s.text.split("\n").map(l => `<span class="d">- ${esc(l)}</span>`).join("")}</div></div>`).join("")}
    ${changed.map(x => `<div class="card" style="margin-bottom:10px;border-left:3px solid var(--orange)"><h3>${badge("Review Required", "เปลี่ยน")} ${esc(x.cur.title)}</h3>${renderDiff(x.prev.text, x.cur.text)}</div>`).join("")}
    ${!added.length && !removed.length && !changed.length ? emptyBox("ไม่พบความแตกต่าง", "ทั้งสอง Version มีเนื้อหาเหมือนกัน") : ""}`
    : (imps.length ? `<div class="toolbar">${can("impact.approve") ? `<button class="btn ok" data-act="impact-approve-all" data-doc="${d.id}" data-to="${toV}">อนุมัติ Proposal ทั้งหมดที่ยังค้าง</button>` : ""}<span class="small muted">Retest ที่แนะนำ: ${imps.filter(i => i.entityType === "Test Case").map(i => esc(i.label)).join(", ") || "-"}</span></div>
      <div class="tblwrap"><table><thead><tr><th>ประเภท</th><th>รายการ</th><th>Proposal</th><th>เหตุผล</th><th>สถานะ</th><th></th></tr></thead><tbody>${imps.map(i => `<tr><td>${esc(i.entityType)}</td><td>${i.entityType === "Test Case" ? `<a href="#/p/${p.id}/testcase/${i.entityRef}">${esc(i.label)}</a>` : i.entityType === "Requirement" ? `<a href="#/p/${p.id}/requirements?sel=${i.entityRef}">${esc(i.label)}</a>` : esc(i.label)}</td><td>${badge(i.proposal)}</td><td class="small">${esc(i.reason)}</td><td>${badge(i.status)}</td><td class="row-flex">${i.status === "PROPOSED" && can("impact.approve") ? `<button class="btn sm ok" data-act="impact-decide" data-id="${i.id}" data-v="APPROVED">อนุมัติ</button><button class="btn sm" data-act="impact-decide" data-id="${i.id}" data-v="REJECTED">ปฏิเสธ</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : emptyBox("ไม่มี Impact Proposal", "ผลกระทบจะถูกสร้างหลังวิเคราะห์ Version ใหม่เสร็จ"))}`,
    [["Projects", "#/projects"], [p.code, `#/p/${p.id}`], ["Version Compare"]]);
}
function applyImpact(i, decision) {
  i.status = decision; i.decidedBy = me().username; i.decidedAt = now();
  if (decision === "APPROVED") {
    if (i.entityType === "Requirement" && i.proposal === "Deprecation Candidate") { const r = S.requirements.find(x => x.id === i.entityRef); if (r) { r.status = "DEPRECATED"; r.isLatest = false; } }
    if (i.entityType === "Requirement" && i.proposal === "Update Required") { const r = S.requirements.find(x => x.id === i.entityRef); if (r && S.requirements.some(n => (n.supersedes || []).includes(r.id))) { r.status = "DEPRECATED"; r.isLatest = false; } }
    if (i.entityType === "Test Case") { const t = S.testCases.find(x => x.id === i.entityRef); if (t) t.impactFlag = `${i.proposal}: ${i.reason} (อนุมัติโดย ${me().username})`; }
    if (i.entityType === "Test Scenario" && i.proposal === "Deprecation Candidate") { const s = S.scenarios.find(x => x.id === i.entityRef); if (s) s.status = "DEPRECATED"; }
  }
  audit("IMPACT_" + decision, i.label, i.proposal);
}
