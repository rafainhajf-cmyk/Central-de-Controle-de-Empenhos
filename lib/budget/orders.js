'use strict';
const {fail,stable,cents}=require('./primitives'),{date}=require('../day-schema'),{addDays}=require('./timelines');
function applyOrderAction(order,input,identity,at){
 if(!identity?.active||!identity.userId)fail('Usuário não autenticado.','FORBIDDEN');
 const keys=['operationId','version','action','note','evidenceIds'];if(!input||Object.keys(input).some(k=>!keys.includes(k))||typeof input.operationId!=='string'||!input.operationId||!['progress','report','confirm','cancel','not-fulfilled','reopen'].includes(input.action)||typeof input.note!=='string'||!input.note.trim()||input.note.length>12000)fail('Providência ou justificativa inválida.');
 if(!Number.isFinite(Date.parse(at)))fail('Instante de registro inválido.');
 const evidenceIds=input.evidenceIds??[];if(!Array.isArray(evidenceIds)||evidenceIds.some(e=>typeof e!=='string'||!e||e.length>200))fail('Referências de evidência inválidas.');
 const command={...input,evidenceIds:[...new Set(evidenceIds)].sort()},hash=stable(command),previous=(order.history||[]).find(e=>e.operationId===input.operationId);
 if(previous){if(previous.actorId!==identity.userId||previous.commandHash!==hash)fail('Identificador usado com outro conteúdo.','OPERATION_CHANGED');return structuredClone(order);}
 const manager=['admin','manager'].includes(identity.role);
 if(['confirm','cancel','not-fulfilled','reopen'].includes(input.action)&&!manager||!manager&&order.assigneeId!==identity.userId)fail('Você não pode registrar essa providência.','FORBIDDEN');
 if(order.version!==input.version)fail('A ordem foi alterada. Recarregue antes de responder.','VERSION_CONFLICT');
 if(['confirmed','cancelled'].includes(order.state)&&input.action!=='reopen')fail('Reabra a ordem antes de alterar.');
 if(input.action==='reopen'&&!['confirmed','cancelled','not-fulfilled'].includes(order.state))fail('A ordem já está aberta.');
 if(input.action==='confirm'&&(order.state!=='reported'||!command.evidenceIds.length))fail('Informe cumprimento e evidência antes da confirmação gerencial.');
 const states={progress:'in-progress',report:'reported',confirm:'confirmed',cancel:'cancelled','not-fulfilled':'not-fulfilled',reopen:'awaiting'};
 const before={state:order.state,version:order.version,completedAt:order.completedAt||null},after={state:states[input.action],version:order.version+1,completedAt:input.action==='confirm'?at:null};
 const event={operationId:input.operationId,actorId:identity.userId,at,sector:order.sector||null,action:input.action,note:input.note,evidenceIds:command.evidenceIds,before,after,commandHash:hash};
 return {...structuredClone(order),...after,response:input.action==='report'||input.action==='progress'?input.note:order.response||null,history:[...structuredClone(order.history||[]),event]};
}
function contractAlerts(contract,asOf,rules={}){
 if(!date(asOf))fail('Data de referência inválida.');const alerts=[];
 if(date(contract.endsOn)){if(contract.endsOn<asOf)alerts.push('VIGENCY_EXPIRED');else if(contract.endsOn<=addDays(asOf,rules.noticeDays??30))alerts.push('VIGENCY_ENDING');}else alerts.push('VIGENCY_UNKNOWN');
 if(contract.remainingCents==null)alerts.push('BALANCE_UNKNOWN');else{cents(contract.remainingCents);if(contract.remainingCents===0)alerts.push('BALANCE_EXHAUSTED');else if(rules.lowBalanceCents!==undefined&&contract.remainingCents<=cents(rules.lowBalanceCents))alerts.push('LOW_BALANCE');}
 if(contract.closureDocumentsPending)alerts.push('CLOSURE_DOCUMENTS_PENDING');
 const closed=contract.closureConfirmed===true&&!!contract.closureDocumentId&&date(contract.closedOn);
 return {alerts,closed:!!closed,nextAction:closed?'Consultar encerramento confirmado':'Registrar providência do fiscal; prazo ou saldo não encerram o contrato'};
}
module.exports={applyOrderAction,contractAlerts};
