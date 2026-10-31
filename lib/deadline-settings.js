'use strict';
const {fail,closed}=require('./identity'),{transaction}=require('./day-db');
const DEFAULTS=Object.freeze({dispatchDays:5,deliveryDays:30,noticeDays:5,secondNoticeDays:5,paDays:7});
async function read(db){
 const r=(await db.query("SELECT value,version FROM central_day.settings WHERE key='deadlines'")).rows[0];
 return {rules:{...DEFAULTS,...r?.value},version:r?.version||0};
}
async function save(db,actor,input){
 if(!actor?.active||!['admin','manager'].includes(actor.role))fail('Somente gestores podem alterar regras gerais.',403,'FORBIDDEN');
 closed(input,['rules','expectedVersion']);
 if(!input.rules||typeof input.rules!=='object'||Array.isArray(input.rules)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('Regras inválidas.');
 closed(input.rules,Object.keys(DEFAULTS));
 if(!Object.keys(input.rules).length||Object.values(input.rules).some(v=>!Number.isInteger(v)||v<1||v>365))fail('Informe prazos inteiros entre 1 e 365 dias; notificações usam dias úteis.');
 return transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,4)');
  const previous=await read(c);
  if(previous.version!==input.expectedVersion)fail('As regras foram alteradas. Recarregue antes de salvar.',409,'VERSION_CONFLICT');
  const rules={...previous.rules,...input.rules};
  await c.query("INSERT INTO central_day.settings(key,value,actor_id) VALUES('deadlines',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,actor_id=excluded.actor_id,version=central_day.settings.version+1,updated_at=now()",[rules,actor.userId]);
  await c.query('INSERT INTO central_day.management_changes(key,actor_id,kind,before_data,after_data) VALUES($1,$2,$3,$4,$5)',['settings|deadlines',actor.userId,'deadline-rules-edited',previous.rules,rules]);
  return {rules,version:previous.version+1};
 });
}
module.exports={DEFAULTS,read,save};

