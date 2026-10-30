'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{transaction}=require('./day-db'),{fail,closed}=require('./identity'),{can}=require('./permissions');
const {entries,importedFields,FIELDS}=require('./management-merge'),{stable}=require('./budget/primitives'),{projectManagement}=require('./budget/source-adapter');
const hash=x=>crypto.createHash('sha256').update(stable(x)).digest('hex');
const system={userId:'system-sync',role:'admin',active:true,sectors:[]};
async function prepareManagement(db){for(const file of ['003-management-sync.sql','004-deadline-settings.sql','005-financial-ledger.sql']){const sql=fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8');if(db.exec)await db.exec(sql);else await db.query(sql);}}
async function readSnapshot(db){return transaction(db,async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');return readWithClient(c);});}
async function readWithClient(db){const r=(await db.query('SELECT s.payload,c.updated_at,c.run_id FROM central_day.management_current c JOIN central_day.management_snapshots s ON s.id=c.snapshot_id WHERE c.id=1')).rows[0];if(!r)return null;
 const manualFields={};for(const m of(await db.query('SELECT key,fields,version FROM central_day.management_manual')).rows)manualFields[m.key]={fields:m.fields,version:m.version};
 const missingRecords=(await db.query('SELECT key,kind,source_data,last_seen FROM central_day.management_sources WHERE present=false')).rows;
 const lastAttempt=(await db.query('SELECT status,error_code,started_at,finished_at FROM central_day.management_runs ORDER BY started_at DESC LIMIT 1')).rows[0]||null;
 return {state:r.payload,updatedAt:new Date(r.updated_at).toISOString(),runId:r.run_id,manualFields,missingRecords,lastAttempt};}
async function commitWithClient(c,state,{actorId,runId}){
 projectManagement(state,system,new Date().toISOString().slice(0,10));const rows=entries(state),{context,...payload}=state;
 const previous=(await c.query('SELECT key,kind,source_data,present FROM central_day.management_sources')).rows,old=new Map(previous.map(r=>[r.key,r]));const counts={inserted:0,changed:0,missing:0};
 for(const r of rows){const data={table:r.table,values:r.values,kind:r.kind},before=old.get(r.key),changed=!before||!before.present||stable(before.source_data)!==stable(data);
  if(!r.table&&before?.source_data?.table){if(before.present){counts.missing++;await c.query('UPDATE central_day.management_sources SET present=false WHERE key=$1',[r.key]);await c.query('INSERT INTO central_day.management_changes(run_id,key,actor_id,kind,before_data) VALUES($1,$2,$3,$4,$5)',[runId,r.key,actorId,'missing-from-source',before.source_data]);}old.delete(r.key);continue;}
  if(changed){counts[before?'changed':'inserted']++;await c.query('INSERT INTO central_day.management_changes(run_id,key,actor_id,kind,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)',[runId,r.key,actorId,before?'source-updated':'source-added',before?.source_data||null,data]);}
  await c.query('INSERT INTO central_day.management_sources(key,kind,source_data) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET source_data=excluded.source_data,present=true,last_seen=now()',[r.key,r.kind,data]);
  await c.query('INSERT INTO central_day.management_manual(key,fields,actor_id) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING',[r.key,importedFields(state,r.key,r.manual),'initial-import']);old.delete(r.key);
 }
 for(const r of old.values())if(r.present){counts.missing++;await c.query('UPDATE central_day.management_sources SET present=false WHERE key=$1',[r.key]);await c.query('INSERT INTO central_day.management_changes(run_id,key,actor_id,kind,before_data) VALUES($1,$2,$3,$4,$5)',[runId,r.key,actorId,'missing-from-source',r.source_data]);}
 const contentHash=hash({...payload,readAt:null});const existing=(await c.query('SELECT id FROM central_day.management_snapshots WHERE content_hash=$1 ORDER BY created_at DESC LIMIT 1',[contentHash])).rows[0];
 const snapshotId=existing?.id||runId;if(!existing)await c.query('INSERT INTO central_day.management_snapshots(id,payload,content_hash) VALUES($1,$2,$3)',[snapshotId,payload,contentHash]);
 await c.query('INSERT INTO central_day.management_current(id,snapshot_id,run_id) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET snapshot_id=excluded.snapshot_id,run_id=excluded.run_id,updated_at=now()',[snapshotId,runId]);return counts;
}
async function commitSnapshot(db,state,meta){return transaction(db,c=>commitWithClient(c,state,meta));}
async function saveManualFields(db,actor,input){closed(input,['key','expectedVersion','fields']);if(typeof input.key!=='string'||!Number.isInteger(input.expectedVersion)||!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields))fail('Edição inválida.');closed(input.fields,FIELDS);for(const key of ['dueOn','sentToSupplierOn','deliveryDueOn','firstNotifiedOn','secondNotifiedOn','paOpenedOn'])if(Object.hasOwn(input.fields,key)&&input.fields[key]!==''&&!require('./day-schema').date(input.fields[key]))fail('Data ou prazo inválido.');if(Object.entries(input.fields).some(([f,v])=>typeof v!=='string'||v.length>(f==='observation'?12000:1000)))fail('Campo inválido.');
 return transaction(db,async c=>{const r=(await c.query('SELECT m.*,s.source_data,s.present FROM central_day.management_manual m JOIN central_day.management_sources s ON s.key=m.key WHERE m.key=$1 FOR UPDATE OF m',[input.key])).rows[0];const sector=r?.fields?.sector||'';if(!r||!can(actor,'read',{sector}))fail('Registro não encontrado.',404,'NOT_FOUND');
  const global=['admin','manager'].includes(actor.role);if(!global&&Object.keys(input.fields).some(f=>!['observation','nextAction'].includes(f)))fail('Permissão insuficiente para alterar atribuição.',403,'FORBIDDEN');if(r.version!==input.expectedVersion)fail('Registro atualizado por outra pessoa. Recarregue.',409,'VERSION_CONFLICT');
  const fields={...r.fields,...input.fields};await c.query('UPDATE central_day.management_manual SET fields=$2,version=version+1,actor_id=$3,updated_at=now() WHERE key=$1',[input.key,fields,actor.userId]);await c.query('INSERT INTO central_day.management_changes(key,actor_id,kind,before_data,after_data) VALUES($1,$2,$3,$4,$5)',[input.key,actor.userId,'manual-edited',r.fields,fields]);return {version:r.version+1,fields};});}
module.exports={prepareManagement,readSnapshot,commitSnapshot,commitWithClient,saveManualFields};

