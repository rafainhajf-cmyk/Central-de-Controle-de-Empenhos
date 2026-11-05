'use strict';
const {addDays}=require('./budget/timelines');
const {date}=require('./day-schema');
const DEFAULTS=require('./deadline-settings').DEFAULTS;
function check(record,asOf,rules={}){
 const cfg={...DEFAULTS,...rules},issued=record.issuedOn?.value,stage=String(record.almox?.status||record.reportedStage||'');
 const sent=record.sentToSupplierOn,first=record.firstNotifiedOn,second=record.secondNotifiedOn,pa=record.paOpenedOn;
 const timeline=[];
 const push=(label,start,days)=>{const due=date(start)?addDays(start,days):null;timeline.push({label,start:date(start)?start:null,dueOn:due,overdueDays:due&&date(asOf)&&asOf>due?Math.round((Date.parse(asOf+'T12:00:00Z')-Date.parse(due+'T12:00:00Z'))/86400000):0});return due;};
 const dispatch=push('Envio ao fornecedor',issued,cfg.dispatchDays);
 if(date(sent))push('Entrega do fornecedor',sent,cfg.deliveryDays);
 else if(date(issued))timeline.push({label:'Entrega estimada, se envio ocorreu no prazo',start:null,dueOn:addDays(dispatch,cfg.deliveryDays),estimated:true});
 if(date(first))push('Resposta à primeira notificação',first,cfg.noticeDays);
 if(date(second))push('Providência após segunda notificação',second,cfg.secondNoticeDays);
 if(date(pa))push('Revisão do PA',pa,cfg.paDays);
 const last=timeline.filter(t=>!t.estimated&&t.dueOn).at(-1)||null;
 const delivered=/entregu|recebid|liquidad/i.test(stage.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
 let action;
 if(date(pa))action='Conferir andamento do PA e registrar a providência';
 else if(date(second))action='Conferir resposta à segunda notificação e avaliar abertura de PA';
 else if(date(first))action='Conferir resposta à primeira notificação e segunda notificação';
 else if(date(sent))action='Conferir entrega, recebimento e eventual primeira notificação';
 else action='Cobrar e registrar a data efetiva do envio da NE ao fornecedor';
 if(delivered)action='Conferir documentos de recebimento, atesto e liquidação; situação da planilha não comprova conclusão';
 if(!date(issued))action='Conferir data de emissão para calcular o prazo de envio';
 return {milestones:timeline,deadline:last?.dueOn||null,overdueDays:last?.overdueDays??null,action,
  status:last?.overdueDays>0?'Prazo informado ultrapassado — conferir comprovação':last?.dueOn?'Prazo em acompanhamento':'Prazo a conferir',hasEstimatedDates:timeline.some(t=>t.estimated),
  caveat:'Prazos contados em dias corridos segundo regras cadastradas. Datas e situações da fonte devem ser comprovadas antes de concluir descumprimento.'};
}
module.exports={check};
