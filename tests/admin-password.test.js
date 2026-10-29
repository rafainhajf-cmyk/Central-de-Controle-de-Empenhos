'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const admin=require('../lib/admin-password'),{createHandler}=require('../lib/admin-login-handler');
const profile={user_id:'owner-id',name:'Administrador',email:'owner@example.test',role:'admin',sectors:[],active:true};
function fixture(){
 const state={profile:{...profile},credentials:null,sessions:[],events:[],attempts:0};
 const db={async transaction(fn){return fn(db);},async query(sql,args=[]){
  const q=sql.replace(/\s+/g,' ').trim();let rows=[];
  if(q.startsWith('SELECT pg_advisory'))return {rows:[]};
  if(q.startsWith('INSERT INTO central_day.login_limits'))rows=[{attempts:++state.attempts}];
  else if(q.startsWith('SELECT user_id,name,email,role,sectors FROM central_day.profiles'))rows=state.profile.active&&state.profile.role==='admin'&&state.profile.email===args[0]?[state.profile]:[];
  else if(q.startsWith('SELECT 1 FROM central_day.admin_credentials'))rows=state.credentials?[{exists:1}]:[];
  else if(q.startsWith('INSERT INTO central_day.admin_credentials'))state.credentials={user_id:args[0],password_hash:args[1],version:1};
  else if(q.startsWith('INSERT INTO central_day.profile_events'))state.events.push(JSON.parse(args.at(-1)));
  else if(q.startsWith('SELECT p.user_id')&&q.includes('FROM central_day.admin_sessions')){
   const s=state.sessions.find(s=>s.token_hash===args[0]&&s.expires_at>Date.now()&&s.credential_version===state.credentials?.version);
   if(s&&state.profile.active&&state.profile.role==='admin'&&(!state.profile.sessions_valid_after||s.created_at>state.profile.sessions_valid_after))rows=[state.profile];
  }else if(q.startsWith('SELECT p.user_id')&&q.includes('JOIN central_day.admin_credentials')){if(state.credentials&&state.profile.active&&state.profile.role==='admin'&&state.profile.email===args[0])rows=[{...state.profile,...state.credentials}];}
  else if(q.startsWith('SELECT c.version'))rows=state.credentials&&state.profile.active&&state.profile.role==='admin'?[{version:state.credentials.version}]:[];
  else if(q.startsWith('DELETE FROM central_day.admin_sessions WHERE expires_at'))state.sessions=state.sessions.filter(s=>s.expires_at>Date.now());
  else if(q.startsWith('INSERT INTO central_day.admin_sessions'))state.sessions.push({token_hash:args[0],user_id:args[1],credential_version:args[2],expires_at:Date.now()+28800000,created_at:Date.now()});
  else if(q.startsWith('DELETE FROM central_day.admin_sessions WHERE token_hash'))state.sessions=state.sessions.filter(s=>s.token_hash!==args[0]);
  else if(q.startsWith('DELETE FROM central_day.admin_sessions WHERE user_id'))state.sessions=state.sessions.filter(s=>s.user_id!==args[0]);
  else if(q.startsWith('SELECT password_hash,version'))rows=state.credentials?[state.credentials]:[];
  else if(q.startsWith('UPDATE central_day.admin_credentials')){if(state.credentials?.version===args[2]){state.credentials.password_hash=args[1];state.credentials.version++;rows=[{user_id:args[0]}];}}
  else throw Error('Unexpected database call: '+q);
  return {rows};
 }};return {db,state};
}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
const owner={userId:profile.user_id,name:profile.name,email:profile.email,role:'admin',active:true,sectors:[]};
const password='First-password-2026';
async function configured(){const f=fixture();await admin.setup(f.db,{}, {email:profile.email,password},owner);return f;}
process.env.CENTRAL_OWNER_EMAIL=profile.email;
test('password hashing uses random salts and rejects wrong or malformed credentials',async()=>{
 const a=await admin.hashPassword(password),b=await admin.hashPassword(password);assert.notEqual(a,b);assert.ok(await admin.verifyPassword(password,a));assert.equal(await admin.verifyPassword('wrong',a),false);assert.equal(await admin.verifyPassword(password,null),false);assert.equal(await admin.verifyPassword(password,'scrypt-v1$bad$bad'),false);
 await assert.rejects(()=>admin.hashPassword('short'));
});
test('setup requires existing authority, binds existing owner and closes after first setup',async()=>{
 const {db,state}=fixture();await assert.rejects(()=>admin.setup(db,{}, {email:profile.email,password},null),e=>e.status===401);
 await assert.rejects(()=>admin.setup(db,{}, {email:'other@example.test',password},owner),e=>e.status===403);
 await assert.rejects(()=>admin.setup(db,{}, {email:profile.email,password},{...owner,userId:'impostor'}),e=>e.status===403);
 await admin.setup(db,{}, {email:profile.email,password},owner);assert.equal(state.credentials.user_id,profile.user_id);assert.equal(state.events.length,1);
 await assert.rejects(()=>admin.setup(db,{}, {email:profile.email,password},owner),e=>e.code==='ADMIN_ALREADY_CONFIGURED');
 assert.doesNotMatch(JSON.stringify(state.events),/First-password|scrypt|token/);
});
test('existing panel key configures only existing active administrator',async()=>{
 process.env.APP_ACCESS_TOKEN='test-key-with-at-least-24-characters';
 const {db,state}=fixture(),req={headers:{authorization:'Bearer '+process.env.APP_ACCESS_TOKEN}};
 await admin.setup(db,req,{email:profile.email,password},null);assert.equal(state.events[0].method,'existing-panel-key');
 const inactive=fixture();inactive.state.profile.active=false;await assert.rejects(()=>admin.setup(inactive.db,req,{email:profile.email,password},null),e=>e.status===403);
 delete process.env.APP_ACCESS_TOKEN;
});
test('login creates hashed server session; cookie survives requests and rechecks current privileges',async()=>{
 const {db,state}=await configured(),res=response();const result=await admin.login(db,{},res,{email:profile.email,password});assert.equal(result.user.userId,profile.user_id);
 const cookie=res.headers['Set-Cookie'][0];assert.match(cookie,/HttpOnly; Secure; SameSite=Strict; Max-Age=28800/);assert.match(cookie,/^__Host-central_admin=/);
 const req={headers:{cookie:cookie.split(';')[0]}};assert.equal((await admin.readSession(db,req)).userId,profile.user_id);assert.equal((await admin.readSession(db,req)).role,'admin');
 assert.notEqual(state.sessions[0].token_hash,admin.tokenFrom(req));state.profile.active=false;assert.equal(await admin.readSession(db,req),null);state.profile.active=true;state.profile.role='operator';assert.equal(await admin.readSession(db,req),null);
});
test('wrong passwords and unknown users cannot issue cookies',async()=>{
 const {db}=await configured();for(const values of [{email:profile.email,password:'wrong'},{email:'unknown@example.test',password}]){const res=response();await assert.rejects(()=>admin.login(db,{},res,values),e=>e.code==='INVALID_LOGIN');assert.equal(res.headers['Set-Cookie'],undefined);}
});
test('logout revokes token and password change invalidates all prior sessions',async()=>{
 const {db,state}=await configured(),r=response();await admin.login(db,{},r,{email:profile.email,password});const req={headers:{cookie:r.headers['Set-Cookie'][0].split(';')[0]}};
 await admin.logout(db,req,response());assert.equal(await admin.readSession(db,req),null);
 const r2=response();await admin.login(db,{},r2,{email:profile.email,password});const req2={headers:{cookie:r2.headers['Set-Cookie'][0].split(';')[0]}};
 await admin.changePassword(db,req2,response(),{currentPassword:password,newPassword:'New-password-for-admin'});assert.equal(state.sessions.length,0);assert.equal(await admin.readSession(db,req2),null);
 await assert.rejects(()=>admin.login(db,{},response(),{email:profile.email,password}),e=>e.status===401);assert.ok((await admin.login(db,{},response(),{email:profile.email,password:'New-password-for-admin'})).user);
});
test('API rejects cross-origin, unknown fields and wrong methods before accessing database',async()=>{
 const handle=createHandler({getDB(){throw Error('must not reach database');}});
 for(const request of [{method:'GET'}, {method:'POST',headers:{host:'central.test',origin:'https://evil.test'}}, {method:'POST',headers:{host:'central.test',origin:'https://central.test','content-type':'application/json','x-central-request':'1'},body:{action:'login',email:profile.email,password,role:'admin'}}]){const res=response();await handle(request,res);assert.ok([400,403,405].includes(res.statusCode));}
});
test('forged cookies and expired sessions fail closed',async()=>{
 const {db,state}=await configured();assert.equal(await admin.readSession(db,{headers:{cookie:'__Host-central_admin='+'a'.repeat(64)}}),null);
 const res=response();await admin.login(db,{},res,{email:profile.email,password});state.sessions[0].expires_at=0;assert.equal(await admin.readSession(db,{headers:{cookie:res.headers['Set-Cookie'][0].split(';')[0]}}),null);
 assert.equal(admin.tokenFrom({headers:{cookie:'__Host-central_admin=x; __Host-central_admin=y'}}),null);
});
test('local administrator identity works without calling the Google or Neon Auth service',async()=>{
 const {db}=await configured(),res=response();await admin.login(db,{},res,{email:profile.email,password});
 const req={headers:{cookie:res.headers['Set-Cookie'][0].split(';')[0]}};
 const identity=await require('../lib/identity').getIdentity(req,response(),db);assert.equal(identity.userId,profile.user_id);assert.equal(identity.role,'admin');
});
