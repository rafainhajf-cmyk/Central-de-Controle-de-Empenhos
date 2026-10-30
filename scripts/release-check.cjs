'use strict';
const assert=require('node:assert/strict');
const {getDB,prepare}=require('../lib/day-db');
(async()=>{const db=getDB();try{
 const before=(await db.query('SELECT snapshot_id,run_id,updated_at FROM central_day.management_current WHERE id=1')).rows;
 await prepare(db);
 const snapshot=await require('../lib/management-cache').readSnapshot(db);
 assert.ok(snapshot,'Existing source snapshot required');
 const state=require('../lib/management-merge').mergeManagement(snapshot.state,snapshot.manualFields);
 const today=require('../lib/business-calendar').civilToday();
 const view=require('../lib/budget/source-adapter').projectManagement(state,{userId:'release-check-read-only',role:'admin',active:true,sectors:[]},today);
 const sources=await require('../lib/day-sources').loadDaySources(db);
 const candidates=require('../lib/day-rules').deriveActivities(sources,[],(await require('../lib/deadline-settings').read(db)).rules);
 const after=(await db.query('SELECT snapshot_id,run_id,updated_at FROM central_day.management_current WHERE id=1')).rows;
 assert.deepEqual(after,before,'Source snapshot must remain unchanged');
 const localAdmin=await db.query("SELECT count(*)::int AS n FROM central_day.admin_credentials c JOIN central_day.profiles p ON p.user_id=c.user_id WHERE p.role='admin' AND p.active=true");
 console.log('CENTRAL_RELEASE_CHECK '+JSON.stringify({databaseEndpoint:new URL(process.env.DATABASE_URL).hostname,localAdminPasswordConfigured:localAdmin.rows[0].n>0,verified:true,snapshotPreserved:true,source:'Neon',commitments:view.commitments.length,contracts:view.contracts.length,sourceRecords:sources.records.length,activityCandidates:candidates.length}));
 if(process.argv.includes('--browser-fixture'))require('../tests/browser-fixture.cjs').build();
 }finally{await db.end();}})().catch(()=>{console.error('CENTRAL_RELEASE_CHECK_FAILED: publication stopped; existing data preserved.');process.exitCode=1;});

