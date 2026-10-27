'use strict';
const crypto=require('node:crypto');
const {creditFormulas}=require('./credit-formulas');
const {HEADERS,readOperationalState,executeOperation,findOperation,quote,toCell}=require('./operational-store');
function assertion(condition,message){if(!condition){const e=Error('A prova isolada não confirmou '+message);e.status=503;e.code='PROBE_VERIFY_FAILED';throw e;}}
async function expectFailure(fn,code){try{await fn();}catch(e){assertion(e.code===code,code);return;}assertion(false,'a recusa esperada de '+code);}
async function runOperationalProbe(original){
 const marker=crypto.randomUUID(),kinds=['nc','distribution','history','credit'];
 const names=Object.fromEntries(kinds.map(k=>[k,'__TESTE_OP_'+marker+'_'+k]));
 const originals=new Set(Object.values(original.sheets).map(s=>s.id));
 const created=[],headers={'Content-Type':'application/json'};let creationAttempted=false,creationConfirmed=false,failure;
 try{
  creationAttempted=true;
  const response=await original.request(':batchUpdate',{method:'POST',headers,body:JSON.stringify({requests:kinds.map(k=>({addSheet:{properties:{title:names[k],hidden:true,gridProperties:{rowCount:100,columnCount:14}}}}))})});
  const sheets={};
  for(const [i,kind]of kinds.entries()){
   const p=response.replies?.[i]?.addSheet?.properties;
   assertion(p&&Number.isInteger(p.sheetId)&&p.title===names[kind]&&!originals.has(p.sheetId)&&!created.some(s=>s.id===p.sheetId),'a identidade das abas criadas');
   const sheet={id:p.sheetId,title:p.title};sheets[kind]=sheet;created.push(sheet);
  }
  creationConfirmed=true;sheets.source={...sheets.credit,cell:'N1'};sheets.report={...sheets.credit,cell:'$N$1'};
  const ids=new Set(created.map(s=>s.id));let metadata;
  const context={spreadsheetId:original.spreadsheetId,sheets,request:async(path,options={})=>{
   if(options.method){const body=JSON.parse(options.body);assertion(path===':batchUpdate'&&body.requests.every(r=>{const op=r.updateCells||r.appendCells;return op&&ids.has(op.start?.sheetId??op.sheetId)}),'o isolamento dos alvos de escrita');}
   if(path==='?fields=sheets.properties'){metadata||=await original.request(path,options);return metadata;}
   return original.request(path,options);
  }};
  const nc=quote(names.nc),dist=quote(names.distribution);
  const seed=(kind,rows)=>({updateCells:{start:{sheetId:sheets[kind].id,rowIndex:0,columnIndex:0},rows:rows.map(row=>({values:row.map(v=>v&&typeof v==='object'?v:toCell(v))})),fields:'userEnteredValue'}});
  const formula=f=>({userEnteredValue:{formulaValue:f}});
  await context.request(':batchUpdate',{method:'POST',headers,body:JSON.stringify({requests:[
   seed('nc',[HEADERS.nc,['2026NC000001','01/10/2026','339030','Crédito fictício de teste',100,0,100,'A confirmar','','']]),
   seed('distribution',[HEADERS.distribution]),seed('history',[HEADERS.history]),
   seed('credit',[[...Array(13).fill('Crédito fictício'),'26/10/2026'],...Array.from({length:99},(_,i)=>creditFormulas(i+2,sheets).map(formula))])
  ]})});
  const common={owner:'Teste isolado do aplicativo',document:'Fixture fictícia — sem validade administrativa',note:'Prova temporária'};
  const op=(action,fields)=>({...common,operationId:crypto.randomUUID(),action,...fields});
  let state=await readOperationalState(context),ncRef=state.ncs[0].ref;
  const reserve=()=>op('create-distribution',{ncRef,date:'2026-10-26',sector:'Setor de teste',amountCents:3000,purpose:'Distribuição fictícia',nextAction:'Conferir apenas no teste'});
  await expectFailure(()=>executeOperation(context,reserve()),'BALANCE_UNVERIFIED');
  await executeOperation(context,op('associate-ug',{ref:ncRef,ug:'160111'}));
  await executeOperation(context,op('create-nc',{ug:'167111',year:2026,nc:'2026NC000002',date:'2026-10-26',nd:'339030',purpose:'NC fictícia de teste',receivedCents:10000,committedCents:0,availableCents:10000,deadline:'A confirmar'}));
  state=await readOperationalState(context);ncRef=state.ncs.find(n=>n.nc==='2026NC000001').ref;
  const distribution=reserve();const saved=await executeOperation(context,distribution);assertion(saved.state==='confirmed','a distribuição');
  const credit=await context.request('/values/'+encodeURIComponent(quote(names.credit)+'!F2:G2')+'?valueRenderOption=UNFORMATTED_VALUE');
  assertion(credit.values?.[0]?.[0]===30&&credit.values?.[0]?.[1]===70,'a fórmula de reserva e saldo livre');
  await executeOperation(context,distribution);state=await readOperationalState(context);assertion(state.distributions.length===1,'a ausência de duplicação');
  await expectFailure(()=>executeOperation(context,{...reserve(),amountCents:7001}),'INSUFFICIENT_BALANCE');
  const oldRef=state.distributions[0].ref;
  const setCell=(kind,row,column,v)=>context.request(':batchUpdate',{method:'POST',headers,body:JSON.stringify({requests:[{updateCells:{start:{sheetId:sheets[kind].id,rowIndex:row-1,columnIndex:column},rows:[{values:[v&&typeof v==='object'?v:toCell(v)]}],fields:'userEnteredValue'}}]})});
  await setCell('distribution',2,9,'Alteração fictícia posterior');
  await expectFailure(()=>executeOperation(context,op('close-distribution',{ref:oldRef,targetStatus:'Cancelada'})),'VERSION_CONFLICT');
  state=await readOperationalState(context);
  await executeOperation(context,op('close-distribution',{ref:state.distributions[0].ref,targetStatus:'Cancelada'}));
  const released=await context.request('/values/'+encodeURIComponent(quote(names.credit)+'!F2:G2')+'?valueRenderOption=UNFORMATTED_VALUE');
  assertion(released.values?.[0]?.[0]===0&&released.values?.[0]?.[1]===100,'a liberação da reserva');
  await setCell('nc',2,7,formula('=TODAY()'));state=await readOperationalState(context);
  await expectFailure(()=>executeOperation(context,op('update-nc-followup',{ref:state.ncs.find(n=>n.nc==='2026NC000001').ref,deadline:'Prazo fictício'})),'RECORD_CONFLICT');
  const found=await findOperation(context,distribution.operationId);assertion(found?.operationId===distribution.operationId,'a consulta de confirmação');
  state=await readOperationalState(context);assertion(state.tables.history.filter((r,i)=>i&&r?.some(c=>c.userEnteredValue)).length===4,'as quatro operações auditadas');
 }catch(e){failure=e;}
 finally{
  if(created.length){try{await original.request(':batchUpdate',{method:'POST',headers,body:JSON.stringify({requests:created.map(s=>({deleteSheet:{sheetId:s.id}}))})});}catch{const e=Error('A limpeza das abas temporárias precisa de conferência.');e.status=503;e.code='PROBE_CLEANUP_PENDING';e.cleanupRequired=created.map(s=>s.title);throw e;}}
  if(creationAttempted&&!creationConfirmed&&!(failure?.status>=400&&failure.status<500)){const e=Error('A criação das abas temporárias ficou sem confirmação. Confira somente os nomes de teste indicados.');e.status=503;e.code='PROBE_CLEANUP_PENDING';e.cleanupRequired=Object.values(names);throw e;}
 }
 if(failure)throw failure;
 return{verified:true,cleanedUp:true,officialDataChanged:false,at:new Date().toISOString()};
}
module.exports={runOperationalProbe};
