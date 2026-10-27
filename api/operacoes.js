'use strict';
const {authorized,accessToken}=require('../lib/google-sheets');
const {productionContext,readOperationalState,toReadModel,executeOperation,findOperation}=require('../lib/operational-store');
const {validateCommand}=require('../lib/operational-model');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function createHandler({getContext=async()=>productionContext(await accessToken())}={}){return async(req,res)=>{
 if(process.env.DATABASE_URL)return res.status(410).json({error:'Controle migrado. Use os lançamentos no banco do programa.'});
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 if(!authorized(req))return res.status(401).json({error:'Não autorizado',code:'UNAUTHORIZED'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido'});
 try{
  let command,isProbe=false;
  if(req.method==='POST'){let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{ return res.status(400).json({error:'JSON inválido',code:'INVALID_JSON'})}if(body&&typeof body==='object'&&!Array.isArray(body)&&body.action==='test-operational-write'){if(Object.keys(body).length!==1)return res.status(400).json({error:'O teste não aceita alvos ou parâmetros externos.'});isProbe=true;}else command=validateCommand(body);}
  const query=req.query||{};if(Object.keys(query).some(k=>k!=='operationId')||(query.operationId!==undefined&&!uuid.test(query.operationId)))return res.status(400).json({error:'Consulta inválida'});
  const context=await getContext();
  if(isProbe)return res.status(200).json(await require('../lib/operational-probe').runOperationalProbe(context));
  if(req.method==='POST')return res.status(200).json(await executeOperation(context,command));
  if(query.operationId){const result=await findOperation(context,query.operationId.toLowerCase());return res.status(200).json(result||{operationId:query.operationId,state:'not-found-yet'});}
  return res.status(200).json(toReadModel(await readOperationalState(context)));
 }catch(e){const status=[400,401,409,413,429,503].includes(e.status)?e.status:503;return res.status(status).json({error:e.status?e.message:'Não foi possível consultar os controles operacionais. Tente novamente.',code:e.code||'OPERATION_ERROR',...(e.cleanupRequired?{cleanupRequired:e.cleanupRequired}:{})});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
