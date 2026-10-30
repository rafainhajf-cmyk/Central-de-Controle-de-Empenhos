'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {deriveActivities}=require('../lib/day-rules');
const fields={number:'2026NE000001',ug:'160111',year:2026,nd:'339030',subitem:'99',sector:'ALMOX',issuedOn:'2026-10-02'};
const run=changes=>deriveActivities({complete:true,records:[{key:'ne-test',kind:'ne',fields:{...fields,...changes}}]});
test('Almox defaults count weekends: five days for dispatch then thirty for delivery',()=>{
 const tasks=run({});assert.equal(tasks.find(t=>t.rule==='send').dueOn,'2026-10-07');
 const first=tasks.find(t=>t.rule==='first-notification');assert.equal(first.dueOn,'2026-11-06');assert.ok(first.issues.includes('ESTIMATED_DISPATCH'));
});
test('reported dispatch and explicit delivery deadline replace the estimated date',()=>{
 const sent=run({sentToSupplierOn:'2026-10-05'});assert.equal(sent.some(t=>t.rule==='send'),false);assert.equal(sent[0].dueOn,'2026-11-04');assert.equal(sent[0].issues.includes('ESTIMATED_DISPATCH'),false);
 assert.equal(run({deliveryDueOn:'2026-11-20'}).find(t=>t.rule==='first-notification').dueOn,'2026-11-20');
});
test('notification response periods are ten calendar days and PA follow-up is weekly',()=>{
 assert.equal(run({firstNotifiedOn:'2026-10-02'})[0].dueOn,'2026-10-12');assert.equal(run({firstNotifiedOn:'2026-10-02'})[0].rule,'second-notification');
 assert.equal(run({secondNotifiedOn:'2026-10-02'})[0].dueOn,'2026-10-12');assert.equal(run({secondNotifiedOn:'2026-10-02'})[0].rule,'administrative-process');
 assert.equal(run({paOpenedOn:'2026-10-02'})[0].dueOn,'2026-10-09');
});
test('legacy notification statuses use their date and missing dates require review',()=>{
 assert.equal(run({status:'13. notificada (1)',notifiedOn:'2026-10-02'})[0].rule,'second-notification');
 assert.equal(run({status:'14. notificada (2 not)',notifiedOn:'2026-10-02'})[0].rule,'administrative-process');
 const missing=run({status:'14. notificada (2 not)'});assert.equal(missing[0].rule,'review');assert.ok(missing[0].issues.includes('DATE_PENDING'));assert.equal(missing[0].dueOn,null);
});
test('delivered and fully liquidated commitments do not request delivery notifications',()=>{
 assert.deepEqual(run({status:'8. liquidado',remainingCents:0}),[]);
 assert.equal(run({status:'1-entregue a liquidar',remainingCents:50000})[0].rule,'payment');
 assert.equal(run({status:'11. falta providência do setor requisitante'})[0].rule,'service-request');
 assert.equal(run({nd:'449052'})[0].rule,'send');
});
test('individual deadline overrides default and invalid dates never become invented dates',()=>{
 assert.ok(run({dueOn:'2026-12-01'}).every(t=>t.dueOn==='2026-12-01'));
 const tasks=run({issuedOn:null});assert.ok(tasks.every(t=>t.dueOn===null));assert.ok(tasks.every(t=>t.issues.includes('DATE_PENDING')));
});
