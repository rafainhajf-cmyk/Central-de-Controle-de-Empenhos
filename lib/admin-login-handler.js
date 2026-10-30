'use strict';
const identity=require('./identity'),dbModule=require('./day-db'),admin=require('./admin-password');
function createHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
  identity.requireSameOrigin(req);identity.closed(req.query||{},[]);const body=identity.readBody(req);
  const allowed={login:['email','password'],setup:['email','password'],logout:[],password:['currentPassword','newPassword']};
  if(!Object.hasOwn(allowed,body.action))identity.fail('Ação inválida.');identity.closed(body,['action',...allowed[body.action]]);
  const db=(deps.getDB||dbModule.getDB)();
  if(body.action==='setup'){
   await require('./profile-store').limitLogin(db,req,'admin-setup');
   let actor=null;
   // An existing panel key is an independent first-time setup path if Google is down.
   if(!require('./google-sheets').authorized(req))actor=await(deps.getIdentity||identity.getIdentity)(req,res,db);
   return res.status(200).json(await admin.setup(db,req,body,actor));
  }
  return res.status(200).json(await admin[body.action==='password'?'changePassword':body.action](db,req,res,body));
 }catch(e){const status=[400,401,403,409,413,429,503].includes(e.status)?e.status:503;return res.status(status).json({error:e.status?e.message:'Acesso de administrador indisponível. Tente novamente.',code:e.code||'ADMIN_LOGIN_UNAVAILABLE'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
