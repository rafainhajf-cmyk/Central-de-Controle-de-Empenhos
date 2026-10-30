'use strict';
// Run only as an explicitly selected protected Vercel candidate build command.
// Output contains verification results, never connection strings, cookies or credentials.
const {getDB,inventory}=require('../lib/day-db'),{runDatabaseProbe,runAuthProbe}=require('../lib/day-probe');
(async()=>{
 const db=getDB(),report={database:null,auth:null,sources:{configured:!!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&!!process.env.GOOGLE_PRIVATE_KEY}};
 try{
  const tables=await inventory(db);report.existingTableCount=tables.length;report.neonProjectId=process.env.NEON_PROJECT_ID||null;
  report.database=await runDatabaseProbe(db);
  const host='empenhos-rafainhajf-cmyks-projects.vercel.app';
  report.auth=await runAuthProbe({method:'POST',headers:{host,origin:'https://'+host,'content-type':'application/json','x-central-request':'1'}});
  if(report.sources.configured){
   const source=await require('../lib/day-sources').loadDaySources();report.sources={configured:true,readVerified:source.complete,recordCount:source.records.length};
  }
  console.log('CENTRAL_INTEGRATION_RESULT '+JSON.stringify(report));
  if(!report.database.verified||!report.auth.verified)process.exitCode=1;
 }catch(e){console.log('CENTRAL_INTEGRATION_RESULT '+JSON.stringify({...report,error:{code:/^[A-Z0-9_]{2,40}$/.test(e.code||'')?e.code:'INTEGRATION_FAILED'}}));process.exitCode=1;}
 finally{await db.end();}
})().catch(()=>{console.log('CENTRAL_INTEGRATION_RESULT {"error":{"code":"PROBE_START_FAILED"}}');process.exitCode=1;});
