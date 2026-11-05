'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),queue=require('../priority-queue'),{check}=require('../lib/almox-monitor');
const ne=(number,sector,extra={})=>({id:'ne|160111|2026|'+number,number,ug:'160111',sector,owner:'',nd:'339030',remainingCents:12000,daysSinceEmission:21,holdingCredit:false,...extra});
test('sector priority matches ordered workflow and credits not distributed remain personal',()=>{
 const state={directory:{ownerAssignments:[],people:[]},credits:{received:[{id:'nc|1',number:'2026NC000001',freeToDistributeCents:4500}],unresolved:[]},distributions:[{id:'distribution|1',number:'2026NC000002',sector:'ALMOX',daysSinceDistribution:11,progress:{uncommittedCents:3000}}],commitments:[ne('2026NE000001','ALMOX',{holdingCredit:true}),ne('2026NE000002','ALMOX',{nd:'339039'}),ne('2026NE000003','ALMOX')]};
 const q=queue.queue(state);assert.equal(q.mine.length,1);assert.equal(q.groups.ALMOX[0].items.length,1);assert.equal(q.groups.ALMOX[1].items.length,1);assert.equal(q.groups.ALMOX[2].items.length,1);assert.equal(q.groups.ALMOX[3].items.length,1);
});
test('fiscal responsibility follows a single registered owner-sector assignment',()=>{
 const state={directory:{ownerAssignments:[{name:'Sgt Teste',sector:'APRV'}],people:[]},credits:{received:[]},distributions:[],commitments:[ne('2026NE000004','Fiscalização',{owner:'Sgt Teste',nd:'339039'})]};
 const q=queue.queue(state);assert.equal(q.groups.APRV[2].items.length,1);assert.equal(q.groups['Fiscalização'][2].items.length,0);
});
test('Almox open task counts from creation and closed task counts until completion',()=>{
 const record=ne('2026NE000005','ALMOX',{almox:{status:'Enviado',observation:'Fornecedor notificado'}});
 const activity={id:'activity-1',reference:record.number,ug:record.ug,rule:'send',state:'waiting',createdAt:'2026-10-01T10:00:00Z',dueOn:'2026-10-04',nextAction:'Cobrar fornecedor'};
 let result=queue.almoxReview(record,{asOf:'2026-10-08',pendingActivities:[activity]});
 assert.equal(result.waitingDays,7);assert.equal(result.overdueDays,4);assert.equal(result.taskStatus,'Aguardando retorno');
 result=queue.almoxReview(record,{asOf:'2026-10-10',pendingActivities:[{...activity,state:'completed',updatedAt:'2026-10-09T11:00:00Z'}]});
 assert.equal(result.taskCompletedAt,'2026-10-09T11:00:00Z');assert.equal(result.waitingDays,8);assert.equal(result.taskStatus,'Todas as atividades registradas concluídas');
});
test('Almox deadlines preserve estimated delivery and distinguish source status from proof',()=>{
 const result=check({issuedOn:{value:'2026-10-01'},almox:{status:'Pendente'},sentToSupplierOn:''},'2026-11-05',{dispatchDays:5,deliveryDays:30});
 assert.equal(result.milestones[0].dueOn,'2026-10-06');assert.equal(result.milestones[0].overdueDays,30);assert.equal(result.milestones[1].estimated,true);
 assert.match(result.action,/envio/);
 const sent=check({issuedOn:{value:'2026-10-01'},sentToSupplierOn:'2026-10-04',almox:{status:'Enviado'}},'2026-11-05');
 assert.equal(sent.milestones[1].dueOn,'2026-11-03');assert.equal(sent.milestones[1].overdueDays,2);
});
