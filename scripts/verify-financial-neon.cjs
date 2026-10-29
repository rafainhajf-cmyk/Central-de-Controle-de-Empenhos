'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
function checkEnvironment(env){
 const host=new URL(env.DATABASE_URL||'invalid:').hostname;
 if(env.VERCEL_ENV!=='preview'||!env.FINANCIAL_TEST_ENDPOINT||host!==env.FINANCIAL_TEST_ENDPOINT||host.includes('ep-rapid-night'))throw Error('Financial probe requires its explicit isolated preview database.');
 return host;
}
async function verify(){
 checkEnvironment(process.env);
 const {Pool}=require('pg'),db=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:10000,statement_timeout:10000});
 const actor={userId:'financial-isolated-probe',name:'Teste isolado de concorrência',active:true,role:'admin',sectors:[]},store=require('../lib/financial-store'),key='ne|999999|2026|2026NE999998',nonce=crypto.randomUUID();
 let inserted=false,lockClient;
 const command=(view,action,fields={})=>({operationId:crypto.randomUUID(),key,action,expectedVersion:view.book.version,sourceVersion:view.source.version,note:'Teste isolado '+nonce,...fields});
 const wait=()=>new Promise(resolve=>setTimeout(resolve,200));
 const fingerprint=async()=>{const r=await db.query("SELECT (SELECT md5(string_agg(key||fields::text||version::text,'|' ORDER BY key)) FROM central_day.management_manual WHERE key<>$1) AS manual_hash,(SELECT md5(string_agg(key||source_data::text,'|' ORDER BY key)) FROM central_day.management_sources WHERE key<>$1) AS sources_hash,(SELECT count(*)::int FROM central_day.activities) AS activities,(SELECT snapshot_id FROM central_day.management_current WHERE id=1) AS snapshot",[key]);return r.rows[0];};
 try{
  await require('../lib/day-db').prepare(db);const before=await fingerprint();
  const source={probe:nonce,table:'NEs e liquidação',kind:'ne',values:['2026NE999998','','Empresa fictícia','Teste isolado',100,0,0,100,'','TESTE','Teste','','','','','999999']};
  await require('../lib/day-db').transaction(db,async c=>{await c.query('INSERT INTO central_day.management_sources(key,kind,source_data) VALUES($1,$2,$3)',[key,'ne',source]);await c.query('INSERT INTO central_day.management_manual(key,fields,actor_id) VALUES($1,$2,$3)',[key,{sector:'TESTE'},actor.userId]);});inserted=true;
  let view=await store.readFinancialBook(db,actor,key),settled=false;
  // An in-flight promotion holds exactly the lock used by synchronize().
  lockClient=await db.connect();await lockClient.query('BEGIN');await lockClient.query('SELECT pg_advisory_xact_lock(193371,3)');
  const pending=store.executeFinancialCommand(db,actor,command(view,'reconcile',{includedMovementIds:[]})).then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
  await wait();assert.equal(settled,false,'Financial write must wait for source promotion');source.values[4]=110;source.values[7]=110;await lockClient.query('UPDATE central_day.management_sources SET source_data=$2 WHERE key=$1',[key,source]);await lockClient.query('COMMIT');lockClient.release();lockClient=null;
  assert.equal((await pending).error?.code,'SOURCE_CHANGED','A waiting command must validate the newly promoted source');
  view=await store.readFinancialBook(db,actor,key);await store.executeFinancialCommand(db,actor,command(view,'reconcile',{includedMovementIds:[]}));
  // A transfer row lock must be observed before the event freezes historical sector.
  view=await store.readFinancialBook(db,actor,key);lockClient=await db.connect();await lockClient.query('BEGIN');await lockClient.query('UPDATE central_day.management_manual SET fields=$2 WHERE key=$1',[key,{sector:'TRANSFERIDO'}]);settled=false;
  const transferring=store.executeFinancialCommand(db,actor,command(view,'liquidation',{amountCents:1000,document:'NL-'+nonce,on:'2026-10-28'})).then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
  await wait();assert.equal(settled,false,'Financial event must wait for transfer');await lockClient.query('COMMIT');lockClient.release();lockClient=null;assert.equal((await transferring).value?.state,'confirmed');
  view=await store.readFinancialBook(db,actor,key);assert.equal(view.book.movements[0].sector,'TRANSFERIDO');assert.equal(view.position.availableCents,10000);
  const first=command(view,'cancellation',{amountCents:1000,document:'AN-1-'+nonce,on:'2026-10-28'}),second=command(view,'cancellation',{amountCents:1000,document:'AN-2-'+nonce,on:'2026-10-28'});
  const concurrent=await Promise.allSettled([store.executeFinancialCommand(db,actor,first),store.executeFinancialCommand(db,actor,second)]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
  const winner=concurrent[0].status==='fulfilled'?first:second;assert.equal((await store.findFinancialOperation(db,actor,winner.operationId)).state,'confirmed');
  assert.deepEqual(await fingerprint(),before,'Imported sources, manual fields, current snapshot and activities must remain unchanged');
  console.log('FINANCIAL_POSTGRES_PROBE '+JSON.stringify({verified:true,isolated:true,sourcePromotionLock:true,assignmentLock:true,concurrentVersion:true,idempotentConfirmation:true,officialDataChanged:false}));
 }finally{
  if(lockClient){await lockClient.query('ROLLBACK');lockClient.release();}
  if(inserted)await require('../lib/day-db').transaction(db,async c=>{const row=(await c.query('SELECT source_data FROM central_day.management_sources WHERE key=$1 FOR UPDATE',[key])).rows[0];assert.equal(row?.source_data?.probe,nonce,'Only this probe owns the cleanup target');await c.query('DELETE FROM central_day.financial_events WHERE key=$1',[key]);await c.query('DELETE FROM central_day.financial_operations WHERE key=$1',[key]);await c.query('DELETE FROM central_day.financial_books WHERE key=$1',[key]);await c.query('DELETE FROM central_day.management_manual WHERE key=$1',[key]);await c.query('DELETE FROM central_day.management_sources WHERE key=$1',[key]);});
  await db.end();
 }
 console.log('FINANCIAL_POSTGRES_PROBE_CLEANED');
}
module.exports={checkEnvironment};
if(require.main===module)verify().catch(e=>{console.error('FINANCIAL_POSTGRES_PROBE_FAILED code='+(e.code||e.name||'UNKNOWN')+': publication stopped.');process.exitCode=1;});
