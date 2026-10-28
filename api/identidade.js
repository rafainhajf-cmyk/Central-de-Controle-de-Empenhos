'use strict';
const identity=require('../lib/identity'),dbModule=require('../lib/day-db'),profiles=require('../lib/profile-store');
const {authorized}=require('../lib/google-sheets'),{can}=require('../lib/permissions');
function createHandler(deps={}){
 const getDB=deps.getDB||dbModule.getDB,getIdentity=deps.getIdentity||identity.getIdentity,neonServer=deps.neonServer||identity.neonServer;
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido.'});
   if(req.method==='GET'){
    if(Object.keys(req.query||{}).some(k=>!['users','access','requests'].includes(k)))identity.fail('Consulta inválida.');
    const db=getDB(),user=await getIdentity(req,res,db);
    if(req.query?.users==='1'){
     if(!can(user,'manage-users'))identity.fail('Acesso não autorizado.',403,'FORBIDDEN');
     return res.status(200).json({users:(await db.query('SELECT user_id,name,email,role,sectors,active FROM central_day.profiles ORDER BY name LIMIT 1000')).rows});
    }
    if(req.query?.requests==='1'){
     require('../lib/google-access').requireOwner(user);
     return res.status(200).json({requests:(await db.query("SELECT user_id,email,name,status,requested_at FROM central_day.access_requests WHERE status='pending' ORDER BY requested_at LIMIT 1000")).rows});
    }
    let access=null;
    if(req.query?.access==='1'&&!user){const r=await(await neonServer(req,res)).getSession({query:{disableCookieCache:'true'}});if(r.data?.user?.id){const pending=(await db.query('SELECT status FROM central_day.access_requests WHERE user_id=$1',[r.data.user.id])).rows[0];access=pending?.status||'inactive';}}
    return res.status(200).json({user,...(req.query?.access==='1'?{access,canApprove:user?.role==='admin'&&user.email?.toLowerCase()===process.env.CENTRAL_OWNER_EMAIL?.toLowerCase()}: {})});
   }
   identity.requireSameOrigin(req);const b=identity.readBody(req);if(typeof b.action!=='string')identity.fail('Ação inválida.');
   const allowed={login:['email','password'],logout:[],'google-start':[],'access-decision':['request'],bootstrap:['profile'],'create-user':['profile'],'update-user':['profile'],'change-password':['currentPassword','newPassword']};
   if(!Object.hasOwn(allowed,b.action))identity.fail('Ação inválida.');identity.closed(b,['action',...allowed[b.action]]);
   if(b.action==='google-start'){
    const auth=await neonServer(req,res),r=await auth.signIn.social({provider:'google',callbackURL:'https://'+req.headers.host+'/api/google-callback',errorCallbackURL:'https://'+req.headers.host+'/meu-dia?google=error',disableRedirect:true});
    if(r.error||!r.data?.url)identity.fail('Não foi possível iniciar o acesso com Google.',503,'GOOGLE_UNAVAILABLE');
    const url=new URL(r.data.url),authHost=new URL(process.env.NEON_AUTH_BASE_URL).hostname;if(url.protocol!=='https:'||!['accounts.google.com',authHost].includes(url.hostname)||url.username||url.password)identity.fail('Resposta de login inválida.',503,'GOOGLE_UNAVAILABLE');
    return res.status(200).json({url:url.href});
   }
   if(b.action==='bootstrap'){
    if(process.env.CENTRAL_OWNER_EMAIL)identity.fail('O administrador titular deve entrar com sua conta Google.',409,'USE_GOOGLE');
    if(!authorized(req))identity.fail('Acesso não autorizado.',401,'UNAUTHORIZED');
    const db=getDB();await dbModule.prepare(db);const auth=await neonServer({...req,headers:{...req.headers,cookie:''}},null);
    const user=await profiles.provision(db,auth,b.profile,null,{bootstrap:true});return res.status(200).json({user,configured:true});
   }
   const db=getDB();
   if(b.action==='login'){
    if(typeof b.email!=='string'||!/^\S+@\S+\.\S+$/.test(b.email)||b.email.length>254||typeof b.password!=='string'||b.password.length>128||!b.password)identity.fail('Dados de entrada inválidos.');
    await profiles.limitLogin(db,req,b.email.trim().toLowerCase());
    // Stage provider cookies until the application profile is confirmed.
    const staged={headers:{},setHeader(k,v){this.headers[k]=v},getHeader(k){return this.headers[k]}};
    const auth=await neonServer({...req,headers:{...req.headers,cookie:''}},staged),r=await auth.signIn.email({email:b.email.trim().toLowerCase(),password:b.password});
    if(r.error?.status===429)identity.fail('Aguarde antes de tentar entrar novamente.',429,'LOGIN_RATE_LIMIT');
    if(r.error&&(r.error.status>=500||r.error.code==='feature_not_supported'))identity.fail('O login individual ainda precisa de configuração no serviço de identidade. O acesso atual continua disponível.',503,'AUTH_NOT_CONFIGURED');
    if(r.error||!r.data?.user?.id)identity.fail('Usuário ou senha inválidos.',401,'INVALID_LOGIN');
    const p=(await db.query('SELECT user_id,name,email,role,sectors,active FROM central_day.profiles WHERE user_id=$1',[r.data.user.id])).rows[0];
    if(!p?.active)identity.fail('Usuário ou senha inválidos.',401,'INVALID_LOGIN');
    if(staged.headers['Set-Cookie'])res.setHeader('Set-Cookie',staged.headers['Set-Cookie']);
    return res.status(200).json({user:{userId:p.user_id,name:p.name,email:p.email,role:p.role,sectors:p.sectors,active:true}});
   }
   if(b.action==='logout'){
    const auth=await neonServer(req,res),r=await auth.signOut();if(r.error)identity.fail('Não foi possível confirmar a saída. Tente novamente.',503,'LOGOUT_UNCONFIRMED');
    return res.status(200).json({signedOut:true});
   }
   const actor=await getIdentity(req,res,db);if(!actor)identity.fail('Entre com seu usuário.',401,'UNAUTHORIZED');
   if(b.action==='access-decision')return res.status(200).json(await require('../lib/google-access').decide(db,actor,b.request));
   if(b.action==='change-password'){
    if(typeof b.currentPassword!=='string'||typeof b.newPassword!=='string'||b.newPassword.length<12||b.newPassword.length>128)identity.fail('Use senha entre 12 e 128 caracteres.');
    const r=await(await neonServer(req,res)).changePassword({currentPassword:b.currentPassword,newPassword:b.newPassword,revokeOtherSessions:true});
    if(r.error)identity.fail('Não foi possível alterar a senha.',400,'PASSWORD_CHANGE_FAILED');return res.status(200).json({updated:true});
   }
   if(!can(actor,'manage-users'))identity.fail('Acesso não autorizado.',403,'FORBIDDEN');
   if(process.env.CENTRAL_OWNER_EMAIL)require('../lib/google-access').requireOwner(actor);
   if(b.action==='create-user')return res.status(200).json({user:await profiles.provision(db,await neonServer({...req,headers:{...req.headers,cookie:''}},null),b.profile,actor)});
   return res.status(200).json(await profiles.updateProfile(db,actor,b.profile));
  }catch(e){return res.status([400,401,403,404,409,413,429,503].includes(e.status)?e.status:503).json({error:e.status?e.message:'Login individual temporariamente indisponível. O acesso atual continua disponível.',code:e.code||'IDENTITY_UNAVAILABLE'});}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
