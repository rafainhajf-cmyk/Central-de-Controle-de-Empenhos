'use strict';
const {sourceCents}=require('./operational-model');
const NC='NCs e prazos',DIST='Distribuições detalhadas';
const norm=v=>String(v??'').trim();
const key=v=>norm(v).toLocaleUpperCase('pt-BR');
function fail(message,status=400){const e=Error(message);e.status=status;throw e;}
function credits(datasets){
 const notes=datasets[NC],distributions=datasets[DIST];if(!notes||!distributions)fail('Base de créditos indisponível.',503);
 const counts=new Map();for(const r of notes.rows)if(norm(r[0]))counts.set(key(r[0]),(counts.get(key(r[0]))||0)+1);
 return notes.rows.flatMap((r,row)=>{
  if(!norm(r[0]))return [];
  const availableCents=sourceCents(r[6]);let distributedCents=0,reservedCents=0,valid=true;const sectors=new Set();
  for(const d of distributions.rows){if(key(d[1])!==key(r[0])||key(d[6])==='CANCELADA')continue;const amount=sourceCents(d[4]);if(amount===null||amount<0){valid=false;continue;}distributedCents+=amount;if(key(d[6])!=='CONCLUÍDA'&&key(d[6])!=='CONCLUIDA')reservedCents+=amount;if(norm(d[2]))sectors.add(norm(d[2]));}
  if(!Number.isSafeInteger(distributedCents)||!Number.isSafeInteger(reservedCents))valid=false;
  const duplicate=counts.get(key(r[0]))!==1;
  const freeCents=availableCents!==null&&valid?availableCents-reservedCents:null;
  const issue=duplicate?'NC repetida: confira a UG e os vínculos antes de distribuir.':availableCents===null||availableCents<0?'Confira o saldo disponível desta NC.':!valid?'Há distribuição com valor inválido. Confira os lançamentos.':freeCents<0?'Reservas em aberto excedem o disponível desta NC.':'';
  const lastAction=[...(notes.creditActions||[])].reverse().find(a=>a.ncRow===row&&key(a.nc)===key(r[0]));
  return [{fiscalPending:Boolean(issue)||freeCents===null||freeCents>0,fiscalOwner:'Fiscal',lastAction:lastAction||null,row,nc:norm(r[0]),nd:norm(r[2]),purpose:norm(r[3]),receivedCents:sourceCents(r[4]),committedCents:sourceCents(r[5]),availableCents,distributedCents:valid?distributedCents:null,reservedCents:valid?reservedCents:null,freeCents,sectorNames:[...sectors],issue,canDistribute:!issue&&freeCents>0}];
 });
}
function sectors(datasets){const values=new Set();for(const [tab,c]of [[DIST,2],['Setores recalculados',1],['Pendências',3]])for(const row of datasets[tab]?.rows||[]){const value=norm(row[c]);if(value&&value.length<=100)values.add(value);}return [...values].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
function distribute(input,current,now=new Date()){
 if(!Number.isSafeInteger(input.revision)||input.revision!==current.revision)fail('Os dados mudaram. Atualize os créditos antes de distribuir.',409);
 const allowed=new Set(['id','action','revision','ncRow','sector','amountCents','actor','note']);for(const name of Object.keys(input))if(!allowed.has(name))fail('Campo não permitido na distribuição.');
 if(!Number.isSafeInteger(input.ncRow)||input.ncRow<0)fail('Escolha uma NC.');
 if(typeof input.sector!=='string'||!norm(input.sector)||input.sector.length>100)fail('Informe o setor de destino.');
 if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0)fail('Informe um valor maior que zero, com no máximo duas casas decimais.');
 const credit=credits(current.datasets).find(c=>c.row===input.ncRow);if(!credit)fail('NC não localizada. Atualize a consulta.',409);
 if(credit.issue)fail(credit.issue,409);
 if(input.amountCents>credit.freeCents)fail('O valor excede o saldo livre para distribuir desta NC.',409);
 const actor=typeof input.actor==='string'&&norm(input.actor)?norm(input.actor):'Operador do painel';if(actor.length>100)fail('Responsável muito extenso.');
 const note=input.note===undefined?'':norm(input.note);if(note.length>1200)fail('Observação muito extensa.');
 const datasets=structuredClone(current.datasets),target=datasets[DIST];
 let row=target.rows.findIndex(r=>r.every(v=>!norm(v)));if(row<0)row=target.rows.length;
 const values=Array(Math.max(10,target.headers.length)).fill('');
 Object.assign(values,{0:new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(now),1:credit.nc,2:norm(input.sector),3:actor,4:(input.amountCents/100).toFixed(2).replace('.',','),5:credit.purpose||'Distribuição interna de crédito',6:'Ativa',7:(credit.availableCents/100).toFixed(2).replace('.',','),8:credit.committedCents===null?'':(credit.committedCents/100).toFixed(2).replace('.',','),9:note||'Acompanhar utilização pelo setor'});
 if(note){(datasets[NC].creditActions||=[]).push({id:input.id,ncRow:credit.row,nc:credit.nc,kind:'distribution',sector:norm(input.sector),amountCents:input.amountCents,note,actor,at:now.toISOString()});}
 target.rows[row]=values;target.updatedAt=now.toISOString();target.origin='Banco do programa';
 return {datasets,before:{tab:DIST,row,values:null,credit},after:{tab:DIST,row,values,nc:credit.nc,sector:norm(input.sector),amountCents:input.amountCents},actor,reason:'Distribuição interna de crédito para '+norm(input.sector)};
}
function requestCreditAction(input,current,now=new Date()){
 if(input.revision!==current.revision)fail('Os dados mudaram. Atualize os créditos antes de registrar a providência.',409);
 const allowed=new Set(['id','action','revision','ncRow','kind','amountCents','diex','targetNd','note','actor']);for(const field of Object.keys(input))if(!allowed.has(field))fail('Campo não permitido na providência.');
 if(!['recollection','nd-change'].includes(input.kind))fail('Escolha a providência.');
 const credit=credits(current.datasets).find(c=>c.row===input.ncRow);if(!credit)fail('NC não localizada.',409);if(credit.issue)fail(credit.issue,409);
 if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0||input.amountCents>credit.freeCents)fail('Informe um valor dentro do saldo não distribuído.');
 if(typeof input.diex!=='string'||!norm(input.diex)||input.diex.length>100)fail('Informe o número do DIEx (até 100 caracteres).');
 if(input.kind==='nd-change'&&(!/^\d{6}$/.test(input.targetNd||'')||input.targetNd===credit.nd))fail('Informe a nova ND com seis dígitos, diferente da atual.');
 if(input.note!==undefined&&(typeof input.note!=='string'||input.note.length>300))fail('A observação deve ter até 300 caracteres.');
 if(input.actor!==undefined&&(typeof input.actor!=='string'||input.actor.length>100))fail('Responsável inválido.');
 const datasets=structuredClone(current.datasets),actions=datasets[NC].creditActions||=[];
 const entry={id:input.id,ncRow:credit.row,nc:credit.nc,kind:input.kind,amountCents:input.amountCents,diex:norm(input.diex),targetNd:input.kind==='nd-change'?input.targetNd:'',note:norm(input.note),actor:norm(input.actor)||'Operador do painel',owner:'Fiscal',status:'Solicitado — aguardando execução',at:now.toISOString()};
 actions.push(entry);
 return {datasets,before:{tab:NC,row:credit.row,values:datasets[NC].rows[credit.row],lastAction:credit.lastAction},after:{tab:NC,row:credit.row,values:datasets[NC].rows[credit.row],creditAction:entry},actor:entry.actor,reason:(entry.kind==='recollection'?'Solicitação de recolhimento':'Solicitação de mudança de ND')+' — DIEx '+entry.diex};
}
module.exports={requestCreditAction,credits,sectors,distribute,NC,DIST};
