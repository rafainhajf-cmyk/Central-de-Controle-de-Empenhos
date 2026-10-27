'use strict';
const {sourceCents}=require('./operational-model');
const {NC,DIST}=require('./credit-distribution');
const clean=v=>String(v??'').trim();
const key=v=>clean(v).toLocaleUpperCase('pt-BR');
function today(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function isoDate(value){const s=clean(value);let m,y,mo,d;if((m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/))){[,y,mo,d]=m;}else if((m=s.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/))){d=m[1];mo=m[2];y=m[3].length===2?'20'+m[3]:m[3];}else return null;
 const result=String(y)+'-'+mo+'-'+d,date=new Date(result+'T12:00:00Z');return Number(y)>=2000&&Number(y)<=2100&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===result?result:null;}
function age(value,now=new Date()){const date=isoDate(value),current=today(now);if(!date||date>current)return {receivedDate:null,receivedDisplay:clean(value)||'A confirmar',days:null,dateIssue:date?'Data futura: conferir recebimento':'Confirmar data de recebimento pelo setor'};const day=s=>Date.parse(s+'T00:00:00Z')/86400000;return {receivedDate:date,receivedDisplay:date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4),days:day(current)-day(date),dateIssue:''};}
function distributedBalances(datasets,now=new Date()){
 const notes=datasets[NC]?.rows||[],known=new Set(notes.filter(r=>clean(r[0])).map(r=>key(r[0]))),rows=[],archivedRows=[];
 for(const [row,r]of (datasets[DIST]?.rows||[]).entries()){
  const nc=clean(r[1]),status=key(r[6]),rawAmount=sourceCents(r[4]),saved=datasets[DIST].workflows?.[row];
  if(!nc||(!known.has(key(nc))&&!/^20\d{2}NC\d{6}$/i.test(nc))||status==='CANCELADA'||(rawAmount===0&&!saved))continue;
  const archived=Boolean(saved?.archivedAt)||['CONCLUÍDA','CONCLUIDA'].includes(status);
  let workflow=null,issue=rawAmount===null||rawAmount<0?'Conferir saldo distribuído':'';
  if(saved){try{workflow=require('./distribution-workflow').state(datasets,row);}catch{issue='Conferir andamento e saldo da distribuição';}}
  const date=age(r[0],now),phaseOneDays=workflow?.phaseOneClosedDate?age(r[0],new Date(workflow.phaseOneClosedDate+'T15:00:00Z')).days:date.days;
  const phase=archived?'archived':workflow?.awaitingCommitCents===0?'receipt':'commit';
  const amountCents=archived?0:workflow?(phase==='commit'?workflow.awaitingCommitCents:workflow.awaitingReceiptCents):rawAmount;
  const firstOkDays=workflow?.firstOkDate?age(r[0],new Date(workflow.firstOkDate+'T15:00:00Z')).days:null;
  const record={firstOkDays,row,nc,sector:clean(r[2]),responsible:clean(r[3]),amountCents:amountCents!==null&&amountCents>=0?amountCents:null,...date,days:archived&&!workflow?null:phaseOneDays,phase,phaseLabel:archived?'Concluída e arquivada':phase==='receipt'?'A receber / concluir':'Até empenhar',workflow,note:clean(r[9]),issue};
  if(archived)archivedRows.push(record);else rows.push(record);
 }
 rows.sort((a,b)=>(b.days??-1)-(a.days??-1)||a.sector.localeCompare(b.sector,'pt-BR')||a.row-b.row);
 const groups=new Map();for(const r of rows){const name=r.sector|| (r.responsible?'Responsável isolado: '+r.responsible:'Destino a confirmar');let g=groups.get(name);if(!g){g={name,amountCents:0,uncertain:false,count:0,oldestDays:null,missingDates:0};groups.set(name,g);}g.count++;if(r.amountCents===null)g.uncertain=true;else g.amountCents+=r.amountCents;if(r.days===null)g.missingDates++;else g.oldestDays=Math.max(g.oldestDays??0,r.days);}
 return {rows,archivedRows,groups:[...groups.values()],asOf:today(now)};
}
function requireDate(value,now=new Date()){const iso=isoDate(value);if(!iso||iso>today(now)){const e=Error('Informe a data real de recebimento pelo setor, sem data futura.');e.status=400;throw e;}return iso;}
function correctReceivedDate(input,current,now=new Date()){
 const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
 if(input.revision!==current.revision)fail('A distribuição mudou. Atualize antes de corrigir o recebimento.',409);
 const allowed=new Set(['id','action','revision','row','receivedDate','actor']);for(const k of Object.keys(input))if(!allowed.has(k))fail('Campo inválido na correção do recebimento.');
 const record=distributedBalances(current.datasets,now).rows.find(r=>r.row===input.row);if(!record)fail('Distribuição de NC em aberto não localizada.',409);
 const iso=requireDate(input.receivedDate,now);const firstEvent=current.datasets[DIST]?.workflows?.[input.row]?.events?.[0];if(firstEvent&&iso>firstEvent.date)fail('O recebimento não pode ser posterior ao primeiro andamento confirmado.');if(input.actor!==undefined&&(typeof input.actor!=='string'||input.actor.length>100))fail('Responsável pelo registro inválido.');
 const datasets=structuredClone(current.datasets),before=[...datasets[DIST].rows[input.row]],values=[...before];values[0]=iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);datasets[DIST].rows[input.row]=values;
 return {datasets,before:{tab:DIST,row:input.row,values:before},after:{tab:DIST,row:input.row,values},actor:clean(input.actor)||'Operador do painel',reason:'Correção da data de recebimento da NC pelo setor'};
}
module.exports={today,isoDate,age,requireDate,distributedBalances,correctReceivedDate};
