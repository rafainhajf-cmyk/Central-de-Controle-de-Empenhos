'use strict';
const crypto=require('crypto'),identity=require('../lib/identity'),db=require('../lib/day-db'),sync=require('../lib/management-sync');
function createHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 try{let actorId,trigger;
  if(req.method==='GET'){const secret=deps.secret||process.env.CRON_SECRET,provided=String(req.headers?.authorization||'').replace(/^Bearer /,'');if(!secret||secret.length<32||Buffer.byteLength(provided)!==Buffer.byteLength(secret)||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(secret)))return res.status(401).json({error:'Acesso não autorizado.'});identity.closed(req.query||{},[]);actorId='daily-cron';trigger='daily';}
  else if(req.method==='POST'){identity.requireSameOrigin(req);const b=identity.readBody(req);identity.closed(b,['action']);if(b.action!=='sync')identity.fail('Ação inválida.');const actor=await(deps.getIdentity||identity.getIdentity)(req,res,(deps.getDB||db.getDB)());if(!actor?.active||!['admin','manager'].includes(actor.role))identity.fail('Acesso não autorizado.',403,'FORBIDDEN');actorId=actor.userId;trigger='manual';}
  else return res.status(405).json({error:'Método não permitido.'});
  const result=await(deps.synchronize||sync.synchronize)((deps.getDB||db.getDB)(),{actorId,trigger});return res.status(result.state==='busy'?409:200).json(result);
 }catch(e){return res.status([400,401,403,409,503].includes(e.status)?e.status:503).json({error:e.status?e.message:'Atualização indisponível. Última versão preservada.',code:e.code||'SYNC_FAILED'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
