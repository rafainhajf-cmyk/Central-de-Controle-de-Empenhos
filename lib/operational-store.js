'use strict';
const {fail,recordVersion,sourceCents,UGS}=require('./operational-model');
const {googleJson}=require('./google-sheets');
const {creditFormulas}=require('./credit-formulas');
const ID='1KKeA5lKttywZp-AvILAhsmfc6XjQ86nYs3OirjE0zco';
const HEADERS={nc:['Número da NC','Quando o crédito chegou','Natureza da despesa (ND)','Para que o crédito foi recebido','Valor recebido (R$)','Valor já empenhado (R$)','Valor ainda disponível (R$)','Prazo de empenho informado na NC','Dias desde o recebimento (na fonte)','O que verificar'],distribution:['Quando distribuí','NC ou NE de origem','Setor que recebeu','Quem ficou responsável','Valor entregue ao setor (R$)','Para que o valor será usado','Situação da distribuição','Saldo disponível da NC no SIAFI (R$)','Total empenhado da NC no SIAFI (R$)','O que acompanhar agora'],history:['Quando aconteceu','O que aconteceu','NC, NE ou processo','Setor','Responsável','Como estava antes','Como ficou depois','Onde foi confirmado','Observações']};
function productionContext(token){return {spreadsheetId:ID,sheets:{nc:{id:1250001001,title:'NCs e prazos'},distribution:{id:1250001003,title:'Distribuições detalhadas'},history:{id:1878020711,title:'Histórico'},credit:{id:1250001600,title:'Crédito livre e distribuído'},source:{id:1250001601,title:'Painel de comando',cell:'B2'},report:{id:344209735,title:'Relatório diário',cell:'$B$5'}},request:(path,options)=>googleJson('https://sheets.googleapis.com/v4/spreadsheets/'+ID+path,token,options)};}
const entered=c=>c?.userEnteredValue;
const value=c=>c?.effectiveValue?.stringValue??c?.effectiveValue?.numberValue??entered(c)?.stringValue??entered(c)?.numberValue??'';
const any=rows=>rows.some(c=>{const v=entered(c);return v&&Object.values(v).some(x=>x!==''&&x!==undefined)});
const quote=t=>"'"+t.replace(/'/g,"''")+"'";
function rowData(sheet){const blocks=sheet.data||[],rows=[];for(const block of blocks){const start=block.startRow||0,col=block.startColumn||0;for(const [i,row]of(block.rowData||[]).entries()){rows[start+i]||=[];for(const[j,c]of(row?.values||[]).entries())rows[start+i][col+j]=c;}}return rows;}
async function readOperationalState(context){
 const meta=await context.request('?fields=sheets.properties');
 const props={};for(const kind of ['nc','distribution','history','credit','source']){const expected=context.sheets[kind],p=meta.sheets?.find(s=>s.properties.sheetId===expected.id)?.properties;if(!p||p.title!==expected.title)fail('Estrutura das abas divergente; confira a planilha.',409,'STRUCTURE_CHANGED');props[kind]=p;}
 if(props.history.gridProperties.rowCount>10000)fail('Histórico excede a leitura segura; nenhuma linha foi ignorada.',413,'HISTORY_LIMIT');
 for(const k of ['nc','distribution'])if(props[k].gridProperties.rowCount>10000)fail('Aba operacional excede a leitura segura.',413,'OPERATIONAL_LIMIT');
 const ranges=['nc','distribution'].map(k=>quote(context.sheets[k].title)+'!A1:L'+props[k].gridProperties.rowCount);
 ranges.push(quote(context.sheets.history.title)+'!A1:I'+props.history.gridProperties.rowCount,quote(context.sheets.credit.title)+'!A1:M100',quote(context.sheets.source.title)+'!'+context.sheets.source.cell);
 const data=await context.request('?'+ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&')+'&fields=sheets(properties,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,userEnteredFormat,dataValidation,chipRuns,textFormatRuns))))');
 const tables={};for(const kind of ['nc','distribution','history','credit','source']){const sheet=data.sheets?.find(s=>s.properties.sheetId===context.sheets[kind].id);if(!sheet||!Array.isArray(sheet.data))fail('Leitura incompleta; dados anteriores preservados.',503,'INCOMPLETE_READ');tables[kind]=rowData(sheet);}
 const setup={};for(const kind of ['nc','distribution','history']){const h=tables[kind][0]||[];for(const[i,label]of HEADERS[kind].entries())if(value(h[i])!==label||entered(h[i])?.formulaValue)fail('Cabeçalhos divergentes em '+context.sheets[kind].title,409,'STRUCTURE_CHANGED');if(kind!=='history'){const a=value(h[10]),b=value(h[11]);if(entered(h[10])?.formulaValue||entered(h[11])?.formulaValue||!((a===''&&b==='')||(a==='UG'&&b==='ID de controle')))fail('Colunas de controle ocupadas ou divergentes.',409,'STRUCTURE_CHANGED');setup[kind]=a==='';if(setup[kind]&&tables[kind].slice(1).some(r=>any(r.slice(10,12))))fail('Colunas sem cabeçalho contêm dados; preparação recusada.',409,'STRUCTURE_CHANGED');}}
 const records={};for(const kind of ['nc','distribution'])records[kind]=(tables[kind]||[]).map((cells,i)=>({cells,row:i+1})).filter(r=>r.row>1&&any(r.cells)).map(r=>{const values=Array.from({length:12},(_,i)=>value(r.cells[i]));const ug=String(values[10]),reference=String(values[kind==='nc'?0:1]);const issues=[];if(r.row>100)issues.push('OUTSIDE_FORMULA_RANGE');if(!UGS.includes(ug))issues.push('UG_PENDING');if(r.cells.some(c=>entered(c)?.formulaValue))issues.push('FORMULA_PRESENT');if(r.cells.some(c=>c?.chipRuns?.length||c?.textFormatRuns?.length))issues.push('NATIVE_CELL_PRESENT');if(!/^20\d{2}NC\d{6}$/.test(reference))issues.push('REFERENCE_INVALID');return {...r,values,ug,nc:reference,issues,ref:{kind,row:r.row,id:String(values[11]),version:recordVersion(r.cells)}};});
 for(const nc of records.nc)if(records.nc.filter(r=>r.nc===nc.nc).length>1)nc.issues.push('NC_DUPLICATE');
 for(const dist of records.distribution){const matches=records.nc.filter(r=>r.nc===dist.nc);if(!matches.length)dist.issues.push('NC_NOT_FOUND');else if(matches.length>1)dist.issues.push('NC_DUPLICATE');else if(UGS.includes(dist.ug)&&UGS.includes(matches[0].ug)&&dist.ug!==matches[0].ug)dist.issues.push('UG_MISMATCH');}
 const address=/^\$?([A-Z]+)\$?(\d+)$/.exec(context.sheets.source.cell);if(!address)fail('Endereço interno de fonte inválido.',503,'INTERNAL_CONTEXT');const sourceColumn=[...address[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;const sourceCells=tables.source[Number(address[2])-1]||[];
 return {context,props,tables,setup,ncs:records.nc,distributions:records.distribution,sourceDate:String(value(sourceCells[sourceColumn])),readAt:new Date().toISOString()};
}
function toReadModel(state){
 const ncs=state.ncs.map(r=>({ref:r.ref,nc:r.nc,ug:r.ug,year:+r.nc.slice(0,4),date:String(r.values[1]),nd:String(r.values[2]),purpose:String(r.values[3]),receivedCents:sourceCents(r.values[4]),committedCents:sourceCents(r.values[5]),availableCents:sourceCents(r.values[6]),deadline:String(r.values[7]),note:String(r.values[9]),balance:distributionBalance(state,r.ref),issues:r.issues}));
 const distributions=state.distributions.map(r=>({ref:r.ref,nc:r.nc,ug:r.ug,date:String(r.values[0]),sector:String(r.values[2]),owner:String(r.values[3]),amountCents:sourceCents(r.values[4]),purpose:String(r.values[5]),status:String(r.values[6]),nextAction:String(r.values[9]),issues:r.issues}));
 const recentOperations=auditEntries(state).slice(-20).reverse().map(e=>({operationId:e.meta.operationId,action:String(value(e.cells[1])),at:e.meta.at,owner:String(value(e.cells[4])),nc:e.meta.record?.nc||'',ug:e.meta.record?.ug||'',note:e.meta.note||''}));
 return {recentOperations,ncs,distributions,sourceDate:state.sourceDate,readAt:state.readAt,setupRequired:Object.values(state.setup).some(Boolean),issues:[...new Set([...ncs,...distributions].flatMap(r=>r.issues))]};
}
module.exports={HEADERS,productionContext,readOperationalState,toReadModel,value,rowData,quote,any};

const crypto=require('node:crypto');
const {validateCommand,hash,ncKey}=require('./operational-model');
const toCell=v=>v===''||v===undefined||v===null?{}:{userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}};
function update(context,kind,row,column,values){return {updateCells:{start:{sheetId:context.sheets[kind].id,rowIndex:row-1,columnIndex:column},rows:[{values:values.map(toCell)}],fields:'userEnteredValue'}};}
function checkFormulaScope(state){
 for(let row=2;row<=100;row++)for(const [column,expected]of creditFormulas(row,state.context.sheets).entries())if(entered(state.tables.credit[row-1]?.[column])?.formulaValue!==expected)fail('As fórmulas de crédito mudaram; confira a integração antes de gravar.',409,'FORMULA_SCOPE_CHANGED');
}

function target(state,ref){
 const list=ref.kind==='nc'?state.ncs:state.distributions;
 const rows=ref.id?list.filter(r=>r.ref.id===ref.id):list.filter(r=>r.row===ref.row);
 if(rows.length!==1||rows[0].ref.version!==ref.version)fail('Registro alterado desde a seleção. Recarregue os dados.',409,'VERSION_CONFLICT');
 const r=rows[0];if(r.issues.some(i=>['FORMULA_PRESENT','REFERENCE_INVALID','NC_DUPLICATE','OUTSIDE_FORMULA_RANGE','NATIVE_CELL_PRESENT'].includes(i)))fail('Registro exige conferência antes de alteração.',409,'RECORD_CONFLICT');return r;
}
function auditEntries(state){const entries=[];for(const cells of state.tables.history.slice(1)){if(!cells)continue;try{const meta=JSON.parse(String(value(cells[8])));if(meta.app==='CCO_OPERATIONS_V1'&&typeof meta.operationId==='string')entries.push({meta,cells});}catch{/* Preserve unrelated historical text. */}}return entries;}
function storedOperation(state,id){const entries=auditEntries(state).filter(e=>e.meta.operationId===id);if(!entries.length)return null;if(entries.length!==1)fail('Identificador duplicado no histórico; conferência necessária.',409,'DUPLICATE_OPERATION');const {meta}=entries[0];return {operationId:id,state:'confirmed',at:meta.at,version:meta.afterVersion,record:meta.record,commandHash:meta.commandHash};}
function verifyResult(state,result){
 const record=result.record||{},rows=record.kind==='nc'?state.ncs:state.distributions;
 const current=rows.filter(r=>record.id?r.ref.id===record.id:r.row===record.row),issues=[];
 if(current.length!==1||current[0].ref.version!==result.version)issues.push('POST_WRITE_CONFLICT');
 const linked=record.kind==='distribution'?state.ncs.find(n=>n.nc===record.nc&&n.ug===record.ug):null;
 if(linked&&distributionBalance(state,linked.ref).issues.length)issues.push('POST_BALANCE_CONFLICT');
 try{checkFormulaScope(state);}catch{issues.push('POST_FORMULA_CONFLICT');}
 if(issues.length){result.state='confirmed-with-conflict';result.issues=issues;}
 delete result.commandHash;return result;
}
async function findOperation(context,id){const state=await readOperationalState(context);const result=storedOperation(state,id);return result?verifyResult(state,result):null;}

function nextRow(state,kind){let row=1;for(const [index,cells]of state.tables[kind].entries())if(cells&&any(cells))row=index+1;if(row>=100)fail('Limite das fórmulas atingido. Nenhum registro foi inserido fora do intervalo.',409,'FORMULA_ROW_LIMIT');return row+1;}
function displayDate(iso){return iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);}
function distributionBalance(state,ncRef){
 const nc=state.ncs.find(r=>ncRef.id?r.ref.id===ncRef.id:r.row===ncRef.row);
 if(!nc)return {availableCents:null,reservedCents:0,freeCents:null,issues:['NC_NOT_FOUND']};
 const issues=[...nc.issues],amounts=[4,5,6].map(i=>sourceCents(nc.values[i]));
 if(amounts.some(v=>v===null||v<0)||amounts[0]!==amounts[1]+amounts[2])issues.push('MONEY_INVALID');
 const availableCents=amounts[2];let reservedCents=0;
 for(const d of state.distributions.filter(r=>r.nc===nc.nc)){
  issues.push(...d.issues);if(d.ug!==nc.ug)issues.push('UG_MISMATCH');
  if(['Cancelada','Concluída'].includes(d.values[6]))continue;
  if(d.values[6]!=='Ativa')issues.push('STATUS_UNVERIFIED');
  const amount=sourceCents(d.values[4]);if(amount===null||amount<0||!Number.isSafeInteger(reservedCents+amount))issues.push('MONEY_INVALID');else reservedCents+=amount;
 }
 const freeCents=availableCents===null?null:availableCents-reservedCents;if(freeCents!==null&&freeCents<0)issues.push('OVER_RESERVED');
 return {availableCents,reservedCents,freeCents,issues:[...new Set(issues)]};
}
function plannedChange(state,c){
 let kind,row,before=[],after,requests=[];
 if(c.action==='create-nc'){
  if(state.ncs.some(r=>r.nc===c.nc))fail('Número de NC já cadastrado, inclusive em outra UG. Confira a fonte.',409,'NC_EXISTS');
  kind='nc';row=nextRow(state,kind);
  after=[c.nc,displayDate(c.date),c.nd,c.purpose,c.receivedCents/100,c.committedCents/100,c.availableCents/100,c.deadline,'','Cadastro manual a conferir com a fonte SIAFI. '+c.note+' Documento: '+c.document,c.ug,c.operationId];
  requests.push(update(state.context,kind,row,0,after));
 }else if(['associate-ug','update-nc-followup'].includes(c.action)){
  const r=target(state,c.ref);kind=c.ref.kind;row=r.row;before=r.values;after=[...before];
  if(c.action==='associate-ug'){
   if(UGS.includes(r.ug)&&r.ug!==c.ug)fail('UG já confirmada; não será substituída automaticamente.',409,'UG_ALREADY_SET');
   const related=kind==='distribution'?state.ncs.filter(x=>x.nc===r.nc):state.distributions.filter(x=>x.nc===r.nc);
   if(related.some(x=>UGS.includes(x.ug)&&x.ug!==c.ug))fail('UG diverge dos registros vinculados; confira a associação.',409,'UG_MISMATCH');
   after[10]=c.ug;after[11]=after[11]||crypto.randomUUID();requests.push(update(state.context,kind,row,10,after.slice(10,12)));
  }else{after[7]=c.deadline;after[9]=c.note;requests.push(update(state.context,kind,row,7,[after[7]]),update(state.context,kind,row,9,[after[9]]));}
 }else if(c.action==='create-distribution'){
  const nc=target(state,c.ncRef),balance=distributionBalance(state,c.ncRef);
  if(balance.issues.length)fail('Saldo ou vínculo de UG pendente de conferência. Resolva as pendências da NC e suas distribuições.',409,'BALANCE_UNVERIFIED');
  if(c.amountCents>balance.freeCents)fail('Valor superior ao saldo livre após as reservas ativas.',409,'INSUFFICIENT_BALANCE');
  kind='distribution';row=nextRow(state,kind);
  after=[displayDate(c.date),nc.nc,c.sector,c.owner,c.amountCents/100,c.purpose,'Ativa',balance.availableCents/100,sourceCents(nc.values[5])/100,c.nextAction,nc.ug,c.operationId];
  requests.push(update(state.context,kind,row,0,after));
 }else if(c.action==='close-distribution'){
  const r=target(state,c.ref);if(!UGS.includes(r.ug))fail('Confirme a UG da distribuição antes de encerrar.',409,'UG_PENDING');
  if(['Cancelada','Concluída'].includes(r.values[6]))fail('Distribuição já encerrada. Não será reaberta ou sobrescrita.',409,'TERMINAL_DISTRIBUTION');
  if(r.values[6]!=='Ativa')fail('Situação anterior precisa ser conferida antes de encerrar.',409,'STATUS_UNVERIFIED');
  kind='distribution';row=r.row;before=r.values;after=[...before];after[6]=c.targetStatus;after[9]=c.nextAction||c.targetStatus+': '+c.note;
  requests.push(update(state.context,kind,row,6,[after[6]]),update(state.context,kind,row,9,[after[9]]));
 }else fail('Operação ainda indisponível',400);
 return {kind,row,before,after,requests};
}
async function executeOperation(context,input){
 const c=validateCommand(input),commandHash=hash(c),state=await readOperationalState(context);
 const prior=storedOperation(state,c.operationId);if(prior){if(prior.commandHash!==commandHash)fail('Identificador já usado com conteúdo diferente.',409,'OPERATION_CHANGED');return verifyResult(state,prior);}
 checkFormulaScope(state);
 const change=plannedChange(state,c),requests=[];
 for(const kind of ['nc','distribution'])if(state.setup[kind])requests.push(update(context,kind,1,10,['UG','ID de controle']));
 requests.push(...change.requests);
 const at=new Date().toISOString(),cells=change.after.map(toCell),afterVersion=recordVersion(cells);
 const reference=String(change.after[change.kind==='nc'?0:1]),ug=String(change.after[10]),record={kind:change.kind,row:change.row,id:String(change.after[11]),nc:reference,ug};
 const meta={app:'CCO_OPERATIONS_V1',operationId:c.operationId,commandHash,at,afterVersion,record,preparedHeaders:Object.keys(state.setup).filter(k=>state.setup[k])};
 const beforeText=JSON.stringify(change.before),afterText=JSON.stringify(change.after);if(beforeText.length>45000||afterText.length>45000)fail('Registro excede o limite seguro de auditoria.',413,'AUDIT_LIMIT');
 const history=[at,c.action,ncKey(ug,+reference.slice(0,4),reference),change.kind==='distribution'?String(change.after[2]):'',c.owner,beforeText,afterText,c.document,JSON.stringify({...meta,note:c.note})];
 const priorHistory=state.tables.history.filter(r=>r&&any(r)).at(-1)||[];
 const auditCells=history.map((v,i)=>({...toCell(v),userEnteredFormat:structuredClone(priorHistory[i]?.userEnteredFormat||{}),...(priorHistory[i]?.dataValidation?{dataValidation:structuredClone(priorHistory[i].dataValidation)}:{})}));
 for(const cell of auditCells){const rule=cell.dataValidation;if(rule?.strict){if(rule.condition?.type!=='ONE_OF_LIST'||!rule.condition.values?.some(v=>v.userEnteredValue===String(value(cell))))fail('Validação nativa do histórico exige conferência.',409,'NATIVE_VALIDATION_CONFLICT');}}
 requests.push({appendCells:{sheetId:context.sheets.history.id,rows:[{values:auditCells}],fields:'userEnteredValue,userEnteredFormat,dataValidation'}});
 try{await context.request(':batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests})});}catch(e){if(e.status&&e.status>=400&&e.status<500){if(e.status===429)fail('Limite temporário do Google; mantenha o rascunho e consulte antes de repetir.',429,'GOOGLE_QUOTA');fail('O Google recusou a gravação; confira permissões e estrutura.',503,'GOOGLE_WRITE_REJECTED');}fail('Sem confirmação de gravação. Consulte o resultado pelo identificador antes de repetir.',503,'RESULT_UNCERTAIN');}
 try{
  const updated=await readOperationalState(context),result=storedOperation(updated,c.operationId);
  if(!result)fail('Resultado não encontrado após o envio.',503,'RESULT_UNCERTAIN');
  return verifyResult(updated,result);
 }catch(e){if(e.code==='RESULT_UNCERTAIN')throw e;fail('Gravação enviada; conferência do resultado ainda pendente.',503,'RESULT_UNCERTAIN');}
}
Object.assign(module.exports,{distributionBalance,executeOperation,findOperation,checkFormulaScope,plannedChange,toCell,update,target,storedOperation});
