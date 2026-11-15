'use strict';
// Regressão: o horário de "Última sincronização confirmada" da cópia SIAFI deve refletir a última
// leitura bem-sucedida do SIAFI, e não a sincronização da planilha principal. Dados fictícios, banco PGlite isolado.
const test=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const cache=require('../lib/management-cache'),refs=require('../lib/budget-reference'),{synchronize}=require('../lib/management-sync'),{createHandler}=require('../lib/source-tables-handler'),{fixture}=require('./fixtures/management');
const admin={userId:'admin',name:'Gestor',active:true,role:'admin',sectors:[]};
const cell=v=>({effectiveValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}});
function mainSheet(){const s=fixture();s.tables['NEs e liquidação'][1][1]=cell('27/04/26');return s;}
const withSiafi=status=>async()=>{const s=mainSheet();s.referenceStatus=status;if(status==='ok')s.referenceRecords=refs.parse('ne',[['Ord','NE','UG','Data NE','ND','PI'],[1,'2026NE000001',160111,46139,339039,'PI-TESTE']],'2026-10-28');if(status==='failed')s.referenceWarning='Não foi possível atualizar PI e referências SIAFI; último retrato preservado.';return s;};
async function run(db,loadState,at){const r=await synchronize(db,{actorId:'sync',trigger:'test',loadState});assert.notEqual(r.state,'busy');
 // fixa o horário da execução para tornar a comparação determinística
 await db.query('UPDATE central_day.management_runs SET started_at=$1,finished_at=$1 WHERE id=(SELECT id FROM central_day.management_runs ORDER BY started_at DESC LIMIT 1)',[at]);return r;}
async function overview(db){const handler=createHandler({getDB:()=>db,getIdentity:async()=>admin,readSnapshot:()=>cache.readSnapshot(db)});
 const res={headers:{},setHeader(){},status(n){this.code=n;return this},json(b){this.body=b;return this}};await handler({method:'GET',query:{overview:'1'}},res);assert.equal(res.code,200);
 return {siafi:res.body.sources.find(s=>s.kind==='referencia'),principal:res.body.sources.find(s=>s.kind==='principal')};}
const T1='2026-11-10T13:00:00.000Z',T2='2026-11-11T13:00:00.000Z',T3='2026-11-12T13:00:00.000Z';
async function setup(){const db=new PGlite();await require('../lib/day-db').prepare(db);return db;}

test('SIAFI timestamp follows the last successful SIAFI read; a failed read keeps data and time, and recovery clears the warning',async()=>{
 const db=await setup();try{
  await run(db,withSiafi('ok'),T1);
  let o=await overview(db);assert.equal(o.siafi.lastSyncedAt,T1);assert.equal(o.siafi.lastAttemptFailed,false);assert.doesNotMatch(o.siafi.status,/Falha/);
  const before=(await cache.readSnapshot(db)).state.referenceRecords;assert.equal(before.length,1);

  // planilha principal sincroniza, leitura do SIAFI falha
  const r2=await run(db,withSiafi('failed'),T2);assert.equal(r2.counts.reference,'failed');
  o=await overview(db);
  assert.equal(o.siafi.lastSyncedAt,T1,'horário do SIAFI não pode avançar quando a leitura falhou');
  assert.equal(o.siafi.lastAttemptFailed,true);assert.equal(o.siafi.lastAttemptAt,T2);
  assert.match(o.siafi.status,/Falha na tentativa mais recente de leitura do SIAFI/);assert.match(o.siafi.status,/última leitura bem-sucedida/);
  assert.notEqual(o.siafi.lastSyncedAt,o.principal.lastSyncedAt,'SIAFI não herda o horário da planilha principal');
  assert.deepEqual((await cache.readSnapshot(db)).state.referenceRecords,before,'dados do SIAFI preservados');

  // recuperação
  await run(db,withSiafi('ok'),T3);
  o=await overview(db);assert.equal(o.siafi.lastSyncedAt,T3);assert.equal(o.siafi.lastAttemptFailed,false);assert.doesNotMatch(o.siafi.status,/Falha/);
 }finally{await db.close();}});

test('without a trusted successful SIAFI read the time stays empty (shown as "Não informada") and the failure is reported',async()=>{
 const db=await setup();try{
  // histórico antigo, sem marcador de leitura do SIAFI
  await run(db,async()=>mainSheet(),T1);
  let o=await overview(db);assert.equal(o.siafi.lastSyncedAt,null);assert.equal(o.siafi.lastAttemptFailed,false);
  assert.ok(o.principal.lastSyncedAt,'planilha principal continua com horário próprio');
  // primeira leitura registrada já é uma falha
  await run(db,withSiafi('failed'),T2);
  o=await overview(db);assert.equal(o.siafi.lastSyncedAt,null);assert.equal(o.siafi.lastAttemptFailed,true);assert.match(o.siafi.status,/nenhuma leitura bem-sucedida registrada/);
 }finally{await db.close();}});

test('status marker is kept out of the saved snapshot payload',async()=>{
 const db=await setup();try{await run(db,withSiafi('ok'),T1);assert.equal((await cache.readSnapshot(db)).state.referenceStatus,undefined);}finally{await db.close();}});
