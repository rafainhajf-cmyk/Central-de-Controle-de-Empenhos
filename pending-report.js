(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CentralPendingReport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const positive=x=>Number.isSafeInteger(x)&&x>0;
 function build(state){
  const rows=[],put=(priority,sector,owner,type,reference,amount,action)=>rows.push({priority,sector:sector||'A atribuir',owner:owner||'A atribuir',type,reference,amount:positive(amount)?amount:null,action:action||'Conferir providência'});
  // Do not equate a SIAFI available balance with an unallocated operational balance.
  for(const nc of state.credits?.available||[])if(positive(nc.availableCents))put(1,'Créditos e NCs','A atribuir','Crédito disponível — distribuição a conferir',nc.number,nc.availableCents,'Verificar saldo distribuído/pendente e decidir destinação');
  for(const ne of state.commitments||[])if(ne.holdingCredit&&positive(ne.remainingCents))put(2,ne.sector,ne.owner,'NE segurando crédito',ne.number,ne.remainingCents,ne.nextAction||'Verificar manutenção ou anulação do saldo');
  for(const p of state.processes||[])if(!/encerrad|concluíd/i.test(p.reportedState||''))put(3,p.sector,p.owner,'Licitação em andamento',p.reference||p.subject,p.estimatedCents,p.nextAction||p.reportedState||'Conferir fase da licitação');
  for(const ne of state.commitments||[])if(positive(ne.remainingCents)&&!ne.holdingCredit&&ne.flow==='fiscal')put(4,ne.sector,ne.owner,'Empenho — Fiscalização',ne.number,ne.remainingCents,ne.nextAction||'Conferir execução, ateste e nota fiscal');
  for(const ne of state.commitments||[])if(positive(ne.remainingCents)&&!ne.holdingCredit&&ne.flow!=='fiscal')put(5,ne.sector,ne.owner,'Empenho — demais fluxos',ne.number,ne.remainingCents,ne.nextAction||'Conferir entrega e liquidação');
  rows.sort((a,b)=>a.sector.localeCompare(b.sector,'pt-BR')||a.owner.localeCompare(b.owner,'pt-BR')||a.priority-b.priority||a.reference.localeCompare(b.reference,'pt-BR'));
  return rows;
 }
 const headers=['Setor','Responsável','Ordem','Tipo de pendência','NC / NE / PRO','Valor em R$ (quando conhecido)','Providência'];
 function table(rows){return rows.map(r=>[r.sector,r.owner,r.priority,r.type,r.reference,r.amount===null?null:r.amount/100,r.action]);}
 return{build,headers,table};
});