'use strict';
const crypto=require('node:crypto');
const {financialKey,stable,safeNumber}=require('./budget/primitives');
const {date,UUID}=require('./day-schema');
const {fail,closed}=require('./identity');
const hash=value=>crypto.createHash('sha256').update(stable(value)).digest('hex');
const money=v=>Number.isSafeInteger(v)&&v>=0;
function emptyBook(){return {version:0,baseline:null,movements:[],reservations:[]};}
function sourceReference(record){
 let key=null;try{key=financialKey('ne',record);}catch{}
 const source={key,sourceDate:require('./legacy-recovery').legacyDate(record.source?.sourceDate,'sourceDate',[]),committedCents:record.committedCents??null,liquidatedCents:record.liquidatedCents??null,cancelledCents:record.cancelledCents??null,remainingCents:record.remainingCents??null};
 const valid=key===record.id&&!!key&&date(source.sourceDate)&&[source.committedCents,source.liquidatedCents,source.cancelledCents,source.remainingCents].every(money)&&BigInt(source.committedCents)===BigInt(source.liquidatedCents)+BigInt(source.cancelledCents)+BigInt(source.remainingCents);
 return {...source,version:hash(source),valid:!!valid,sector:record.sector||''};
}
function movementTotals(movements,ids){
 let liquidation=0n,cancellation=0n;
 for(const m of movements){if(ids&&!ids.has(m.id))continue;const original=m.kind==='reversal'?movements.find(x=>x.id===m.movementId):m;if(!original)fail('Histórico financeiro incompatível.',409,'LEDGER_CONFLICT');const amount=BigInt(m.amountCents)*(m.kind==='reversal'?-1n:1n);if(original.kind==='liquidation')liquidation+=amount;else cancellation+=amount;}
 return {liquidation,cancellation};
}
function financialPosition(book,source){
 const common={version:book.version,sourceVersion:source.version,baseline:book.baseline,reservedCents:null,availableCents:null,freeInternalCents:null,liquidatedCents:null,cancelledCents:null,releasedCreditCents:0};
 if(!source.valid)return {...common,status:'source-pending',notice:'Confirme UG, exercício, data e valores consistentes na fonte antes de movimentar.'};
 if(!book.baseline||book.baseline.sourceVersion!==source.version)return {...common,status:'reconciliation-required',notice:'Concilie esta fonte e os movimentos já incorporados antes de calcular o saldo operacional.'};
 const included=new Set(book.baseline.includedMovementIds),pending=movementTotals(book.movements.filter(m=>!included.has(m.id)&&m.kind!=='reversal'));
 // Reversals may point at an original already incorporated into the source.
 for(const m of book.movements)if(m.kind==='reversal'&&!included.has(m.id)){const original=book.movements.find(x=>x.id===m.movementId);if(!original)fail('Estorno sem movimento original.',409,'LEDGER_CONFLICT');pending[original.kind==='liquidation'?'liquidation':'cancellation']-=BigInt(m.amountCents);}
 const available=BigInt(source.remainingCents)-pending.liquidation-pending.cancellation,liquidated=BigInt(source.liquidatedCents)+pending.liquidation,cancelled=BigInt(source.cancelledCents)+pending.cancellation;
 const reserved=book.reservations.filter(r=>r.state==='active').reduce((sum,r)=>sum+BigInt(r.amountCents),0n);
 if(available<0n||liquidated<0n||cancelled<0n||reserved>available)return {...common,status:'reconciliation-conflict',notice:'A fonte e os movimentos ou reservas estão incompatíveis. Confira a conciliação.'};
 return {...common,status:'ready',reservedCents:safeNumber(reserved),availableCents:safeNumber(available),freeInternalCents:safeNumber(available-reserved),liquidatedCents:safeNumber(liquidated),cancelledCents:safeNumber(cancelled),notice:'Saldo operacional informado. Não é confirmação do SIAFI nem crédito liberado.'};
}
const ACTIONS={reconcile:['includedMovementIds'],liquidation:['amountCents','on','document'],cancellation:['amountCents','on','document'],reversal:['movementId','on','document'],reserve:['amountCents','on','document','purpose'],'cancel-reservation':['reservationId'],'complete-reservation':['reservationId']};
function validateCommand(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(ACTIONS,input.action))fail('Ação financeira inválida.');
 closed(input,['action','operationId','key','expectedVersion','sourceVersion','note',...ACTIONS[input.action]]);
 if(typeof input.operationId!=='string'||!UUID.test(input.operationId)||typeof input.key!=='string'||input.key.length>100||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||typeof input.sourceVersion!=='string'||!/^[a-f0-9]{64}$/.test(input.sourceVersion)||typeof input.note!=='string'||!input.note.trim()||input.note.length>12000)fail('Comando financeiro incompleto.');
 if(['liquidation','cancellation','reserve'].includes(input.action)&&(!money(input.amountCents)||input.amountCents===0))fail('Informe um valor positivo em centavos inteiros.');
 if(['liquidation','cancellation','reserve','reversal'].includes(input.action)&&(!date(input.on)||typeof input.document!=='string'||!input.document.trim()||input.document.length>200))fail('Informe data e documento válidos.');
 if(input.action==='reserve'&&(typeof input.purpose!=='string'||!input.purpose.trim()||input.purpose.length>1200))fail('Informe a finalidade da reserva.');
 if(input.action==='reversal'&&(typeof input.movementId!=='string'||!UUID.test(input.movementId)))fail('Escolha o movimento a estornar.');
 if(input.action.endsWith('-reservation')&&(typeof input.reservationId!=='string'||!UUID.test(input.reservationId)))fail('Escolha a reserva.');
 if(input.action==='reconcile'&&(!Array.isArray(input.includedMovementIds)||input.includedMovementIds.length>2000||input.includedMovementIds.some(id=>typeof id!=='string'||!UUID.test(id))||new Set(input.includedMovementIds).size!==input.includedMovementIds.length))fail('Lista de movimentos incorporados inválida.');
 return structuredClone(input);
}
function applyFinancialCommand(book,source,input,actor,at){
 const c=validateCommand(input);
 if(!actor?.active||!actor.userId||!['admin','manager'].includes(actor.role))fail('Apenas administrador ou gestor pode registrar movimentos financeiros.',403,'FORBIDDEN');
 if(!Number.isFinite(Date.parse(at)))fail('Instante inválido.');
 if(c.expectedVersion!==book.version)fail('O livro financeiro mudou. Recarregue antes de enviar.',409,'VERSION_CONFLICT');
 if(!source.valid||c.key!==source.key)fail('Identidade ou valores da fonte pendentes de conferência.',409,'SOURCE_PENDING');
 if(c.sourceVersion!==source.version)fail('A fonte financeira mudou. Recarregue e concilie.',409,'SOURCE_CHANGED');
 const b=structuredClone(book),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 if(c.on&&(c.on>today||c.on.slice(0,4)<source.key.split('|')[2]))fail('Data futura ou anterior ao exercício do empenho.');
 const position=financialPosition(b,source);
 if(c.action==='reconcile'){
  const included=new Set(c.includedMovementIds);
  if((b.baseline?.includedMovementIds||[]).some(id=>!included.has(id)))fail('Movimentos já incorporados devem permanecer no marco conciliado.',409,'RECONCILIATION_HISTORY');
  for(const id of included){const m=b.movements.find(x=>x.id===id);if(!m||m.kind==='reversal'&&!included.has(m.movementId))fail('Movimento desconhecido ou estorno sem original incorporado.');}
  const totals=movementTotals(b.movements,included);
  if(totals.liquidation<0n||totals.cancellation<0n||totals.liquidation>BigInt(source.liquidatedCents)||totals.cancellation>BigInt(source.cancelledCents))fail('A fonte não comporta os movimentos indicados como incorporados.',409,'RECONCILIATION_CONFLICT');
  b.baseline={sourceVersion:source.version,sourceDate:source.sourceDate,includedMovementIds:[...included].sort(),actorId:actor.userId,at};
  if(financialPosition(b,source).status!=='ready')fail('A conciliação excede o saldo ou conflita com reservas ativas.',409,'RECONCILIATION_CONFLICT');
 }else if(c.action.endsWith('-reservation')){
  const reservation=b.reservations.find(r=>r.id===c.reservationId);if(!reservation||reservation.state!=='active')fail('Reserva inexistente ou já encerrada.',409,'RESERVATION_CLOSED');
  Object.assign(reservation,{state:c.action==='cancel-reservation'?'cancelled':'completed',closedAt:at,closedBy:actor.userId,closureNote:c.note});
 }else{
  if(position.status!=='ready')fail(position.notice,409,'RECONCILIATION_REQUIRED');
  if(b.movements.length+b.reservations.length>=2000)fail('Limite do livro atingido. Preserve o histórico e solicite ampliação.',413,'LEDGER_LIMIT');
  const normalized=c.document.trim().normalize('NFC').toLocaleUpperCase('pt-BR');
  if([...b.movements,...b.reservations].some(m=>m.document.trim().normalize('NFC').toLocaleUpperCase('pt-BR')===normalized))fail('Documento já registrado neste empenho. Consulte o histórico.',409,'DUPLICATE_DOCUMENT');
  const event={id:c.operationId,kind:c.action,on:c.on,document:c.document.trim(),note:c.note,actorId:actor.userId,actorName:actor.name||actor.userId,sector:source.sector,at};
  if(c.action==='reversal'){
   const original=b.movements.find(m=>m.id===c.movementId&&m.kind!=='reversal');if(!original)fail('Movimento original não encontrado.');
   if(b.movements.some(m=>m.kind==='reversal'&&m.movementId===original.id))fail('Movimento já estornado.',409,'ALREADY_REVERSED');
   if(c.on<original.on)fail('O estorno não pode anteceder o movimento original.');
   b.movements.push({...event,amountCents:original.amountCents,movementId:original.id});
  }else{
   if(c.amountCents>position.availableCents)fail('Valor superior ao saldo operacional conciliado.',409,'INSUFFICIENT_BALANCE');
   if(c.amountCents>position.freeInternalCents)fail('Encerre ou cancele as reservas internas antes de comprometer esse valor.',409,'ACTIVE_RESERVATIONS');
   if(c.action==='reserve')b.reservations.push({...event,amountCents:c.amountCents,purpose:c.purpose,state:'active'});
   else b.movements.push({...event,amountCents:c.amountCents});
  }
  if(financialPosition(b,source).status!=='ready')fail('Movimento incompatível com a fonte conciliada.',409,'RECONCILIATION_CONFLICT');
 }
 b.version++;return b;
}
module.exports={emptyBook,sourceReference,financialPosition,validateCommand,applyFinancialCommand};
