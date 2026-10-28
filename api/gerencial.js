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
  const missing=(snapshot.missingRecords||[]).filter(r=>can(actor,'read',{sector:snapshot.manualFields[r.key]?.fields?.sector||''})).map(r=>{const fields=snapshot.manualFields[r.key]?.fields||{},v=r.source_data.values||[],cents=require('../lib/operational-model').sourceCents;return {key:r.key,kind:r.kind,number:typeof v[0]==='string'?v[0]:r.key,sector:fields.sector||'',owner:fields.owner||'',observation:fields.observation||'',nextAction:fields.nextAction||'',lastBalanceCents:r.kind==='ne'?cents(v[7]):r.kind==='nc'?cents(v[6]):null,lastSeen:r.last_seen};});
  return res.status(200).json({...view,permissions:{canEditAssignment:['admin','manager'].includes(actor.role)},missingRecords:missing,sync:{updatedAt:snapshot.updatedAt,lastAttempt:snapshot.lastAttempt?.status||null,stale:Date.now()-Date.parse(snapshot.updatedAt)>30*3600000,canSync}});
 }catch(e){const status=[400,401,403,409,413,429,503].includes(e.status)?e.status:503;return res.status(status).json({error:e.code==='STRUCTURE_CHANGED'?'A estrutura da fonte mudou. Consulta anterior preservada.':'Não foi possível concluir a consulta gerencial. Dados anteriores preservados; não é possível afirmar que não houve movimentação.',code:e.code||'MANAGEMENT_READ_FAILED'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
