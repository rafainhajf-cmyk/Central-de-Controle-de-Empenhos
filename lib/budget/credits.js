'use strict';
const {cents,sumCents,financialKey,uniqueEvents,fail}=require('./primitives');
function creditViews(records,exercise){
 if(!Number.isInteger(exercise))fail('Exercício inválido.');const seen=new Set(),received=[],unresolved=[];
 for(const r of records){if(r.year!==exercise)continue;const key=financialKey('nc',r);if(!key){unresolved.push(r);continue;}if(seen.has(key))fail('NC duplicada; confira a identidade.','DUPLICATE_IDENTITY');seen.add(key);cents(r.availableCents,{nullable:true});received.push(r);}
 return {received,available:received.filter(r=>r.availableCents>0),unresolved};
}
function distributionState(distribution,events){
 const original=cents(distribution.distributedCents);const own=uniqueEvents(events).filter(e=>e.distributionId===distribution.id),confirmed=own.filter(e=>e.trust==='confirmed');
 let executed=0;
 for(const e of confirmed){if(!['commitment','commitment-reversal'].includes(e.kind))fail('Movimento de distribuição inválido.');const value=cents(e.amountCents);if(e.kind==='commitment')executed=sumCents([executed,value]);else{executed-=value;if(executed<0)fail('Estorno superior ao empenhamento.','OVER_REVERSAL');}}
 if(executed>original)fail('Empenhamento superior à distribuição.','OVER_EXECUTION');
 return {distributedCents:original,executedCents:executed,pendingCents:original-executed,canArchive:executed===original,reportedEvents:own.filter(e=>e.trust!=='confirmed'),history:own};
}
module.exports={creditViews,distributionState};
