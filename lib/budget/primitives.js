'use strict';
function fail(message,code='INVALID_BUDGET_DATA'){const e=Error(message);Object.assign(e,{code,status:400});throw e;}
function cents(v,{nullable=false}={}){if(nullable&&(v===null||v===undefined))return null;if(!Number.isSafeInteger(v)||v<0)fail('Valor monetário inválido.');return v;}
function safeNumber(n){if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))fail('Valor excede precisão monetária segura.','MONEY_OVERFLOW');return Number(n);}
function sumCents(values){return safeNumber(values.reduce((sum,v)=>sum+BigInt(cents(v)),0n));}
function financialKey(kind,r){
 if(!['nc','ne'].includes(kind))fail('Tipo financeiro inválido.');
 if(!r||!r.ug||!r.year||!r.number)return null;
 if(!/^\d{6}$/.test(r.ug)||!Number.isInteger(r.year)||!new RegExp('^'+r.year+kind.toUpperCase()+'\\d{6}$').test(r.number))fail('Identidade financeira incompatível.');
 return [kind,r.ug,r.year,r.number].join('|');
}
function ratioBasisPoints(amount,base){cents(amount);cents(base);return base?safeNumber(BigInt(amount)*10000n/BigInt(base)):null;}
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
function uniqueEvents(events){const map=new Map();for(const e of events){if(!e.id)fail('Evento sem identificador.');const previous=map.get(e.id);if(previous&&stable(previous)!==stable(e))fail('Mesmo evento com conteúdos diferentes.','EVENT_CONFLICT');map.set(e.id,e);}return [...map.values()];}
module.exports={fail,cents,safeNumber,sumCents,financialKey,ratioBasisPoints,stable,uniqueEvents};
