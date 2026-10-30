'use strict';
const crypto=require('node:crypto'),{transaction}=require('./day-db'),{fail}=require('./identity'),{can}=require('./permissions'),{UUID}=require('./day-schema'),{stable}=require('./budget/primitives'),{sourceCents}=require('./operational-model'),{legacyDate}=require('./legacy-recovery'),model=require('./distribution-model'),{sourceVersion}=require('./distribution-identity');
async function indexWithClient(c){
 const state=(await c.query('SELECT s.payload FROM central_day.management_current c JOIN central_day.management_snapshots s ON s.id=c.snapshot_id WHERE c.id=1')).rows[0]?.payload;if(!state)return;
 for(const row of require('./management-merge').entries(state).filter(r=>r.kind==='distribution')){
  await c.query("INSERT INTO central_day.management_sources(key,kind,source_data) VALUES($1,'distribution',$2) ON CONFLICT(key) DO NOTHING",[row.key,{table:row.table,values:row.values,kind:row.kind}]);
  await c.query("INSERT INTO central_day.management_manual(key,fields,actor_id) VALUES($1,$2,'initial-distribution-index') ON CONFLICT(key) DO NOTHING",[row.key,row.manual]);
 }
}
async function prepareSources(db){return transaction(db,async c=>{await c.query('SELECT pg_advisory_xact_lock(193371,3)');await indexWithClient(c);});}
function baseFor(v){return {amountCents:sourceCents(v[4]),distributedOn:legacyDate(v[0],'distributedOn',[])};}
async function recordFor(c,actor,key,lock=false){
 const r=(await c.query('SELECT m.fields,m.version,s.kind,s.source_data,s.present FROM central_day.management_manual m JOIN central_day.management_sources s ON s.key=m.key WHERE m.key=$1'+(lock?' FOR UPDATE OF m':''),[key])).rows[0];
 if(!r||r.kind!=='distribution'||!can(actor,'read',{sector:r.fields.sector||''}))fail('Distribuição não encontrada ou fora do seu setor.',404,'NOT_FOUND');return r;
}
async function previous(c,actor,key,id){const r=(await c.query("SELECT actor_id,after_data FROM central_day.management_changes WHERE key=$1 AND after_data->>'distributionOperationId'=$2 ORDER BY id DESC LIMIT 1",[key,id])).rows[0];if(r&&r.actor_id!==actor.userId)fail('Operação não encontrada.',404,'NOT_FOUND');return r?.after_data;}
async function findOperation(db,actor,key,id){
 if(typeof key!=='string'||!key.startsWith('distribution|')||typeof id!=='string'||!UUID.test(id))fail('Consulta inválida.');
 return transaction(db,async c=>{await recordFor(c,actor,key);const found=await previous(c,actor,key,id);return found?{state:'confirmed',operationId:id,version:found.distributionOperationVersion}:{state:'not-found-yet',operationId:id};});
}
async function execute(db,actor,input){
 if(!actor?.active||!actor.userId||!['admin','manager'].includes(actor.role))fail('Apenas administrador ou gestor pode confirmar etapas da distribuição.',403,'FORBIDDEN');
 const command=model.validate(input),hash=crypto.createHash('sha256').update(stable(command)).digest('hex');
 return transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,3)');await indexWithClient(c);const row=await recordFor(c,actor,command.key,true),found=await previous(c,actor,command.key,command.operationId);
  if(found){if(found.distributionCommandHash!==hash)fail('Identificador já usado com outros dados.',409,'OPERATION_CHANGED');return {state:'confirmed',operationId:command.operationId,version:found.distributionOperationVersion};}
  if(!row.present||row.source_data.table!=='Distribuições detalhadas')fail('A distribuição está ausente da última fonte. Histórico preservado para conferência.',409,'SOURCE_MISSING');
  if(row.version!==command.expectedVersion)fail('Este lançamento foi alterado. Atualize antes de confirmar.',409,'VERSION_CONFLICT');
  const v=row.source_data.values||[];if(sourceVersion(v)!==command.sourceVersion)fail('A fonte mudou. Atualize e confira o lançamento.',409,'SOURCE_CHANGED');
  const fields=model.apply(baseFor(v),row.fields,command,actor),version=row.version+1;
  await c.query('UPDATE central_day.management_manual SET fields=$2,version=version+1,actor_id=$3,updated_at=now() WHERE key=$1',[command.key,fields,actor.userId]);
  await c.query('INSERT INTO central_day.management_changes(key,actor_id,kind,before_data,after_data) VALUES($1,$2,$3,$4,$5)',[command.key,actor.userId,command.action,row.fields,{...fields,distributionOperationId:command.operationId,distributionCommandHash:hash,distributionOperationVersion:version,distributionNote:command.note,distributionActor:actor.name||actor.userId}]);
  return {state:'confirmed',operationId:command.operationId,version};
 });
}
module.exports={prepareSources,execute,findOperation,baseFor};
