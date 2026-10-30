'use strict';
const {date}=require('./day-schema'),{fail}=require('./identity'),{scope}=require('./permissions');
function midnight(day){
 const target=Date.parse(day+'T00:00:00Z'),fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 let value=target;for(let i=0;i<3;i++){const parts=Object.fromEntries(fmt.formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));const local=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);value+=target-local;}return new Date(value).toISOString();
}
function periodBounds(period,day){
 if(!['daily','weekly','monthly'].includes(period)||!date(day)||day<'2020-01-01')fail('Período inválido. Use uma data a partir de 2020.');
 const start=new Date(day+'T12:00:00Z');if(period==='weekly')start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));if(period==='monthly')start.setUTCDate(1);
 const end=new Date(start);if(period==='monthly')end.setUTCMonth(end.getUTCMonth()+1);else end.setUTCDate(end.getUTCDate()+(period==='weekly'?7:1));
 return {from:midnight(start.toISOString().slice(0,10)),until:midnight(end.toISOString().slice(0,10)),label:start.toISOString().slice(0,10),timezone:'America/Sao_Paulo'};
}
async function report(db,actor,period,day,sector){
 const bounds=periodBounds(period,day),sc=scope(actor,'e',3),params=[bounds.from,bounds.until,...sc.params];let where=sc.sql;
 if(sector){params.push(sector);where+=' AND e.sector=$'+params.length;}
 const events=(await db.query(`SELECT e.sector,e.action,count(*)::integer AS count FROM central_day.events e WHERE e.at >= $1 AND e.at < $2 AND ${where} GROUP BY e.sector,e.action ORDER BY e.sector NULLS LAST,e.action`,params)).rows;
 const endScope=scope(actor,'e',2),endParams=[bounds.until,...endScope.params];let endWhere=endScope.sql;
 if(sector){endParams.push(sector);endWhere+=' AND e.sector=$'+endParams.length;}
 const openAtEnd=(await db.query(`WITH latest AS (SELECT DISTINCT ON(activity_id) activity_id,after_data FROM central_day.events WHERE at < $1 ORDER BY activity_id,at DESC,id DESC), e AS (SELECT after_data->>'sector' AS sector,after_data->>'assigneeId' AS assignee_id,after_data->>'state' AS state FROM latest) SELECT e.sector,count(*)::integer AS count FROM e WHERE e.state <> 'completed' AND ${endWhere} GROUP BY e.sector ORDER BY e.sector NULLS LAST`,endParams)).rows;
 const currentScope=scope(actor,'a'),currentParams=[...currentScope.params];let currentWhere=currentScope.sql;if(sector){currentParams.push(sector);currentWhere+=' AND a.sector=$'+currentParams.length;}
 const currentOpen=Number((await db.query(`SELECT count(*)::integer AS count FROM central_day.activities a WHERE state <> 'completed' AND ${currentWhere}`,currentParams)).rows[0].count);
 const totals={new:0,completed:0,reopened:0,charged:0,partial:0,progress:0,waiting:0,openAtEnd:openAtEnd.reduce((n,r)=>n+r.count,0),currentOpen};
 const names={generated:'new',create:'new',complete:'completed',reopen:'reopened',charge:'charged',partial:'partial',progress:'progress',wait:'waiting'};
 for(const r of events)if(names[r.action])totals[names[r.action]]+=r.count;
 return {period,...bounds,totals,eventsBySector:events,openAtEndBySector:openAtEnd,readAt:new Date().toISOString(),source:'Neon — eventos de acompanhamento; não representa liquidação financeira'};
}
module.exports={periodBounds,report};
