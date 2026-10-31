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
