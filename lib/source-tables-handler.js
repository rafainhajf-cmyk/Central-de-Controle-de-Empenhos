'use strict';
const identity=require('./identity'),db=require('./day-db'),cache=require('./management-cache'),catalog=require('../sheet-catalog');
function sourcePurpose(name){
 if(/Almox/i.test(name))return 'Situação de fornecimento, observações, prazos e cobranças do Almox';
 if(/NEs|liquida|empenh/i.test(name))return 'Empenhos, saldo a liquidar e acompanhamento por setor';
 if(/NCs|Crédito|Movimentos por NC/i.test(name))return 'Créditos, saldo livre, distribuição e vínculos financeiros';
 if(/Distribui/i.test(name))return 'Distribuição do crédito e acompanhamento de requisição/empenhamento';
 if(/Proposta/i.test(name))return 'Propostas de contratação do Excel recebido: objeto, setor, prioridade, orçamento, ND, NC e andamento, sem confundir com empenhos emitidos';
 if(/Processos|PRO/i.test(name))return 'Licitações sem NC, tipos de processo, valores e fases';
 if(/Metas|Meta|setor|Setor/i.test(name))return 'Metas e comparações por setor e tipo de despesa';
 if(/Pendências|atividades|Relatório|Cobranças/i.test(name))return 'Pendências, cobranças e atividades operacionais';
 if(/Contrato/i.test(name))return 'Contratos, fiscais e vigências';
 return 'Conferência e histórico da execução orçamentária';
}
const cellValue=c=>c?.formattedValue??c?.effectiveValue?.stringValue??c?.effectiveValue?.numberValue??c?.effectiveValue?.boolValue??c?.userEnteredValue?.stringValue??c?.userEnteredValue?.numberValue??c?.userEnteredValue?.boolValue??'';
function createHandler(deps={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
  const database=(deps.getDB||db.getDB)(),actor=await(deps.getIdentity||identity.getIdentity)(req,res,database);
  if(!actor?.active)return res.status(401).json({error:'Entre na Central para consultar as fontes.'});
  if(req.query?.overview==='1'){
   identity.closed(req.query,['overview']);
   const snapshot=await(deps.readSnapshot||cache.readSnapshot)(database);
   const hasSnapshot=!!snapshot,global=['admin','manager'].includes(actor.role)||actor.globalRead===true;
   const main='1KKeA5lKttywZp-AvILAhsmfc6XjQ86nYs3OirjE0zco';
   const reference='1ZEoR270SokVLVHp7-okaz8aTsSa6WAJNZD0kOgdxW9o';
   const rows=hasSnapshot?snapshot.state.tables||{}:{};
   const refs=(snapshot?.state?.referenceRecords||[]).filter(r=>r.kind==='ne'||r.kind==='nc');
   const refDates=[...new Set(refs.map(r=>r.sourceDate).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();
   const lastReferenceDate=refDates.at(-1)||null;
   const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const expected=new Date(parts+'T12:00:00Z');do{expected.setUTCDate(expected.getUTCDate()-1);}while([0,6].includes(expected.getUTCDay()));
   const expectedDate=expected.toISOString().slice(0,10);
   const status=lastReferenceDate===null?'Sem data confirmada na última sincronização':lastReferenceDate<expectedDate?'Atrasada em relação ao último dia útil, conferir feriados':lastReferenceDate===expectedDate?'Data esperada do último dia útil':'Data posterior ao último dia útil, conferir';
   const info=[
    {name:'Central de Controle Orçamentário · planilha principal',url:'https://docs.google.com/spreadsheets/d/'+main+'/edit',lastSyncedAt:snapshot?.updatedAt||null,lastSourceDate:snapshot?.state.sourceDate||null,kind:'principal',purpose:'NCs e créditos, distribuições, empenhos e liquidação, metas, processos, ALMOX, pendências, contratos e histórico',status:hasSnapshot?'Retrato preservado no Neon':'Sem sincronização confirmada'},
    {name:'Cópia SIAFI · NE emitidas e Créditos Recebidos',url:'https://docs.google.com/spreadsheets/d/'+reference+'/edit',lastSyncedAt:snapshot?.updatedAt||null,lastSourceDate:lastReferenceDate,expectedBusinessDate:expectedDate,kind:'referencia',purpose:'Cópia com defasagem esperada de 1 dia útil. Confere NE/NC e UG, datas, ND e PI; não substitui valores da fonte principal.',status:status+' (comparação de dias úteis sem calendário local de feriados)'}
   ];
   const tabs=catalog.map(x=>({title:x.title,available:Array.isArray(rows[x.title]),count:global?(rows[x.title]||[]).slice(1).filter(r=>r?.some(c=>cellValue(c)!=='')).length:null,url:'https://docs.google.com/spreadsheets/d/'+main+'/edit#gid='+x.id,purpose:sourcePurpose(x.title)}));
   return res.status(200).json({sources:info,tabs,lastSyncAt:snapshot?.updatedAt||null,sourceDate:snapshot?.state.sourceDate||null,latestRun:snapshot?.lastAttempt?.status||null,canBrowseRaw:global,readOnly:true,notice:hasSnapshot?'Informações do último retrato salvo no Neon. Sincronização não é consulta em tempo real ao Google.':'Nenhuma sincronização inicial confirmada. Os links das fontes continuam disponíveis.'});
  }
  // Raw reference tables can contain several sectors. Individual scope remains in /gerencial.
  if(!['admin','manager'].includes(actor.role)&&actor.globalRead!==true)return res.status(403).json({error:'A consulta integral das fontes exige perfil de gestor. Use a Visão Gerencial para consultar seu setor.'});
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
