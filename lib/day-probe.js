'use strict';
const crypto=require('node:crypto'),{prepare,inventory}=require('./day-db');
function scoped(db,namespace){
 const rewrite=s=>s.replace(/\bcentral_day\b/g,namespace);
 const out={query:(sql,params)=>db.query(rewrite(sql),params)};
 if(db.exec)out.exec=sql=>db.exec(rewrite(sql));
 if(db.transaction)out.transaction=fn=>db.transaction(c=>fn(scoped(c,namespace)));
 else out.connect=async()=>{const c=await db.connect();return {...scoped(c,namespace),release:()=>c.release()};};
 return out;
}
async function runDatabaseProbe(db){
 const namespace='central_probe_'+crypto.randomBytes(12).toString('hex'),testDB=scoped(db,namespace);let created=false,verified=false,cleanedUp=false;
 const before=await inventory(db);
 try{
  await prepare(testDB);created=true;
  await testDB.query("INSERT INTO central_day.profiles(user_id,email,name,role,sectors) VALUES('probe-a','a@example.test','Teste A','operator',ARRAY['ALMOX']),('probe-b','b@example.test','Teste B','operator',ARRAY['APRV'])");
  const taskId=crypto.randomUUID();await testDB.query("INSERT INTO central_day.activities(id,source_key,source,rule,rule_version,subject,sector,assignee_id) VALUES($1,'probe','{}','probe',1,'Teste isolado','ALMOX','probe-a')",[taskId]);
  const store=require('./day-store'),a={userId:'probe-a',name:'Teste A',role:'operator',sectors:['ALMOX'],active:true},b={userId:'probe-b',name:'Teste B',role:'operator',sectors:['APRV'],active:true};
  const command={operationId:crypto.randomUUID(),action:'charge',id:taskId,version:1,note:'Cobrança fictícia',nextAction:'Aguardar teste'};
  const result=await store.executeDayCommand(testDB,a,command);if(result.activity.state!=='waiting')throw Error('charge state');
  await store.executeDayCommand(testDB,a,command);
  const partial=await store.executeDayCommand(testDB,a,{...command,operationId:crypto.randomUUID(),action:'partial',version:2,note:'Parte fictícia realizada'});if(partial.activity.state!=='in-progress')throw Error('partial state');
  if((await store.readDayState(testDB,b)).activities.length!==0)throw Error('scope leak');
  let denied=false;try{await store.getActivity(testDB,b,taskId);}catch(e){denied=e.status===404;}if(!denied)throw Error('scope bypass');
  const events=(await store.history(testDB,a,taskId)).events;if(events.length!==2||events.some(e=>e.actor_id!=='probe-a'))throw Error('audit mismatch');
  verified=true;
 }finally{
  if(created){await db.query('DROP SCHEMA '+namespace+' CASCADE');cleanedUp=!(await inventory(db)).some(t=>t.table_schema===namespace);}
 }
 const after=await inventory(db);const unchanged=JSON.stringify(before)===JSON.stringify(after);
 return {verified:verified&&cleanedUp&&unchanged,cleanedUp,existingStructuresUnchanged:unchanged,checks:['charge-remains-open','partial-remains-open','idempotent-response','sector-isolation','individual-audit']};
}
async function runAuthProbe(req){
 const {neonServer}=require('./identity');const id=crypto.randomBytes(12).toString('hex'),email='central-probe-'+id+'@example.test',password=crypto.randomBytes(28).toString('base64url')+'aA1!';
 function safeReason(message){let text=String(message||'').replaceAll(email,'[test-user]').replaceAll(password,'[password]');for(const value of Object.values(process.env))if(value&&value.length>=8)text=text.replaceAll(value,'[redacted]');return text.replace(/https?:\/\/[^\s]+/g,'[endpoint]').replace(/[A-Za-z0-9_+=\/.-]{32,}/g,'[redacted]').slice(0,500);}
 let cookies=[],signupCookies=[],created=false,cleanedUp=false,verified=false,stage='signup',providerError=null;
 function currentReq(){return {...req,headers:{...req.headers,cookie:cookies.map(c=>c.split(';')[0]).join('; ')}};}
 function response(){return {setHeader(k,v){if(k.toLowerCase()==='set-cookie')cookies=Array.isArray(v)?v:[v]},getHeader(k){return k.toLowerCase()==='set-cookie'?cookies:undefined}};}
 try{
  let auth=await neonServer({...req,headers:{...req.headers,cookie:''}},response());
  let r=await auth.signUp.email({email,password,name:'Verificação isolada da Central'});if(r.error){providerError={status:r.error.status,code:r.error.code,reason:safeReason(r.error.message)};return {verified:false,cleanedUp:true,stage,providerError};}created=true;signupCookies=[...cookies];
  stage='login';cookies=[];auth=await neonServer(currentReq(),response());r=await auth.signIn.email({email,password});if(r.error){providerError={status:r.error.status,code:r.error.code,reason:safeReason(r.error.message)};return {verified:false,cleanedUp:false,stage,providerError};}
  stage='session';auth=await neonServer(currentReq(),response());r=await auth.getSession({query:{disableCookieCache:'true'}});if(!r.data?.user?.id||r.data.user.email!==email)return {verified:false,cleanedUp:false,stage};
  stage='invalid-password';const invalid=await(await neonServer({...req,headers:{...req.headers,cookie:''}},null)).signIn.email({email,password:'wrong-password-for-isolated-test'});if(!invalid.error)return {verified:false,cleanedUp:false,stage};
  stage='complete';verified=true;
 }finally{
  if(created){for(const saved of [cookies,signupCookies]){try{cookies=[...saved];const auth=await neonServer(currentReq(),response());const r=await auth.deleteUser({password});cleanedUp=!r.error;if(cleanedUp)break;}catch{cleanedUp=false;}}}
 }
 return {verified:verified&&cleanedUp,cleanedUp,stage,providerError};
}
module.exports={scoped,runDatabaseProbe,runAuthProbe};
