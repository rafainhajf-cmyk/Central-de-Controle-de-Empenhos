'use strict';
const quote=t=>"'"+t.replace(/'/g,"''")+"'";
function creditFormulas(row,sheets){
 const nc=quote(sheets.nc.title),dist=quote(sheets.distribution.title),report=sheets.report||{title:'Relatório diário',cell:'$B$5'},a='A'+row;
 const guarded=expression=>`=IF(${a}="";"";${expression})`;
 return [
  `=IF(${nc}!A${row}="";"";${nc}!A${row})`,guarded(`${nc}!C${row}`),guarded(`${nc}!E${row}`),guarded(`${nc}!F${row}`),guarded(`${nc}!G${row}`),
  guarded(`SUMIFS(${dist}!$E$2:$E$100;${dist}!$B$2:$B$100;${a};${dist}!$G$2:$G$100;"<>Cancelada";${dist}!$G$2:$G$100;"<>Concluída")`),
  guarded(`MAX(0;E${row}-F${row})`),guarded(`MAX(0;F${row}-E${row})`),
  guarded(`IFERROR(TEXTJOIN(", ";TRUE;UNIQUE(FILTER(${dist}!$C$2:$C$100;${dist}!$B$2:$B$100=${a})));"Sem distribuição")`),guarded(`${nc}!H${row}`),
  guarded(`IF(H${row}>0;"CONFLITO: distribuição excede disponível";IF(F${row}>0;"Reserva interna; confirmar empenho/baixa";IF(REGEXMATCH(UPPER(J${row});"PRAZO|EMPH|EMPENHO");"Saldo matemático; verificar prazo da NC";"Sem distribuição ativa")))`),
  guarded(`IF(H${row}>0;"Conferir duplicidade e status da distribuição";IF(F${row}>0;"Confirmar empenho ou liberação com responsável";"Verificar prazo e possibilidade de distribuir"))`),
  guarded(`${quote(report.title)}!${report.cell}`)
 ];
}
module.exports={creditFormulas};
