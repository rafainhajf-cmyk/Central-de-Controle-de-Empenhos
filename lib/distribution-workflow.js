'use strict';
const {sourceCents}=require('./operational-model');
const NC='NCs e prazos',DIST='Distribuições detalhadas';
const text=v=>String(v??'').trim();const upper=v=>text(v).toLocaleUpperCase('pt-BR');
function fail(message,status=400){const e=Error(message);e.status=status;throw e;}
const money=c=>(c/100).toFixed(2).replace('.',',');
function state(datasets,row){
 const r=datasets[DIST]?.rows[row];if(!r||!text(r[1]))fail('Distribuição não localizada.',409);
 const saved=datasets[DIST].workflows?.[row];
 const originalCents=saved?.originalCents??sourceCents(r[4]);if(!Number.isSafeInteger(originalCents)||originalCents<=0)fail('Confira o valor original da distribuição.',409);
 const s=saved?structuredClone(saved):{nc:text(r[1]),sector:text(r[2]),responsible:text(r[3]),originalCents,committedCents:0,receivedCents:0,returnedCents:0,events:[],firstOkDate:null,phaseOneClosedDate:null,archivedAt:null};
 if(upper(s.nc)!==upper(r[1])||[s.committedCents,s.receivedCents,s.returnedCents].some(v=>!Number.isSafeInteger(v)||v<0)||s.committedCents+s.returnedCents>s.originalCents||s.receivedCents>s.committedCents)fail('Andamento inconsistente. Confira o histórico da distribuição.',409);
 s.awaitingCommitCents=s.originalCents-s.committedCents-s.returnedCents;s.awaitingReceiptCents=s.committedCents-s.receivedCents;
 if(saved&&sourceCents(r[4])!==s.awaitingCommitCents)fail('Saldo editado fora do andamento. Confira o histórico.',409);
 return s;
}
function progress(input,current,now=new Date()){
 if(input.revision!==current.revision)fail('A distribuição mudou. Atualize antes de registrar o andamento.',409);
 const allowed=new Set(['id','action','revision','row','kind','amountCents','date','reference','note','actor','receivedDate']);for(const k of Object.keys(input))if(!allowed.has(k))fail('Campo inválido no andamento.');
 if(!Number.isSafeInteger(input.row)||input.row<0||!['commit','receive','return','return-committed','archive'].includes(input.kind))fail('Escolha o andamento da distribuição.');
 const datasets=structuredClone(current.datasets),r=datasets[DIST]?.rows[input.row];if(!r||['CANCELADA','CONCLUÍDA','CONCLUIDA'].includes(upper(r[6])))fail('Esta distribuição não está em aberto.',409);
 const beforeState=state(datasets,input.row),s=structuredClone(beforeState);if(s.archivedAt)fail('Distribuição já arquivada.',409);
 const beforeValues=[...r];
 const {requireDate,isoDate}=require('./distribution-view');const date=requireDate(input.date,now);
 if(input.receivedDate!==undefined){const confirmed=requireDate(input.receivedDate,now);if(s.events.length&&confirmed!==isoDate(r[0]))fail('Use Corrigir recebimento para alterar a data de um andamento existente.');r[0]=confirmed.slice(8,10)+'/'+confirmed.slice(5,7)+'/'+confirmed.slice(0,4);}
 const receivedDate=isoDate(r[0]);
 if(!receivedDate||date<receivedDate)fail('Confirme o recebimento pelo setor e use uma data igual ou posterior.');
 const last=s.events.at(-1);if(last&&date<last.date)fail('A data deve ser igual ou posterior ao último andamento registrado.');
 for(const[name,max]of [['reference',100],['note',300],['actor',100]])if(input[name]!==undefined&&(typeof input[name]!=='string'||input[name].length>max))fail('Campo inválido: '+name);
 const amount=input.amountCents;if(!Number.isSafeInteger(amount)||amount<0||(input.kind!=='archive'&&amount===0))fail('Informe um valor positivo em centavos.');
 let noteRow=null;
 function updateNC(delta){
  const matches=datasets[NC]?.rows.map((v,i)=>({v,i})).filter(x=>upper(x.v[0])===upper(s.nc));if(matches?.length!==1)fail('Confirme a NC e sua UG antes de registrar empenho ou anulação.',409);
  const record=matches[0],committed=sourceCents(record.v[5]),available=sourceCents(record.v[6]);if(committed===null||available===null||!Number.isSafeInteger(committed+delta)||!Number.isSafeInteger(available-delta)||committed+delta<0||available-delta<0)fail('O valor não corresponde aos saldos atuais da NC. Confira o crédito.',409);
  noteRow={row:record.i,before:[...record.v]};record.v[5]=money(committed+delta);record.v[6]=money(available-delta);noteRow.after=[...record.v];
 }
 if(input.kind==='commit'){
  if(amount>s.awaitingCommitCents)fail('O empenho excede o valor ainda não empenhado.');updateNC(amount);s.committedCents+=amount;s.firstOkDate||=date;
 }else if(input.kind==='receive'){
  if(amount>s.awaitingReceiptCents)fail('O recebimento excede o empenho ainda pendente de recebimento.');s.receivedCents+=amount;
 }else if(input.kind==='return'){
  if(amount>s.awaitingCommitCents)fail('A devolução excede o saldo ainda não empenhado.');s.returnedCents+=amount;
 }else if(input.kind==='return-committed'){
  if(amount>s.awaitingReceiptCents)fail('A sobra excede o empenho ainda não recebido.');updateNC(-amount);s.committedCents-=amount;s.returnedCents+=amount;
 }else{
  if(s.awaitingCommitCents!==0)fail('Registre o empenho ou devolva o saldo não utilizado antes de arquivar.');
  if(amount!==0)fail('Arquivar não movimenta valores. Atualize a página e confirme o arquivamento com saldo disponível zerado.');s.archivedAt=now.toISOString();
 }
 s.awaitingCommitCents=s.originalCents-s.committedCents-s.returnedCents;s.awaitingReceiptCents=s.committedCents-s.receivedCents;
 if(s.awaitingCommitCents===0)s.phaseOneClosedDate||=date;
 const event={id:input.id,kind:input.kind,amountCents:amount,date,reference:text(input.reference),note:text(input.note),actor:text(input.actor)||'Operador do painel',at:now.toISOString()};s.events.push(event);
 r[4]=money(s.awaitingCommitCents);r[6]=s.archivedAt?'Concluída':s.awaitingCommitCents>0?(s.committedCents>0?'Empenho parcial':'Ativa'):'Saldo disponível zerado — pronto para arquivar';
 if(event.note)r[9]=event.note;
 (datasets[DIST].workflows||={})[input.row]=s;
 const titles={commit:'1º OK — empenho confirmado',receive:'Recebimento/conclusão parcial',return:'Devolução de saldo não empenhado','return-committed':'Sobra devolvida por anulação confirmada',archive:'OK final — concluído e arquivado'};
 return {datasets,before:{tab:DIST,row:input.row,values:beforeValues,workflow:beforeState},after:{tab:DIST,row:input.row,values:r,workflow:s,event,ncChange:noteRow},actor:event.actor,reason:titles[input.kind]+(event.reference?' — '+event.reference:'')};
}
module.exports={state,progress};
