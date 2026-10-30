'use strict';
const operational=require('./operational-store');
const {recoverLegacy,legacyDate}=require('./legacy-recovery');
const {fail}=require('./identity');
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function buildSources(state){
 const recovery=recoverLegacy(state),records=[],seen=new Set();
 for(const c of recovery.candidates){
  if(!['ne','pending','contract'].includes(c.kind))continue;
  const existing=state.records.find(r=>r.id===c.existingId);
  if(existing)seen.add(existing.id);
  records.push({key:c.key,kind:c.kind,fields:{...c.fields,...existing?.fields},lifecycle:existing?.lifecycle,issues:[...c.issues,...(c.conflicts.length?['SOURCE_CONFLICT']:[])],provenance:{origins:c.rawSources},originalAlmox:state.sourceRecords.find(s=>s.key===c.key||c.rawSources.some(origin=>origin.originId===s.id))?.originalAlmox});
 }
 for(const r of state.records)if(!seen.has(r.id)&&['ne','pending','contract','process'].includes(r.kind))records.push({...r,key:r.key,issues:r.provenance?.conflicts?.length?['SOURCE_CONFLICT']:[]});
 const table=state.tables['Processos e PRO']||[],headers=(table[0]||[]).map(operational.value),aliases={id:['ID de controle','ID','Número do processo','Processo'],subject:['Objeto','Objeto do processo'],sector:['Setor','Setor responsável'],owner:['Responsável'],dueOn:['Prazo','Prazo informado'],reference:['NC ou NE','Vínculo NC/NE']};
 const columns=Object.fromEntries(Object.entries(aliases).map(([k,labels])=>[k,headers.findIndex(h=>labels.some(l=>norm(l)===norm(h)))]));
 let unresolved=0;
 for(let i=1;i<table.length;i++){
  const values=table[i]||[];if(!values.some(c=>String(operational.value(c)).trim()))continue;
  const f={};for(const [name,col]of Object.entries(columns))if(col>=0)f[name]=String(operational.value(values[col]));
  if(!f.id||!f.subject){unresolved++;continue;}
  if(records.some(r=>r.kind==='process'&&r.fields.reference===f.id))continue;
  const issues=[];const due=legacyDate(f.dueOn,'dueOn',issues);records.push({key:'source:process:'+f.id,kind:'process',fields:{...f,dueOn:due,reference:f.id},issues,provenance:{title:'Processos e PRO',id:f.id}});
 }
 if(unresolved)records.push({key:'review:processes-source',kind:'review',fields:{subject:'Conferir '+unresolved+' linhas de processos sem identidade/cabeçalho suficiente'},issues:['PROCESS_SOURCE_IDENTITY_PENDING'],provenance:{title:'Processos e PRO',unresolved}});
 const rows=state.tables['Distribuições detalhadas']||[];
 for(let i=1;i<rows.length;i++){
  const v=Array.from({length:12},(_,j)=>operational.value(rows[i]?.[j]));if(!v.some(x=>x!==''))continue;
  const issues=[],control=String(v[11]||'');
  // An unresolved source row is a review item, never a financial association.
  const key=control?'distribution:'+control:'review:distribution:'+i;
  const assignedOn=legacyDate(v[0],'assignedOn',issues);
  records.push({key,kind:control?'distribution':'review',fields:{number:String(v[1]),sector:String(v[2]),owner:String(v[3]),assignedOn,status:String(v[6]),nextAction:String(v[9]),subject:'Conferir identificação e empenho de crédito distribuído '+String(v[1])},issues:control?issues:[...issues,'DISTRIBUTION_ID_PENDING'],provenance:{title:'Distribuições detalhadas',controlId:control||null,row:i+1,values:v}});
 }
 return {complete:true,records,readAt:state.readAt,sourceDate:state.sourceDate};
}
async function loadDaySources(db){
 const snapshot=await require('./management-cache').readSnapshot(db||require('./day-db').getDB());
 if(!snapshot)fail('Atualize os dados no painel antes de gerar atividades. Nenhuma atividade foi alterada.',409,'SYNC_REQUIRED');
 const state=require('./management-merge').mergeManagement(snapshot.state,snapshot.manualFields);
 const source=buildSources(state);
 const projection=require('./budget/source-adapter').projectManagement(state,{userId:'day-source-reader',role:'admin',active:true,sectors:[]},require('./business-calendar').civilToday());
 const commitments=new Map(projection.commitments.map(record=>[record.id,record]));
 for(const record of source.records){
  const sourceKey=record.kind==='contract'?record.provenance?.origins?.map(origin=>origin.originId?.startsWith('contract:')?'contract|'+origin.originId.slice(9):null).find(key=>key&&snapshot.manualFields[key]):null;
  const fields=snapshot.manualFields[record.key]?.fields||snapshot.manualFields[sourceKey]?.fields;
  if(fields)record.fields={...record.fields,...fields};
  const financial=record.kind==='ne'?commitments.get(record.key):null;
  if(financial){
   record.fields.nd=record.fields.nd||financial.nd;
   record.fields.subitem=record.fields.subitem||financial.subitem;
   record.fields.issuedOn=record.fields.issuedOn||financial.issuedOn?.value;
   record.fields.remainingCents=financial.remainingCents;
   record.fields.status=record.fields.status||financial.reportedStage;
   record.fields.almoxStatus=financial.almox?.status;
  }
 }
 return {...source,readAt:snapshot.updatedAt,storage:'Neon'};
}
module.exports={loadDaySources,buildSources};

