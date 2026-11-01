'use strict';
const {sumCents,financialKey,stable}=require('./budget/primitives'),crypto=require('node:crypto');
function attach(credits,distributions,commitments){
 const candidates=new Map();for(const c of [...credits.received,...credits.unresolved]){if(!candidates.has(c.number))candidates.set(c.number,[]);candidates.get(c.number).push(c);}
 for(const d of distributions){const list=(candidates.get(d.number)||[]).filter(c=>!d.ug||c.ug===d.ug);d.creditKey=d.creditKey||(list.length===1&&list[0].creditKey?list[0].creditKey:null);}
 const official=new Map(commitments.filter(r=>r.ug).map(r=>[r.id,r]));
 for(const c of [...credits.received,...credits.unresolved]){
  const match=distributions.filter(d=>d.creditKey===c.creditKey&&!!c.creditKey),ambiguous=distributions.filter(d=>!d.creditKey&&d.number===c.number&&(!d.ug||d.ug===c.ug)),unknown=match.some(d=>!d.progress.valid)||ambiguous.length>0;
  c.distributedCents=unknown?null:sumCents(match.map(d=>d.progress.uncommittedCents));c.distributionCount=match.length;c.distributionNeedsReview=unknown;const events=match.flatMap(d=>d.progress.commitments),groups=new Map();
  for(const e of events){const number=/\b20\d{2}NE\d{6}\b/i.exec(e.document||'')?.[0]?.toUpperCase(),k=number&&c.ug?financialKey('ne',{number,ug:c.ug,year:+number.slice(0,4)}):null;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
  let unreflected=0;for(const [k,items]of groups){const total=sumCents(items.map(e=>e.amountCents)),ne=official.get(k),sameCredit=ne&&new RegExp('\\b'+c.number+'\\b').test(ne.subject||'');if(!sameCredit||!Number.isSafeInteger(ne.committedCents)||ne.committedCents<total)unreflected=sumCents([unreflected,total]);}
  c.commitmentsAwaitingSourceCents=unreflected;c.freeToDistributeCents=!unknown&&Number.isSafeInteger(c.availableCents)?Math.max(0,c.availableCents-c.distributedCents-unreflected):null;c.allocationConflict=!unknown&&Number.isSafeInteger(c.availableCents)&&c.distributedCents+unreflected>c.availableCents;
  c.sourceVersion=crypto.createHash('sha256').update(stable([c.creditKey,c.receivedCents,c.committedCents,c.availableCents,c.sourceDate])).digest('hex');c.canDistribute=!!c.creditKey&&c.freeToDistributeCents>0&&!c.allocationConflict;
 }
 return credits;
}
module.exports={attach};
