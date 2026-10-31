'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./fixtures/management');
const {mergeManagement}=require('../lib/management-merge');
const {projectManagement}=require('../lib/budget/source-adapter');
const actor={active:true,userId:'test-admin',role:'admin',sectors:[]};
test('manual NE assignment, owner, stage and next action take precedence in gerencial view',()=>{
 const state=fixture(),key='ne|160111|2026|2026NE000001';
 const manual={[key]:{version:2,fields:{sector:'Fiscalização',owner:'Tenente teste',status:'Aguardando ateste',nextAction:'Cobrar documento'}}};
 const view=projectManagement(mergeManagement(state,manual),actor,'2026-10-31');
 const ne=view.commitments.find(r=>r.number==='2026NE000001');
 assert.ok(ne);
 assert.equal(ne.sector,'Fiscalização');
 assert.equal(ne.owner,'Tenente teste');
 assert.equal(ne.reportedStage,'Aguardando ateste');
 assert.equal(ne.nextAction,'Cobrar documento');
 assert.equal(ne.manualVersion,2);
});

test('NC PRO is read from manual Neon fields using canonical NC and UG identity',()=>{
 const state=fixture();state.tables['NCs e prazos'].push(['2026NC000555','2026-10-01','339030','Aquisição',500,200,300,'Prazo','','','160111',''].map(x=>({userEnteredValue:typeof x==='number'?{numberValue:x}:{stringValue:String(x)},effectiveValue:typeof x==='number'?{numberValue:x}:{stringValue:String(x)}})));
 const key='nc|160111|2026|2026NC000555';
 const view=projectManagement(mergeManagement(state,{[key]:{version:3,fields:{pro:'PRO 123/2026'}}}),actor,'2026-10-31');
 const nc=[...view.credits.available,...view.credits.received,...view.credits.unresolved].find(x=>x.number==='2026NC000555');
 assert.ok(nc);assert.equal(nc.id,key);assert.equal(nc.pro,'PRO 123/2026');assert.equal(nc.manualVersion,3);
});
