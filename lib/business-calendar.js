'use strict';
const {date}=require('./day-schema');
function civilToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function addBusinessDays(start,count,calendar=[]){
 if(!date(start))return null;
 const holidays=new Set(calendar.map(h=>h.day instanceof Date?h.day.toISOString().slice(0,10):h.day));
 const d=new Date(start+'T12:00:00Z');let n=0;
 while(n<count){d.setUTCDate(d.getUTCDate()+1);if(d.getUTCDay()!==0&&d.getUTCDay()!==6&&!holidays.has(d.toISOString().slice(0,10)))n++;}
 return d.toISOString().slice(0,10);
}
module.exports={civilToday,addBusinessDays};
