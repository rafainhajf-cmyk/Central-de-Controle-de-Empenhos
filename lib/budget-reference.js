'use strict';
const {financialKey}=require('./budget/primitives'),{legacyDate}=require('./legacy-recovery');
const SOURCE_ID='1ZEoR270SokVLVHp7-okaz8aTsSa6WAJNZD0kOgdxW9o';
function parse(kind,rows,sourceDate=null,readAt=new Date().toISOString()){
 const header=rows?.[0]||[],expected=kind==='ne'?['Ord','NE','UG','Data NE','ND','PI']:['Ord','NC','Data NC','UG','UGR','ND','PI'];if(expected.some((v,i)=>header[i]!==v))throw Error('REFERENCE_HEADERS_CHANGED');
 return rows.slice(1).filter(v=>new RegExp('^20\\d{2}'+kind.toUpperCase()+'\\d{6}$').test(v[1])).flatMap(v=>{const ug=String(v[kind==='ne'?2:3]||'');if(!/^\d{6}$/.test(ug))return [];return [{kind,number:String(v[1]),ug,issuedOn:legacyDate(v[kind==='ne'?3:2],'referenceDate',[]),nd:String(v[kind==='ne'?4:5]||''),pi:String(v[kind==='ne'?5:6]||''),sourceDate,readAt}];});
}
function find(state,kind,number,ug){const all=(state.referenceRecords||[]).filter(r=>r.kind===kind&&r.number===number&&(!ug||r.ug===ug));if(!all.length||new Set(all.map(r=>r.ug)).size!==1)return null;const unique=k=>[...new Set(all.map(r=>r[k]).filter(Boolean))];return {...all[0],pi:unique('pi').join(' / '),nd:unique('nd').length===1?unique('nd')[0]:null,issuedOn:unique('issuedOn').length===1?unique('issuedOn')[0]:null};}
const key=r=>financialKey(r.kind,{...r,year:+r.number.slice(0,4)});
async function readGoogle(token){
 const {googleJson}=require('./google-sheets'),base='https://sheets.googleapis.com/v4/spreadsheets/'+SOURCE_ID,meta=await googleJson(base+'?fields=sheets.properties',token),ranges=[];
 for(const name of ['NE emitidas','Créditos Recebidos']){const n=meta.sheets?.find(s=>s.properties.title===name)?.properties.gridProperties?.rowCount;if(!Number.isInteger(n)||n<4||n>10000)throw Error('REFERENCE_SIZE_CHANGED');ranges.push("'"+name+"'!A4:"+(name==='NE emitidas'?'F':'G')+n);}
 ranges.push("'NE emitidas'!P1","'Créditos Recebidos'!L1");const result=await googleJson(base+'/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&'+ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&'),token),v=result.valueRanges;if(v?.length!==4)throw Error('REFERENCE_INCOMPLETE');return [...parse('ne',v[0].values,legacyDate(v[2].values?.[0]?.[0],'sourceDate',[])),...parse('nc',v[1].values,legacyDate(v[3].values?.[0]?.[0],'sourceDate',[]))];
}
async function save(c,records){const groups=new Map();for(const r of records||[]){const k=key(r);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}for(const rows of groups.values()){const r={...rows[0],...find({referenceRecords:rows},rows[0].kind,rows[0].number,rows[0].ug)};const k=key(r);if(!k)continue;await c.query("INSERT INTO central_day.management_sources(key,kind,source_data) VALUES($1,'budget-reference',$2) ON CONFLICT(key) DO UPDATE SET source_data=excluded.source_data,present=true,last_seen=now()",['reference|'+k,r]);}}
module.exports={parse,find,key,readGoogle,save};
