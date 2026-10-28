'use strict';
const {stable,fail}=require('./primitives');
const LABELS={confirmed:'Confirmado',reported:'Informado pelo setor',divergent:'Divergente',missing:'Sem informação',pending:'Aguardando confirmação'};
function resolveFacts(input){
 if(!Array.isArray(input))fail('Fatos inválidos.');
 const facts=input.filter(f=>f&&f.value!==null&&f.value!==undefined&&f.value!=='');
 if(facts.some(f=>!['confirmed','reported','pending'].includes(f.trust)||!f.source))fail('Fato sem confiabilidade/origem definida.');
 if(!facts.length)return {status:'missing',value:null,alternatives:[]};
 const confirmed=facts.filter(f=>f.trust==='confirmed'),manual=confirmed.filter(f=>f.manual===true),chosen=manual.length?manual:confirmed.length?confirmed:facts;
 const different=list=>new Set(list.map(f=>stable(f.value))).size>1;
 const conflict=different(confirmed.length?confirmed:facts);
 const value=different(chosen)?null:chosen[0].value;
 return {status:conflict?'divergent':chosen[0].trust,value,manualPreserved:manual.length>0,alternatives:structuredClone(facts)};
}
function confirmedEvent(event){return !!event&&event.trust==='confirmed'&&typeof event.evidenceId==='string'&&!!event.evidenceId.trim();}
module.exports={LABELS,resolveFacts,confirmedEvent};
