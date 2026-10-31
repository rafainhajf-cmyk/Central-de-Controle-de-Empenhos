'use strict';
// Read-only reconciliation: never updates source, a snapshot, or manual Neon fields.
const norm=x=>String(x??'').trim();
const num=x=>{if(typeof x==='number')return Number.isFinite(x)?Math.round(x*100):null;let t=norm(x).replace(/R\$|\s/g,'');if(!t)return null;if(t.includes(',')&&t.includes('.'))t=t.replace(/\./g,'').replace(',','.');else if(t.includes(','))t=t.replace(',','.');const n=Number(t);return Number.isFinite(n)?Math.round(n*100):null;};
const ne=/^20\d{2}NE\d{6}$/,nc=/^20\d{2}NC\d{6}$/;
function keyed(rows,{kind,number,ug,values}){
 const result=new Map(),problems=[],duplicates=new Set();
 for(const row of rows){
  const no=norm(row[number]),unit=norm(row[ug]);
  if(!(kind==='ne'?ne:nc).test(no))continue;
  if(!/^\d{6}$/.test(unit)){problems.push({number:no,code:'UG_MISSING'});continue;}
  const key=unit+'|'+no;
  if(duplicates.has(key))continue;
  if(result.has(key)){problems.push({key,code:'DUPLICATE'});result.delete(key);duplicates.add(key);continue;}
  result.set(key,{number:no,ug:unit,amounts:Object.fromEntries(Object.entries(values).map(([field,col])=>[field,num(row[col])]))});
 }
 return {result,problems};
}
function compare({official,central,kind}){
 if(!['ne','nc'].includes(kind))throw Error('Tipo inválido');
 const config=kind==='ne'?{
  official:{kind,number:1,ug:2,values:{committed:10,liquidated:11,cancelled:12,remaining:13}},
  central:{kind,number:0,ug:15,values:{committed:4,liquidated:5,cancelled:6,remaining:7}}
 }:{
  official:{kind,number:1,ug:3,values:{received:8,committed:9,available:10}},
  central:{kind,number:0,ug:10,values:{received:4,committed:5,available:6}}
 };
 if(!config.official)throw Error('Tipo inválido');
 const a=keyed(official,config.official),b=keyed(central,config.central),differences=[];
 for(const [key,left] of a.result){
  const right=b.result.get(key);
  if(!right){differences.push({key,code:'MISSING_IN_CENTRAL'});continue;}
  for(const field of Object.keys(left.amounts))if(left.amounts[field]===null||right.amounts[field]===null)differences.push({key,field,code:'UNVERIFIED_AMOUNT'});
  else if(left.amounts[field]!==right.amounts[field])differences.push({key,field,code:'AMOUNT_MISMATCH',officialCents:left.amounts[field],centralCents:right.amounts[field]});
 }
 for(const key of b.result.keys())if(!a.result.has(key))differences.push({key,code:'NOT_IN_OFFICIAL_WINDOW'});
 return {differences,issues:[...a.problems.map(x=>({...x,source:'official'})),...b.problems.map(x=>({...x,source:'central'}))],compared:a.result.size,centralCount:b.result.size};
}
module.exports={compare};
