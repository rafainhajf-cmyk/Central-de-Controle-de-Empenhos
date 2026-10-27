'use strict';
const crypto=require('node:crypto');
const UGS=['160111','167111'];
function fail(message,status=400,code='INVALID_COMMAND'){const e=Error(message);e.status=status;e.code=code;throw e;}
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function recordVersion(cells){return hash(Array.from({length:12},(_,i)=>cells[i]?.userEnteredValue?.stringValue===''?null:(cells[i]?.userEnteredValue||null)));}
function ncKey(ug,year,nc){return [ug,year,nc].join('|');}
function text(value,name,max,required=false){if(value===undefined&&!required)return '';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail('Campo inválido: '+name);return value.trim();}
function isoDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('Data inválida');const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value||+value.slice(0,4)<2000||+value.slice(0,4)>2100)fail('Data inválida');return value;}
function cents(value,name){if(!Number.isSafeInteger(value)||value<0)fail('Valor inválido em centavos: '+name);return value;}
function ref(value){if(!value||typeof value!=='object'||!['nc','distribution'].includes(value.kind)||!Number.isInteger(value.row)||value.row<2||value.row>100||typeof value.version!=='string'||! /^[a-f0-9]{64}$/.test(value.version))fail('Referência ou versão inválida');return {kind:value.kind,row:value.row,version:value.version,id:text(value.id,'ID',100)};}
const fields={
 'create-nc':['ug','year','nc','date','nd','purpose','receivedCents','committedCents','availableCents','deadline'],
 'associate-ug':['ref','ug'],'update-nc-followup':['ref','deadline'],
 'create-distribution':['ncRef','date','sector','amountCents','purpose','nextAction'],
 'close-distribution':['ref','targetStatus','nextAction']
};
function validateCommand(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(fields,input.action))fail('Operação inválida');
 const allowed=new Set(['operationId','action','owner','document','note',...fields[input.action]]);
 for(const k of Object.keys(input))if(!allowed.has(k))fail('Campo não permitido: '+k);
 if(typeof input.operationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.operationId))fail('Identificador de operação inválido');
 const c={operationId:input.operationId.toLowerCase(),action:input.action,owner:text(input.owner,'responsável',100,true),document:text(input.document,'documento',300,true),note:text(input.note,'observação',1200,['associate-ug','close-distribution'].includes(input.action))};
 if(input.ref!==undefined)c.ref=ref(input.ref);
 if(input.ug!==undefined){if(!UGS.includes(input.ug))fail('UG inválida');c.ug=input.ug;}
 if(c.action==='create-nc'){
  if(!c.ug||!Number.isInteger(input.year)||!/^(20\d{2})NC\d{6}$/.test(input.nc||'')||+input.nc.slice(0,4)!==input.year)fail('NC ou exercício inválido');
  if(!/^\d{6}$/.test(input.nd||''))fail('ND inválida');
  Object.assign(c,{year:input.year,nc:input.nc,date:isoDate(input.date),nd:input.nd,purpose:text(input.purpose,'finalidade',1200,true),deadline:text(input.deadline,'prazo',300),receivedCents:cents(input.receivedCents,'recebido'),committedCents:cents(input.committedCents,'empenhado'),availableCents:cents(input.availableCents,'disponível')});
  if(!Number.isSafeInteger(c.committedCents+c.availableCents)||c.receivedCents!==c.committedCents+c.availableCents)fail('Recebido deve corresponder a empenhado mais disponível. Confira a fonte.');
 }else if(c.action==='associate-ug'){if(!c.ug||!c.ref)fail('Informe UG e registro');}
 else if(c.action==='update-nc-followup'){if(c.ref?.kind!=='nc')fail('Selecione uma NC');c.deadline=text(input.deadline,'prazo',300);}
 else if(c.action==='create-distribution'){
  c.ncRef=ref(input.ncRef);if(c.ncRef.kind!=='nc')fail('Selecione uma NC');
  Object.assign(c,{date:isoDate(input.date),sector:text(input.sector,'setor',100,true),purpose:text(input.purpose,'finalidade',1200,true),nextAction:text(input.nextAction,'próxima providência',600),amountCents:cents(input.amountCents,'distribuição')});if(!c.amountCents)fail('O valor da distribuição deve ser positivo');
 }else{if(c.ref?.kind!=='distribution'||!['Cancelada','Concluída'].includes(input.targetStatus))fail('Encerramento inválido');c.targetStatus=input.targetStatus;c.nextAction=text(input.nextAction,'próxima providência',600);}
 return c;
}
function sourceCents(value){if(typeof value==='string'){const s=value.replace(/^R\$\s*/,'').trim();if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))return null;value=Number(s.replace(/\./g,'').replace(',','.'));}if(typeof value!=='number'||!Number.isFinite(value)||!Number.isSafeInteger(Math.round(value*100))||Math.abs(value*100-Math.round(value*100))>0.001)return null;return Math.round(value*100);}
module.exports={UGS,fail,hash,recordVersion,ncKey,validateCommand,sourceCents};
