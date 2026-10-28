'use strict';
const {validateEntity,versionOf,entityKey,validDate,fail,UGS}=require('../management-schema');
const {value}=require('./operational-store');
const present=v=>v!==undefined&&v!==null&&v!=='';
const normalized=s=>String(s).normalize('NFKC').replace(/\s*✎/g,'').trim();
function lookup(raw,label){const found=Object.keys(raw).find(k=>normalized(k)===normalized(label));return found===undefined?undefined:raw[found];}
function numeric(v){if(typeof v==='number')return v;if(typeof v==='string'&&/^\d+(?:\.0+)?$/.test(v))return Number(v);return null;}
function asUG(v){const n=numeric(v);return UGS.includes(String(n))?String(n):null;}
function legacyDate(v,field,issues){
 if(!present(v))return null;
 if(typeof v==='string'&&/^(a confirmar|inserir |não informad|sem data|data não )/i.test(v.trim()))return null;
 if(validDate(v))return v;
 if(typeof v==='string'&&/^\d{2}\/\d{2}\/\d{4}$/.test(v)){const s=v.slice(6)+'-'+v.slice(3,5)+'-'+v.slice(0,2);if(validDate(s))return s;}
 const n=numeric(v);if(n!==null&&n>=36526&&n<=73415&&Number.isInteger(n)){const d=new Date(Date.UTC(1899,11,30)+n*86400000).toISOString().slice(0,10);if(validDate(d))return d;}
 issues.push('DATE_UNRESOLVED:'+field);return null;
}
const legacyNE={number:'NE',ug:'UG',year:'Exercício',supplier:'Empresa',description:'Descrição do empenho',nd:'ND',expenseType:'Tipo de despesa',sector:'Setor responsável',owner:'Responsável',status:'Situação',observation:'Observação',holdingCredit:'Segurando crédito',notifiedOn:'Notificado em',administrativeProcess:'Nº do PA',balanceDestination:'Destino do saldo',serviceMode:'Execução do serviço',servicePerformedOn:'Serviço executado em',invoiceCertifiedOn:'NF atestada em',holdingSince:'Segurando crédito desde',cancellationRequestedOn:'Anulação pedida em',contractEndsOn:'Fim do contrato',extendedUntil:'Prorrogado até'};
const dates=new Set(['notifiedOn','servicePerformedOn','invoiceCertifiedOn','holdingSince','cancellationRequestedOn','contractEndsOn','extendedUntil','startsOn','endsOn','lastChargedOn','dueOn','startedOn','completedOn','activityOn']);
function neFields(raw,issues){
 const fields={};for(const [field,label]of Object.entries(legacyNE)){let v=lookup(raw,label);if(!present(v))continue;
  if(field==='ug')v=asUG(v);else if(field==='year')v=numeric(v);else if(dates.has(field))v=legacyDate(v,field,issues);else if(field==='holdingCredit'){v=String(v).trim().toLowerCase()==='sim'?true:String(v).trim().toLowerCase()==='não'?false:null;}
  else v=String(v);if(present(v)||v===false)fields[field]=v;
 }
 if(!present(lookup(raw,'Exercício'))&&/^20\d{2}NE\d{6}$/.test(fields.number||''))fields.year=Number(fields.number.slice(0,4));
 if(!fields.ug)issues.push('UG_PENDING');if(!Number.isInteger(fields.year))issues.push('YEAR_PENDING');return fields;
}
function cleanFields(kind,input,issues){
 const result={};for(const [k,v]of Object.entries(input))if(present(v)||v===false||v===0)result[k]=v;
 try{return validateEntity(kind,result);}catch(e){issues.push('FIELD_REVIEW:'+e.message);return result;}
}
function recoverLegacy(state){
 const groups=new Map,conflicts=[];let order=0;
 function add(kind,fields,source,{issues=[],mergeKey,reference=false,originId}={}){
  const rawSource={...source,originId:originId||source.originId};const key=mergeKey||(['ne','contract'].includes(kind)&&fields.ug!==null?(()=>{try{return entityKey(kind,fields);}catch{return 'review:'+rawSource.originId;}})():'source:'+rawSource.originId);
  let group=groups.get(key);if(!group){group={kind,key,fields:{},rawSources:[],issues:[],conflicts:[],reference,order:order++};groups.set(key,group);}
  for(const [field,legacy]of Object.entries(fields))if(present(legacy)||legacy===false||legacy===0){const current=group.fields[field];if(!present(current)&&current!==false&&current!==0)group.fields[field]=legacy;else if(JSON.stringify(current)!==JSON.stringify(legacy)){const conflict={field,current,legacy,originId:rawSource.originId};group.conflicts.push(conflict);conflicts.push({...conflict,key,code:'FIELD_CONFLICT'});}}
  group.rawSources.push(rawSource);group.issues.push(...issues);return group;
 }
 for(const src of state.sourceRecords||[]){
  const issues=[...(src.issues||[])],fields={...src.fields};if(fields.holdingCredit==='Sim')fields.holdingCredit=true;else if(fields.holdingCredit==='Não')fields.holdingCredit=false;else if(fields.holdingCredit!==true&&fields.holdingCredit!==false)delete fields.holdingCredit;
  add(src.kind,cleanFields(src.kind,fields,issues),{originId:src.id,row:Number(src.id.split(':').at(-1)),title:'NEs e liquidação',values:src.fields,sourceVersion:src.sourceVersion,sourceDate:src.sourceDate},{issues});
 }
 const pendingRows=state.tables['Pendências']||[];
 for(let i=1;i<pendingRows.length;i++){
  const v=Array.from({length:13},(_,j)=>value(pendingRows[i]?.[j]));if(!v[0]||!v[5])continue;const issues=[];const id='pending:'+String(v[0]);
  const fields={subject:String(v[5]),reference:String(v[2]),sector:String(v[3]),owner:String(v[4]),urgency:String(v[6]),status:String(v[8]),nextAction:String(v[10]),observation:String(v[12])};
  for(const [col,name]of [[1,'startedOn'],[7,'dueOn'],[9,'lastChargedOn'],[11,'completedOn']])if(present(v[col]))fields[name]=legacyDate(v[col],name,issues);
  add('pending',cleanFields('pending',fields,issues),{originId:id,row:i+1,title:'Pendências',values:Object.fromEntries(v.map((x,j)=>[String(j),x]))},{issues,mergeKey:id});
 }
 const contractRows=state.tables['Contratos e fiscais']||[];
 for(let i=1;i<contractRows.length;i++){
  const v=Array.from({length:16},(_,j)=>value(contractRows[i]?.[j]));if(!v[0])continue;const issues=[];const year=Number(/(?:\/)(20\d{2})$/.exec(String(v[0]))?.[1]);
  const fields={number:String(v[0]),year,supplier:String(v[1]),subject:String(v[2]),startsOn:legacyDate(v[3],'startsOn',issues),endsOn:legacyDate(v[4],'endsOn',issues),owner:String(v[7]),substitute:String(v[8]),nextAction:String(v[14]||v[11]),status:String(v[13]),lastChargedOn:legacyDate(v[15],'lastChargedOn',issues)};
  add('contract',cleanFields('contract',fields,issues),{originId:'contract:'+String(v[12]||v[0]),row:i+1,title:'Contratos e fiscais',values:Object.fromEntries(v.map((x,j)=>[String(j),x]))},{issues});
 }
 for(let i=1;i<(state.tables['Histórico']||[]).length;i++){
  const cells=state.tables['Histórico'][i];if(!cells)continue;const marker=String(value(cells[8]));if(!/^(legacy|pasa):/.test(marker))continue;
  const match=/^(legacy|pasa):([a-f0-9]{64}):(.+?):(\d+)(?:\s*\||$)/.exec(marker);
  if(!match){const issue={code:'INVALID_LEGACY_MARKER',row:i+1};conflicts.push(issue);add('legacy-reference',{}, {originId:'invalid-marker:'+i,row:i+1,title:'Histórico',values:{marker}},{issues:['INVALID_LEGACY_MARKER'],reference:true});continue;}
  const [,provider,hash,title,rowText]=match,n=Number(rowText),originId=match[0].replace(/\s*\|$/,'').trim();
  const source={originId,row:n,title,historyRow:i+1,sourceHash:hash,sourceDate:provider==='pasa'?'26/10/2026':'Data original preservada na fonte'};
  if(provider==='legacy'&&/^Hist[oó]rico$/.test(title)){add('legacy-reference',{}, {...source,values:{before:value(cells[5]),after:value(cells[6]),reference:value(cells[2])}},{reference:true});continue;}
  let raw;try{raw=JSON.parse(String(value(cells[6])));if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('invalid');}catch{conflicts.push({code:'INVALID_LEGACY_JSON',originId,row:i+1});add('legacy-reference',{}, {...source,values:{original:String(value(cells[6]))}},{issues:['INVALID_LEGACY_JSON'],reference:true});continue;}
  source.values=raw;const issues=[];
  if(provider==='legacy'&&title==='Empenhos')add('ne',cleanFields('ne',neFields(raw,issues),issues),source,{issues});
  else if(provider==='legacy'&&title==='Fiscais de Contrato'){
   const number=String(lookup(raw,'Contrato')||''),year=Number(/\/(20\d{2})$/.exec(number)?.[1]);const fields={number,year,supplier:String(lookup(raw,'Empresa')||''),subject:String(lookup(raw,'Objeto')||''),owner:String(lookup(raw,'Fiscal titular')||''),substitute:String(lookup(raw,'Fiscal substituto')||''),nextAction:String(lookup(raw,'Providência')||''),startsOn:legacyDate(lookup(raw,'Início'),'startsOn',issues),endsOn:legacyDate(lookup(raw,'Fim da vigência'),'endsOn',issues)};
   add('contract',cleanFields('contract',fields,issues),source,{issues});
  }else if(provider==='pasa'&&n>=21){
   const controlId='PASA-'+hash.slice(0,12)+'-L'+n,mergeKey='pending:'+controlId;
   const budget=n<=26;const fields={subject:String(raw[budget?'OBJETO':'AÇÃO']||''),owner:String(raw[budget?'RESPONSÁVEL':'RESPONSÁVEL']||''),status:String(raw[budget?'STATUS':'SITUAÇÃO']||''),nextAction:String(raw[budget?'OBSERVAÇÃO':'PRÓXIMO PASSO']||''),observation:JSON.stringify(raw)};
   if(n===45)fields.subject='Conferir registro PASA “Ten Muniz” (linha 45) e vínculo da abertura de serviço';if(n===46)fields.subject='Confirmar origem e aplicação da sobra de serviço';
   const ref=String(raw['NC / NE']||raw['VINCULAR NC']||'');if(/^20\d{2}(NC|NE)\d{6}$/.test(ref))fields.reference=ref;
   add('pending',cleanFields('pending',fields,issues),source,{issues,mergeKey});
  }else if(provider==='pasa'&&n>=11&&n<=16){const fields={number:String(raw.NE||''),year:Number(String(raw.NE||'').slice(0,4)),status:String(raw['SITUAÇÃO']||''),observation:String(raw['PROVIDÊNCIA']||'')};issues.push('UG_PENDING');add('ne',fields,source,{issues});}
  else add('legacy-reference',{},source,{reference:true});
 }
 const candidates=[...groups.values()].map(group=>{
  const origins=[...new Set(group.rawSources.map(s=>s.originId))];let existing=(state.records||[]).find(r=>r.key===group.key||origins.some(id=>r.provenance?.migrationIds?.includes(id)));
  const applied=existing&&origins.every(id=>existing.provenance?.migrationIds?.includes(id));
  let fields=group.fields;if(existing){fields={...group.fields,...existing.fields};for(const [field,legacy]of Object.entries(group.fields))if(present(existing.fields[field])&&JSON.stringify(existing.fields[field])!==JSON.stringify(legacy)){group.conflicts.push({field,current:existing.fields[field],legacy,originId:'Cadastro atual'});}}
  const issues=[...new Set(group.issues)];const needsReview=issues.length>0;
  const migrationId='migration:'+versionOf({key:group.key,origins,sources:group.rawSources.map(s=>({originId:s.originId,values:s.values,sourceVersion:s.sourceVersion}))});
  return {migrationId,kind:group.kind,key:group.key,fields,rawSources:group.rawSources,issues,conflicts:group.conflicts,originIds:origins,existingId:existing?.id||null,status:applied?'applied':needsReview?'needs-review':group.reference?'reference-only':'ready'};
 });
 return {candidates,conflicts};
}
function planLegacyMigration(state,ids){
 const {candidates}=recoverLegacy(state),records=[],audit=[];
 for(const id of ids){const candidate=candidates.find(c=>c.migrationId===id);if(!candidate)fail('Registro de migração não localizado; recarregue.',409,'MIGRATION_CHANGED');if(candidate.status==='applied')continue;if(candidate.status!=='ready')fail('Registro exige conferência antes da migração.',409,'LEGACY_REVIEW_REQUIRED');
  const existing=(state.records||[]).find(r=>r.id===candidate.existingId);const recordId=existing?.id||'imported-'+versionOf(candidate.key);
  const provenance={...(existing?.provenance||{}),source:'Dados recuperados da própria Central',migrationIds:[...new Set([...(existing?.provenance?.migrationIds||[]),...candidate.originIds])],rawSources:candidate.rawSources,conflicts:candidate.conflicts};
  records.push({id:recordId,kind:candidate.kind,fields:validateEntity(candidate.kind,candidate.fields),provenance,existingId:existing?.id||null});audit.push({migrationId:id,originIds:candidate.originIds});
 }
 return {records,audit};
}
module.exports={legacyDate,recoverLegacy,planLegacyMigration};
