'use strict';
const {value,HEADERS:OP}=require('../operational-store'),{sourceCents}=require('../operational-model'),{legacyDate}=require('../legacy-recovery');
const {financialKey,fail}=require('./primitives'),{can}=require('../permissions'),{date}=require('../day-schema');
const {ownKey}=require('../management-merge');
const {classifyFlow,materialTimeline,serviceTimeline,processReview}=require('./timelines'),{creditViews}=require('./credits');
const HEADERS={
 'NEs e liquidação':['Número da NE','Data de emissão','Fornecedor','O que foi comprado ou contratado','Valor empenhado (R$)','Valor já liquidado (R$)','Valor anulado (R$)','Quanto falta liquidar (R$)','Seção indicada no SIAFI','Setor que acompanha','Pessoa responsável','Etapa atual','Esta NE está segurando crédito?','Situação Almox','Observação integral Almox','UG / ano','Análise de prazo e ação'],
 'Base para metas':['NE','Data da NE','ND','Tipo de despesa','Setor responsável','Responsável','Fornecedor','Empenhado (R$)','Liquidado informado (R$)','Anulado (R$)','Saldo a liquidar (R$)','Redução do saldo (estimativa, R$)','% estimado pelo saldo','Situação do empenho','Segurando crédito?','Seção na fonte','UG','Setor sugerido pela regra','Critério de classificação'],
 'Metas por despesa':['Tipo de despesa','Créditos recebidos (R$)','Liquidado + pago da meta (R$)','Meta 31/10 (%)','Meta 31/12 (%)','Falta para 31/10 (R$)','Falta para 31/12 (R$)','% liquidado','Faltam pontos percentuais (31/10)','Prazo','Qualidade da fonte'],
 'Processos e PRO':['Prioridade','Objeto','Modalidade','ND','Setor demandante','Responsável','Lançamento','Dias','Orçamento pronto em','Nº PRO','Crédito (NC/NE)','Valor estimado','Envio ao sistema','Prazo','Situação','NE gerada'],
 'NCs e prazos':OP.nc,'Distribuições detalhadas':OP.distribution
};
function rows(state,title){const table=state.tables[title];if(!Array.isArray(table)||HEADERS[title].some((h,i)=>value(table[0]?.[i])!==h))fail('Cabeçalhos divergentes em '+title+'; consulta gerencial não aplicada.','STRUCTURE_CHANGED');return table.slice(1).map((r,i)=>({v:Array.from({length:Math.max(r?.length||0,HEADERS[title].length)},(_,j)=>value(r?.[j])),row:i+2})).filter(r=>r.v.some(v=>v!==''));}
function money(v,issues){const n=sourceCents(v);if(n===null||n<0){issues.push('FINANCIAL_VALUE_PENDING');return null;}return n;}
function projectManagement(state,actor,asOf){
 if(!can(actor,'read',{} )&&!['operator','sector-lead'].includes(actor?.role)||!actor?.userId||actor.active!==true)fail('Acesso não autorizado.','UNAUTHORIZED');
 if(!date(asOf))fail('Data de referência inválida.');const globalAccess=['admin','manager'].includes(actor.role),visible=r=>can(actor,'read',r),seen=new Set();
 const bases=new Map();for(const {v}of rows(state,'Base para metas')){if(!/^20\d{2}NE\d{6}$/.test(v[0]))continue;const k=financialKey('ne',{number:String(v[0]),ug:/^\d{6}$/.test(String(v[16]))?String(v[16]):null,year:+String(v[0]).slice(0,4)});if(k){if(bases.has(k))fail('Identidade financeira duplicada na base de metas.','DUPLICATE_IDENTITY');bases.set(k,v);}}
 const commitments=[];
 for(const {v,row}of rows(state,'NEs e liquidação')){
  if(!/^20\d{2}NE\d{6}$/.test(v[0]))continue;const keyForAssignment=financialKey('ne',{number:String(v[0]),ug:/^\d{6}$/.test(String(v[15]))?String(v[15]):null,year:+String(v[0]).slice(0,4)});const savedAssignment=keyForAssignment?state.manualFields?.[keyForAssignment]?.fields:null;const sector=savedAssignment?.sector??String(v[9]);if(!visible({sector}))continue;
  const issues=[],number=String(v[0]),ug=/^\d{6}$/.test(String(v[15]))?String(v[15]):null,year=+number.slice(0,4),key=financialKey('ne',{number,ug,year});
  if(key&&seen.has(key))fail('Identidade financeira duplicada em NEs.','DUPLICATE_IDENTITY');if(key)seen.add(key);else issues.push('IDENTITY_PENDING');
  const base=key?bases.get(key):null;if(!base)issues.push('CLASSIFICATION_PENDING');
  const manual=state.manualFields?.[key],nd=manual?.fields?.nd||(base?String(base[2]):null),subitem=/(?:subitem|sub[ .:-]*item)\D{0,5}(07|04|21)\b/i.exec(String(v[3]))?.[1]||null,automaticClassification=classifyFlow({nd,subitem}),sectorFlow=/^almox(?:arifado)?$/i.test(sector.trim())?'almox':/^aprv$/i.test(sector.trim())?'aprv':/^fiscaliza[cç][aã]o$/i.test(sector.trim())?'fiscal':null,classification=sectorFlow?{flow:sectorFlow,origin:'sector-assignment'}:automaticClassification,issued=legacyDate(v[1],'issuedOn',issues);
  if(!sector.trim())issues.push('SECTOR_PENDING');if(!classification.flow)issues.push('CLASSIFICATION_PENDING');
  // A date or status in a source is a statement, not a verified administrative event.
  const record={id:key||'review:ne:'+row,number,ug,year,sector,owner:manual?.fields?.owner??String(v[10]),supplier:String(v[2]),subject:String(v[3]),nd,subitem,expenseType:base?String(base[3]):null,flow:classification.flow,classificationOrigin:classification.origin,classificationConfirmed:false,issuedOn:{value:issued,trust:'reported'},committedCents:money(v[4],issues),liquidatedCents:money(v[5],issues),cancelledCents:money(v[6],issues),remainingCents:money(v[7],issues),reportedStage:manual?.fields?.status??String(v[11]),almox:{status:String(v[13]),observation:String(v[14]),trust:'reported',source:'Situação Almox / Observação integral Almox na fonte sincronizada'},readyToLiquidate:false,issues,source:{title:'NEs e liquidação',row,sourceDate:state.sourceDate}};
  record.timeline=record.flow==='fiscal'?serviceTimeline(record,[],{},[],asOf):record.flow==='almox'?materialTimeline(record,[],{},[],asOf):null;
  record.daysSinceEmission=issued&&issued<=asOf?Math.round((Date.parse(asOf+'T12:00:00Z')-Date.parse(issued+'T12:00:00Z'))/86400000):null;record.dueOn=manual?.fields?.dueOn||null;for(const key of ['sentToSupplierOn','deliveryDueOn','firstNotifiedOn','secondNotifiedOn','paOpenedOn'])record[key]=manual?.fields?.[key]||'';record.deadlineOverdue=!!record.dueOn&&record.dueOn<asOf;
  record.nextAction=manual?.fields?.nextAction??(String(v[16])||record.timeline?.reason||'Verificar situação e comprovar a próxima etapa');record.manualVersion=manual?.version||null;record.observation=manual?.fields?.observation??String(v[14]);commitments.push(record);
 }
 const credits={received:[],available:[],unresolved:[]},distributions=[];
 // Source NCs have no authenticated assignee. Global finances are limited to managers.
 if(globalAccess){const ncs=[];for(const {v,row}of rows(state,'NCs e prazos')){if(!/^20\d{2}NC\d{6}$/.test(v[0]))continue;const issues=[],number=String(v[0]);ncs.push({id:String(v[11]||'review:nc:'+row),number,year:+number.slice(0,4),ug:/^\d{6}$/.test(String(v[10]))?String(v[10]):null,nd:String(v[2]),subject:String(v[3]),receivedCents:money(v[4],issues),committedCents:money(v[5],issues),availableCents:money(v[6],issues),deadline:String(v[7]),pro:state.manualFields?.[String(v[11])]?.fields?.pro||'',manualVersion:state.manualFields?.[String(v[11])]?.version||null,issues});}Object.assign(credits,creditViews(ncs,+asOf.slice(0,4)));}
 const distributionIds=state.distributionKeys||require('../distribution-identity').identities(state.tables['Distribuições detalhadas']);
 for(const {v,row}of rows(state,'Distribuições detalhadas')){
  if(!v[1])continue;const key=distributionIds[row-1],manual=state.manualFields?.[key],fields=manual?.fields||{},sector=fields.sector??String(v[2]);if(!visible({sector}))continue;
  const issues=[],base={amountCents:money(v[4],issues),distributedOn:legacyDate(v[0],'distributedOn',issues)},progress=fields.distributionProgress,position=require('../distribution-model').position(base,progress,asOf),overrides=progress?.overrides||{},distributedOn=overrides.distributedOn??base.distributedOn;
  if(!key)issues.push('DISTRIBUTION_ID_PENDING');if(position.sourceChanged)issues.push('SOURCE_CHANGED');if(!position.valid)issues.push('DISTRIBUTION_BALANCE_PENDING');
  distributions.push({id:key||'review:distribution:'+row,number:String(v[1]),ug:/^\d{6}$/.test(String(v[10]))?String(v[10]):null,sector,owner:fields.owner??String(v[3]),sourceAmountCents:base.amountCents,amountCents:position.amountCents,pendingCents:position.uncommittedCents,canArchive:position.canArchive,subject:overrides.subject??String(v[5]),reportedState:position.archived?'Arquivada':progress?'1º OK: '+position.firstOk+' · 2º OK: '+position.secondOk:String(v[6]),sourceState:String(v[6]),nextAction:fields.nextAction??String(v[9]),observation:fields.observation||'',distributedOn,daysSinceDistribution:distributedOn?Math.max(0,Math.round((Date.parse(asOf+'T12:00:00Z')-Date.parse(distributedOn+'T12:00:00Z'))/86400000)):null,manualVersion:manual?.version||1,sourceVersion:state.distributionSourceVersions?.[row-1]||require('../distribution-identity').sourceVersion(v),progress:position,canEdit:globalAccess&&!!key,issues});
 }
 // Vinculação financeira somente por NC e UG verificadas. Sem UG, não afirmar saldo.
 if(globalAccess){
  const grouped=new Map(),ambiguous=new Set();
  for(const d of distributions){
   if(!/^20\d{2}NC\d{6}$/.test(d.number))continue;
   if(!d.ug){ambiguous.add(d.number);continue;}
   const key=d.number+'|'+d.ug,group=grouped.get(key)||{pending:0,uncertain:false};
   const pending=d.progress?.uncommittedCents;
   if(!Number.isSafeInteger(pending)||pending<0||d.issues.length||d.progress?.sourceChanged)group.uncertain=true;
   else if(!d.progress.archived){
    if(!Number.isSafeInteger(group.pending+pending))group.uncertain=true;
    else group.pending+=pending;
   }
   grouped.set(key,group);
  }
  for(const nc of [...credits.received,...credits.unresolved]){
   const group=nc.ug?grouped.get(nc.number+'|'+nc.ug):null;
   const uncertain=!nc.ug||ambiguous.has(nc.number)||group?.uncertain;
   nc.distributedPendingCents=uncertain?null:group?.pending??0;
   nc.distributionReconciliation=uncertain?'Vínculo NC/UG pendente de conferência':group?'Distribuições internas identificadas por NC e UG; não é saldo SIAFI':'Nenhuma distribuição identificada por NC e UG';
  }
 }
 const processes=[];for(const {v,row}of rows(state,'Processos e PRO')){if(!v[1]||!visible({sector:String(v[4])}))continue;const issues=[];if(!v[9])issues.push('PROCESS_ID_PENDING');const p={id:'review:process:'+row,reference:String(v[9]),subject:String(v[1]),sector:String(v[4]),owner:String(v[5]),modality:String(v[2]),reportedDate:legacyDate(v[6],'reportedDate',issues),distributedOn:null,reportedState:String(v[14]),creditLinkStatus:'Aguardando vínculo a NC',linkedCreditId:null,issues};Object.assign(p,processReview(p,[],asOf));processes.push(p);}
 const goals=globalAccess?rows(state,'Metas por despesa').filter(({v})=>v[0]&&sourceCents(v[1])!==null).map(({v})=>({subject:String(v[0]),receivedCents:sourceCents(v[1]),liquidatedPlusPaidCents:sourceCents(v[2]),targets:[{label:'31/10',percentage:String(v[3]),gapCents:sourceCents(v[5])},{label:'31/12',percentage:String(v[4]),gapCents:sourceCents(v[6])}],measure:'liquidated-plus-paid-source',reconciled:false,sourceQuality:String(v[10]),notice:'Valores da fonte. Base geral liquidado + pago ainda não conciliada com liquidação explícita por setor.'})):[];
 const sourceKeys=new Set(rows(state,'NEs e liquidação').map(({v})=>{try{return financialKey('ne',{number:String(v[0]),year:+String(v[0]).slice(0,4),ug:/^\d{6}$/.test(String(v[15]))?String(v[15]):null});}catch{return null;}}).filter(Boolean));
 const contracts=[];for(const [i,cells]of(state.tables['Contratos e fiscais']||[]).entries()){if(i===0)continue;const v=cells.map(value);if(!v[0])continue;const id='contract|'+v[12],manual=state.manualFields?.[id],fields=manual?.fields||{},sector=fields.sector||'';if(!visible({sector}))continue;const issues=[],endsOn=legacyDate(fields.endsOn||v[4],'endsOn',issues);contracts.push({id,number:String(v[0]),supplier:String(v[1]||''),subject:String(v[2]||''),sector,owner:fields.owner??String(v[7]||''),observation:fields.observation||'',nextAction:fields.nextAction??String(v[14]||v[11]||''),reportedState:fields.status??String(v[13]||''),endsOn,daysToEnd:endsOn?Math.round((Date.parse(endsOn+'T12:00:00Z')-Date.parse(asOf+'T12:00:00Z'))/86400000):null,manualVersion:manual?.version||null,issues});}
 const ownRecords=(state.records||[]).filter(r=>r.lifecycle!=='archived'&&!sourceKeys.has(r.key)&&visible({sector:r.fields?.sector})).map(r=>({id:r.id,key:r.key,kind:r.kind,number:r.fields?.number||r.id,subject:r.fields?.description||r.fields?.subject||r.kind,sector:r.fields?.sector||'',owner:r.fields?.owner||'',observation:r.fields?.observation||'',nextAction:r.fields?.nextAction||'',manualKey:ownKey(r),manualVersion:state.manualFields?.[ownKey(r)]?.version||null}));
 return {ownRecords,readAt:state.readAt,sourceDate:state.sourceDate,asOf,globalAccess,mode:'read-only',commitments,credits,distributions,processes,goals,contracts,notice:'Consulta gerencial. Declarações e datas da planilha não comprovam cumprimento. Nenhum lançamento foi alterado.'};
}
module.exports={projectManagement,HEADERS};

