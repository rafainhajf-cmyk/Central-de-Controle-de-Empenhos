'use strict';
const {transaction}=require('./day-db'),{fail,closed}=require('./identity'),{ROLES}=require('./permissions');
const columns='user_id,name,email,role,sectors,active,sessions_valid_after';
async function reconcile(db,s,owner=process.env.CENTRAL_OWNER_EMAIL){
 if(!s?.user?.id||!s.session||Date.parse(s.session.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(s.session.expiresAt)))return null;
 const existing=(await db.query('SELECT '+columns+' FROM central_day.profiles WHERE user_id=$1',[s.user.id])).rows[0];
 const isOwner=owner&&(s.user.email?.trim().toLowerCase()===owner.trim().toLowerCase()||existing?.email?.toLowerCase()===owner.trim().toLowerCase());
 if(isOwner&&(s.user.email?.trim().toLowerCase()!==owner.trim().toLowerCase()||s.user.emailVerified!==true||!(await db.query('SELECT 1 FROM neon_auth.account WHERE "userId"=$1 AND "providerId"=$2',[s.user.id,'google'])).rows.length))return null;
 if(existing)return existing;
 const u=s.user;if(u.emailVerified!==true||typeof u.email!=='string'||!u.email||u.email.length>254)return null;
 if(!(await db.query('SELECT 1 FROM neon_auth.account WHERE "userId"=$1 AND "providerId"=$2',[u.id,'google'])).rows.length)return null;
 return transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,2)');
  const prior=(await c.query('SELECT '+columns+' FROM central_day.profiles WHERE user_id=$1',[u.id])).rows[0];if(prior)return prior;
  const email=u.email.trim().toLowerCase(),name=String(u.name||email).slice(0,160);
  if(owner&&email===owner.trim().toLowerCase()){
   // A different provider account with the same email is never silently rebound.
   if((await c.query('SELECT 1 FROM central_day.profiles WHERE email=$1',[email])).rows.length)fail('Conta já vinculada. Entre com a conta original.',409,'ACCOUNT_CONFLICT');
   const p=(await c.query('INSERT INTO central_day.profiles(user_id,email,name,role,sectors) VALUES($1,$2,$3,$4,$5) RETURNING '+columns,[u.id,email,name,'admin',[]])).rows[0];
   await c.query('INSERT INTO central_day.profile_events(actor_id,target_id,after_data) VALUES($1,$1,$2)',[u.id,JSON.stringify({reason:'verified-google-owner',role:'admin'})]);return p;
  }
  await c.query('INSERT INTO central_day.access_requests(user_id,email,name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',[u.id,email,name]);return null;
 });
}
function requireOwner(actor,owner=process.env.CENTRAL_OWNER_EMAIL){if(!owner||actor?.role!=='admin'||actor.active===false||actor.email?.toLowerCase()!==owner.toLowerCase())fail('Somente o administrador titular pode autorizar acessos.',403,'FORBIDDEN');}
async function decide(db,actor,input,owner=process.env.CENTRAL_OWNER_EMAIL){
 requireOwner(actor,owner);closed(input,['userId','decision','role','sectors']);
 if(typeof input.userId!=='string'||!['approve','deny'].includes(input.decision)||!ROLES.includes(input.role)||!Array.isArray(input.sectors)||input.sectors.length>40||input.sectors.some(s=>typeof s!=='string'||!s.trim()||s.length>100))fail('Solicitação inválida.');
 return transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,2)');
  const r=(await c.query('SELECT * FROM central_day.access_requests WHERE user_id=$1 FOR UPDATE',[input.userId])).rows[0];if(!r||r.status!=='pending')fail('Solicitação já decidida ou inexistente.',409,'REQUEST_CLOSED');
  if(input.decision==='approve')await c.query('INSERT INTO central_day.profiles(user_id,email,name,role,sectors) VALUES($1,$2,$3,$4,$5)',[r.user_id,r.email,r.name,input.role,[...new Set(input.sectors.map(s=>s.trim()))]]);
  await c.query('UPDATE central_day.access_requests SET status=$2,decided_at=now(),decided_by=$3 WHERE user_id=$1',[r.user_id,input.decision==='approve'?'approved':'denied',actor.userId]);
  await c.query('INSERT INTO central_day.profile_events(actor_id,target_id,after_data) VALUES($1,$2,$3)',[actor.userId,r.user_id,JSON.stringify({decision:input.decision,role:input.role,sectors:input.sectors})]);return {updated:true};
 });
}
module.exports={reconcile,decide,requireOwner};
