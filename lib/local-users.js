'use strict';
const crypto=require('node:crypto'),{fail,closed}=require('./identity'),{can,ROLES}=require('./permissions'),{transaction}=require('./day-db');
const LOGIN=/^[a-z][a-z0-9._-]{2,39}$/;
function validate(input){
 closed(input,['name','email','password','role','sectors']);
 const login=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(!LOGIN.test(login)||typeof input.name!=='string'||!input.name.trim()||input.name.length>160||!ROLES.includes(input.role)||!Array.isArray(input.sectors)||input.sectors.length>40||input.sectors.some(s=>typeof s!=='string'||!s.trim()||s.length>100))fail('Dados de usuário inválidos.');
 if(typeof input.password!=='string'||input.password.length<6||input.password.length>128)fail('Use uma senha entre 6 e 128 caracteres para o login local.');
 return {...input,name:input.name.trim(),login,sectors:[...new Set(input.sectors.map(s=>s.trim()))]};
}
async function provision(db,actor,input){
 if(!can(actor,'manage-users'))fail('Acesso não autorizado.',403,'FORBIDDEN');
 const p=validate(input),encoded=await require('./admin-password').hashPassword(p.password,{minimum:6}),id=crypto.randomUUID();
 return transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,2)');
  if((await c.query('SELECT 1 FROM central_day.admin_credentials WHERE lower(login)=$1',[p.login])).rows.length)fail('Login já cadastrado.',409,'USER_EXISTS');
  // This reserved address is an internal identifier, never an email destination.
  await c.query('INSERT INTO central_day.profiles(user_id,email,name,role,sectors) VALUES($1,$2,$3,$4,$5)',[id,p.login+'@local.central.invalid',p.name,p.role,p.sectors]);
  await c.query('INSERT INTO central_day.admin_credentials(user_id,password_hash,login) VALUES($1,$2,$3)',[id,encoded,p.login]);
  const after={userId:id,name:p.name,login:p.login,role:p.role,sectors:p.sectors,active:true};
  await c.query('INSERT INTO central_day.profile_events(actor_id,target_id,after_data) VALUES($1,$2,$3)',[actor.userId,id,JSON.stringify({...after,reason:'local-user-created'})]);return after;
 });
}
module.exports={LOGIN,validate,provision};
