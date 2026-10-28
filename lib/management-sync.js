'use strict';
const crypto=require('crypto'),{transaction}=require('./day-db'),{commitWithClient}=require('./management-cache'),{fail}=require('./identity');
async function loadGoogleState(){const google=require('./google-sheets'),management=require('./management-store');return management.readManagementState(management.createManagementContext(await google.accessToken()));}
async function synchronize(db,{actorId,trigger,loadState=loadGoogleState}){
 const runId=crypto.randomUUID(),started=new Date().toISOString();
 try{return await transaction(db,async c=>{
  const locked=(await c.query('SELECT pg_try_advisory_xact_lock(193371,3) AS locked')).rows[0]?.locked;if(!locked)return {state:'busy'};
  const source=await loadState(),counts=await commitWithClient(c,source,{actorId,runId});const state=counts.inserted||counts.changed||counts.missing?'updated':'unchanged';
  await c.query('INSERT INTO central_day.management_runs(id,trigger,actor_id,started_at,finished_at,status,counts) VALUES($1,$2,$3,$4,now(),$5,$6)',[runId,trigger,actorId,started,state,counts]);
  return {state,updatedAt:new Date().toISOString(),counts};
 });}catch(e){try{await db.query('INSERT INTO central_day.management_runs(id,trigger,actor_id,started_at,finished_at,status,error_code) VALUES($1,$2,$3,$4,now(),$5,$6)',[runId,trigger,actorId,started,'failed','SYNC_FAILED']);}catch{}fail('Não foi possível atualizar. A última versão e seus preenchimentos foram preservados.',503,'SYNC_FAILED');}
}
module.exports={synchronize,loadGoogleState};
