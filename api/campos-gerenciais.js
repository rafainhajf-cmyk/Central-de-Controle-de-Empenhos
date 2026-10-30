'use strict';
const identity=require('../lib/identity'),db=require('../lib/day-db'),cache=require('../lib/management-cache'),{can}=require('../lib/permissions');
function createHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido.'});
  const database=(deps.getDB||db.getDB)();
  if(req.method==='POST')identity.requireSameOrigin(req);
  const actor=await(deps.getIdentity||identity.getIdentity)(req,res,database);
  if(!actor?.active)identity.fail('Entre com seu usuário.',401,'UNAUTHORIZED');
  if(req.method==='GET'){
   identity.closed(req.query||{},['key','offset','operationId']);if(req.query?.operationId)return res.status(200).json(await require('../lib/distribution-store').findOperation(database,actor,req.query.key,req.query.operationId));const {key,offset='0'}=req.query||{},page=Number(offset);
   if(typeof key!=='string'||!key||key.length>500||!Number.isSafeInteger(page)||page<0||page>100000)identity.fail('Consulta inválida.');
   const record=(await database.query('SELECT fields FROM central_day.management_manual WHERE key=$1',[key])).rows[0];
   if(!record||!can(actor,'read',{sector:record.fields.sector||''}))identity.fail('Registro não encontrado.',404,'NOT_FOUND');
   const rows=(await database.query('SELECT c.id,c.kind,c.before_data,c.after_data,c.at,COALESCE(p.name,c.actor_id) AS actor_name FROM central_day.management_changes c LEFT JOIN central_day.profiles p ON p.user_id=c.actor_id WHERE c.key=$1 ORDER BY c.at DESC,c.id DESC LIMIT 101 OFFSET $2',[key,page])).rows;
   return res.status(200).json({events:rows.slice(0,100).map(e=>e.kind.startsWith('distribution-')?{...e,after_data:Object.fromEntries(Object.entries(e.after_data||{}).filter(([key])=>!['distributionProgress','distributionCommandHash'].includes(key)))}:e),nextOffset:rows.length>100?page+100:null});
  }
  identity.closed(req.query||{},[]);
  const body=identity.readBody(req);if(typeof body.action==='string'&&body.action.startsWith('distribution-'))return res.status(200).json(await(deps.executeDistribution||require('../lib/distribution-store').execute)(database,actor,body));
  return res.status(200).json(await(deps.saveManualFields||cache.saveManualFields)(database,actor,body));
 }catch(e){return res.status([400,401,403,404,409,413].includes(e.status)?e.status:503).json({error:e.status?e.message:'Não foi possível confirmar a edição. Recarregue antes de repetir.',code:e.code||'EDIT_UNAVAILABLE'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;

