'use strict';
const identity=require('../lib/identity'),{getDB}=require('../lib/day-db'),settings=require('../lib/deadline-settings');
function createHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido.'});
  identity.closed(req.query||{},[]);
  if(req.method==='POST')identity.requireSameOrigin(req);
  const db=(deps.getDB||getDB)(),actor=await(deps.getIdentity||identity.getIdentity)(req,res,db);
  if(!actor)identity.fail('Entre com seu usuário individual.',401,'UNAUTHORIZED');
  const data=req.method==='GET'?await settings.read(db):await settings.save(db,actor,identity.readBody(req));
  return res.status(200).json({...data,canEdit:['admin','manager'].includes(actor.role),notice:'Regras para novas atividades. Atividades existentes mantêm seus prazos; ajustes individuais ficam no histórico.'});
 }catch(e){return res.status([400,401,403,409,413,503].includes(e.status)?e.status:503).json({error:e.status?e.message:'Não foi possível consultar as regras. Nenhuma alteração foi confirmada.',code:e.code||'RULES_UNAVAILABLE'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
