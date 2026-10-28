'use strict';
const {getDB,prepare}=require('../lib/day-db'),{synchronize,loadGoogleState}=require('../lib/management-sync'),{projectManagement}=require('../lib/budget/source-adapter');
(async()=>{const db=getDB();try{
 await prepare(db);const state=await loadGoogleState();projectManagement(state,{userId:'initialization',role:'admin',active:true,sectors:[]},new Date().toISOString().slice(0,10));
 const result=await synchronize(db,{actorId:'deployment-initialization',trigger:'initial',loadState:async()=>state});console.log('MANAGEMENT_INITIALIZATION '+JSON.stringify(result));
 }catch(e){console.log('MANAGEMENT_INITIALIZATION '+JSON.stringify({failed:true,code:/^[A-Z_]{2,50}$/.test(e.code||'')?e.code:'INITIALIZATION_FAILED',table:/Cabeçalhos divergentes em ([^;]+)/.exec(e.message||'')?.[1]||null}));process.exitCode=1;}finally{await db.end();}})();
