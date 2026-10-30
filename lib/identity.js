'use strict';
const {ROLES}=require('./permissions');
function fail(message,status=400,code='INVALID_REQUEST'){const e=Error(message);Object.assign(e,{status,code});throw e;}
function requireSameOrigin(req){
 const h=req.headers||{},host=h.host;
 if(typeof host!=='string'||!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)||h.origin!=='https://'+host||!/^application\/json(?:\s*;|$)/i.test(h['content-type']||'')||h['x-central-request']!=='1')fail('Origem da solicitação não autorizada.',403,'CSRF');
}
function createIdentityService({session,profile,now=()=>Date.now()}){
 return {async getIdentity(req){
  const s=await session(req);
  if(!s?.user?.id||!s.session||!Number.isFinite(Date.parse(s.session.expiresAt))||Date.parse(s.session.expiresAt)<=now())return null;
  const p=await profile(s.user.id);
  if(!p||p.active!==true||!ROLES.includes(p.role)||!Array.isArray(p.sectors))return null;
  if(p.sessions_valid_after&&(!Number.isFinite(Date.parse(s.session.createdAt))||Date.parse(s.session.createdAt)<=Date.parse(p.sessions_valid_after)))return null;
  return {userId:s.user.id,name:p.name||s.user.name||'',email:p.email||'',role:p.role,sectors:p.sectors,active:true};
 }};
}
async function neonServer(req,res){
 const {createAuthServer,serializeSetCookie,extractNeonAuthCookies}=await import('@neondatabase/auth/server');
 const baseUrl=process.env.NEON_AUTH_BASE_URL,secret=process.env.NEON_AUTH_COOKIE_SECRET;
 if(!baseUrl||!secret||secret.length<32)fail('Login individual ainda não configurado.',503,'AUTH_NOT_CONFIGURED');
 const url=new URL(baseUrl);if(url.protocol!=='https:')fail('Configuração de autenticação inválida.',503,'AUTH_NOT_CONFIGURED');
 const cookies=[];
 return createAuthServer({baseUrl,cookieSecret:secret,sessionDataTtl:1,sameSite:'lax',log:{debug(){},info(){},warn(){},error(){}},context:()=>({
  getCookies:()=>extractNeonAuthCookies(req.headers?.cookie||''),
  setCookie:(name,value,options)=>{cookies.push(serializeSetCookie({name,value,...options,httpOnly:true,secure:true,sameSite:'lax',path:'/'}));res?.setHeader('Set-Cookie',[...(res.getHeader?.('Set-Cookie')||[]),cookies.pop()]);},
  getHeader:name=>name==='host'?req.headers?.host||null:null,
  getOrigin:()=>req.headers?.origin||'https://'+req.headers?.host,
  getFramework:()=> 'central-node'
 })});
}
async function getIdentity(req,res,db){
 const local=await require('./admin-password').readSession(db,req);if(local)return local;
 const auth=await neonServer(req,res);
 return createIdentityService({session:async()=>{const r=await auth.getSession({query:{disableCookieCache:'true'}});if(r.error&&r.error.status>=500)fail('Autenticação temporariamente indisponível.',503,'AUTH_UNAVAILABLE');if(r.data?.user){const p=await require('./google-access').reconcile(db,r.data);if(!p)return null;}return r.data;},profile:async id=>(await db.query('SELECT user_id,name,email,role,sectors,active,sessions_valid_after FROM central_day.profiles WHERE user_id=$1',[id])).rows[0]}).getIdentity(req);
}
function readBody(req,max=24000){let body=req.body;if(typeof body==='string'){if(Buffer.byteLength(body)>max)fail('Solicitação excede limite.',413);try{body=JSON.parse(body);}catch{fail('JSON inválido.');}}if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>max)fail('Solicitação inválida.');return body;}
function closed(body,keys){if(Object.keys(body).some(k=>!keys.includes(k)))fail('Campo não permitido.');}
module.exports={createIdentityService,getIdentity,neonServer,requireSameOrigin,readBody,closed,fail};

