'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {HEADERS,projectManagement}=require('../lib/budget/source-adapter');
const cache=require('../lib/management-cache'),settings=require('../lib/deadline-settings');
const {classifyFlow}=require('../lib/budget/timelines');
const {deriveActivities}=require('../lib/day-rules');
const actor={userId:'admin',name:'Administrador de teste',role:'admin',active:true,sectors:[]};
const operator={userId:'other',name:'Outro setor',role:'operator',active:true,sectors:['APRV']};
const {fixture}=require('./fixtures/management');
async function dbFixture(){const db=new PGlite();await require('../lib/day-db').prepare(db);await db.query("INSERT INTO central_day.profiles(user_id,email,name,role,sectors) VALUES('admin','admin@example.test','Administrador de teste','admin','{}'),('other','other@example.test','Outro setor','operator',ARRAY['APRV'])");return db;}
function response(){return{statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
test('APRV recognizes each configured subitem, fiscal ND, and missing ND stays unclassified',()=>{
 for(const subitem of ['07','04','21'])assert.equal(classifyFlow({nd:'339030',subitem}).flow,'aprv');
 assert.equal(classifyFlow({nd:'339039',subitem:'07'}).flow,'fiscal');
 assert.equal(classifyFlow({nd:'339030',subitem:'99'}).flow,'almox');
 assert.equal(classifyFlow({nd:null}).flow,null);
 const view=projectManagement(fixture(),actor,'2026-10-28');
 assert.equal(view.commitments[0].flow,'aprv');assert.equal(view.commitments[0].daysSinceEmission,27);
 assert.equal(view.contracts[0].daysToEnd,64);
});
test('Meu Dia uses saved Neon snapshot, manual fields and preserved Almox annotation without Google credentials',async()=>{
 const db=await dbFixture();try{
  await assert.rejects(()=>require('../lib/day-sources').loadDaySources(db),e=>e.code==='SYNC_REQUIRED');
  await cache.commitSnapshot(db,fixture(),{actorId:'admin',runId:'import-1'});
  await cache.saveManualFields(db,actor,{key:'ne|160111|2026|2026NE000001',expectedVersion:1,fields:{sector:'APRV',owner:'Responsável atual',nextAction:'Conferir com o setor',dueOn:'2026-11-02'}});
  await cache.saveManualFields(db,actor,{key:'ne|160111|2026|2026NE000001',expectedVersion:2,fields:{firstNotifiedOn:'2026-10-20',sentToSupplierOn:'2026-10-01'}});
  const source=await require('../lib/day-sources').loadDaySources(db),ne=source.records.find(r=>r.kind==='ne');
  assert.equal(source.storage,'Neon');assert.equal(ne.fields.sector,'APRV');assert.equal(ne.fields.owner,'Responsável atual');assert.equal(ne.fields.dueOn,'2026-11-02');assert.equal(ne.originalAlmox.observation,'Anotação original');
  await cache.saveManualFields(db,actor,{key:'contract|CONTRATO-1',expectedVersion:1,fields:{owner:'Fiscal atual',nextAction:'Conferir aditivo'}});
  const contractSource=await require('../lib/day-sources').loadDaySources(db);assert.equal(contractSource.records.find(r=>r.kind==='contract').fields.owner,'Fiscal atual');
  const before=(await db.query('SELECT source_data FROM central_day.management_sources WHERE key=$1',[ne.key])).rows[0];
  await cache.commitSnapshot(db,fixture(),{actorId:'system-sync',runId:'import-2'});
  const again=await require('../lib/day-sources').loadDaySources(db);assert.equal(again.records.find(r=>r.key===ne.key).fields.owner,'Responsável atual');
  assert.equal(again.records.find(r=>r.key===ne.key).fields.firstNotifiedOn,'2026-10-20');assert.equal(again.records.find(r=>r.key===ne.key).fields.sentToSupplierOn,'2026-10-01');
  assert.deepEqual((await db.query('SELECT source_data FROM central_day.management_sources WHERE key=$1',[ne.key])).rows[0],before);
 }finally{await db.close();}
});
test('general deadlines are versioned, audited, scoped, validated, and do not rewrite existing tasks',async()=>{
 const db=await dbFixture();try{
  const initial=await settings.read(db);assert.equal(initial.version,0);
  await assert.rejects(()=>settings.save(db,operator,{expectedVersion:0,rules:initial.rules}),e=>e.status===403);
  const rules={dispatchDays:7,noticeDays:6,secondNoticeDays:8,paDays:9};
  const saved=await settings.save(db,actor,{expectedVersion:0,rules});assert.equal(saved.version,1);
  await assert.rejects(()=>settings.save(db,actor,{expectedVersion:0,rules}),e=>e.code==='VERSION_CONFLICT');
  await assert.rejects(()=>settings.save(db,actor,{expectedVersion:1,rules:{...rules,dispatchDays:-1}}),e=>e.status===400);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM central_day.management_changes WHERE kind='deadline-rules-edited'")).rows[0].n,1);
  const source={complete:true,records:[{key:'ne-one',kind:'ne',fields:{number:'2026NE000001',ug:'160111',year:2026,nd:'339030',subitem:'99',sector:'ALMOX',assignedOn:'2026-10-01'}}]};
  assert.equal(deriveActivities(source,[],rules).find(r=>r.rule==='send').dueOn,'2026-10-08');
  source.records[0].fields.dueOn='2026-11-02';assert.equal(deriveActivities(source,[],rules)[0].dueOn,'2026-11-02');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM central_day.activities')).rows[0].n,0);
 }finally{await db.close();}
});
test('history respects sector access, includes identity, and invalid dates do not commit',async()=>{
 const db=await dbFixture();try{
  await cache.commitSnapshot(db,fixture(),{actorId:'admin',runId:'import'});
  const key='ne|160111|2026|2026NE000001';
  await assert.rejects(()=>cache.saveManualFields(db,actor,{key,expectedVersion:1,fields:{dueOn:'2026-02-31'}}),e=>e.status===400);
  await cache.saveManualFields(db,actor,{key,expectedVersion:1,fields:{observation:'Ajuste feito pela administração'}});
  const make=who=>require('../api/campos-gerenciais').createHandler({getDB:()=>db,getIdentity:async()=>who});
  const denied=response();await make(operator)({method:'GET',query:{key}},denied);assert.equal(denied.statusCode,404);
  const ok=response();await make(actor)({method:'GET',query:{key}},ok);assert.equal(ok.statusCode,200);assert.equal(ok.body.events[0].actor_name,actor.name);
  assert.equal(ok.body.events[0].after_data.observation,'Ajuste feito pela administração');
 }finally{await db.close();}
});
test('daily commands preserve partial work and idempotency, with historical actor and isolated sectors',async()=>{
 const db=await dbFixture();try{
  const store=require('../lib/day-store'),operationId=crypto.randomUUID();
  const created=await store.executeDayCommand(db,actor,{action:'create',operationId,subject:'Pendência teste',reference:'NE teste',sector:'ALMOX',note:'Contexto de teste'});
  const command={action:'partial',operationId:crypto.randomUUID(),id:created.activity.id,version:1,note:'Parte recebida',nextAction:'Cobrar restante'};
  const partial=await store.executeDayCommand(db,actor,command);assert.equal(partial.activity.state,'in-progress');
  assert.deepEqual(await store.executeDayCommand(db,actor,command),partial);
  assert.equal((await store.readDayState(db,operator)).activities.length,0);
  const events=(await store.history(db,actor,created.activity.id)).events;assert.equal(events.length,2);assert.ok(events.every(e=>e.actor_id==='admin'));
 }finally{await db.close();}
});
test('rules endpoint rejects unauthenticated and cross-origin writes',async()=>{
 const db=await dbFixture();try{
  const no=require('../api/regras').createHandler({getDB:()=>db,getIdentity:async()=>null}),r=response();await no({method:'GET',query:{}},r);assert.equal(r.statusCode,401);
  const h=require('../api/regras').createHandler({getDB:()=>db,getIdentity:async()=>actor}),x=response();await h({method:'POST',headers:{host:'example.test',origin:'https://evil.test','content-type':'application/json','x-central-request':'1'},body:{}},x);assert.equal(x.statusCode,403);
 }finally{await db.close();}
});
test('Excel export is a native XLSX ZIP with Unicode, numeric cells and no executable formulas',()=>{
 const bytes=require('../report-exports').workbook('Consulta de teste',['Texto','Valor'],[['=HYPERLINK("x")',1234.56],['Ação & prazo',0]]);
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 const text=new TextDecoder().decode(bytes);assert.match(text,/sheet1.xml/);assert.match(text,/inlineStr/);assert.match(text,/Ação &amp; prazo/);assert.match(text,/<v>1234.56<\/v>/);assert.doesNotMatch(text,/<f>/);
});
test('generate API reads Neon, persists candidates once, and returns them under individual access',async()=>{
 const db=await dbFixture();try{
  const sourceState=fixture();delete sourceState.sourceRecords[0].fields.nd;await cache.commitSnapshot(db,sourceState,{actorId:'admin',runId:'generate-import'});
  const handle=require('../api/meu-dia').createHandler({getDB:()=>db,getIdentity:async()=>actor});
  const request={method:'POST',headers:{host:'example.test',origin:'https://example.test','content-type':'application/json','x-central-request':'1'},query:{},body:{action:'generate',operationId:crypto.randomUUID()}};
  const first=response();await handle(request,first);assert.equal(first.statusCode,200);assert.ok(first.body.generated>0);
  const repeat=response();await handle(request,repeat);assert.deepEqual(repeat.body,first.body);
  const read=response();await handle({method:'GET',query:{}},read);assert.equal(read.statusCode,200);assert.equal(read.body.activities.length,first.body.generated);assert.ok(read.body.activities.some(r=>r.issues.includes('APRV_NE_DEADLINE_EXCLUDED')));
  const events=(await db.query('SELECT actor_id,count(*)::integer AS n FROM central_day.events GROUP BY actor_id')).rows;assert.equal(events.length,1);assert.equal(events[0].actor_id,'admin');assert.equal(events[0].n,first.body.generated);
 }finally{await db.close();}
});

