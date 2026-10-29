'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ledger=require('../lib/financial-ledger');
const actor={userId:'admin',name:'Gestor',role:'admin',active:true,sectors:[]};
const source={id:'ne|160111|2026|2026NE000001',ug:'160111',year:2026,number:'2026NE000001',sector:'ALMOX',committedCents:10000,liquidatedCents:0,cancelledCents:0,remainingCents:10000,source:{sourceDate:'2026-10-28'}};
const ref=(r=source)=>ledger.sourceReference(r);
const command=(action,book,fields={},r=source)=>({action,operationId:crypto.randomUUID(),key:r.id,expectedVersion:book.version,sourceVersion:ref(r).version,note:'Conferência documentada',...fields});
const apply=(book,c,r=source)=>ledger.applyFinancialCommand(book,ref(r),c,actor,'2026-10-28T15:00:00Z');
const reconciled=()=>apply(ledger.emptyBook(),command('reconcile',ledger.emptyBook(),{includedMovementIds:[]}));
test('unreconciled source never presents operational zero and cannot accept a movement',()=>{
 const b=ledger.emptyBook();assert.equal(ledger.financialPosition(b,ref()).availableCents,null);
 assert.throws(()=>apply(b,command('liquidation',b,{amountCents:2500,on:'2026-10-28',document:'NL-1'})),e=>e.code==='RECONCILIATION_REQUIRED');
});
test('liquidation of 2500 leaves 7500; a single reversal restores 10000 with historical actor',()=>{
 let b=reconciled();b=apply(b,command('liquidation',b,{amountCents:2500,on:'2026-10-28',document:'NL-1'}));
 assert.equal(ledger.financialPosition(b,ref()).availableCents,7500);assert.equal(ledger.financialPosition(b,ref()).liquidatedCents,2500);
 const id=b.movements[0].id;b=apply(b,command('reversal',b,{movementId:id,on:'2026-10-28',document:'EST-1'}));
 assert.equal(ledger.financialPosition(b,ref()).availableCents,10000);assert.equal(b.movements[0].actorId,'admin');assert.equal(b.movements[0].sector,'ALMOX');
 assert.throws(()=>apply(b,command('reversal',b,{movementId:id,on:'2026-10-28',document:'EST-2'})),e=>e.code==='ALREADY_REVERSED');
});
test('rejects excess, fractional, zero and unsafe amounts, invalid dates, duplicate documents and stale versions',()=>{
 let b=reconciled();
 for(const amountCents of [10001,0,-1,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>apply(b,command('liquidation',b,{amountCents,on:'2026-10-28',document:'NL-X'})));
 for(const on of ['2026-02-31','2026-10-29'])assert.throws(()=>apply(b,command('liquidation',b,{amountCents:100,on,document:'NL-X'})));
 b=apply(b,command('cancellation',b,{amountCents:100,on:'2026-10-28',document:' Doc-1 '}));
 assert.throws(()=>apply(b,command('cancellation',b,{amountCents:100,on:'2026-10-28',document:'doc-1'})),e=>e.code==='DUPLICATE_DOCUMENT');
 assert.throws(()=>apply(b,{...command('cancellation',b,{amountCents:100,on:'2026-10-28',document:'DOC-2'}),expectedVersion:0}),e=>e.code==='VERSION_CONFLICT');
});
test('source change invalidates operational calculation; including an incorporated movement prevents double counting',()=>{
 let b=reconciled();b=apply(b,command('liquidation',b,{amountCents:2500,on:'2026-10-28',document:'NL-1'}));
 const updated={...source,liquidatedCents:2500,remainingCents:7500,source:{sourceDate:'2026-10-29'}};
 assert.equal(ledger.financialPosition(b,ref(updated)).availableCents,null);
 const c={...command('reconcile',b,{includedMovementIds:[b.movements[0].id]},updated)};
 b=ledger.applyFinancialCommand(b,ref(updated),c,actor,'2026-10-29T12:00:00Z');
 assert.equal(ledger.financialPosition(b,ref(updated)).availableCents,7500);assert.equal(ledger.financialPosition(b,ref(updated)).liquidatedCents,2500);
 b=ledger.applyFinancialCommand(b,ref(updated),command('reversal',b,{movementId:b.movements[0].id,on:'2026-10-29',document:'EST-1'},updated),actor,'2026-10-29T13:00:00Z');
 assert.equal(ledger.financialPosition(b,ref(updated)).availableCents,10000);
});
test('reconciliation cannot forget already incorporated events or include unknown or orphan reversal IDs',()=>{
 let b=reconciled();b=apply(b,command('liquidation',b,{amountCents:2500,on:'2026-10-28',document:'NL-1'}));
 const id=b.movements[0].id,updated={...source,liquidatedCents:2500,remainingCents:7500};b=apply(b,command('reconcile',b,{includedMovementIds:[id]},updated),updated);
 assert.throws(()=>apply(b,command('reconcile',b,{includedMovementIds:[]},updated),updated),e=>e.code==='RECONCILIATION_HISTORY');
 assert.throws(()=>apply(b,command('reconcile',b,{includedMovementIds:['unknown']},updated),updated));
 b=apply(b,command('reversal',b,{movementId:id,on:'2026-10-28',document:'EST-1'},updated),updated);
 const fresh=reconciled();assert.throws(()=>apply({...fresh,movements:b.movements},command('reconcile',fresh,{includedMovementIds:[b.movements[1].id]})));
});
test('reservation of 3000 leaves 7000 internally free, never releases credit, and cancellation preserves history',()=>{
 let b=reconciled();b=apply(b,command('reserve',b,{amountCents:3000,purpose:'Material para atividade',on:'2026-10-28',document:'RES-1'}));
 let p=ledger.financialPosition(b,ref());assert.equal(p.availableCents,10000);assert.equal(p.freeInternalCents,7000);assert.equal(p.releasedCreditCents,0);
 assert.throws(()=>apply(b,command('reserve',b,{amountCents:7001,purpose:'Excesso',on:'2026-10-28',document:'RES-2'})));
 assert.throws(()=>apply(b,command('cancellation',b,{amountCents:7001,on:'2026-10-28',document:'AN-1'})),e=>e.code==='ACTIVE_RESERVATIONS');
 b=apply(b,command('cancel-reservation',b,{reservationId:b.reservations[0].id}));p=ledger.financialPosition(b,ref());assert.equal(p.freeInternalCents,10000);assert.equal(b.reservations[0].state,'cancelled');
});
test('missing UG or unknown/inconsistent financial source cannot establish a financial book',()=>{
 for(const r of [{...source,ug:null},{...source,remainingCents:null},{...source,remainingCents:10001},{...source,id:'ne|167111|2026|2026NE000001'}])assert.equal(ref(r).valid,false);
 assert.throws(()=>apply(ledger.emptyBook(),command('reconcile',ledger.emptyBook(),{includedMovementIds:[]}),{...source,ug:null}));
});
test('manual annotations and row order do not invalidate a financial source; UG and financial changes do',()=>{
 assert.equal(ref().version,ref({...source,owner:'Outro',sector:'APRV',source:{sourceDate:'2026-10-28',row:99}}).version);
 assert.notEqual(ref().version,ref({...source,liquidatedCents:1,remainingCents:9999}).version);
 assert.notEqual(ref().version,ref({...source,id:'ne|167111|2026|2026NE000001',ug:'167111'}).version);
});
test('source dates in the existing Brazilian format are interpreted as civil dates without inventing a year',()=>{
 assert.equal(ref({...source,source:{sourceDate:'28/10/2026'}}).valid,true);
 assert.equal(ref({...source,source:{sourceDate:'28/10/2026'}}).version,ref().version);
 assert.equal(ref({...source,source:{sourceDate:'28/10'}}).valid,false);
});
test('only active managers can write; closed schemas reject client-supplied actors and financial source values',()=>{
 const b=reconciled(),c=command('liquidation',b,{amountCents:100,on:'2026-10-28',document:'NL-1'});
 assert.throws(()=>ledger.applyFinancialCommand(b,ref(),c,{...actor,role:'operator'},'2026-10-28T15:00:00Z'),e=>e.status===403);
 assert.throws(()=>apply(b,{...c,actorId:'other'}));assert.throws(()=>apply(b,{...c,remainingCents:99999}));
});
