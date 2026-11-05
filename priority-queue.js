'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CentralPriorityQueue=api;
})(typeof window!=='undefined'?window:null,function(){
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
 const sectorOf=s=>{const x=normalize(s);if(x.includes('ALMOX'))return 'ALMOX';if(x.includes('APRV'))return 'APRV';if(x.includes('FISCAL'))return 'Fiscalização';return null;};
 const order=['ALMOX','APRV','Fiscalização'];
 const stages=['Créditos distribuídos sem empenho','Empenhos segurando créditos','Serviços 339039 · Fiscalização','Demais empenhos'];
 function ownerSector(r,directory){
  if(sectorOf(r.sector)!=='Fiscalização'||!r.owner)return sectorOf(r.sector);
  const target=normalize(r.owner);
  const catalog=(directory?.ownerAssignments||[]).filter(o=>normalize(o.name)===target).map(o=>sectorOf(o.sector)).filter(Boolean);
  const people=(directory?.people||[]).filter(p=>normalize(p.name)===target).flatMap(p=>(p.sectors||[]).map(sectorOf)).filter(Boolean);
  const matches=[...new Set([...catalog,...people])].filter(x=>x!=='Fiscalização');
  // Assignment to two different areas is ambiguous and should not silently move the NE.
  return matches.length===1?matches[0]:'Fiscalização';
 }
 const isoDay=instant=>typeof instant==='string'&&/^\d{4}-\d{2}-\d{2}/.test(instant)?instant.slice(0,10):null;
 function daysBetween(start,end){
  const a=isoDay(start),b=isoDay(end);if(!a||!b||a>b)return null;
  return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
 }
 function followups(state,reference,ug){
  return (state.pendingActivities||[]).filter(a=>a.reference===reference&&(!a.ug||!ug||a.ug===ug));
 }
 function almoxReview(record,state){
  const actions=followups(state,record.number,record.ug);
  const asOf=state.asOf||new Date().toISOString().slice(0,10);
  const open=actions.filter(a=>a.state!=='completed');
  const active=open.sort((a,b)=>(a.dueOn||'9999').localeCompare(b.dueOn||'9999'))[0]||null;
  const age=active?daysBetween(active.createdAt,asOf):null;
  const due=active?.dueOn||record.dueOn||null;
  const delay=due&&due<asOf?daysBetween(due,asOf):0;
  const statuses={open:'Aberta','in-progress':'Em andamento',waiting:'Aguardando retorno',completed:'Concluída'};
  const sourceStatus=record.almox?.status||'Sem informação na planilha';
  const sourceObservation=record.almox?.observation||'Sem observação do Almox na fonte';
  return {sourceStatus,sourceObservation,activityId:active?.id||null,
   taskCreatedAt:active?.createdAt||null,dueOn:due,
   waitingDays:age,overdueDays:delay,
   taskStatus:active?statuses[active.state]||active.state:actions.length?'Todas as atividades registradas concluídas':'Sem cobrança registrada',
   action:active?.nextAction||active?.subject||record.nextAction||'Conferir envio, entrega, notificação ou liquidação e registrar providência',
   lastAction:active?.lastAction||null,
   rule:active?.rule||null,
   hasEvidence:!!active};
 }
 function queue(state){
  const groups=Object.fromEntries(order.map(k=>[k,stages.map((label,priority)=>({label,priority,items:[]}))]));
  const known=new Set();
  for(const d of state.distributions||[]){
   if(d.archived||d.progress?.archived||!Number.isSafeInteger(d.progress?.uncommittedCents)||d.progress.uncommittedCents<=0)continue;
   const sector=ownerSector(d,state.directory);if(!sector||!groups[sector])continue;
   const key=d.id||'distribution:'+d.number+':'+sector;
   if(known.has(key))continue;known.add(key);
   groups[sector][0].items.push({key,kind:'distribution',number:d.number,subject:d.subject||d.processType||'Distribuição',sector,owner:d.owner,amountCents:d.progress.uncommittedCents,days:d.daysSinceDistribution,daysLabel:'Desde a distribuição',nextAction:d.nextAction||'Confirmar requisição e empenhamento',record:d});
  }
  for(const n of state.commitments||[]){
   if(!Number.isSafeInteger(n.remainingCents)||n.remainingCents<=0)continue;
   const sector=ownerSector(n,state.directory);if(!sector||!groups[sector])continue;
   const priority=n.holdingCredit===true?1:String(n.nd||'').replace(/\D/g,'')==='339039'?2:3;
   const key=n.id||'ne:'+n.number+':'+sector;
   if(known.has(key))continue;known.add(key);
   const review=sector==='ALMOX'?almoxReview(n,state):null;groups[sector][priority].items.push({key,kind:'commitment',number:n.number,subject:n.subject||n.supplier||'Empenho',sector,owner:n.owner,amountCents:n.remainingCents,days:n.daysSinceEmission,daysLabel:'Desde a emissão',nextAction:review?.action||n.nextAction||'Conferir execução e liquidação',review,record:n});
  }
  for(const sector of order)for(const bucket of groups[sector])bucket.items.sort((a,b)=>(b.days??-1)-(a.days??-1)||b.amountCents-a.amountCents||String(a.number).localeCompare(String(b.number),'pt-BR'));
  const mine=(state.credits?.received||[]).filter(c=>Number.isSafeInteger(c.freeToDistributeCents)&&c.freeToDistributeCents>0).map(c=>({key:c.id,kind:'credit',number:c.number,subject:c.subject||'Crédito a distribuir',sector:'Gestão Orçamentária',owner:'Minha responsabilidade',amountCents:c.freeToDistributeCents,days:null,nextAction:'Distribuir saldo livre aos setores',record:c}));
  const uncertain=(state.credits?.unresolved||[]).filter(c=>!Number.isSafeInteger(c.freeToDistributeCents)||c.distributionNeedsReview);
  return {groups,order,stages,mine,uncertain};
 }
 return {queue,sectorOf,ownerSector,almoxReview,daysBetween};
});
