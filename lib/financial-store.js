'use strict';
const crypto=require('node:crypto');
const {transaction}=require('./day-db'),{fail}=require('./identity'),{can}=require('./permissions'),{UUID}=require('./day-schema');
const {stable}=require('./budget/primitives'),{sourceCents}=require('./operational-model'),ledger=require('./financial-ledger');
function checkKey(key){if(typeof key!=='string'||!/^ne\|\d{6}\|20\d{2}\|20\d{2}NE\d{6}$/.test(key))fail('Identidade do empenho inválida.');}
async function sourceFor(client,actor,key,lock=false){
 checkKey(key);
 const row=(await client.query('SELECT s.kind,s.source_data,s.present,m.fields FROM central_day.management_sources s JOIN central_day.management_manual m ON m.key=s.key WHERE s.key=$1'+(lock?' FOR SHARE OF m':''),[key])).rows[0];
 if(!row||!can(actor,'read',{sector:row.fields.sector||''}))fail('Empenho não encontrado ou fora do seu acesso.',404,'NOT_FOUND');
 const current=(await client.query('SELECT s.payload->>\'sourceDate\' AS source_date FROM central_day.management_current c JOIN central_day.management_snapshots s ON s.id=c.snapshot_id WHERE c.id=1')).rows[0];
 const v=row.source_data?.values||[];
 const record={id:key,number:String(v[0]),ug:String(v[15]||''),year:+String(v[0]).slice(0,4),sector:row.fields.sector||'',committedCents:sourceCents(v[4]),liquidatedCents:sourceCents(v[5]),cancelledCents:sourceCents(v[6]),remainingCents:sourceCents(v[7]),source:{sourceDate:current?.source_date}};
 const source=ledger.sourceReference(record);
 if(!row.present||row.kind!=='ne'||row.source_data.table!=='NEs e liquidação')source.valid=false;
 return {source,present:row.present};
}
async function bookFor(client,key){return (await client.query('SELECT state FROM central_day.financial_books WHERE key=$1',[key])).rows[0]?.state||ledger.emptyBook();}
async function readFinancialBook(db,actor,key,offset=0){
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('Página de histórico inválida.');
 return transaction(db,async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  const {source,present}=await sourceFor(c,actor,key),book=await bookFor(c,key);
  const rows=(await c.query('SELECT id,actor_id,actor_name,sector,action,note,command,at FROM central_day.financial_events WHERE key=$1 ORDER BY id DESC LIMIT 51 OFFSET $2',[key,offset])).rows;
  const events=rows.slice(0,50).map(r=>({id:String(r.id),actorId:r.actor_id,actorName:r.actor_name,sector:r.sector,action:r.action,note:r.note,command:r.command,at:new Date(r.at).toISOString()}));
  return {source,present,book,position:ledger.financialPosition(book,source),events,nextOffset:rows.length>50?offset+50:null,canWrite:actor?.active===true&&['admin','manager'].includes(actor.role)};
 });
}
async function findFinancialOperation(db,actor,id){
 if(typeof id!=='string'||!UUID.test(id))fail('Identificador de operação inválido.');
 return transaction(db,async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  const r=(await c.query('SELECT key,result FROM central_day.financial_operations WHERE id=$1 AND actor_id=$2',[id,actor?.userId||''])).rows[0];
  if(!r)return {operationId:id,state:'not-found-yet'};
  try{await sourceFor(c,actor,r.key);}catch(e){if(e.status===404)return {operationId:id,state:'not-found-yet'};throw e;}
  return r.result;
 });
}
async function executeFinancialCommand(db,actor,input){
 if(!actor?.active||!actor.userId||!['admin','manager'].includes(actor.role))fail('Apenas administrador ou gestor pode registrar movimentos financeiros.',403,'FORBIDDEN');
 const command=ledger.validateCommand(input),commandHash=crypto.createHash('sha256').update(stable(command)).digest('hex');
 return transaction(db,async c=>{
  // Same lock as sync: a source promotion cannot interleave with a financial write.
  await c.query('SELECT pg_advisory_xact_lock(193371,3)');
  const {source}=await sourceFor(c,actor,command.key,true);
  const previous=(await c.query('SELECT actor_id,command_hash,result FROM central_day.financial_operations WHERE id=$1',[command.operationId])).rows[0];
  if(previous){if(previous.actor_id!==actor.userId)fail('Operação não encontrada.',404,'NOT_FOUND');if(previous.command_hash!==commandHash)fail('Identificador já usado com outro conteúdo.',409,'OPERATION_CHANGED');return previous.result;}
  const before=await bookFor(c,command.key),at=new Date().toISOString(),after=ledger.applyFinancialCommand(before,source,command,actor,at),position=ledger.financialPosition(after,source);
  const result={operationId:command.operationId,state:'confirmed',version:after.version,position};
  await c.query('INSERT INTO central_day.financial_operations(id,key,actor_id,command_hash,result) VALUES($1,$2,$3,$4,$5)',[command.operationId,command.key,actor.userId,commandHash,result]);
  await c.query('INSERT INTO central_day.financial_books(key,version,state) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET version=excluded.version,state=excluded.state,updated_at=now()',[command.key,after.version,after]);
  await c.query('INSERT INTO central_day.financial_events(operation_id,key,actor_id,actor_name,sector,action,note,command,before_data,after_data,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[command.operationId,command.key,actor.userId,actor.name||actor.userId,source.sector,command.action,command.note,command,before,after,at]);
  return result;
 });
}
module.exports={readFinancialBook,findFinancialOperation,executeFinancialCommand};
