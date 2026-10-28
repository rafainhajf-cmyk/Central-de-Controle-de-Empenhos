'use strict';
const {financialKey,stable}=require('./primitives');
function compareSnapshots(previous,current){
 const failure=reason=>({state:'failed',reason,replacePrevious:false,unchanged:null,changes:[],deleteRecordIds:[],previousSnapshotId:previous?.id||null});
 if(!current||current.complete!==true||current.status!=='success'||!Array.isArray(current.records)||!current.id)return failure('Consulta falhou ou foi incompleta; retrato anterior preservado.');
 if(previous&&(previous.sourceId!==current.sourceId||previous.basis!==current.basis))return failure('Bases ou fontes incompatíveis; conciliação necessária.');
 if(previous?.sourceDate&&current.sourceDate&&current.sourceDate<previous.sourceDate)return failure('A fonte recebida é anterior ao retrato confirmado.');
 function index(snapshot){const rows=new Map();for(const r of snapshot?.records||[]){const key=financialKey(r.kind,r);if(!key||rows.has(key))throw Error('Identidade incompleta ou duplicada.');rows.set(key,r);}return rows;}
 let before,after;try{before=index(previous);after=index(current);}catch(e){return failure(e.message);}
 if(previous?.id===current.id){if(stable(previous.records)!==stable(current.records))return failure('Mesmo retrato com conteúdos diferentes.');return {state:'replayed',replacePrevious:false,unchanged:true,changes:[],deleteRecordIds:[]};}
 const changes=[];
 for(const [key,r]of after){const old=before.get(key);if(!old){changes.push({kind:'new-'+r.kind,key,before:null,after:r,inferredLiquidation:false});continue;}
  const fields=['committedCents','liquidatedCents','cancelledCents','remainingCents','receivedCents','availableCents','status'].filter(f=>stable(old[f])!==stable(r[f]));
  if(fields.length)changes.push({kind:'changed',key,fields,before:old,after:r,inferredLiquidation:false});
 }
 for(const [key,r]of before)if(!after.has(key))changes.push({kind:'missing-from-source',key,before:r,after:null,requiresReview:true});
 return {state:changes.length?'changed':'unchanged',replacePrevious:true,unchanged:!changes.length,changes,deleteRecordIds:[],previousSnapshotId:previous?.id||null,currentSnapshotId:current.id,readAt:current.readAt,sourceDate:current.sourceDate};
}
module.exports={compareSnapshots};
