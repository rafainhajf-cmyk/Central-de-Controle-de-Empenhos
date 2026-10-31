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
 const sent=run({sentToSupplierOn:'2026-10-05'});assert.equal(sent.some(t=>t.rule==='send'),false);assert.equal(sent[0].dueOn,'2026-11-06');assert.equal(sent[0].issues.includes('ESTIMATED_DISPATCH'),false);
 assert.equal(run({deliveryDueOn:'2026-11-20'}).find(t=>t.rule==='first-notification').dueOn,'2026-11-06');
});
test('notification response periods are five business days and PA follow-up is weekly',()=>{
 assert.equal(run({firstNotifiedOn:'2026-10-02'})[0].dueOn,'2026-10-09');assert.equal(run({firstNotifiedOn:'2026-10-02'})[0].rule,'second-notification');
 assert.equal(run({secondNotifiedOn:'2026-10-02'})[0].dueOn,'2026-10-09');assert.equal(run({secondNotifiedOn:'2026-10-02'})[0].rule,'administrative-process');
 assert.equal(run({paOpenedOn:'2026-10-02'})[0].dueOn,'2026-10-09');
});
test('business day notice deadlines skip weekends and listed holidays',()=>{const records={complete:true,records:[{key:'ne-test',kind:'ne',fields:{...fields,firstNotifiedOn:'2026-10-02'}}]};const t=deriveActivities(records,[{day:'2026-10-05'}]);assert.equal(t[0].dueOn,'2026-10-12');});
test('legacy notification statuses use their date and missing dates require review',()=>{
 assert.equal(run({status:'13. notificada (1)',notifiedOn:'2026-10-02'})[0].rule,'first-notification-proof');
 assert.equal(run({status:'14. notificada (2 not)',notifiedOn:'2026-10-02'})[0].rule,'second-notification-proof');
 const missing=run({status:'14. notificada (2 not)'});assert.equal(missing[0].rule,'second-notification-proof');assert.ok(missing[0].issues.includes('SECOND_NOTICE_PROOF_PENDING'));assert.equal(missing[0].dueOn,null);
});
test('delivered and fully liquidated commitments do not request delivery notifications',()=>{
 assert.deepEqual(run({status:'8. liquidado',remainingCents:0}),[]);
 assert.equal(run({status:'1-entregue a liquidar',remainingCents:50000})[0].rule,'almox-invoice');
 assert.equal(run({status:'11. falta providência do setor requisitante'})[0].rule,'service-request');
 assert.equal(run({nd:'449052'})[0].rule,'send');
});
test('ALMOX delivered to liquidation requires collecting supplier invoices, not assuming payment',()=>{
 const tasks=run({status:'1. entregue a liquidar',sector:'ALMOX',remainingCents:50000});
 assert.equal(tasks.length,1);
 assert.equal(tasks[0].rule,'almox-invoice');
 assert.match(tasks[0].subject,/nota fiscal/);
 assert.ok(tasks[0].issues.includes('INVOICE_TRACKING_PENDING'));
 assert.equal(run({status:'1. entregue a liquidar',sector:'Fiscalização'})[0].rule,'payment');
});
test('NF location does not close ALMOX collection while balance remains',()=>{
 assert.equal(run({status:'1. entregue a liquidar',remainingCents:1,invoiceLocation:'bda'})[0].rule,'almox-invoice');
 assert.deepEqual(run({status:'8. liquidado',remainingCents:0}),[]);
 assert.equal(run({status:'8. liquidado',remainingCents:100})[0].rule,'liquidation-review');
});
test('service, notification documentary proof and brigade PA progress',()=>{
 assert.equal(run({status:'11. falta providência do setor requisitante',serviceRequestedOn:'2026-10-02'})[0].rule,'service-completion');
 assert.equal(run({status:'11. falta providência do setor requisitante',serviceRequestedOn:'2026-10-02',servicePerformedOn:'2026-10-10'})[0].rule,'service-invoice');
 assert.equal(run({status:'14. notificada (2 not)',secondNotifiedOn:'2026-10-02',paDiexSentOn:'2026-10-09'})[0].rule,'pa-brigade');
});
test('individual deadline overrides default and invalid dates never become invented dates',()=>{
 assert.ok(run({dueOn:'2026-12-01'}).every(t=>t.dueOn==='2026-12-01'));
 const tasks=run({issuedOn:null});assert.ok(tasks.every(t=>t.dueOn===null));assert.ok(tasks.every(t=>t.issues.includes('DATE_PENDING')));
});

test('closed contracts are preserved in the source without generating a new follow-up',()=>{
 const source={complete:true,records:[{key:'contract-one',kind:'contract',fields:{number:'1/2026',status:'Encerrado'}}]};assert.deepEqual(deriveActivities(source),[]);assert.equal(source.records.length,1);
});
