'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fail}=require('./identity');
let pool;
function getDB(){
 if(!process.env.DATABASE_URL)fail('Banco do Meu Dia ainda não configurado.',503,'DB_NOT_CONFIGURED');
 if(!pool){const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,statement_timeout:20000});pool.on('error',()=>{});}
 return pool;
}
async function transaction(db,fn){
 // PGlite exposes transaction(); Pool uses a dedicated connection per transaction.
 if(db.transaction)return db.transaction(fn);
 const client=await db.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(e){try{await client.query('ROLLBACK');}catch{}throw e;}finally{client.release();}
}
const migration=()=>fs.readFileSync(path.join(__dirname,'../migrations/001-meu-dia.sql'),'utf8');
async function inventory(db){return (await db.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name")).rows;}
async function prepare(db){
 const sql=migration(),fingerprint=crypto.createHash('sha256').update(sql).digest('hex');
 return transaction(db,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(193371,1)');
  const exists=(await c.query("SELECT 1 FROM information_schema.schemata WHERE schema_name='central_day'")).rows.length;
  if(exists){
   const table=(await c.query("SELECT 1 FROM information_schema.tables WHERE table_schema='central_day' AND table_name='schema_version'")).rows.length;
   if(!table)fail('Estrutura existente não reconhecida. Banco preservado.',409,'SCHEMA_CONFLICT');
   const versions=(await c.query('SELECT version,fingerprint FROM central_day.schema_version')).rows;
   if(versions.length!==1||versions[0].version!==1||versions[0].fingerprint!==fingerprint)fail('Versão do banco incompatível. Banco preservado.',409,'SCHEMA_CONFLICT');
   await c.query(fs.readFileSync(path.join(__dirname,'../migrations/002-google-access.sql'),'utf8'));
   await require('./management-cache').prepareManagement(c);
   return {prepared:true,created:false};
  }
  // Single, reviewed, additive migration. Existing schemas are never modified.
  if(c.exec)await c.exec(sql);else await c.query(sql);
  await c.query('INSERT INTO central_day.schema_version(version,fingerprint) VALUES(1,$1)',[fingerprint]);
  await c.query(fs.readFileSync(path.join(__dirname,'../migrations/002-google-access.sql'),'utf8'));
   await require('./management-cache').prepareManagement(c);
  return {prepared:true,created:true};
 });
}
module.exports={getDB,transaction,prepare,inventory};
