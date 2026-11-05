'use strict';
const identity=require('../lib/identity'),db=require('../lib/day-db'),cache=require('../lib/management-cache'),{mergeManagement}=require('../lib/management-merge'),{can}=require('../lib/permissions'),{projectManagement}=require('../lib/budget/source-adapter');
function createHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
  identity.closed(req.query||{},[]);
  const actor=await(deps.getIdentity||identity.getIdentity)(req,res,(deps.getDB||db.getDB)());
  if(!actor||actor.active!==true)return res.status(401).json({error:'Entre com seu usuário individual.',code:'UNAUTHORIZED'});
  const canSync=['admin','manager'].includes(actor.role),database=(deps.getDB||db.getDB)();
  const snapshot=deps.loadState?{state:await deps.loadState(),manualFields:{},missingRecords:[],updatedAt:new Date().toISOString()}:await(deps.readSnapshot||cache.readSnapshot)(database);
  if(!snapshot)return res.status(409).json({error:'A primeira atualização ainda não foi realizada.',code:'SYNC_REQUIRED',canSync});
  const state=mergeManagement(snapshot.state,snapshot.manualFields);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const view=(deps.project||projectManagement)(state,actor,today);
  const financial=require('../lib/financial-ledger'),keys=view.commitments.map(r=>r.id).filter(key=>key.startsWith('ne|'));
  const books=new Map((await database.query('SELECT key,state FROM central_day.financial_books WHERE key=ANY($1::text[])',[keys])).rows.map(row=>[row.key,row.state]));
  for(const record of view.commitments){record.canAnnotate=can(actor,'respond',{sector:record.sector});record.financial=financial.financialPosition(books.get(record.id)||financial.emptyBook(),financial.sourceReference(record));}
  const deadlineRules=(await require('../lib/deadline-settings').read(database)).rules;
  const almoxMonitor=require('../lib/almox-monitor');
  for(const ne of view.commitments)if(/almox/i.test(ne.sector||'')||ne.flow==='almox')ne.almoxCheck=almoxMonitor.check(ne,today,deadlineRules);
  const missing=(snapshot.missingRecords||[]).filter(r=>can(actor,'read',{sector:snapshot.manualFields[r.key]?.fields?.sector||''})).map(r=>{const fields=snapshot.manualFields[r.key]?.fields||{},v=r.source_data.values||[],cents=require('../lib/operational-model').sourceCents;return {key:r.key,kind:r.kind,number:typeof v[0]==='string'?v[0]:r.key,sector:fields.sector||'',owner:fields.owner||'',observation:fields.observation||'',nextAction:fields.nextAction||'',lastBalanceCents:r.kind==='ne'?cents(v[7]):r.kind==='nc'?cents(v[6]):null,lastSeen:r.last_seen};});
  const sc=require('../lib/permissions').scope(actor,'a'),pending=(await database.query("SELECT a.id,a.source_key AS \"sourceKey\",a.rule,a.reference,a.ug,a.sector,coalesce(p.name,'') AS owner,a.subject,a.next_action AS \"nextAction\",a.due_on::text AS \"dueOn\",a.state,a.created_at AS \"createdAt\",a.updated_at AS \"updatedAt\",a.priority,a.assignee_id AS \"assigneeId\",(SELECT note FROM central_day.events e WHERE e.activity_id=a.id ORDER BY e.at DESC,e.id DESC LIMIT 1) AS \"lastAction\" FROM central_day.activities a LEFT JOIN central_day.profiles p ON p.user_id=a.assignee_id WHERE "+sc.sql+" ORDER BY a.created_at DESC,a.id LIMIT 10001",sc.params)).rows;
  const directory=await require('../lib/management-directory').load(database,snapshot,actor);return res.status(200).json({...view,pendingActivities:pending.slice(0,10000),reportTruncated:pending.length>10000,directory,viewerId:actor.userId,viewer:{name:actor.name,role:actor.role,globalRead:actor.globalRead===true,sectors:actor.sectors},permissions:{canEditAssignment:['admin','manager'].includes(actor.role)},missingRecords:missing,sync:{updatedAt:snapshot.updatedAt,lastAttempt:snapshot.lastAttempt?.status||null,stale:Date.now()-Date.parse(snapshot.updatedAt)>30*3600000,canSync}});
 }catch(e){const status=[400,401,403,409,413,429,503].includes(e.status)?e.status:503;return res.status(status).json({error:e.code==='STRUCTURE_CHANGED'?'A estrutura da fonte mudou. Consulta anterior preservada.':'Não foi possível concluir a consulta gerencial. Dados anteriores preservados; não é possível afirmar que não houve movimentação.',code:e.code||'MANAGEMENT_READ_FAILED'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;

