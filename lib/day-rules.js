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
  const emit=(rule,subject,{days,start,priority=3,sector=f.sector||null,dueOn=null,extra=[]}={})=>{
   const sourceKey=r.key+'|'+rule;if(keys.has(sourceKey))return;keys.add(sourceKey);
   const foundIssues=[...issues,...extra];if(days&&!date(start))foundIssues.push('DATE_PENDING');if(!sector)foundIssues.push('SECTOR_PENDING');foundIssues.push('RESPONSIBLE_USER_PENDING');
   result.push({sourceKey,rule,ruleVersion:2,subject,reference:f.number||f.reference||'',ug:f.ug||null,exercise:f.year||null,sector,assigneeId:null,priority,dueOn:date(f.dueOn)?f.dueOn:days?addDays(start,days,'calendar',calendar):date(dueOn)?dueOn:null,nextAction:f.nextAction||'',issues:[...new Set(foundIssues)],source:{kind:r.kind,key:r.key,fields:f,provenance:r.provenance||{},readAt:snapshot.readAt,sourceDate:snapshot.sourceDate||null,originalAlmox:r.originalAlmox||null}});
  };
  if(r.kind==='process'){emit('process',f.subject||'Acompanhar processo / TR / orçamento',{priority:1,dueOn:f.dueOn});continue;}
  if(r.kind==='distribution'){
   if(!['Cancelada','Concluída'].includes(f.status))emit('commit-distribution','Conferir empenho do crédito distribuído',{priority:2,days:5,start:f.assignedOn});continue;
  }
  if(r.kind==='pending'){emit('pending',f.subject||'Conferir pendência existente',{dueOn:f.dueOn,priority:2,extra:f.completedOn?['SOURCE_COMPLETION_REQUIRES_REVIEW']:[]});continue;}
  if(r.kind==='contract'){emit('contract','Conferir vigência e providência do contrato '+(f.number||''),{dueOn:f.endsOn,priority:4});continue;}
  if(r.kind==='review'){emit('review',f.subject||'Conferir informações da fonte',{extra:['SOURCE_REVIEW_REQUIRED']});continue;}
  if(r.kind!=='ne')continue;
  if(!f.ug||!f.year||!/^20\d{2}NE\d{6}$/.test(f.number||'')){
   emit('review','Confirmar identidade e UG de '+(f.number||'empenho'),{extra:['UG_OR_IDENTITY_PENDING']});continue;
  }
  const stage=[f.status,f.almoxStatus].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(f.remainingCents===0&&/liquidad/.test(stage))continue;
  if(/entregue.*liquidar|entregue.*pagamento/.test(stage)){emit('payment','Verificar a fase do pagamento da NE',{priority:3});continue;}
  if(/falta.*providencia.*setor/.test(stage)){emit('service-request','Verificar se o serviço já foi solicitado ao fornecedor',{priority:3});continue;}
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
   if(f.paOpenedOn){emit('pa-review','Acompanhar andamento do PA',{sector:'ALMOX',days:timing.paDays,start:f.paOpenedOn});}
   else if(second){emit('administrative-process','Abrir PA se não houver atendimento da segunda notificação',{sector:'ALMOX',days:timing.secondNoticeDays,start:second});}
   else if(first){emit('second-notification','Fazer segunda notificação se não houver atendimento da primeira',{sector:'ALMOX',days:timing.noticeDays,start:first});}
   else if(/notific/.test(stage)){emit('review','Conferir data da notificação para calcular a próxima providência',{sector:'ALMOX',extra:['DATE_PENDING']});}
   else{
    if(!f.sentToSupplierOn)emit('send','Conferir envio da NE ao fornecedor pelo Almox',{sector:'ALMOX',days:timing.dispatchDays,start:issued});
    emit('first-notification','Verificar entrega e fazer primeira notificação após o vencimento',{sector:'ALMOX',dueOn:delivery,extra:[...(!f.sentToSupplierOn&&!f.deliveryDueOn?['ESTIMATED_DISPATCH']:[]),...(!date(delivery)?['DATE_PENDING']:[])]});
   }
  }else emit('review','Confirmar classificação e responsável do empenho',{extra:['CLASSIFICATION_PENDING']});
 }
 return result;
}
module.exports={deriveActivities};

