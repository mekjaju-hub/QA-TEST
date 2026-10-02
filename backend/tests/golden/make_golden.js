// Generates golden output from the ORIGINAL JS engine (04_source/p3_engine.js + p4_gen.js)
// so the Python port can be checked for parity.  Run: node make_golden.js > demo_js.json
const fs = require("fs"), vm = require("vm"), path = require("path");
const src = path.resolve(__dirname, "../../../04_source");
let n = 0; const seq = {};
const ctx = {
  NF: "NOT_FOUND", uid: () => "id-" + (++n), now: () => "2026-01-01T00:00:00Z", pad: (x, l = 3) => String(x).padStart(l, "0"),
  nextSeq: k => (seq[k] = (seq[k] || 0) + 1), me: () => ({ username: "golden" }), clone: o => JSON.parse(JSON.stringify(o)),
  S: { requirements: [], conflicts: [], scenarios: [], testCases: [], projects: [], artifacts: [], runs: [], settings: {} },
  save: () => {}, esc: s => String(s), console, TextEncoder, Number, String, Math, JSON, Object, Array, Set, Map, RegExp, Date, Uint32Array,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(src, "p3_engine.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(src, "p4_gen.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(src, "demo.js"), "utf8").replace(/^const DEMO_BRS/m, "var DEMO_BRS"), ctx);
const out = vm.runInContext(`(() => {
  const project = { id: "p1", code: "CAM", name: "Demo" };
  const doc = { id: "d1", name: "demo.txt" }; const version = { v: 1, images: [] };
  const sections = blocksToSections(textToBlocks(DEMO_BRS), "demo.txt");
  const reqs = [];
  sections.forEach(section => {
    const module = moduleFrom(section.title, "GENERAL");
    candidateStatements(section).forEach(st => {
      const r = buildRequirement({ project, doc, version, section, module }, st);
      r.projectId = "p1"; S.requirements.push(r); reqs.push(r);
    });
  });
  detectConflicts("p1");
  const boundaries = reqs.map(r => ({ reqId: r.reqId, rows: boundaryData(r), types: scenarioTypesFor(r), pr: assessPriorityRisk(r, "Boundary") }));
  return { sections: sections.map(s => ({ title: s.title, text: s.text })),
    requirements: reqs.map(r => ({ reqId: r.reqId, type: r.type, module: r.module, title: r.title, fields: r.fields,
      completeness: r.completeness.score, clarity: r.clarity.score, clarityReasons: r.clarity.reasons.map(x => x.text),
      status: r.status, questions: r.questions.map(q => q.key), duplicateOf: r.duplicateOf || null })),
    conflicts: S.conflicts.map(c => ({ a: S.requirements.find(r => r.id === c.a).reqId, b: S.requirements.find(r => r.id === c.b).reqId, similarity: c.similarity, diffs: c.diffs })),
    boundaries };
})()`, ctx);
process.stdout.write(JSON.stringify(out, null, 1));
