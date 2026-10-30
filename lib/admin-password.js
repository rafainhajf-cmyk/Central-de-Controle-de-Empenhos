'use strict';
const crypto=require('node:crypto'),{promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt),COOKIE='__Host-central_admin',TTL=8*60*60,REMEMBER_TTL=30*24*60*60;
const {fail}=require('./identity');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function validatePassword(password){if(typeof password!=='string'||password.length<12||password.length>128)fail('Use uma senha entre 12 e 128 caracteres.');}
async function hashPassword(password){
 validatePassword(password);const salt=crypto.randomBytes(32).toString('hex');
 const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return 'scrypt-v1$'+salt+'$'+key.toString('hex');
}
async function verifyPassword(password,encoded){
 if(typeof password!=='string'||password.length>128)return false;
 const parts=String(encoded||'').split('$');
 // Perform the same expensive work for nonexistent accounts.
 const valid=parts.length===3&&parts[0]==='scrypt-v1'&&/^[a-f0-9]{64}$/.test(parts[1])&&/^[a-f0-9]{128}$/.test(parts[2]);
 const key=await scrypt(password,valid?parts[1]:'0'.repeat(64),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return valid&&crypto.timingSafeEqual(key,Buffer.from(parts[2],'hex'));
}
function tokenFrom(req){
 const match=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
 if(match.length!==1)return null;const token=match[0].slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(token)?token:null;
}
function setCookie(res,token,maxAge=TTL){
 const before=res.getHeader?.('Set-Cookie')||[];
 res.setHeader('Set-Cookie',[...(Array.isArray(before)?before:[before]),COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge]);
}
function actor(p){return {userId:p.user_id,name:p.name,email:p.email,role:p.role,sectors:p.sectors,active:true};}
async function readSession(db,req){
 const token=tokenFrom(req);if(!token)return null;
 const p=(await db.query(`SELECT p.user_id,p.name,p.email,p.role,p.sectors FROM central_day.admin_sessions s
 JOIN central_day.admin_credentials c ON c.user_id=s.user_id AND c.version=s.credential_version
 JOIN central_day.profiles p ON p.user_id=s.user_id
 WHERE s.token_hash=$1 AND s.expires_at>now() AND p.active=true AND p.role='admin'
 AND (p.sessions_valid_after IS NULL OR s.created_at>p.sessions_valid_after)`,[digest(token)])).rows[0];
 return p?actor(p):null;
}
async function setup(db,req,{email,password},authenticated){
 validatePassword(password);const owner=process.env.CENTRAL_OWNER_EMAIL?.trim().toLowerCase();
 if(!owner||typeof email!=='string'||email.trim().toLowerCase()!==owner)fail('Não foi possível configurar o acesso.',403,'FORBIDDEN');
 const verified=authenticated?.active===true&&authenticated.role==='admin'&&authenticated.email?.trim().toLowerCase()===owner;
 if(!verified&&!require('./google-sheets').authorized(req))fail('Entre como administrador ou informe a chave atual do painel para definir a primeira senha.',401,'SETUP_AUTH_REQUIRED');
 const encoded=await hashPassword(password);
 return require('./day-db').transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,6)');
  const p=(await c.query("SELECT user_id,name,email,role,sectors FROM central_day.profiles WHERE lower(email)=$1 AND role='admin' AND active=true FOR UPDATE",[owner])).rows[0];
  if(!p||(verified&&p.user_id!==authenticated.userId))fail('Perfil de administrador indisponível.',403,'FORBIDDEN');
  if((await c.query('SELECT 1 FROM central_day.admin_credentials WHERE user_id=$1',[p.user_id])).rows.length)fail('Senha já definida. Entre com e-mail e senha.',409,'ADMIN_ALREADY_CONFIGURED');
  await c.query('INSERT INTO central_day.admin_credentials(user_id,password_hash) VALUES($1,$2)',[p.user_id,encoded]);
  await c.query('INSERT INTO central_day.profile_events(actor_id,target_id,after_data) VALUES($1,$1,$2)',[p.user_id,JSON.stringify({reason:'admin-password-configured',method:verified?'admin-session':'existing-panel-key'})]);
  return {configured:true};
 });
}
async function login(db,req,res,{email,password,remember=false}){
 if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>128||!password)fail('Dados de entrada inválidos.');
 if(typeof remember!=='boolean')fail('Opção de sessão inválida.');
 await require('./profile-store').limitLogin(db,req,email.trim().toLowerCase());
 const p=(await db.query(`SELECT p.user_id,p.name,p.email,p.role,p.sectors,c.password_hash,c.version FROM central_day.profiles p
 JOIN central_day.admin_credentials c ON c.user_id=p.user_id WHERE lower(p.email)=$1 AND p.role='admin' AND p.active=true`,[email.trim().toLowerCase()])).rows[0];
 if(!await verifyPassword(password,p?.password_hash))fail('Usuário ou senha inválidos.',401,'INVALID_LOGIN');
 const token=crypto.randomBytes(32).toString('hex');
 // Lock the credential while issuing the session, so password changes cannot race login.
 await require('./day-db').transaction(db,async c=>{
  const current=(await c.query("SELECT c.version FROM central_day.admin_credentials c JOIN central_day.profiles p ON p.user_id=c.user_id WHERE c.user_id=$1 AND p.active=true AND p.role='admin' FOR UPDATE OF c,p",[p.user_id])).rows[0];
  if(!current||current.version!==p.version)fail('Entre novamente com sua senha atual.',401,'INVALID_LOGIN');
  await c.query('DELETE FROM central_day.admin_sessions WHERE expires_at<=now()');
  await c.query("INSERT INTO central_day.admin_sessions(token_hash,user_id,credential_version,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')",[digest(token),p.user_id,p.version,remember?REMEMBER_TTL:TTL]);
 });
 setCookie(res,token,remember?REMEMBER_TTL:TTL);return {user:actor(p)};
}
async function consumeLoginLink(db,req,res,{token}){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('Link de acesso inválido.',401,'INVALID_LOGIN_LINK');
 await require('./profile-store').limitLogin(db,req,'admin-login-link');
 const sessionToken=crypto.randomBytes(32).toString('hex');
 const user=await require('./day-db').transaction(db,async c=>{
  const p=(await c.query(`SELECT p.user_id,p.name,p.email,p.role,p.sectors,c.version FROM central_day.admin_login_links l
   JOIN central_day.admin_credentials c ON c.user_id=l.user_id AND c.version=l.credential_version
   JOIN central_day.profiles p ON p.user_id=l.user_id
   WHERE l.token_hash=$1 AND l.consumed_at IS NULL AND l.expires_at>now() AND p.active=true AND p.role='admin'
   AND (p.sessions_valid_after IS NULL OR l.created_at>p.sessions_valid_after) FOR UPDATE OF l,c,p`,[digest(token)])).rows[0];
  if(!p)fail('Link expirado ou já utilizado. Solicite um novo link pessoal ou entre com sua senha.',401,'INVALID_LOGIN_LINK');
  await c.query("INSERT INTO central_day.admin_sessions(token_hash,user_id,credential_version,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')",[digest(sessionToken),p.user_id,p.version,REMEMBER_TTL]);
  await c.query('UPDATE central_day.admin_login_links SET consumed_at=now() WHERE token_hash=$1',[digest(token)]);
  await c.query('INSERT INTO central_day.profile_events(actor_id,target_id,after_data) VALUES($1,$1,$2)',[p.user_id,JSON.stringify({reason:'admin-personal-link-used',rememberedDays:30})]);
  return actor(p);
 });
 setCookie(res,sessionToken,REMEMBER_TTL);return {user};
}
async function logout(db,req,res){const token=tokenFrom(req);if(token)await db.query('DELETE FROM central_day.admin_sessions WHERE token_hash=$1',[digest(token)]);setCookie(res,'',0);return {signedOut:true};}
async function changePassword(db,req,res,{currentPassword,newPassword}){
 const user=await readSession(db,req);if(!user)fail('Entre como administrador.',401,'UNAUTHORIZED');
 validatePassword(newPassword);await require('./profile-store').limitLogin(db,req,user.email.toLowerCase());
 const before=(await db.query('SELECT password_hash,version FROM central_day.admin_credentials WHERE user_id=$1',[user.userId])).rows[0];
 if(!await verifyPassword(currentPassword,before?.password_hash))fail('Senha atual inválida.',401,'INVALID_LOGIN');
 const encoded=await hashPassword(newPassword);
 await require('./day-db').transaction(db,async c=>{
  const changed=await c.query('UPDATE central_day.admin_credentials SET password_hash=$2,version=version+1,updated_at=now() WHERE user_id=$1 AND version=$3 RETURNING user_id',[user.userId,encoded,before.version]);
  if(!changed.rows.length)fail('Senha alterada em outra sessão. Entre novamente.',409,'VERSION_CONFLICT');
  await c.query('DELETE FROM central_day.admin_sessions WHERE user_id=$1',[user.userId]);
  await c.query('INSERT INTO central_day.profile_events(actor_id,target_id,after_data) VALUES($1,$1,$2)',[user.userId,JSON.stringify({reason:'admin-password-changed',sessionsRevoked:true})]);
 });
 setCookie(res,'',0);return {updated:true,signedOut:true};
}
module.exports={hashPassword,verifyPassword,readSession,setup,login,consumeLoginLink,logout,changePassword,tokenFrom};
