'use strict';
const {fail,closed}=require('./identity'),{transaction}=require('./day-db');
const KEYS=Object.freeze(['panel','commitments','credits','distribution','processes','proposals','catalog','goals','contracts']);
async function read(db){
 const r=(await db.query("SELECT value,version FROM central_day.settings WHERE key='area-order'")).rows[0];
 const saved=Array.isArray(r?.value)?r.value.filter(k=>KEYS.includes(k)):[];
 return {order:[...new Set([...saved,...KEYS])],version:r?.version||0};
}
async function save(db,actor,input){
 if(!actor?.active||!['admin','manager'].includes(actor.role))fail('Somente gestores podem alterar a sequência das áreas.',403,'FORBIDDEN');
 closed(input,['order','expectedVersion']);
 if(!Array.isArray(input.order)||input.order.length!==KEYS.length||new Set(input.order).size!==KEYS.length||input.order.some(k=>!KEYS.includes(k))||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('Sequência inválida.');
 return transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,5)');
  const previous=await read(c);
  if(previous.version!==input.expectedVersion)fail('A sequência foi alterada. Recarregue antes de salvar.',409,'VERSION_CONFLICT');
  await c.query("INSERT INTO central_day.settings(key,value,actor_id) VALUES('area-order',$1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,actor_id=excluded.actor_id,version=central_day.settings.version+1,updated_at=now()",[input.order,actor.userId]);
  await c.query('INSERT INTO central_day.management_changes(key,actor_id,kind,before_data,after_data) VALUES($1,$2,$3,$4,$5)',['settings|area-order',actor.userId,'area-order-edited',previous.order,input.order]);
  return {order:input.order,version:previous.version+1};
 });
}
module.exports={KEYS,read,save};
