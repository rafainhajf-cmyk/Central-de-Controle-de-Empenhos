'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),{fixture}=require('./fixtures/management'),cache=require('../lib/management-cache');
const store=require('../lib/financial-store');
const actor={userId:'admin',name:'Gestor teste',role:'admin',active:true,sectors:[]},other={userId:'other',name:'Outro setor',role:'operator',active:true,sectors:['APRV']};
const key='ne|160111|2026|2026NE000001';
async function setup(){const db=new PGlite();await require('../lib/day-db').prepare(db);await cache.commitSnapshot(db,fixture(),{actorId:'admin',runId:crypto.randomUUID()});return db;}
const cmd=(view,action,fields={})=>({key,action,expectedVersion:view.book.version,sourceVersion:view.source.version,operationId:crypto.randomUUID(),note:'Conferência de teste',...fields});
const response=()=>({statusCode:0,setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
test('financial commands persist atomically, survive lost response and refuse UUID reuse with changed content',async()=>{
 const db=await setup();try{
  let v=await store.readFinancialBook(db,actor,key);assert.equal(v.position.availableCents,null);
  await store.executeFinancialCommand(db,actor,cmd(v,'reconcile',{includedMovementIds:[]}));v=await store.readFinancialBook(db,actor,key);
  const c=cmd(v,'liquidation',{amountCents:2500,document:'NL-1',on:'2026-10-28'}),r=await store.executeFinancialCommand(db,actor,c);
  assert.equal(r.position.availableCents,77500);assert.deepEqual(await store.executeFinancialCommand(db,actor,c),r);assert.deepEqual(await store.findFinancialOperation(db,actor,c.operationId),r);
  await assert.rejects(()=>store.executeFinancialCommand(db,actor,{...c,amountCents:3000}),e=>e.code==='OPERATION_CHANGED');
  const audit=(await db.query('SELECT actor_id,actor_name,action FROM central_day.financial_events ORDER BY id')).rows;assert.equal(audit.length,2);assert.equal(audit[1].actor_name,actor.name);
  const again=await store.readFinancialBook(db,actor,key);assert.equal(again.book.movements.length,1);assert.equal(again.events.length,2);
  const dashboard=response();await require('../api/gerencial').createHandler({getDB:()=>db,getIdentity:async()=>actor})({method:'GET',query:{}},dashboard);
  assert.equal(dashboard.statusCode,200);assert.equal(dashboard.body.commitments[0].remainingCents,80000);assert.equal(dashboard.body.commitments[0].financial.availableCents,77500);
 }finally{await db.close();}
});
test('stale concurrent commands and failed audit roll back balance and operation together',async()=>{
 const db=await setup();try{
  await store.executeFinancialCommand(db,actor,cmd(await store.readFinancialBook(db,actor,key),'reconcile',{includedMovementIds:[]}));
  const v=await store.readFinancialBook(db,actor,key),c=cmd(v,'liquidation',{amountCents:50000,document:'NL-1',on:'2026-10-28'}),d=cmd(v,'liquidation',{amountCents:50000,document:'NL-2',on:'2026-10-28'});
  const results=await Promise.allSettled([store.executeFinancialCommand(db,actor,c),store.executeFinancialCommand(db,actor,d)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
  const before=await store.readFinancialBook(db,actor,key);await db.query("ALTER TABLE central_day.financial_events ADD CONSTRAINT reject_test CHECK(action <> 'reserve')");
  const bad=cmd(before,'reserve',{amountCents:1000,document:'RES-1',on:'2026-10-28',purpose:'Teste de rollback'});await assert.rejects(()=>store.executeFinancialCommand(db,actor,bad));
  assert.equal((await store.readFinancialBook(db,actor,key)).book.version,before.book.version);assert.equal((await store.findFinancialOperation(db,actor,bad.operationId)).state,'not-found-yet');
 }finally{await db.close();}
});
test('current manual sector controls access and UUID confirmation cannot reveal a transferred record',async()=>{
 const db=await setup();try{
  const c=cmd(await store.readFinancialBook(db,actor,key),'reconcile',{includedMovementIds:[]});await store.executeFinancialCommand(db,actor,c);
  await assert.rejects(()=>store.readFinancialBook(db,other,key),e=>e.status===404);await assert.rejects(()=>store.executeFinancialCommand(db,other,c),e=>e.status===403);
  await cache.saveManualFields(db,actor,{key,expectedVersion:1,fields:{sector:'APRV'}});
  assert.equal((await store.readFinancialBook(db,other,key)).events[0].actorName,actor.name);
  assert.equal((await store.findFinancialOperation(db,other,c.operationId)).state,'not-found-yet');
 }finally{await db.close();}
});
test('new financial snapshot requires reconciliation and absent source refuses writing but preserves history',async()=>{
 const db=await setup();try{
  await store.executeFinancialCommand(db,actor,cmd(await store.readFinancialBook(db,actor,key),'reconcile',{includedMovementIds:[]}));
  let v=await store.readFinancialBook(db,actor,key);await store.executeFinancialCommand(db,actor,cmd(v,'liquidation',{amountCents:2500,on:'2026-10-28',document:'NL-1'}));
  const changed=fixture();changed.sourceDate='2026-10-29';await cache.commitSnapshot(db,changed,{actorId:'sync',runId:crypto.randomUUID()});
  v=await store.readFinancialBook(db,actor,key);assert.equal(v.position.availableCents,null);assert.equal(v.book.movements.length,1);
  await assert.rejects(()=>store.executeFinancialCommand(db,actor,cmd(v,'liquidation',{amountCents:100,on:'2026-10-28',document:'NL-2'})),e=>e.code==='RECONCILIATION_REQUIRED');
  changed.tables['NEs e liquidação'].pop();await cache.commitSnapshot(db,changed,{actorId:'sync',runId:crypto.randomUUID()});v=await store.readFinancialBook(db,actor,key);assert.equal(v.present,false);assert.equal(v.book.movements.length,1);
  await assert.rejects(()=>store.executeFinancialCommand(db,actor,cmd(v,'reconcile',{includedMovementIds:[]})),e=>e.code==='SOURCE_PENDING');
 }finally{await db.close();}
});
test('financial API rejects missing login, foreign origin, unauthorized actor and unrecognized input without writing',async()=>{
 const db=await setup();try{
  const make=who=>require('../api/financeiro').createHandler({getDB:()=>db,getIdentity:async()=>who});
  const no=response();await make(null)({method:'GET',query:{key}},no);assert.equal(no.statusCode,401);
  const evil=response();await make(actor)({method:'POST',headers:{host:'example.test',origin:'https://evil.test','content-type':'application/json','x-central-request':'1'},body:{}},evil);assert.equal(evil.statusCode,403);
  const headers={host:'example.test',origin:'https://example.test','content-type':'application/json','x-central-request':'1'},body=cmd(await store.readFinancialBook(db,actor,key),'reconcile',{includedMovementIds:[]});
  const denied=response();await make(other)({method:'POST',headers,body},denied);assert.equal(denied.statusCode,403);
  const bad=response();await make(actor)({method:'POST',headers,body:{...body,sourceBalance:999999}},bad);assert.equal(bad.statusCode,400);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM central_day.financial_events')).rows[0].n,0);
  const ok=response();await make(actor)({method:'POST',headers,body},ok);assert.equal(ok.statusCode,200);assert.equal(ok.body.state,'confirmed');
 }finally{await db.close();}
});
