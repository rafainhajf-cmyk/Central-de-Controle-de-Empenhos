'use strict';
const identity=require('../lib/identity'),database=require('../lib/day-db'),store=require('../lib/financial-store');
function createHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido.'});
  if(req.method==='POST')identity.requireSameOrigin(req);
  const db=(deps.getDB||database.getDB)(),actor=await(deps.getIdentity||identity.getIdentity)(req,res,db);
  if(!actor?.active)identity.fail('Entre com seu usuário individual.',401,'UNAUTHORIZED');
  const query=req.query||{};identity.closed(query,req.method==='GET'?['key','offset','operationId']:[]);
  if(req.method==='GET'){
   if(Object.values(query).some(v=>typeof v!=='string'))identity.fail('Consulta inválida.');
   if(query.operationId){identity.closed(query,['operationId']);return res.status(200).json(await store.findFinancialOperation(db,actor,query.operationId));}
   const offset=query.offset===undefined?0:Number(query.offset);
   return res.status(200).json(await store.readFinancialBook(db,actor,query.key,offset));
  }
  return res.status(200).json(await store.executeFinancialCommand(db,actor,identity.readBody(req)));
 }catch(e){const known=[400,401,403,404,409,413,429,503].includes(e.status);return res.status(known?e.status:503).json({error:known?e.message:'Não foi possível confirmar a operação. Consulte o resultado pelo identificador antes de repetir.',code:e.code||'FINANCIAL_UNAVAILABLE'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
