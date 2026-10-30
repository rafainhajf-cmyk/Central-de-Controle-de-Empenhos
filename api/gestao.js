'use strict';
const {authorized,accessToken}=require('../lib/google-sheets');
const {validateManagementCommand}=require('../management-schema');
const store=require('../lib/management-store');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function createHandler({getContext=async()=>store.createManagementContext(await accessToken())}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 if(!authorized(req))return res.status(401).json({error:'Acesso não autorizado',code:'UNAUTHORIZED'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido'});
 try{
  const query=req.query||{};if(Object.keys(query).some(k=>k!=='operationId')||query.operationId!==undefined&&(typeof query.operationId!=='string'||!UUID.test(query.operationId)))return res.status(400).json({error:'Consulta inválida'});
  let command;
  if(req.method==='POST'){let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'JSON inválido'});}command=validateManagementCommand(body);}
  const context=await getContext();
  if(command)return res.status(200).json(await store.executeManagement(context,command));
  if(query.operationId)return res.status(200).json(await store.findManagementOperation(context,query.operationId.toLowerCase()));
  return res.status(200).json(store.managementView(await store.readManagementState(context)));
 }catch(e){const status=[400,401,409,413,429,503].includes(e.status)?e.status:503;return res.status(status).json({error:e.status?e.message:'Falha na consulta de gestão. Dados anteriores preservados.',code:e.code||'MANAGEMENT_ERROR'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
