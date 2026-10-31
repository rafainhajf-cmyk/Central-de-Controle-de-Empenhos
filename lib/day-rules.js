'use strict';
const {fail}=require('./identity'),{date}=require('./day-schema'),{addDays}=require('./budget/timelines');
function deriveActivities(snapshot,calendar=[],settings={}){
 const timing={...require('./deadline-settings').DEFAULTS,...settings};
 if(snapshot?.complete!==true||!Array.isArray(snapshot.records))fail('Fonte incompleta. Atividades anteriores preservadas.',503,'INCOMPLETE_SOURCE');
 const result=[],keys=new Set(),sourceKeys=new Set();
 for(const record of snapshot.records){if(sourceKeys.has(record.key))fail('Origens com a mesma identidade exigem conferência. Nenhuma atividade foi omitida.',409,'DUPLICATE_SOURCE');sourceKeys.add(record.key);}
 for(const r of snapshot.records){
  if(!r.key||!r.fields)fail('Fonte sem proveniência verificável.',409,'SOURCE_IDENTITY_MISSING');
  if(r.lifecycle==='archived')continue;
  const f=r.fields,issues=[...(r.issues||[])];
  const emit=(rule,subject,{days,start,priority=3,sector=f.sector||null,dueOn=null,mode='calendar',extra=[]}={})=>{
   const sourceKey=r.key+'|'+rule;if(keys.has(sourceKey))return;keys.add(sourceKey);
   const foundIssues=[...issues,...extra];if(days&&!date(start))foundIssues.push('DATE_PENDING');if(!sector)foundIssues.push('SECTOR_PENDING');foundIssues.push('RESPONSIBLE_USER_PENDING');
   result.push({sourceKey,rule,ruleVersion:2,subject,reference:f.number||f.reference||'',ug:f.ug||null,exercise:f.year||null,sector,assigneeId:null,priority,dueOn:date(f.dueOn)?f.dueOn:days?addDays(start,days,mode,calendar):date(dueOn)?dueOn:null,nextAction:f.nextAction||'',issues:[...new Set(foundIssues)],source:{kind:r.kind,key:r.key,fields:f,provenance:r.provenance||{},readAt:snapshot.readAt,sourceDate:snapshot.sourceDate||null,originalAlmox:r.originalAlmox||null}});
  };
  if(r.kind==='process'){emit('process',f.subject||'Acompanhar processo / TR / orçamento',{priority:1,dueOn:f.dueOn});continue;}
  if(r.kind==='distribution'){
   if(!['Cancelada','Concluída'].includes(f.status))emit('commit-distribution','Conferir empenho do crédito distribuído',{priority:2,days:5,start:f.assignedOn});continue;
  }
  if(r.kind==='pending'){emit('pending',f.subject||'Conferir pendência existente',{dueOn:f.dueOn,priority:2,extra:f.completedOn?['SOURCE_COMPLETION_REQUIRES_REVIEW']:[]});continue;}
  if(r.kind==='contract'){if(/encerrad|concluid/i.test(String(f.status||'')))continue;emit('contract','Conferir vigência e providência do contrato '+(f.number||''),{dueOn:f.endsOn,priority:4});continue;}
  if(r.kind==='review'){emit('review',f.subject||'Conferir informações da fonte',{extra:['SOURCE_REVIEW_REQUIRED']});continue;}
  if(r.kind!=='ne')continue;
  if(!f.ug||!f.year||!/^20\d{2}NE\d{6}$/.test(f.number||'')){
   emit('review','Confirmar identidade e UG de '+(f.number||'empenho'),{extra:['UG_OR_IDENTITY_PENDING']});continue;
  }
  const stage=[f.status,f.almoxStatus].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(f.remainingCents===0&&/liquidad/.test(stage))continue;
  if(/(?:^|\s)8[.\s-]*liquidad/.test(stage)){emit('liquidation-review','Conferir saldo a liquidar; arquivar somente após saldo zero',{sector:f.sector||'ALMOX',extra:['BALANCE_PENDING']});continue;}
  if(/entregue.*liquidar|entregue.*pagamento/.test(stage)){
   const almox=/^(almox|almoxarifado)$/i.test(String(f.sector||'').trim())||/^(almox|almoxarifado)$/i.test(String(f.flow||'').trim());
   if(almox&&/entregue.*liquidar/.test(stage)){
    const places={fiscalizacao:'na Fiscalização',bda:'na Brigada',devolvida:'devolvida',problema:'devolvida com problema'};
    const key=String(f.invoiceLocation||'').toLowerCase(),location=places[key]||'sem localização documental confirmada';
    emit('almox-invoice','Cobrar Almoxarifado: acompanhar nota fiscal '+location+' e resolver pendências até zerar saldo a liquidar',{priority:2,sector:'ALMOX',extra:['INVOICE_TRACKING_PENDING']});
   }else emit('payment','Verificar a fase do pagamento da NE',{priority:3});
   continue;
  }
  if(/falta.*providencia.*setor/.test(stage)){
   if(!f.serviceRequestedOn)emit('service-request','Cobrar setor requisitante para acionar o fornecedor do serviço',{priority:2,extra:['SERVICE_REQUEST_PROOF_PENDING']});
   else if(!f.servicePerformedOn)emit('service-completion','Acompanhar prazo e conclusão do serviço solicitado',{priority:2,days:5,start:f.serviceRequestedOn});
   else if(!f.invoiceSubmittedOn)emit('service-invoice','Cobrar envio da nota fiscal após conclusão do serviço',{priority:2,extra:['INVOICE_SUBMISSION_PENDING']});
   else emit('service-payment','Acompanhar liquidação e pagamento do serviço; conferir saldo',{priority:3});
   continue;
  }
  const sub=f.subitem||/(?:subitem|sub[ .:-]*item|339030)\D{0,5}(07|21|04)\b/i.exec([f.description,f.observation].filter(Boolean).join(' '))?.[1];
  if(f.holdingCredit===true)emit('holding-credit','Definir providência e destino do crédito retido',{priority:4,dueOn:f.dueOn});
  if(f.nd==='339039'){
   if(!f.servicePerformedOn)emit('service','Cobrar execução do serviço e conferir fiscal',{days:5,start:f.assignedOn,priority:3,sector:f.sector||null,extra:!f.serviceInspector?['SERVICE_INSPECTOR_PENDING']:[]});
   if(!f.invoiceCertifiedOn)emit('certify','Conferir ateste da nota fiscal do serviço',{priority:3});
  }else if(f.nd==='339030'&&['07','21','04'].includes(sub)){
   emit('review','Acompanhar empenho do APRV sem contagem de prazo de NE',{sector:'APRV',extra:['APRV_NE_DEADLINE_EXCLUDED']});
  }else if(f.nd&&(f.nd!=='339030'||sub||f.sector==='ALMOX')){
   const issued=f.issuedOn||f.assignedOn,estimatedSent=addDays(issued,timing.dispatchDays),sent=f.sentToSupplierOn||estimatedSent;
   const delivery=f.deliveryDueOn||addDays(sent,timing.deliveryDays);
   const second=f.secondNotifiedOn||(/(?:14[. \-]|segunda|2[ªa° .]*not)/.test(stage)?f.notifiedOn:null);
   const first=f.firstNotifiedOn||(!second&&/notific/.test(stage)?f.notifiedOn:null);
   if(/^14[.\s-]/.test(stage)&&!f.secondNotifiedOn){
    emit('second-notification-proof','Confirmar comprovante e data do envio da segunda notificação pelo Almox',{sector:'ALMOX',extra:['SECOND_NOTICE_PROOF_PENDING']});continue;
   }
   if(/^13[.\s-]/.test(stage)&&!f.firstNotifiedOn){
    emit('first-notification-proof','Confirmar comprovante e data do envio da primeira notificação pelo Almox',{sector:'ALMOX',extra:['FIRST_NOTICE_PROOF_PENDING']});continue;
   }
   if(f.paOpenedOn){emit('pa-review','Conferir se a Brigada designou encarregado e se o PA foi concluído',{sector:'ALMOX',days:timing.paDays,start:f.paOpenedOn});}
   else if(second){if(!f.paDiexSentOn)emit('administrative-process','Cobrar DIEx do Almox solicitando abertura de PA à Brigada',{sector:'ALMOX',days:timing.secondNoticeDays,start:second,mode:'business',extra:['PA_DIEX_PROOF_PENDING']});else emit('pa-brigade','Conferir abertura do PA na Brigada, designação do encarregado e conclusão',{sector:'ALMOX',extra:['PA_BRIGADE_STATUS_PENDING']});}
   else if(first){emit('second-notification','Fazer segunda notificação se não houver atendimento da primeira',{sector:'ALMOX',days:timing.noticeDays,start:first,mode:'business'});}
   else if(/notific/.test(stage)){emit('review','Conferir data da notificação para calcular a próxima providência',{sector:'ALMOX',extra:['DATE_PENDING']});}
   else{
    if(!f.sentToSupplierOn)emit('send','Conferir envio da NE ao fornecedor pelo Almox',{sector:'ALMOX',days:timing.dispatchDays,start:issued});
    emit('first-notification','Verificar entrega e fazer primeira notificação 35 dias corridos após emissão da NE',{sector:'ALMOX',days:35,start:issued,extra:[...(!f.sentToSupplierOn?['ESTIMATED_DISPATCH']:[])]});
   }
  }else emit('review','Confirmar classificação e responsável do empenho',{extra:['CLASSIFICATION_PENDING']});
 }
 return result;
}
module.exports={deriveActivities};

