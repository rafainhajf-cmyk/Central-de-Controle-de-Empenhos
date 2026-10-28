'use strict';
const crypto=require('node:crypto');
const catalog=require('../sheet-catalog');
const schema=require('../management-schema');
const {googleJson}=require('./google-sheets');
const {sourceCents}=require('./operational-model');
const {rowData,value,quote}=require('./operational-store');
const {fail,versionOf,validateEntity,validateManagementCommand,entityKey}=schema;
const ID='1KKeA5lKttywZp-AvILAhsmfc6XjQ86nYs3OirjE0zco';
const HISTORY=['Quando aconteceu','O que aconteceu','NC, NE ou processo','Setor','Responsável','Como estava antes','Como ficou depois','Onde foi confirmado','Observações'];
const INTERNAL={records:{title:'Cadastros do aplicativo',headers:['ID','Tipo','Chave','Versão','Conteúdo','Estado','Criado em','Alterado em','Origem']},movements:{title:'Movimentos confirmados do aplicativo',headers:['ID da operação','ID do movimento','Tipo','UG','Exercício','NE','Data','Documento','Valor em centavos','Movimento estornado','Marco conciliado','Metadados']}};
const cell=v=>v===undefined||v===null||v===''?{}:{userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v)}};
const occupied=rows=>rows?.some(c=>c?.userEnteredValue&&Object.values(c.userEnteredValue).some(v=>v!==''));
function createManagementContext(token){return {spreadsheetId:ID,core:catalog.map(s=>({id:s.id,title:s.title,lastColumn:s.lastColumn})),internal:{records:{title:INTERNAL.records.title},movements:{title:INTERNAL.movements.title}},request:(path,opts)=>googleJson('https://sheets.googleapis.com/v4/spreadsheets/'+ID+path,token,opts)};}
function unsafe(c){return !!(c?.userEnteredValue?.formulaValue||c?.chipRuns?.length||c?.textFormatRuns?.length);}
function assertHeaders(cells,expected){for(let i=0;i<expected.length;i++)if(value(cells?.[i])!==expected[i]||unsafe(cells?.[i]))fail('Cabeçalhos ou conteúdo nativo divergentes; confira a estrutura.',409,'STRUCTURE_CHANGED');}
function recordKey(kind,fields,id){return ['ne','contract'].includes(kind)?entityKey(kind,fields):kind+'|'+id;}
function parsedRecord(cells,row){
 if(cells.some(unsafe))fail('Cadastro contém fórmula ou conteúdo nativo não suportado.',409,'NATIVE_CELL_CONFLICT');
 try{
  const v=Array.from({length:9},(_,i)=>value(cells[i]));const fields=validateEntity(v[1],JSON.parse(v[4]));const provenance=JSON.parse(v[8]||'{}');
  if(!v[0]||!['active','archived'].includes(v[5])||typeof provenance!=='object'||!provenance||Array.isArray(provenance)||!v[6]||!v[7])throw Error('invalid record');
  const record={id:String(v[0]),kind:v[1],key:String(v[2]),fields,lifecycle:v[5],createdAt:String(v[6]),updatedAt:String(v[7]),provenance};
  if(record.key!==recordKey(record.kind,fields,record.id)||versionOf(record)!==v[3])throw Error('version mismatch');
  return {...record,version:v[3],row};
 }catch(e){if(e.code==='NATIVE_CELL_CONFLICT')throw e;fail('Cadastro inconsistente ou alterado externamente; nenhuma informação foi ignorada.',409,'CORRUPT_RECORD');}
}
function auditEntries(tables){
 const entries=[];
 for(const cells of (tables['Histórico']||[]).slice(1)){
  if(!cells)continue;const text=String(value(cells[8]));let meta;
  try{meta=JSON.parse(text);}catch{if(text.startsWith('{"app":"CCO_MANAGEMENT_V1"'))fail('Histórico de gestão inválido.',409,'CORRUPT_AUDIT');continue;}
  if(meta?.app==='CCO_MANAGEMENT_V1'){
   if(typeof meta.operationId!=='string'||! /^[a-f0-9]{64}$/.test(meta.commandHash||''))fail('Histórico de gestão inválido.',409,'CORRUPT_AUDIT');
   entries.push(meta);
  }
 }
 return entries;
}
function sourceRecords(tables,sourceDate){
 const records=[];
 for(const [index,cells]of(tables['NEs e liquidação']||[]).entries()){
  if(index===0||!occupied(cells))continue;const number=String(value(cells[0]));if(!/^20\d{2}NE\d{6}$/.test(number))continue;
  const rawUG=String(value(cells[15]));const ug=schema.UGS.includes(rawUG)?rawUG:null;
  const fields={ug,year:+number.slice(0,4),number,supplier:String(value(cells[2])),description:String(value(cells[3])),sector:String(value(cells[9])),owner:String(value(cells[10])),status:String(value(cells[11])),holdingCredit:value(cells[12])};
  records.push({kind:'ne',id:'source:ne:'+String(index+1),key:ug?'ne|'+ug+'|'+fields.year+'|'+number:null,fields,financial:{committedCents:sourceCents(value(cells[4])),liquidatedCents:sourceCents(value(cells[5])),cancelledCents:sourceCents(value(cells[6])),remainingCents:sourceCents(value(cells[7]))},originalAlmox:{status:String(value(cells[13])),observation:String(value(cells[14]))},sourceDate,sourceVersion:versionOf(cells.map(c=>c?.userEnteredValue||null)),issues:ug?[]:['UG_PENDING']});
 }
 return records;
}
async function readManagementState(context){
 const meta=await context.request('?fields=sheets.properties');if(!Array.isArray(meta.sheets))fail('Leitura incompleta de metadados.',503,'INCOMPLETE_READ');
 const props={},selected=[];
 for(const expected of context.core){const found=meta.sheets.find(s=>s.properties?.sheetId===expected.id)?.properties;if(!found||found.title!==expected.title)fail('Aba de referência ausente ou renomeada.',409,'STRUCTURE_CHANGED');props[expected.title]=found;selected.push({...expected,columns:expected.lastColumn});}
 const internal={};
 for(const k of ['records','movements']){
  const title=context.internal[k].title;const found=meta.sheets.filter(s=>s.properties.title===title);if(found.length>1)fail('Aba interna duplicada.',409,'STRUCTURE_CHANGED');
  if(found.length){internal[k]=found[0].properties;props[title]=found[0].properties;selected.push({id:internal[k].sheetId,title,columns:k==='records'?'I':'L'});}
 }
 for(const s of selected){const rows=props[s.title].gridProperties?.rowCount;if(!Number.isInteger(rows)||rows<1)fail('Dimensão de leitura inválida.',503,'INCOMPLETE_READ');if(rows>10000)fail('Aba excede o limite seguro; nenhuma linha foi omitida.',413,'READ_LIMIT');}
 const ranges=selected.map(s=>quote(s.title)+'!A1:'+s.columns+props[s.title].gridProperties.rowCount);
 const data=await context.request('?'+ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&')+'&fields=sheets(properties,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,userEnteredFormat,dataValidation,chipRuns,textFormatRuns,note))))');
 const tables={};for(const s of selected){const sheet=data.sheets?.find(x=>x.properties.sheetId===s.id);if(!sheet||!Array.isArray(sheet.data))fail('Consulta incompleta; dados anteriores preservados.',503,'INCOMPLETE_READ');tables[s.title]=rowData(sheet);}
 assertHeaders(tables['Histórico']?.[0],HISTORY);
 for(const k of ['records','movements'])if(internal[k])assertHeaders(tables[context.internal[k].title]?.[0],INTERNAL[k].headers);
 const records=(tables[context.internal.records.title]||[]).map((r,i)=>({r,i})).filter(x=>x.i>0&&occupied(x.r)).map(x=>parsedRecord(x.r,x.i+1));
 if(new Set(records.map(r=>r.id)).size!==records.length||new Set(records.map(r=>r.key)).size!==records.length)fail('Cadastro duplicado; confira a identidade.',409,'DUPLICATE_RECORD');
 const setupRequired=!internal.records||!internal.movements;const sourceDate=String(value(tables['Painel de comando']?.[1]?.[1]));
 return {context,meta,props,internal,tables,records,setupRequired,sourceDate,sourceRecords:sourceRecords(tables,sourceDate),historyEntries:auditEntries(tables),movements:[],reconciliations:[],readAt:new Date().toISOString()};
}
function managementView(state){const legacy=require('./legacy-recovery').recoverLegacy(state);return {setupRequired:state.setupRequired,records:state.records.map(({row,...r})=>r),sourceRecords:state.sourceRecords,legacyCandidates:legacy.candidates,conflicts:legacy.conflicts,movements:state.movements,reconciliations:state.reconciliations,limits:{rows:10000,recordCharacters:45000,observationCharacters:12000},sourceDate:state.sourceDate,readAt:state.readAt};}
function previousOperation(state,id){const matches=state.historyEntries.filter(e=>e.operationId===id);if(matches.length>1)fail('Operação duplicada no histórico.',409,'DUPLICATE_OPERATION');return matches[0]||null;}
function operationResult(state,meta){
 const result={operationId:meta.operationId,state:'confirmed',record:meta.record||null};
 if(meta.action==='prepare'&&state.setupRequired){result.state='confirmed-with-conflict';result.issues=['STRUCTURE_CHANGED'];}
 if(meta.record){const record=state.records.find(r=>r.id===meta.record.id);if(!record||record.version!==meta.record.version){result.state='confirmed-with-conflict';result.issues=['POST_WRITE_CONFLICT'];}}
 if(meta.records){result.records=meta.records;for(const ref of meta.records)if(!state.records.some(r=>r.id===ref.id&&r.version===ref.version)){result.state='confirmed-with-conflict';result.issues=['POST_WRITE_CONFLICT'];}}
 return result;
}
async function findManagementOperation(context,id){const state=await readManagementState(context),meta=previousOperation(state,id);return meta?operationResult(state,meta):{operationId:id,state:'not-found-yet'};}
function nativeCells(values,template=[]){
 return values.map((v,i)=>{
  const old=template[i]||{};if(unsafe(old))fail('Conteúdo nativo exige conferência.',409,'NATIVE_CELL_CONFLICT');
  const result={...cell(v),userEnteredFormat:structuredClone(old.userEnteredFormat||{})};const validation=old.dataValidation;
  if(validation){if(validation.strict&&(validation.condition?.type!=='ONE_OF_LIST'||!validation.condition.values?.some(x=>x.userEnteredValue===String(v))))fail('Validação da célula exige conferência.',409,'NATIVE_VALIDATION_CONFLICT');result.dataValidation=structuredClone(validation);}
  return result;
 });
}
function recordValues(record){const payload=JSON.stringify(record.fields),provenance=JSON.stringify(record.provenance);if(payload.length>45000||provenance.length>45000)fail('Cadastro excede o limite seguro.',413,'RECORD_LIMIT');return [record.id,record.kind,record.key,record.version,payload,record.lifecycle,record.createdAt,record.updatedAt,provenance];}
function planPrepare(state){
 const requests=[],used=new Set(state.meta.sheets.map(s=>s.properties.sheetId));
 for(const k of ['records','movements'])if(!state.internal[k]){
  let id;do{id=crypto.randomInt(10000000,2000000000);}while(used.has(id));used.add(id);
  const headers=INTERNAL[k].headers;
  requests.push({addSheet:{properties:{sheetId:id,title:state.context.internal[k].title,hidden:true,gridProperties:{rowCount:1000,columnCount:headers.length,frozenRowCount:1}}}},{updateCells:{range:{sheetId:id,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:headers.length},rows:[{values:headers.map(cell)}],fields:'userEnteredValue'}});
 }
 return {requests,before:null,after:null};
}
function planRecord(state,c){
 if(state.setupRequired)fail('Prepare os cadastros antes de gravar.',409,'SETUP_REQUIRED');
 if(!['save','archive','restore','resolve-conflict'].includes(c.action))fail('Operação ainda não disponível.',400,'ACTION_UNAVAILABLE');
 const previous=c.ref?state.records.find(r=>r.id===c.ref.id&&r.kind===c.ref.kind):null;
 if(c.ref&&(!previous||previous.version!==c.ref.version))fail('Registro alterado; recarregue antes de salvar.',409,'VERSION_CONFLICT');
 const {row,version,...base}=previous||{};
 const at=new Date().toISOString(),id=previous?.id||crypto.randomUUID(),kind=previous?.kind||c.kind;
 const fields=['save','resolve-conflict'].includes(c.action)?c.fields:previous.fields;
 if(previous&&['ne','contract'].includes(kind)&&entityKey(kind,fields)!==previous.key)fail('Identidade confirmada não pode ser substituída.',409,'IDENTITY_CHANGED');
 const record=previous?{...base,fields,updatedAt:at}:{id,kind,key:recordKey(kind,fields,id),fields,lifecycle:'active',createdAt:at,updatedAt:at,provenance:{source:'Cadastro informado no aplicativo'}};
 if(c.action==='save'&&record.lifecycle==='archived')fail('Reabra o registro antes de editar.',409,'ARCHIVED_RECORD');
 if(c.action==='archive'){if(record.lifecycle!=='active')fail('Registro já arquivado.',409,'TERMINAL_RECORD');record.lifecycle='archived';}
 if(c.action==='restore'){if(record.lifecycle!=='archived')fail('Registro já está ativo.',409,'ACTIVE_RECORD');record.lifecycle='active';}
 if(c.action==='resolve-conflict')record.provenance={...record.provenance,conflicts:[],resolution:{at,reason:c.reason,owner:c.owner}};
 if(state.records.some(r=>r.id!==id&&r.key===record.key))fail('Já existe cadastro com a mesma identidade.',409,'RECORD_EXISTS');
 record.version=versionOf(record);const values=recordValues(record),sheetId=state.internal.records.sheetId;
 let request;
 if(previous){const target=state.tables[state.context.internal.records.title][row-1];if(target.some(unsafe))fail('Registro contém fórmula ou conteúdo nativo.',409,'NATIVE_CELL_CONFLICT');request={updateCells:{range:{sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:0,endColumnIndex:9},rows:[{values:values.map(cell)}],fields:'userEnteredValue'}};}
 else{const table=state.tables[state.context.internal.records.title];if(table.filter(occupied).length>=10000)fail('Limite de cadastros atingido.',413,'RECORD_LIMIT');const template=table.slice(1).filter(occupied).at(-1)||[];request={appendCells:{sheetId,rows:[{values:nativeCells(values,template)}],fields:'userEnteredValue,userEnteredFormat,dataValidation'}};}
 return {requests:[request],before:previous||null,after:record};
}
function planMigration(state,c,review=false){
 if(state.setupRequired)fail('Prepare os cadastros antes de migrar.',409,'SETUP_REQUIRED');
 const recovery=require('./legacy-recovery');let plan;
 if(review){
  const candidate=recovery.recoverLegacy(state).candidates.find(x=>x.migrationId===c.migrationIds[0]);if(!candidate||candidate.kind!==c.kind||candidate.status==='reference-only')fail('Origem divergente; recarregue os dados.',409,'MIGRATION_CHANGED');
  if(candidate.existingId||candidate.status==='applied')fail('Registro já recuperado; abra o cadastro existente.',409,'ALREADY_MIGRATED');
  for(const name of ['number','ug'])if(candidate.fields[name]&&candidate.fields[name]!==c.fields[name])fail('Identidade diverge da origem conhecida.',409,'IDENTITY_CHANGED');
  plan={records:[{id:'imported-'+versionOf(candidate.key),kind:c.kind,fields:c.fields,provenance:{source:'Recuperação conferida pelo operador',migrationIds:candidate.originIds,rawSources:candidate.rawSources,conflicts:[],resolution:{reason:c.reason,owner:c.owner}}}],audit:[{migrationId:candidate.migrationId,originIds:candidate.originIds}]};
 }else plan=recovery.planLegacyMigration(state,c.migrationIds);
 const requests=[],before=[],after=[],at=new Date().toISOString();
 const table=state.tables[state.context.internal.records.title];if(table.filter(occupied).length+plan.records.filter(r=>!r.existingId).length>10000)fail('Limite de cadastros atingido.',413,'RECORD_LIMIT');
 for(const imported of plan.records){
  const previous=state.records.find(r=>r.id===imported.existingId);
  const record={id:imported.id,kind:imported.kind,key:recordKey(imported.kind,imported.fields,imported.id),fields:imported.fields,lifecycle:previous?.lifecycle||'active',createdAt:previous?.createdAt||at,updatedAt:at,provenance:imported.provenance};record.version=versionOf(record);
  if(state.records.some(r=>r.id!==record.id&&r.key===record.key))fail('Identidade já cadastrada; confira o vínculo.',409,'RECORD_EXISTS');
  const values=recordValues(record),sheetId=state.internal.records.sheetId;
  if(previous)requests.push({updateCells:{range:{sheetId,startRowIndex:previous.row-1,endRowIndex:previous.row,startColumnIndex:0,endColumnIndex:9},rows:[{values:values.map(cell)}],fields:'userEnteredValue'}});
  else requests.push({appendCells:{sheetId,rows:[{values:nativeCells(values,table.slice(1).filter(occupied).at(-1)||[])}],fields:'userEnteredValue,userEnteredFormat,dataValidation'}});
  before.push(previous||null);after.push(record);
 }
 return {requests,before,after,migrationAudit:plan.audit};
}
async function executeManagement(context,input){
 const c=validateManagementCommand(input),commandHash=versionOf(c),state=await readManagementState(context),previous=previousOperation(state,c.operationId);
 if(previous){if(previous.commandHash!==commandHash)fail('Identificador já usado com conteúdo diferente.',409,'OPERATION_CHANGED');return operationResult(state,previous);}
 const plan=c.action==='prepare'?planPrepare(state):c.action==='migrate'?planMigration(state,c):c.action==='resolve-conflict'&&!c.ref?planMigration(state,c,true):planRecord(state,c);
 const records=(Array.isArray(plan.after)?plan.after:plan.after?[plan.after]:[]).map(r=>({id:r.id,kind:r.kind,version:r.version}));
 const record=records.length===1?records[0]:null;
 const at=new Date().toISOString(),meta={app:'CCO_MANAGEMENT_V1',operationId:c.operationId,commandHash,action:c.action,at,record,...(Array.isArray(plan.after)?{records,migrationAudit:plan.migrationAudit}:{})};
 const before=JSON.stringify(plan.before),after=JSON.stringify(plan.after);if(before.length>45000||after.length>45000)fail('Auditoria excede limite seguro.',413,'AUDIT_LIMIT');
 const history=state.tables['Histórico'];if(history.filter(occupied).length>=10000)fail('Histórico excede limite seguro.',413,'HISTORY_LIMIT');
 const values=[at,c.action,plan.after?.key||(c.action==='migrate'?'Recuperação de dados legados':'Preparação dos cadastros'),plan.after?.fields?.sector||'',c.owner,before,after,c.document,JSON.stringify({...meta,reason:c.reason})];
 const template=history.filter(occupied).at(-1)||[];
 const audit={appendCells:{sheetId:state.props['Histórico'].sheetId,rows:[{values:nativeCells(values,template)}],fields:'userEnteredValue,userEnteredFormat,dataValidation'}};
 try{await context.request(':batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[...plan.requests,audit]})});}
 catch(e){if(e.status===429)fail('Limite temporário do Google. Consulte o resultado antes de repetir.',429,'GOOGLE_QUOTA');if(e.status>=400&&e.status<500)fail('O Google recusou a gravação; mantenha o rascunho.',503,'GOOGLE_WRITE_REJECTED');fail('Gravação sem confirmação. Consulte o resultado antes de repetir.',503,'RESULT_UNCERTAIN');}
 try{const updated=await readManagementState(context),confirmed=previousOperation(updated,c.operationId);if(!confirmed)fail('Resultado ainda sem confirmação.',503,'RESULT_UNCERTAIN');return operationResult(updated,confirmed);}
 catch(e){if(e.code==='RESULT_UNCERTAIN')throw e;fail('Leitura de confirmação falhou. Consulte antes de repetir.',503,'RESULT_UNCERTAIN');}
}
module.exports={INTERNAL,HISTORY,cell,occupied,recordKey,createManagementContext,readManagementState,managementView,executeManagement,findManagementOperation};
