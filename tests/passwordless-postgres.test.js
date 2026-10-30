'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),admin=require('../lib/admin-password');
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
const digest=t=>crypto.createHash('sha256').update(t).digest('hex');
test('personal access links issue remembered sessions once and reject expired, revoked and inactive access',async()=>{
 const db=new PGlite();try{
  await require('../lib/day-db').prepare(db);
  const password='Test-only-password-2026';
  await db.query("INSERT INTO central_day.profiles(user_id,email,name,role,sectors) VALUES('owner','owner@example.test','Owner','admin','{}')");
  await db.query('INSERT INTO central_day.admin_credentials(user_id,password_hash) VALUES($1,$2)',['owner',await admin.hashPassword(password)]);
  async function issue(expired=false){const token=crypto.randomBytes(32).toString('hex');await db.query("INSERT INTO central_day.admin_login_links(token_hash,user_id,credential_version,expires_at) SELECT $1,user_id,version,now()+$2*interval '1 second' FROM central_day.admin_credentials WHERE user_id='owner'",[digest(token),expired?-1:1800]);return token;}
  const handle=require('../api/identidade').createHandler({getDB:()=>db,neonServer(){throw Error('Passwordless access must not call Google');}});
  const headers={host:'central.test',origin:'https://central.test','content-type':'application/json','x-central-request':'1'};
  const token=await issue(),first=response();await handle({method:'POST',headers,body:{action:'admin-link',token}},first);
  assert.equal(first.statusCode,200);assert.equal(first.body.user.userId,'owner');
  const cookie=first.headers['Set-Cookie'][0];assert.match(cookie,/HttpOnly; Secure; SameSite=Strict; Max-Age=2592000/);
  const req={headers:{cookie:cookie.split(';')[0]}};assert.equal((await admin.readSession(db,req)).role,'admin');
  const ttl=(await db.query("SELECT extract(epoch FROM expires_at-now())::int AS seconds FROM central_day.admin_sessions")).rows[0].seconds;assert.ok(ttl>29*86400);
  const used=response();await handle({method:'POST',headers,body:{action:'admin-link',token}},used);assert.equal(used.statusCode,401);assert.equal((await db.query('SELECT count(*)::int AS n FROM central_day.admin_sessions')).rows[0].n,1);
  await assert.rejects(async()=>admin.consumeLoginLink(db,{},response(),{token:await issue(true)}),e=>e.code==='INVALID_LOGIN_LINK');
  await assert.rejects(()=>admin.consumeLoginLink(db,{},response(),{token:'f'.repeat(64)}),e=>e.code==='INVALID_LOGIN_LINK');
  const revoked=await issue();await db.query("UPDATE central_day.admin_credentials SET version=version+1 WHERE user_id='owner'");
  await assert.rejects(()=>admin.consumeLoginLink(db,{},response(),{token:revoked}),e=>e.code==='INVALID_LOGIN_LINK');assert.equal(await admin.readSession(db,req),null);
  const inactive=await issue();await db.query("UPDATE central_day.profiles SET active=false WHERE user_id='owner'");
  await assert.rejects(()=>admin.consumeLoginLink(db,{},response(),{token:inactive}),e=>e.code==='INVALID_LOGIN_LINK');
  const stored=await db.query('SELECT token_hash FROM central_day.admin_login_links');assert.ok(stored.rows.every(r=>r.token_hash!==token));
  const events=JSON.stringify((await db.query('SELECT after_data FROM central_day.profile_events')).rows);assert.equal(events.includes(token),false);
 }finally{await db.close();}
});
test('remembered password login is optional and expired cookies never expose another profile',async()=>{
 const db=new PGlite();try{
  await require('../lib/day-db').prepare(db);await db.query("INSERT INTO central_day.profiles(user_id,email,name,role,sectors) VALUES('owner','owner@example.test','Owner','admin','{}')");
  await db.query('INSERT INTO central_day.admin_credentials(user_id,password_hash) VALUES($1,$2)',['owner',await admin.hashPassword('Test-password-for-owner')]);
  const res=response();await admin.login(db,{},res,{email:'owner@example.test',password:'Test-password-for-owner',remember:true});assert.match(res.headers['Set-Cookie'][0],/Max-Age=2592000/);
  await assert.rejects(()=>admin.login(db,{},response(),{email:'owner@example.test',password:'Test-password-for-owner',remember:'true'}),e=>e.status===400);
  const req={headers:{cookie:res.headers['Set-Cookie'][0].split(';')[0]}};await db.query("UPDATE central_day.admin_sessions SET expires_at=now()-interval '1 second'");assert.equal(await admin.readSession(db,req),null);
 }finally{await db.close();}
});
