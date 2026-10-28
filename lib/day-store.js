'use strict';
const crypto=require('node:crypto');const {transaction}=require('./day-db'),{fail}=require('./identity'),{can,scope}=require('./permissions'),{validate,stable,UUID}=require('./day-schema');
const date=v=>v instanceof Date?v.toISOString().slice(0,10):v;
const instant=v=>v instanceof Date?v.toISOString():v;
function activity(r){return {id:r.id,sourceKey:r.source_key,source:r.source,rule:r.rule,ruleVersion:r.rule_version,subject:r.subject,reference:r.reference,ug:r.ug,exercise:r.exercise,sector:r.sector,assigneeId:r.assignee_id,priority:r.priority,dueOn:date(r.due_on),state:r.state,nextAction:r.next_action,issues:r.issues,version:r.version,createdAt:instant(r.created_at),updatedAt:instant(r.updated_at)};}
async function getActivity(db,actor,id,lock=false){
 const sc=scope(actor,'a',2),r=(await db.query(`SELECT a.* FROM central_day.activities a WHERE a.id=$1 AND ${sc.sql}${lock?' FOR UPDATE':''}`,[id,...sc.params])).rows[0];
 if(!r)fail('Atividade não encontrada ou fora do seu acesso.',404,'NOT_FOUND');return activity(r);
}
async function readDayState(db,actor,{view='day',sector,offset=0,includeCompleted=false}={}){
 if(!['day','mine','sector','all'].includes(view)||!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('Filtro inválido.');
 const sc=scope(actor),params=[...sc.params],clauses=[sc.sql];
 if(!includeCompleted)clauses.push("a.state <> 'completed'");
 if(view==='mine'){params.push(actor.userId);clauses.push('a.assignee_id=$'+params.length);}
 if(sector){params.push(sector);clauses.push('a.sector=$'+params.length);}
 if(view==='sector'&&!sector)fail('Escolha o setor.');
 params.push(offset);
 const rows=(await db.query(`SELECT a.* FROM central_day.activities a WHERE ${clauses.join(' AND ')} ORDER BY a.priority,a.due_on NULLS LAST,a.created_at,a.id LIMIT 101 OFFSET $${params.length}`,params)).rows;
 return {activities:rows.slice(0,100).map(activity),nextOffset:rows.length>100?offset+100:null,readAt:new Date().toISOString(),source:'Neon — acompanhamento; referências financeiras preservadas'};
}
async function history(db,actor,id,offset=0){
 await getActivity(db,actor,id);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('Página inválida.');
 const rows=(await db.query('SELECT id,operation_id,actor_id,actor_name,sector,assignee_id,action,note,before_data,after_data,at FROM central_day.events WHERE activity_id=$1 ORDER BY at DESC,id DESC LIMIT 101 OFFSET $2',[id,offset])).rows;
 return {events:rows.slice(0,100).map(e=>({...e,at:instant(e.at)})),nextOffset:rows.length>100?offset+100:null};
}
async function findDayOperation(db,actor,id){
 if(typeof id!=='string'||!UUID.test(id))fail('Identificador inválido.');
 const op=(await db.query('SELECT * FROM central_day.operations WHERE id=$1 AND actor_id=$2',[id,actor.userId])).rows[0];
 if(!op)return {operationId:id,state:'not-found-yet'};
 if(op.activity_id){try{await getActivity(db,actor,op.activity_id);}catch(e){if(e.status===404)return {operationId:id,state:'not-found-yet'};throw e;}}
 return op.result;
}
async function executeDayCommand(db,actor,input){
 const c=validate(input),hash=crypto.createHash('sha256').update(stable(c)).digest('hex');
 return transaction(db,async q=>{
  await q.query("INSERT INTO central_day.operations(id,actor_id,command_hash,result) VALUES($1,$2,$3,'{}') ON CONFLICT(id) DO NOTHING",[c.operationId,actor.userId,hash]);
  const op=(await q.query('SELECT * FROM central_day.operations WHERE id=$1 FOR UPDATE',[c.operationId])).rows[0];
  if(op.actor_id!==actor.userId)fail('Operação não encontrada.',404,'NOT_FOUND');
  if(op.command_hash!==hash)fail('Identificador já usado com outro conteúdo.',409,'OPERATION_CHANGED');
  if(op.result.state==='confirmed'){await getActivity(q,actor,op.activity_id);return op.result;}
  let before=null,after;
  if(c.action==='create'){
   if(!can(actor,'create',{sector:c.sector}))fail('Você não pode criar atividades neste setor.',403,'FORBIDDEN');
   const id=crypto.randomUUID();
   const r=await q.query("INSERT INTO central_day.activities(id,source_key,source,rule,rule_version,subject,reference,sector,due_on,next_action) VALUES($1,$2,$3,'manual',1,$4,$5,$6,$7,$8) RETURNING *",[id,'manual:'+c.operationId,JSON.stringify({type:'manual',actorId:actor.userId}),c.subject,c.reference,c.sector,c.dueOn||null,c.nextAction||'']);after=activity(r.rows[0]);
  }else{
   before=await getActivity(q,actor,c.id,true);
   if(!can(actor,c.action==='assign'?'assign':'respond',before))fail('Você não pode alterar esta atividade.',403,'FORBIDDEN');
   if(before.version!==c.version)fail('A atividade mudou. Recarregue antes de responder.',409,'VERSION_CONFLICT');
   if(before.state==='completed'&&c.action!=='reopen')fail('Reabra a atividade antes de alterá-la.',409,'ACTIVITY_COMPLETED');
   if(c.action==='reopen'&&before.state!=='completed')fail('A atividade já está aberta.',409,'ALREADY_OPEN');
   const states={charge:'waiting',partial:'in-progress',wait:'waiting',progress:'in-progress',complete:'completed',reopen:'open',assign:before.state};
   after={...before,state:states[c.action],version:before.version+1};
   if(c.action==='assign'){
    if(!can(actor,'assign',{sector:c.sector}))fail('Setor de destino fora do seu acesso.',403,'FORBIDDEN');
    if(c.assigneeId){const p=(await q.query('SELECT * FROM central_day.profiles WHERE user_id=$1',[c.assigneeId])).rows[0];if(!p?.active||!p.sectors.includes(c.sector))fail('Responsável não está ativo no setor escolhido.');}
    after.sector=c.sector;after.assigneeId=c.assigneeId;
   }
   if(Object.hasOwn(c,'nextAction'))after.nextAction=c.nextAction;
   if(Object.hasOwn(c,'dueOn'))after.dueOn=c.dueOn;
   const r=await q.query('UPDATE central_day.activities SET state=$2,next_action=$3,due_on=$4,sector=$5,assignee_id=$6,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[after.id,after.state,after.nextAction,after.dueOn,after.sector,after.assigneeId]);after=activity(r.rows[0]);
  }
  // Historical assignment is frozen at the event. A transfer belongs to the old scope.
  const assignment=before||after;
  await q.query('INSERT INTO central_day.events(id,operation_id,activity_id,actor_id,actor_name,sector,assignee_id,action,note,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[crypto.randomUUID(),c.operationId,after.id,actor.userId,actor.name,assignment.sector,assignment.assigneeId,c.action,c.note,before?JSON.stringify(before):null,JSON.stringify(after)]);
  const result={operationId:c.operationId,state:'confirmed',activity:after};
  await q.query('UPDATE central_day.operations SET activity_id=$2,result=$3 WHERE id=$1',[c.operationId,after.id,JSON.stringify(result)]);return result;
 });
}
module.exports={activity,getActivity,readDayState,history,findDayOperation,executeDayCommand};
