'use strict';
const crypto=require('node:crypto'),{transaction}=require('./day-db'),{fail}=require('./identity'),{can}=require('./permissions'),{UUID}=require('./day-schema'),{stable}=require('./budget/primitives'),{sourceCents}=require('./operational-model'),{legacyDate}=require('./legacy-recovery'),model=require('./distribution-model'),{sourceVersion}=require('./distribution-identity');
async function indexWithClient(c){
 const state=(await c.query('SELECT s.payload FROM central_day.management_current c JOIN central_day.management_snapshots s ON s.id=c.snapshot_id WHERE c.id=1')).rows[0]?.payload;if(!state)return;
 for(const row of require('./management-merge').entries(state).filter(r=>r.kind==='distribution'||r.kind==='ne'||r.kind==='process')){
  await c.query("INSERT INTO central_day.management_sources(key,kind,source_data) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING",[row.key,row.kind,{table:row.table,values:row.values,kind:row.kind}]);
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
 return transaction(db,async c=>{if(key==='distribution|local:'+id&&actor?.active&&['admin','manager'].includes(actor.role)&&!(await c.query('SELECT key FROM central_day.management_sources WHERE key=$1',[key])).rows.length)return {state:'not-found-yet',operationId:id};await recordFor(c,actor,key);const found=await previous(c,actor,key,id);return found?{state:'confirmed',operationId:id,version:found.distributionOperationVersion}:{state:'not-found-yet',operationId:id};});
}
async function currentView(c,actor){const snapshot=await require('./management-cache').readWithClient(c);if(!snapshot)fail('Fonte ainda não carregada.',409,'SOURCE_MISSING');return {snapshot,view:require('./budget/source-adapter').projectManagement(require('./management-merge').mergeManagement(snapshot.state,snapshot.manualFields),actor,require('./business-calendar').civilToday())};}
async function createWithClient(c,actor,command,hash){
 const found=await previous(c,actor,command.key,command.operationId);if(found){if(found.distributionCommandHash!==hash)fail('Identificador já usado com outros dados.',409,'OPERATION_CHANGED');return {state:'confirmed',operationId:command.operationId,version:found.distributionOperationVersion};}
 const {snapshot,view}=await currentView(c,actor),nc=view.credits.received.find(r=>r.creditKey===command.ncKey);if(!nc)fail('NC não encontrada ou identidade pendente.',404,'NOT_FOUND');if(nc.sourceVersion!==command.sourceVersion)fail('Os valores da NC mudaram. Atualize antes de distribuir.',409,'SOURCE_CHANGED');if(!nc.canDistribute||command.amountCents>nc.freeToDistributeCents)fail('O valor supera o saldo livre para distribuir desta NC.',409,'EXCESS_DISTRIBUTION');
 const directory=await require('./management-directory').load(c,snapshot,actor);if(command.sector&&!directory.sectors.includes(command.sector))fail('Escolha um setor cadastrado.');if(command.owner&&!directory.owners.includes(command.owner))fail('Escolha um responsável cadastrado.');
 require('./management-directory').check(directory,command);if(!directory.processTypes.includes(command.processType))fail('Escolha um tipo de processo válido.');
 const date=require('./business-calendar').civilToday(),value=(BigInt(command.amountCents)/100n).toString()+','+(BigInt(command.amountCents)%100n).toString().padStart(2,'0');if(sourceCents(value)!==command.amountCents)fail('Valor excede precisão suportada.');
 const values=[date,nc.number,command.sector,command.owner,value,command.subject||command.processType,'Aguardando requisição',nc.availableCents/100,nc.committedCents/100,'Entregar requisição',nc.ug,'local:'+command.operationId],data={local:true,table:'Distribuições locais',kind:'distribution',values,ncKey:nc.creditKey,processType:command.processType,createdBy:actor.userId},fields={sector:command.sector,owner:command.owner,processType:command.processType,phase:command.phase||'',creditKey:nc.creditKey,nextAction:'Entregar requisição'};
 await c.query("INSERT INTO central_day.management_sources(key,kind,source_data) VALUES($1,'distribution',$2)",[command.key,data]);await c.query('INSERT INTO central_day.management_manual(key,fields,actor_id) VALUES($1,$2,$3)',[command.key,fields,actor.userId]);await c.query('INSERT INTO central_day.management_changes(key,actor_id,kind,after_data) VALUES($1,$2,$3,$4)',[command.key,actor.userId,command.action,{...fields,distributionOperationId:command.operationId,distributionCommandHash:hash,distributionOperationVersion:1,distributionNote:command.note,distributionActor:actor.name||actor.userId}]);return {state:'confirmed',operationId:command.operationId,version:1};
}
async function execute(db,actor,input){
 if(!actor?.active||!actor.userId||!['admin','manager'].includes(actor.role))fail('Apenas administrador ou gestor pode confirmar etapas da distribuição.',403,'FORBIDDEN');
 const command=model.validate(input),hash=crypto.createHash('sha256').update(stable(command)).digest('hex');
 return transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,3)');await indexWithClient(c);if(command.action==='distribution-create')return createWithClient(c,actor,command,hash);const row=await recordFor(c,actor,command.key,true),found=await previous(c,actor,command.key,command.operationId);
  if(found){if(found.distributionCommandHash!==hash)fail('Identificador já usado com outros dados.',409,'OPERATION_CHANGED');return {state:'confirmed',operationId:command.operationId,version:found.distributionOperationVersion};}
  if(!row.present||!['Distribuições detalhadas','Distribuições locais'].includes(row.source_data.table))fail('A distribuição está ausente da última fonte. Histórico preservado para conferência.',409,'SOURCE_MISSING');
  if(row.version!==command.expectedVersion)fail('Este lançamento foi alterado. Atualize antes de confirmar.',409,'VERSION_CONFLICT');
  const v=row.source_data.values||[];if(sourceVersion(v)!==command.sourceVersion)fail('A fonte mudou. Atualize e confira o lançamento.',409,'SOURCE_CHANGED');
  const fields=model.apply(baseFor(v),row.fields,command,actor),version=row.version+1;if(command.action==='distribution-edit'){const {snapshot}=await currentView(c,actor),directory=await require('./management-directory').load(c,snapshot,actor);require('./management-directory').check(directory,Object.fromEntries(Object.entries(command.fields).filter(([k])=>['phase','processType'].includes(k))));}
  if(command.action==='distribution-edit'&&model.position(baseFor(v),fields.distributionProgress).amountCents>model.position(baseFor(v),row.fields.distributionProgress).amountCents){const {view}=await currentView(c,actor),dist=view.distributions.find(r=>r.id===command.key),nc=view.credits.received.find(r=>r.creditKey===dist?.creditKey),extra=model.position(baseFor(v),fields.distributionProgress).amountCents-model.position(baseFor(v),row.fields.distributionProgress).amountCents;if(!nc||!nc.canDistribute||extra>nc.freeToDistributeCents)fail('O aumento supera o saldo livre da NC.',409,'EXCESS_DISTRIBUTION');}
  await c.query('UPDATE central_day.management_manual SET fields=$2,version=version+1,actor_id=$3,updated_at=now() WHERE key=$1',[command.key,fields,actor.userId]);
  await c.query('INSERT INTO central_day.management_changes(key,actor_id,kind,before_data,after_data) VALUES($1,$2,$3,$4,$5)',[command.key,actor.userId,command.action,row.fields,{...fields,distributionOperationId:command.operationId,distributionCommandHash:hash,distributionOperationVersion:version,distributionNote:command.note,distributionActor:actor.name||actor.userId}]);
  return {state:'confirmed',operationId:command.operationId,version};
 });
}
module.exports={prepareSources,execute,findOperation,baseFor,createWithClient,indexWithClient,currentView};
