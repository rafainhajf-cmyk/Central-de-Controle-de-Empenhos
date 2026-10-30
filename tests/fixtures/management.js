'use strict';
const {HEADERS}=require('../../lib/budget/source-adapter');
const cell=x=>({userEnteredValue:typeof x==='number'?{numberValue:x}:{stringValue:String(x??'')},effectiveValue:typeof x==='number'?{numberValue:x}:{stringValue:String(x??'')}});
function fixture(){
 const tables=Object.fromEntries(Object.entries(HEADERS).map(([name,h])=>[name,[h.map(cell)]]));
 const ne=['2026NE000001','2026-10-01','Empresa teste','Material de cozinha SUBITEM 21',1000,200,0,800,'APRV','ALMOX','Pessoa de teste','Aberto','Não','Pendente','Anotação original','160111','Conferir entrega'];
 tables['NEs e liquidação'].push(ne.map(cell));
 tables['Base para metas'].push(['2026NE000001','','339030','Material','','','',1000,200,0,800,0,0,'','','','160111'].map(cell));
 tables['Contratos e fiscais']=[['Contrato'],['01/2026','Fornecedor teste','Manutenção','2026-01-01','2026-12-31','','','Fiscal teste','','','','Conferir vigência','CONTRATO-1','Ativo','Conferir prorrogação',''].map(cell)];
 const fields={number:'2026NE000001',ug:'160111',year:2026,description:'Material SUBITEM 21',nd:'339030',sector:'ALMOX',owner:'Pessoa de teste'};
 return{tables,records:[],sourceRecords:[{id:'source:ne:2',kind:'ne',key:'ne|160111|2026|2026NE000001',fields,originalAlmox:{status:'Pendente',observation:'Anotação original'},issues:[]}],historyEntries:[],movements:[],reconciliations:[],readAt:'2026-10-28T12:00:00Z',sourceDate:'2026-10-28'};
}
module.exports={fixture};
