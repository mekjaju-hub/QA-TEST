global.document={addEventListener(){},querySelector(){return null}};global.sessionStorage={getItem(){return null},setItem(){},removeItem(){}};
global.setInterval=()=>0;
const fs=require('fs');
const code=['p2_core.js','p3_engine.js','p4_gen.js','demo.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
eval(code+`
S.users.push({id:'u1',username:'admin',role:'ADMIN',active:true});session={userId:'u1',lastActive:Date.now()};
const p={id:'p1',code:'CAM',name:'Demo'};S.projects.push(p);
const blocks=textToBlocks(DEMO_BRS);const secs=blocksToSections(blocks,'demo');
console.log('sections',secs.map(s=>s.title));
const doc={id:'d1',name:'demo'};const ver={v:1,images:[]};
secs.forEach(sec=>{const mod=moduleFrom(sec.title,'GEN');candidateStatements(sec).forEach(st=>{S.requirements.push(buildRequirement({project:p,doc,version:ver,section:sec,module:mod},st));});});
console.log('conflicts',detectConflicts('p1'));
S.requirements.forEach(r=>console.log(r.reqId,r.type,r.status,'C',r.completeness.score,'Cl',r.clarity.score,'op',r.fields.thresholdOp,r.fields.thresholdValue,r.fields.unit,'|role',r.fields.role,'|exp',r.fields.expected.slice(0,40),'|Q',r.questions.map(q=>q.key).join(',')));
`);
