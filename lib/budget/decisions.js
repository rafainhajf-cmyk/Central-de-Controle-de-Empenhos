'use strict';
const crypto=require('node:crypto'),{can}=require('../permissions'),{date}=require('../day-schema'),{fail}=require('./primitives');
const CATEGORY=['mine','distributed-credit','service','material','aprv','process','contract','order','goal'];
const STAGES=['credit','commitment','sent','scheduled','delivery','service-performed','invoice-received','documentation','certified','sent-to-liquidation','liquidated'];
const QUESTIONS={sent:'A NE foi enviada ao fornecedor?',delivery:'O material foi entregue?','first-notification':'Foi feita a primeira notificação?','second-notification':'Foi feita a segunda notificação?','pa-opened':'O PA foi aberto?','pa-update':'Você consultou o andamento do PA?',scheduled:'O fiscal confirmou o agendamento?','service-performed':'O serviço foi executado?','invoice-received':'A nota fiscal foi recebida?',certified:'A documentação foi atestada?','process-check':'Você verificou o processo, mesmo sem alteração?','order-fulfillment':'A providência determinada foi cumprida?'};
function buildQuestions(activities,responses,identity,asOf){
 if(!date(asOf))fail('Data de referência inválida.');const result=[],seen=new Set();
 for(const a of activities){
  if(['completed','confirmed','cancelled','archived'].includes(a.state)||!can(identity,'read',a))continue;
  if(['process-check','pa-update'].includes(a.stage)&&a.dueOn&&a.dueOn>asOf)continue;
  const id=crypto.createHash('sha256').update(String(a.id)+'|'+String(a.stage)).digest('hex');if(seen.has(id))continue;seen.add(id);
  if(responses.some(r=>r.questionId===id&&r.actorId===identity.userId&&r.activityVersion===a.version&&r.on===asOf))continue;
  result.push({id,activityId:a.id,activityVersion:a.version,question:QUESTIONS[a.stage]||'Qual é a próxima providência para este registro?',subject:a.subject,choices:['yes','no','partial','no-change','not-applicable'],updatesOfficialFinancialData:false,requiresManagerValidation:a.stage==='order-fulfillment'});
 }
 return result;
}
function prioritizeActions(activities,asOf){
 if(!date(asOf))fail('Data de referência inválida.');const rank=(list,value)=>list.includes(value)?list.indexOf(value):list.length;
 return [...activities].sort((a,b)=>rank(CATEGORY,a.category)-rank(CATEGORY,b.category)||String(a.sector||'').localeCompare(String(b.sector||''))||rank(STAGES,a.stage)-rank(STAGES,b.stage)||Number(!!b.dueOn&&b.dueOn<asOf)-Number(!!a.dueOn&&a.dueOn<asOf)||(b.goalPotentialCents||0)-(a.goalPotentialCents||0)||String(a.id).localeCompare(String(b.id)));
}
module.exports={buildQuestions,prioritizeActions,CATEGORY,STAGES};
