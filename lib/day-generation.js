'use strict';
const crypto=require('node:crypto'),{transaction}=require('./day-db'),{can}=require('./permissions'),{fail}=require('./identity'),{UUID}=require('./day-schema');
async function generateActivities(db,actor,candidates,operationId){
 if(typeof operationId!=='string'||!UUID.test(operationId)||!Array.isArray(candidates)||candidates.length>5000)fail('Geração excede o limite seguro ou identificador inválido.');
 if(!['admin','manager','sector-lead'].includes(actor.role)||!actor.active)fail('Você não pode gerar atividades.',403,'FORBIDDEN');
 return transaction(db,async q=>{
  const hash='generation-v1';
  await q.query("INSERT INTO central_day.operations(id,actor_id,command_hash,result) VALUES($1,$2,$3,'{}') ON CONFLICT(id) DO NOTHING",[operationId,actor.userId,hash]);
  const op=(await q.query('SELECT * FROM central_day.operations WHERE id=$1 FOR UPDATE',[operationId])).rows[0];
  if(op.actor_id!==actor.userId)fail('Operação não encontrada.',404,'NOT_FOUND');if(op.command_hash!==hash)fail('Identificador já usado.',409,'OPERATION_CHANGED');if(op.result.state==='confirmed')return op.result;
  let generated=0,existing=0,outOfScope=0;
  for(const c of candidates){
   if(!can(actor,'generate',c)){outOfScope++;continue;}
   if(JSON.stringify(c.source).length>150000)fail('Origem excede o limite seguro. Nenhum texto foi cortado.',413,'SOURCE_LIMIT');
   const id=crypto.randomUUID();
   const r=await q.query("INSERT INTO central_day.activities(id,source_key,source,rule,rule_version,subject,reference,ug,exercise,sector,priority,due_on,next_action,issues) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(source_key) DO NOTHING RETURNING *",[id,c.sourceKey,JSON.stringify(c.source),c.rule,c.ruleVersion,c.subject,c.reference,c.ug,c.exercise,c.sector,c.priority,c.dueOn,c.nextAction,JSON.stringify(c.issues)]);
   if(!r.rows.length){existing++;continue;}generated++;
   const after=require('./day-store').activity(r.rows[0]);
   await q.query("INSERT INTO central_day.events(id,operation_id,activity_id,actor_id,actor_name,sector,assignee_id,action,note,after_data) VALUES($1,$2,$3,$4,$5,$6,NULL,'generated','Atividade gerada por consulta; fonte preservada.',$7)",[crypto.randomUUID(),crypto.randomUUID(),id,actor.userId,actor.name,c.sector,JSON.stringify(after)]);
  }
  const result={operationId,state:'confirmed',generated,existing,outOfScope};await q.query('UPDATE central_day.operations SET result=$2 WHERE id=$1',[operationId,JSON.stringify(result)]);return result;
 });
}
module.exports={generateActivities};
