'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const admin=require('../lib/admin-password'),identity=require('../lib/identity');
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};}
test('administrator setup, login, identity after reload, password change and revocation on Postgres',async()=>{
 const db=new PGlite(),previous=process.env.CENTRAL_OWNER_EMAIL;process.env.CENTRAL_OWNER_EMAIL='owner@example.test';
 const actor={userId:'owner-test',email:'owner@example.test',role:'admin',active:true,sectors:[]};
 try{
  await require('../lib/day-db').prepare(db);await require('../lib/day-db').prepare(db);
  await db.query("INSERT INTO central_day.profiles(user_id,email,name,role,sectors) VALUES($1,$2,'Owner','admin','{}')",[actor.userId,actor.email]);
  const endpoint=require('../api/identidade').createHandler({getDB:()=>db});
  const notConfigured=response();await endpoint({method:'GET',query:{login:'1'}},notConfigured);assert.deepEqual(notConfigured.body,{adminPasswordConfigured:false});
  await admin.setup(db,{}, {email:actor.email,password:'Initial-admin-password'},actor);
  const configured=response();await endpoint({method:'GET',query:{login:'1'}},configured);assert.deepEqual(configured.body,{adminPasswordConfigured:true});
  const res=response();await admin.login(db,{},res,{email:actor.email,password:'Initial-admin-password'});
  const req={headers:{cookie:res.headers['Set-Cookie'][0].split(';')[0]}};
  const regular=response();await require('../api/identidade').createHandler({getDB:()=>db,neonServer(){throw Error('Google must not be used for a local administrator');}})({method:'POST',headers:{host:'central.test',origin:'https://central.test','content-type':'application/json','x-central-request':'1'},body:{action:'login',email:actor.email,password:'Initial-admin-password'}},regular);
  assert.equal(regular.statusCode,200);assert.equal(regular.body.user.userId,actor.userId);
  assert.equal((await identity.getIdentity(req,response(),db)).userId,actor.userId);
  assert.equal((await identity.getIdentity({...req},response(),db)).role,'admin');
  const credentials=(await db.query('SELECT user_id,password_hash FROM central_day.admin_credentials')).rows;
  assert.equal(credentials.length,1);assert.equal(credentials[0].user_id,actor.userId);assert.match(credentials[0].password_hash,/^scrypt-v1\$/);
  await assert.rejects(()=>admin.setup(db,{}, {email:actor.email,password:'Different-admin-password'},actor),e=>e.code==='ADMIN_ALREADY_CONFIGURED');
  await admin.changePassword(db,req,response(),{currentPassword:'Initial-admin-password',newPassword:'Replacement-admin-password'});
  assert.equal(await admin.readSession(db,req),null);
  await assert.rejects(()=>admin.login(db,{},response(),{email:actor.email,password:'Initial-admin-password'}),e=>e.code==='INVALID_LOGIN');
  const next=response();await admin.login(db,{},next,{email:actor.email,password:'Replacement-admin-password'});
  const nextReq={headers:{cookie:next.headers['Set-Cookie'][0].split(';')[0]}};
  await admin.logout(db,nextReq,response());assert.equal(await admin.readSession(db,nextReq),null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM central_day.profiles')).rows[0].n,1);
 }finally{await db.close();if(previous===undefined)delete process.env.CENTRAL_OWNER_EMAIL;else process.env.CENTRAL_OWNER_EMAIL=previous;}
});
