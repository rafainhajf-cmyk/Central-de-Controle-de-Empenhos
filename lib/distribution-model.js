'use strict';
const {fail,closed}=require('./identity'),{UUID,date}=require('./day-schema'),{civilToday}=require('./business-calendar'),{sumCents}=require('./budget/primitives');
const actions=['distribution-edit','distribution-requisition','distribution-commit','distribution-reverse','distribution-archive','distribution-reopen'];
function text(v,max=1200,required=true){if(typeof v!=='string'||v.length>max||required&&!v.trim())fail('Texto obrigatório ou acima do limite.');return v.trim();}
function cents(v,positive=false){if(!Number.isSafeInteger(v)||v<(positive?1:0))fail('Valor monetário inválido.');return v;}
function validate(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!actions.includes(input.action))fail('Ação de distribuição inválida.');
 const extras={'distribution-edit':['fields'],'distribution-requisition':['amountCents','date','document'],'distribution-commit':['requisitionId','amountCents','date','document'],'distribution-reverse':['eventId'],'distribution-archive':[],'distribution-reopen':[]};
 closed(input,['action','key','expectedVersion','sourceVersion','operationId','note',...extras[input.action]]);
 if(typeof input.key!=='string'||!input.key.startsWith('distribution|')||input.key.length>500||(typeof input.operationId!=='string'||!UUID.test(input.operationId))||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1||(typeof input.sourceVersion!=='string'||! /^[a-f0-9]{64}$/.test(input.sourceVersion)))fail('Identidade ou versão da distribuição inválida.');
 const c={action:input.action,key:input.key,expectedVersion:input.expectedVersion,sourceVersion:input.sourceVersion,operationId:input.operationId.toLowerCase(),note:text(input.note,4000)};
 if(input.action==='distribution-edit'){
  if(!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields))fail('Campos inválidos.');closed(input.fields,['sector','owner','subject','amountCents','distributedOn','nextAction','observation']);c.fields={};
  for(const [k,v]of Object.entries(input.fields)){if(k==='amountCents')c.fields[k]=cents(v);else if(k==='distributedOn'){if(v!==''&&!date(v))fail('Data de distribuição inválida.');c.fields[k]=v;}else c.fields[k]=text(v,k==='observation'?12000:1000,k==='sector');}
  if(!Object.keys(c.fields).length)fail('Informe os campos a alterar.');
 }
 if(['distribution-requisition','distribution-commit'].includes(c.action)){c.amountCents=cents(input.amountCents,true);if(!date(input.date)||input.date>civilToday())fail('Informe uma data válida, até hoje.');c.date=input.date;c.document=text(input.document,300);}
 if(c.action==='distribution-commit'){if(typeof input.requisitionId!=='string'||!UUID.test(input.requisitionId))fail('Requisição inválida.');c.requisitionId=input.requisitionId.toLowerCase();}
 if(c.action==='distribution-reverse'){if(typeof input.eventId!=='string'||!UUID.test(input.eventId))fail('Registro de correção inválido.');c.eventId=input.eventId.toLowerCase();}
 return c;
}
function empty(base){return {schema:1,sourceAmountCents:base.amountCents,overrides:{},requisitions:[],commitments:[],reversals:[],archived:false};}
function position(base,progress,asOf=civilToday()){
 const p=progress||empty(base),reversed=new Set((p.reversals||[]).map(e=>e.eventId)),requisitions=(p.requisitions||[]).filter(e=>!reversed.has(e.id)),commitments=(p.commitments||[]).filter(e=>!reversed.has(e.id));
 const amountCents=p.overrides?.amountCents??base.amountCents,requestedCents=sumCents(requisitions.map(e=>e.amountCents)),committedCents=sumCents(commitments.map(e=>e.amountCents)),valid=Number.isSafeInteger(amountCents)&&amountCents>=requestedCents&&requestedCents>=committedCents;
 const lots=requisitions.map(r=>{const linked=commitments.filter(e=>e.requisitionId===r.id),done=sumCents(linked.map(e=>e.amountCents)),closedOn=done===r.amountCents?linked.map(e=>e.date).sort().at(-1):null;return {...r,committedCents:done,pendingCents:r.amountCents-done,secondOk:done===r.amountCents?'Concluído':done?'Parcial':'Pendente',daysToCommit:Math.max(0,Math.round((Date.parse((closedOn||asOf)+'T12:00:00Z')-Date.parse(r.date+'T12:00:00Z'))/86400000)),closedOn};});
 return {amountCents,requestedCents,committedCents,pendingRequisitionCents:valid?amountCents-requestedCents:null,pendingCommitmentCents:valid?requestedCents-committedCents:null,uncommittedCents:valid?amountCents-committedCents:null,firstOk:!amountCents?'Sem saldo':requestedCents===amountCents?'Concluído':requestedCents?'Parcial':'Pendente',secondOk:!amountCents?'Sem saldo':committedCents===amountCents?'Concluído':committedCents?'Parcial':'Pendente',canArchive:valid&&amountCents===committedCents,archived:p.archived===true,sourceChanged:!!progress&&progress.sourceAmountCents!==base.amountCents,valid,lots,commitments,reversals:p.reversals||[],oldestPendingDays:Math.max(0,...lots.filter(r=>r.pendingCents>0).map(r=>r.daysToCommit))};
}
function apply(base,fields,command,actor,at=new Date().toISOString()){
 const next=structuredClone(fields),p=next.distributionProgress||empty(base);next.distributionProgress=p;
 if(p.schema!==1)fail('Versão de acompanhamento incompatível.',409,'DISTRIBUTION_SCHEMA');
 if(p.archived&&!['distribution-reopen'].includes(command.action))fail('Reabra a distribuição antes de alterar.',409,'DISTRIBUTION_ARCHIVED');
 const before=position(base,p),event={id:command.operationId,date:command.date,document:command.document,note:command.note,actorId:actor.userId,actorName:actor.name||actor.userId,at};
 if(before.sourceChanged&&!['distribution-edit','distribution-reverse','distribution-reopen'].includes(command.action))fail('O valor da fonte mudou. Confira e salve o lançamento antes de confirmar outra etapa.',409,'SOURCE_CHANGED');
 if(command.action==='distribution-edit'){
  for(const [k,v]of Object.entries(command.fields))if(['amountCents','subject','distributedOn'].includes(k))p.overrides[k]=v;else next[k]=v;
  p.sourceAmountCents=base.amountCents;
 }else if(command.action==='distribution-requisition'){
  if(!before.valid||command.amountCents>before.pendingRequisitionCents)fail('A requisição excede o saldo ainda pendente com o setor.',409,'EXCESS_REQUISITION');
  const starts=p.overrides.distributedOn??base.distributedOn;if(starts&&command.date<starts)fail('A requisição não pode anteceder a distribuição.');
  if(before.lots.some(r=>r.document.toLocaleLowerCase('pt-BR')===command.document.toLocaleLowerCase('pt-BR')))fail('Essa requisição já foi registrada. Confira a linha existente.',409,'DUPLICATE_DOCUMENT');
  p.requisitions.push({...event,amountCents:command.amountCents});
 }else if(command.action==='distribution-commit'){
  const lot=before.lots.find(r=>r.id===command.requisitionId);if(!lot)fail('Requisição não encontrada.',404,'NOT_FOUND');
  if(command.date<lot.date)fail('O empenhamento não pode anteceder a entrega da requisição.');
  if(!before.valid||command.amountCents>lot.pendingCents)fail('O empenhamento excede o valor pendente desta requisição.',409,'EXCESS_COMMITMENT');
  // A single NE may cover several requisitions; duplicate use within one lot is refused.
  if(before.commitments.some(e=>e.requisitionId===lot.id&&e.document.toLocaleLowerCase('pt-BR')===command.document.toLocaleLowerCase('pt-BR')))fail('Esse empenho já foi registrado nesta requisição. Use a correção para ajustar o valor.',409,'DUPLICATE_DOCUMENT');
  p.commitments.push({...event,requisitionId:lot.id,amountCents:command.amountCents});
 }else if(command.action==='distribution-reverse'){
  const delivery=before.lots.find(r=>r.id===command.eventId),commit=before.commitments.find(r=>r.id===command.eventId);if(!delivery&&!commit)fail('Registro inexistente ou já corrigido.',409,'EVENT_REVERSED');if(delivery&&delivery.committedCents>0)fail('Corrija primeiro os empenhamentos vinculados a esta requisição.',409,'LINKED_COMMITMENTS');p.reversals.push({...event,eventId:command.eventId});
 }else if(command.action==='distribution-archive'){
  if(!before.canArchive)fail('Só é possível arquivar quando o saldo a empenhar estiver zerado.',409,'BALANCE_PENDING');p.archived=true;
 }else if(command.action==='distribution-reopen'){if(!p.archived)fail('Distribuição já está aberta.',409,'NOT_ARCHIVED');p.archived=false;}
 const after=position(base,p);if(!after.valid&&!['distribution-reverse','distribution-reopen'].includes(command.action))fail('O valor total não pode ficar abaixo das requisições e empenhamentos já confirmados.',409,'BALANCE_PENDING');
 const start=p.overrides.distributedOn??base.distributedOn;if(start&&(start>civilToday()||after.lots.some(r=>r.date<start)))fail('A data de distribuição deve anteceder as requisições e não pode estar no futuro.');
 if(p.requisitions.length+p.commitments.length+p.reversals.length>5000||JSON.stringify(p).length>250000)fail('Histórico excede o limite desta distribuição.',413,'DISTRIBUTION_LIMIT');return next;
}
module.exports={validate,position,apply,empty};
