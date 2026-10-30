'use strict';
const {fail,closed}=require('./identity');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ACTIONS=['charge','partial','wait','progress','complete','reopen','assign','create'];
function date(v){if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function text(v,max=12000,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail('Texto inválido ou acima do limite.');return v;}
function validate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Comando inválido.');
 closed(input,['operationId','action','id','version','note','nextAction','dueOn','sector','assigneeId','subject','reference']);
 if(typeof input.operationId!=='string'||!UUID.test(input.operationId)||!ACTIONS.includes(input.action))fail('Identificador ou ação inválidos.');
 const c={operationId:input.operationId.toLowerCase(),action:input.action,note:text(input.note??'',12000,true)};
 if(c.action==='create'){
  c.subject=text(input.subject,500,true);c.reference=text(input.reference??'',500);c.sector=input.sector===null?null:text(input.sector,100,true);
 }else{
  if(typeof input.id!=='string'||!UUID.test(input.id)||!Number.isSafeInteger(input.version)||input.version<1)fail('Identidade ou versão inválida.');c.id=input.id.toLowerCase();c.version=input.version;
 }
 for(const key of ['nextAction','dueOn','sector','assigneeId'])if(Object.hasOwn(input,key)){
  if(key==='dueOn'){if(input[key]!==null&&!date(input[key]))fail('Prazo inválido.');c[key]=input[key];}
  else if(key==='nextAction')c[key]=text(input[key]);
  else c[key]=input[key]===null?null:text(input[key],key==='sector'?100:200,true);
 }
 if(['charge','partial','wait'].includes(c.action)&&!c.nextAction?.trim())fail('Informe o próximo passo para manter a pendência acompanhada.');
 if(c.action!=='assign'&&c.action!=='create'&&(Object.hasOwn(input,'sector')||Object.hasOwn(input,'assigneeId')))fail('Atribuição exige ação específica.');
 if(c.action==='assign'&&(!Object.hasOwn(input,'sector')||!Object.hasOwn(input,'assigneeId')))fail('Informe setor e responsável, ou deixe responsável sem atribuição.');
 return c;
}
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
module.exports={UUID,ACTIONS,date,text,validate,stable};
