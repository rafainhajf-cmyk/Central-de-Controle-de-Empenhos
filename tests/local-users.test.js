'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),local=require('../lib/local-users'),auth=require('../lib/admin-password');
const owner={userId:'owner',name:'Administrador',email:'owner@example.test',role:'admin',active:true,sectors:[]};
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v},getHeader(k){return this.headers[k]},status(n){this.code=n;return this},json(v){this.body=v;return this}};}
const req=body=>({method:'POST',headers:{host:'central.test',origin:'https://central.test','content-type':'application/json','x-central-request':'1'},body});
test('username logins are distinct non-admin identities, remembered, scoped, revocable and independent of Google',async()=>{const db=new PGlite();try{await require('../lib/day-db').prepare(db);await db.query('INSERT INTO central_day.profiles(user_id,email,name,role) VALUES($1,$2,$3,$4)',[owner.userId,owner.email,owner.name,owner.role]);const a=await local.provision(db,owner,{name:'Operador A',email:'operador.a',password:'abc123',role:'operator',sectors:['ALMOX']}),b=await local.provision(db,owner,{name:'Operador B',email:'operador.b',password:'abc123',role:'operator',sectors:['APRV']});assert.notEqual(a.userId,b.userId);const handler=require('../api/identidade').createHandler({getDB:()=>db,neonServer(){throw Error('Must not call Google')}}),response=res();await handler(req({action:'login',email:'OPERADOR.A',password:'abc123',remember:true}),response);assert.equal(response.code,200);assert.equal(response.body.user.userId,a.userId);assert.equal(response.body.user.role,'operator');assert.match(response.headers['Set-Cookie'][0],/Max-Age=2592000/);const session={headers:{cookie:response.headers['Set-Cookie'][0].split(';')[0]}},actor=await auth.readSession(db,session);assert.equal(actor.userId,a.userId);assert.equal(require('../lib/permissions').can(actor,'manage-users'),false);assert.equal(require('../lib/permissions').can(actor,'read',{sector:'APRV'}),false);assert.equal(require('../lib/permissions').can(actor,'read',{sector:'ALMOX'}),true);await assert.rejects(()=>local.provision(db,actor,{name:'Impostor',email:'impostor',password:'abc123',role:'admin',sectors:[]}),e=>e.status===403);await assert.rejects(()=>local.provision(db,owner,{name:'Duplicado',email:'OPERADOR.A',password:'abc123',role:'operator',sectors:[]}),e=>e.code==='USER_EXISTS');const wrong=res();await handler(req({action:'login',email:'operador.a',password:'wrong'}),wrong);assert.equal(wrong.code,401);assert.equal(wrong.headers['Set-Cookie'],undefined);const unknown=res();await handler(req({action:'login',email:'unknown',password:'abc123'}),unknown);assert.equal(unknown.code,401);await db.query("UPDATE central_day.profiles SET active=false WHERE user_id=$1",[a.userId]);assert.equal(await auth.readSession(db,session),null);await db.query("UPDATE central_day.profiles SET active=true WHERE user_id=$1",[a.userId]);await auth.changePassword(db,session,res(),{currentPassword:'abc123',newPassword:'Replacement-strong-password'});assert.equal(await auth.readSession(db,session),null);assert.equal((await auth.login(db,{},res(),{email:'operador.a',password:'Replacement-strong-password'})).user.userId,a.userId);const events=(await db.query('SELECT after_data FROM central_day.profile_events')).rows;assert.doesNotMatch(JSON.stringify(events),/abc123|scrypt|password_hash/);const credentials=(await db.query('SELECT password_hash FROM central_day.admin_credentials')).rows;assert.notEqual(credentials[0].password_hash,credentials[1].password_hash);
}finally{await db.close();}});

test('the owner can reset an existing local password and revoke sessions without changing permissions',async()=>{
 const db=new PGlite(),previousOwner=process.env.CENTRAL_OWNER_EMAIL;
 process.env.CENTRAL_OWNER_EMAIL=owner.email;
 try{
  await require('../lib/day-db').prepare(db);
  await db.query('INSERT INTO central_day.profiles(user_id,email,name,role) VALUES($1,$2,$3,$4)',[owner.userId,owner.email,owner.name,owner.role]);
  const user=await local.provision(db,owner,{name:'Operador de teste',email:'operador.teste',password:'initial-test-password',role:'operator',sectors:['ALMOX']});
  await db.query('UPDATE central_day.profiles SET global_read=true WHERE user_id=$1',[user.userId]);
  const original=res();
  await auth.login(db,req({}),original,{email:user.login,password:'initial-test-password'});
  const session={headers:{cookie:original.headers['Set-Cookie'][0].split(';')[0]}};
  const before=await auth.readSession(db,session);
  const handler=actor=>require('../api/identidade').createHandler({getDB:()=>db,getIdentity:async()=>actor});
  const call=async(actor,body)=>{
   const response=res();
   await handler(actor)(req(body),response);
   return response;
  };
  const listed=res();
  await handler(owner)({method:'GET',query:{users:'1'}},listed);
  assert.equal(listed.body.users.find(row=>row.user_id===user.userId).canResetPassword,true);
  assert.equal(listed.body.users.find(row=>row.user_id===owner.userId).canResetPassword,false);

  const reset={action:'reset-local-password',userId:user.userId,newPassword:'replacement-test-password'};
  assert.equal((await call(null,reset)).code,401);
  assert.equal((await call(before,reset)).code,403);
  assert.equal((await call({...owner,email:'another@example.test'},reset)).code,403);
  assert.equal((await call(owner,{...reset,newPassword:'short'})).code,400);
  assert.equal((await call(owner,{...reset,userId:owner.userId})).code,404);
  assert.deepEqual((await call(owner,reset)).body,{updated:true});
  assert.equal(await auth.readSession(db,session),null);
  await assert.rejects(()=>auth.login(db,req({}),res(),{email:user.login,password:'initial-test-password'}),error=>error.code==='INVALID_LOGIN');
  const updated=await auth.login(db,req({}),res(),{email:user.login,password:reset.newPassword});
  assert.deepEqual(updated.user,before);
  const audit=(await db.query("SELECT actor_id,target_id,after_data FROM central_day.profile_events WHERE after_data->>'reason'='local-password-reset'")).rows;
  assert.deepEqual(audit,[{actor_id:owner.userId,target_id:user.userId,after_data:{reason:'local-password-reset',sessionsRevoked:true}}]);
 }finally{
  if(previousOwner===undefined)delete process.env.CENTRAL_OWNER_EMAIL;
  else process.env.CENTRAL_OWNER_EMAIL=previousOwner;
  await db.close();
 }
});
