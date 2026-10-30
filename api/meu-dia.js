'use strict';
const identity=require('../lib/identity'),dbModule=require('../lib/day-db'),store=require('../lib/day-store'),sources=require('../lib/day-sources'),rules=require('../lib/day-rules'),generation=require('../lib/day-generation'),reports=require('../lib/day-reports');
const {can}=require('../lib/permissions'),{UUID,date}=require('../lib/day-schema');
function createHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido.'});
  if(req.method==='POST')identity.requireSameOrigin(req);
  const query=req.query||{};identity.closed(query,['view','sector','offset','completed','id','operationId','report','date','calendar','directory']);
  const db=(deps.getDB||dbModule.getDB)(),actor=await(deps.getIdentity||identity.getIdentity)(req,res,db);
  if(!actor)identity.fail('Entre com seu usuário individual.',401,'UNAUTHORIZED');
  if(req.method==='GET'){
   for(const v of Object.values(query))if(typeof v!=='string')identity.fail('Filtro inválido.');
   const offset=query.offset===undefined?0:Number(query.offset);if(!Number.isSafeInteger(offset)||offset<0)identity.fail('Página inválida.');
   if(query.id){if(!UUID.test(query.id))identity.fail('Identificador inválido.');return res.status(200).json({activity:await store.getActivity(db,actor,query.id),...await store.history(db,actor,query.id,offset)});}
   if(query.operationId)return res.status(200).json(await store.findDayOperation(db,actor,query.operationId));
   if(query.report)return res.status(200).json(await reports.report(db,actor,query.report,query.date,query.sector));
   if(query.calendar==='1')return res.status(200).json({calendar:(await db.query('SELECT day::text,kind,label FROM central_day.calendar ORDER BY day LIMIT 10000')).rows,notice:'Os prazos consideram fins de semana e os feriados/dias sem expediente cadastrados. Confira a cobertura do período.'});
   if(query.directory==='1'){
    const global=['admin','manager'].includes(actor.role);const people=(await db.query(`SELECT user_id,name,sectors FROM central_day.profiles WHERE active AND ${global?'TRUE':'sectors && $1::text[]'} ORDER BY name LIMIT 1000`,global?[]:[actor.sectors])).rows;
    const sectors=(await db.query(`SELECT DISTINCT sector FROM central_day.activities WHERE sector IS NOT NULL ${global?'':'AND sector=ANY($1::text[])'} ORDER BY sector`,global?[]:[actor.sectors])).rows.map(r=>r.sector);
    return res.status(200).json({people,sectors:[...new Set([...sectors,...actor.sectors])]});
   }
   return res.status(200).json(await store.readDayState(db,actor,{view:query.view,sector:query.sector,offset,includeCompleted:query.completed==='1'}));
  }
  const body=identity.readBody(req);
  if(body.action==='generate'){
   identity.closed(body,['action','operationId']);if(typeof body.operationId!=='string'||!UUID.test(body.operationId))identity.fail('Identificador inválido.');
   if(!['admin','manager','sector-lead'].includes(actor.role))identity.fail('Você não pode gerar atividades.',403,'FORBIDDEN');
   const old=(await db.query('SELECT command_hash FROM central_day.operations WHERE id=$1 AND actor_id=$2',[body.operationId,actor.userId])).rows[0];
   if(old&&old.command_hash!=='generation-v1')identity.fail('Identificador já usado com outro conteúdo.',409,'OPERATION_CHANGED');
   const previous=await store.findDayOperation(db,actor,body.operationId);if(previous.state==='confirmed')return res.status(200).json(previous);
   const snapshot=await(deps.loadSources||sources.loadDaySources)(db);const calendar=(await db.query('SELECT day::text,kind,label FROM central_day.calendar')).rows;
   const settings=await require('../lib/deadline-settings').read(db);
   return res.status(200).json(await generation.generateActivities(db,actor,rules.deriveActivities(snapshot,calendar,settings.rules),body.operationId));
  }
  if(body.action==='calendar'){
   identity.closed(body,['action','day','kind','label']);if(!can(actor,'calendar'))identity.fail('Acesso não autorizado.',403,'FORBIDDEN');
   if(!date(body.day)||!['national','local'].includes(body.kind)||typeof body.label!=='string'||!body.label.trim()||body.label.length>200)identity.fail('Dia sem expediente inválido.');
   const result=await dbModule.transaction(db,async q=>{const before=(await q.query('SELECT day::text,kind,label FROM central_day.calendar WHERE day=$1 FOR UPDATE',[body.day])).rows[0]||null;const after={day:body.day,kind:body.kind,label:body.label};await q.query('INSERT INTO central_day.calendar(day,kind,label,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(day) DO UPDATE SET kind=$2,label=$3,actor_id=$4,updated_at=now()',[body.day,body.kind,body.label,actor.userId]);await q.query('INSERT INTO central_day.calendar_events(actor_id,before_data,after_data) VALUES($1,$2,$3)',[actor.userId,JSON.stringify(before),JSON.stringify(after)]);return {saved:true};});
   return res.status(200).json(result);
  }
  return res.status(200).json(await store.executeDayCommand(db,actor,body));
 }catch(e){return res.status([400,401,403,404,409,413,429,503].includes(e.status)?e.status:503).json({error:e.status?e.message:'Meu Dia temporariamente indisponível. Dados anteriores preservados.',code:e.code||'DAY_UNAVAILABLE'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
