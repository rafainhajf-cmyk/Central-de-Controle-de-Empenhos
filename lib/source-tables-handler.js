'use strict';
const identity=require('./identity'),db=require('./day-db'),cache=require('./management-cache'),catalog=require('../sheet-catalog');
const cellValue=c=>c?.formattedValue??c?.effectiveValue?.stringValue??c?.effectiveValue?.numberValue??c?.effectiveValue?.boolValue??c?.userEnteredValue?.stringValue??c?.userEnteredValue?.numberValue??c?.userEnteredValue?.boolValue??'';
function createHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
  const database=(deps.getDB||db.getDB)(),actor=await(deps.getIdentity||identity.getIdentity)(req,res,database);
  if(!actor?.active)return res.status(401).json({error:'Entre na Central para consultar as fontes.'});
  // Raw reference tables can contain several sectors. Individual scope remains in /gerencial.
  if(!['admin','manager'].includes(actor.role))return res.status(403).json({error:'A consulta integral das fontes exige perfil de gestor. Use a Visão Gerencial para consultar seu setor.'});
  const query=req.query||{};identity.closed(query,['tab','q','offset']);const {tab,q='',offset='0'}=query;
  if((tab!==undefined&&typeof tab!=='string')||typeof q!=='string'||q.length>200||typeof offset!=='string'||!/^\d{1,6}$/.test(offset))return res.status(400).json({error:'Consulta inválida.'});
  if(tab!==undefined&&!catalog.some(s=>s.title===tab))return res.status(400).json({error:'Fonte não autorizada.'});
  const snapshot=await(deps.readSnapshot||cache.readSnapshot)(database);if(!snapshot)return res.status(409).json({error:'A carga inicial ainda não foi realizada. Nenhum dado foi apagado.'});
  const tables=snapshot.state.tables||{},available=catalog.map(s=>({title:s.title,id:s.id,available:Array.isArray(tables[s.title]),count:(tables[s.title]||[]).slice(1).filter(r=>r.some(c=>cellValue(c)!=='')).length}));
  const common={catalog:available,updatedAt:snapshot.updatedAt,sourceDate:snapshot.state.sourceDate,runId:snapshot.runId,notice:'Fonte original preservada no banco. Ajustes manuais e próximas providências são consultados na Visão Gerencial.'};
  if(tab===undefined)return res.status(200).json(common);
  const data=tables[tab];if(!Array.isArray(data))return res.status(200).json({...common,tab,available:false,headers:[],rows:[],total:0,nextOffset:null});
  const headers=(data[0]||[]).map(cellValue),needle=q.trim().toLocaleLowerCase('pt-BR');
  const rows=data.slice(1).filter(row=>row.some(c=>cellValue(c)!=='')).map(row=>Array.from({length:Math.max(headers.length,row.length)},(_,i)=>cellValue(row[i]))).filter(row=>!needle||row.some(v=>String(v).toLocaleLowerCase('pt-BR').includes(needle)));
  const start=Number(offset),limit=100;return res.status(200).json({...common,tab,available:true,headers,rows:rows.slice(start,start+limit),total:rows.length,nextOffset:start+limit<rows.length?start+limit:null});
 }catch(e){return res.status(e.status===400?400:503).json({error:e.status===400?e.message:'Não foi possível consultar as fontes. Os dados salvos foram preservados.'});}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
