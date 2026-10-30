'use strict';
const crypto=require('node:crypto');
const {transaction}=require('./day-db'),{fail,closed}=require('./identity'),{ROLES,can}=require('./permissions');
function validateProfile(input){
 closed(input,['name','email','password','role','sectors']);
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>160||typeof input.email!=='string'||!/^\S+@\S+\.\S+$/.test(input.email)||input.email.length>254||!ROLES.includes(input.role)||!Array.isArray(input.sectors)||input.sectors.length>40||input.sectors.some(s=>typeof s!=='string'||!s.trim()||s.length>100))fail('Dados de usuário inválidos.');
 if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)fail('Use uma senha entre 12 e 128 caracteres.');
 return {name:input.name.trim(),email:input.email.trim().toLowerCase(),password:input.password,role:input.role,sectors:[...new Set(input.sectors.map(s=>s.trim()))]};
}
async function limitLogin(db,req,email){
 const period=Math.floor(Date.now()/900000),ip=req.headers?.['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown';
 for(const [kind,value,max]of [['email',email,10],['ip',ip,50]]){
  const bucket=crypto.createHash('sha256').update((process.env.NEON_AUTH_COOKIE_SECRET||'test')+'|'+kind+'|'+value+'|'+period).digest('hex');
  const r=await db.query('INSERT INTO central_day.login_limits(bucket,attempts,expires_at) VALUES($1,1,now()+interval \'15 minutes\') ON CONFLICT(bucket) DO UPDATE SET attempts=central_day.login_limits.attempts+1 RETURNING attempts',[bucket]);
  if(r.rows[0].attempts>max)fail('Aguarde antes de tentar entrar novamente.',429,'LOGIN_RATE_LIMIT');
 }
}
async function provision(db,auth,input,actor,{bootstrap=false}={}){
 const p=validateProfile(input);
 if(bootstrap){if(p.role!=='admin')fail('O primeiro perfil deve ser administrador.');}
 else if(!can(actor,'manage-users'))fail('Acesso não autorizado.',403,'FORBIDDEN');
 return transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,2)');
  if(bootstrap&&(await c.query("SELECT 1 FROM central_day.profiles WHERE role='admin'")).rows.length)fail('Administrador inicial já configurado.',409,'BOOTSTRAP_CLOSED');
  if((await c.query('SELECT 1 FROM central_day.profiles WHERE email=$1',[p.email])).rows.length)fail('Usuário já configurado. Abra o cadastro existente.',409,'USER_EXISTS');
  // Provider credentials are used only here; neither result nor event contains passwords/tokens.
  let r=await auth.signUp.email({name:p.name,email:p.email,password:p.password});
  if(r.error){
   // Recovery for a provider success whose local transaction did not commit: verify the password, never bind by name/email alone.
   r=await auth.signIn.email({email:p.email,password:p.password});
  }
  if(r.error||!r.data?.user?.id||r.data.user.email?.toLowerCase()!==p.email)fail('Não foi possível criar ou vincular o usuário. Confira os dados e a configuração do login.',409,'PROVIDER_USER_UNCONFIRMED');
  const id=r.data.user.id;
  await c.query('INSERT INTO central_day.profiles(user_id,email,name,role,sectors) VALUES($1,$2,$3,$4,$5)',[id,p.email,p.name,p.role,p.sectors]);
  const after={userId:id,name:p.name,email:p.email,role:p.role,sectors:p.sectors,active:true};
  await c.query('INSERT INTO central_day.profile_events(actor_id,target_id,after_data) VALUES($1,$2,$3)',[actor?.userId||id,id,JSON.stringify(after)]);
  return after;
 });
}
async function updateProfile(db,actor,input){
 if(!can(actor,'manage-users'))fail('Acesso não autorizado.',403,'FORBIDDEN');
 closed(input,['userId','role','sectors','active']);
 if(typeof input.userId!=='string'||!ROLES.includes(input.role)||typeof input.active!=='boolean'||!Array.isArray(input.sectors)||input.sectors.length>40||input.sectors.some(s=>typeof s!=='string'||!s.trim()||s.length>100))fail('Perfil inválido.');
 if(input.userId===actor.userId&&(!input.active||input.role!=='admin'))fail('Não desative ou rebaixe seu próprio administrador.',409,'SELF_ADMIN_CHANGE');
 return transaction(db,async c=>{
  const before=(await c.query('SELECT user_id,name,email,role,sectors,active FROM central_day.profiles WHERE user_id=$1 FOR UPDATE',[input.userId])).rows[0];if(!before)fail('Usuário não encontrado.',404,'NOT_FOUND');
  await c.query('UPDATE central_day.profiles SET role=$2,sectors=$3,active=$4,sessions_valid_after=CASE WHEN $4=false THEN now() ELSE sessions_valid_after END,updated_at=now() WHERE user_id=$1',[input.userId,input.role,[...new Set(input.sectors.map(s=>s.trim()))],input.active]);
  const after={...before,role:input.role,sectors:input.sectors,active:input.active};
  await c.query('INSERT INTO central_day.profile_events(actor_id,target_id,before_data,after_data) VALUES($1,$2,$3,$4)',[actor.userId,input.userId,JSON.stringify(before),JSON.stringify(after)]);
  return {updated:true};
 });
}
module.exports={validateProfile,limitLogin,provision,updateProfile};
