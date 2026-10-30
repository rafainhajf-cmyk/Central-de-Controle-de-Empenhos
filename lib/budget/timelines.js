'use strict';
const {date}=require('../day-schema'),{addBusinessDays}=require('../business-calendar'),{fail,uniqueEvents}=require('./primitives'),{confirmedEvent}=require('./evidence');
function addDays(start,days,mode='calendar',calendar=[]){if(!date(start))return null;if(!Number.isInteger(days)||days<0||days>3650||!['calendar','business'].includes(mode))fail('Regra de prazo inválida.');if(mode==='business')return addBusinessDays(start,days,calendar);const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function deadline(on,estimated=false,origin=null){return {on:date(on)?on:null,estimated,origin};}
function verifiedEvents(events,asOf){return uniqueEvents(events).filter(e=>confirmedEvent(e)&&date(e.on)&&e.on<=asOf).sort((a,b)=>a.on.localeCompare(b.on));}
function factDate(f){return f?.trust==='confirmed'&&date(f.value)?f.value:null;}
function last(events,kind){return events.filter(e=>e.kind===kind).at(-1);}
function reviewChecks(events,kind,asOf){return uniqueEvents(events).filter(e=>e.kind===kind&&e.actorId&&date(e.on)&&e.on<=asOf&&['no-change','progress','pending','completed'].includes(e.outcome)).sort((a,b)=>a.on.localeCompare(b.on));}
function classifyFlow(record,rules={},exception=null){
 if(exception){if(exception.confirmed!==true||!exception.reason?.trim()||!['almox','fiscal','aprv'].includes(exception.flow))fail('Exceção de classificação exige confirmação e motivo.');return {flow:exception.flow,origin:'individual-exception',reason:exception.reason};}
 if((rules.serviceNDs||['339039']).includes(record.nd))return {flow:'fiscal',origin:'nd-rule'};
 if(record.nd==='339030'&&(rules.aprvSubitems||['07','04','21']).includes(String(record.subitem||'').padStart(2,'0')))return {flow:'aprv',origin:'subitem-rule'};
 if(!record.nd)return {flow:null,origin:'unclassified',issues:['ND_PENDING']};
 return {flow:'almox',origin:'residual-rule',issues:record.nd?[]:['ND_PENDING']};
}
function materialTimeline(record,events,rules={},calendar=[],asOf){
 if(!date(asOf))fail('Data de referência inválida.');const valid=verifiedEvents(events,asOf),issued=factDate(record.issuedOn),sent=last(valid,'sent'),first=last(valid,'first-notification'),second=last(valid,'second-notification'),pa=last(valid,'pa-opened');
 const dispatchDue=deadline(addDays(issued,rules.dispatchDays??5,rules.dispatchMode||'calendar',calendar),false,'emission');
 const dispatchOn=sent?.on||dispatchDue.on,estimated=!sent;
 const explicit=factDate(record.contractDeliveryDueOn),deliveryDue=deadline(explicit||addDays(dispatchOn,rules.deliveryDays??30,rules.deliveryMode||'calendar',calendar),!explicit&&estimated,explicit?'contract':'dispatch');
 const complete=valid.some(e=>e.kind==='delivery'&&e.complete===true);
 let nextAction,nextDue;
 if(complete){nextAction='documentation';nextDue=deadline(null);}
 else if(pa){const checks=reviewChecks(events,'pa-update',asOf).filter(e=>e.on>=pa.on),anchor=checks.at(-1)?.on||pa.on;nextAction='pa-update';nextDue=deadline(addDays(anchor,rules.paReviewDays??7,rules.paReviewMode||'calendar',calendar),false,'last-pa-update');}
 else if(second){nextAction='pa-opened';nextDue=deadline(addDays(second.on,rules.paDays??10,rules.paMode||'calendar',calendar),false,'second-notification');}
 else if(first){nextAction='second-notification';nextDue=deadline(addDays(first.on,rules.secondNoticeDays??10,rules.secondNoticeMode||'calendar',calendar),false,'first-notification');}
 else if(deliveryDue.on&&asOf>deliveryDue.on){nextAction='first-notification';nextDue=deliveryDue;}
 else if(!sent){nextAction='sent';nextDue=dispatchDue;}
 else{nextAction='delivery';nextDue=deliveryDue;}
 const overdue=!!nextDue.on&&asOf>nextDue.on;
 const sufficient=!!nextDue.on&&!nextDue.estimated&&record.unresolvedConfirmed===true;
 return {dispatchDue,dispatchOn:deadline(dispatchOn,estimated,sent?'dispatch-document':'dispatch-estimate'),deliveryDue,nextAction,nextDue,overdue,breachConfirmed:overdue&&sufficient,state:complete?'documentation':!nextDue.on||nextDue.estimated||overdue&&!sufficient?'verify':overdue?'overdue':'pending',closed:false,partialDelivery:valid.some(e=>e.kind==='delivery'&&e.complete===false),missingMilestones:!issued?['EMISSION_NOT_CONFIRMED']:[],reason:overdue&&!sufficient?'Verificar situação: prazo transcorrido sem comprovação suficiente.':null};
}
const SERVICE_STAGES=['sent','scheduled','service-performed','measured','invoice-received','certified','sent-to-liquidation','liquidated'];
function serviceTimeline(record,events,rules={},calendar=[],asOf){
 if(!date(asOf))fail('Data de referência inválida.');const valid=verifiedEvents(events,asOf),stages=SERVICE_STAGES.filter(s=>s!=='measured'||record.measurementRequired===true);let previous=factDate(record.issuedOn),blockedAt=null;
 for(const stage of stages){const done=last(valid,stage);if(!done||done.complete===false||stage==='liquidated'&&record.remainingCents!==0){blockedAt=stage;break;}previous=done.on;}
 const setting=rules[blockedAt],due=setting?addDays(previous,setting.days,setting.mode||'calendar',calendar):null;
 return {blockedAt,nextDue:deadline(due,false,'previous-confirmed-stage'),overdue:!!due&&asOf>due,closed:blockedAt===null,state:blockedAt===null?'completed':!previous||!due?'verify':'pending'};
}
function processReview(process,events,asOf,rules={}){
 if(!date(asOf))fail('Data de referência inválida.');const checks=reviewChecks(events,'process-check',asOf),distributed=date(process.distributedOn)?process.distributedOn:null,anchor=checks.at(-1)?.on||distributed;
 const next=addDays(anchor,rules.reviewDays??7,rules.reviewMode||'calendar',rules.calendar||[]);
 return {nextDue:deadline(next,false,checks.length?'last-process-check':'distribution'),overdue:!!next&&asOf>next,lastCheck:checks.at(-1)||null,state:next?'pending':'verify',linkedCreditRequired:false};
}
module.exports={addDays,classifyFlow,materialTimeline,serviceTimeline,processReview,SERVICE_STAGES};
