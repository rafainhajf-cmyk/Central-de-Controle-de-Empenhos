const clone=x=>structuredClone(x);
const headers={nc:['Número da NC','Quando o crédito chegou','Natureza da despesa (ND)','Para que o crédito foi recebido','Valor recebido (R$)','Valor já empenhado (R$)','Valor ainda disponível (R$)','Prazo de empenho informado na NC','Dias desde o recebimento (na fonte)','O que verificar'],distribution:['Quando distribuí','NC ou NE de origem','Setor que recebeu','Quem ficou responsável','Valor entregue ao setor (R$)','Para que o valor será usado','Situação da distribuição','Saldo disponível da NC no SIAFI (R$)','Total empenhado da NC no SIAFI (R$)','O que acompanhar agora'],history:['Quando aconteceu','O que aconteceu','NC, NE ou processo','Setor','Responsável','Como estava antes','Como ficou depois','Onde foi confirmado','Observações']};
const cell=v=>v===undefined||v===null?{}:{userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v}};
function fixture(options={}){
 const tables={nc:[options.legacyHeaders?headers.nc:[...headers.nc,'UG','ID de controle'],...(options.ncs||[['2026NC000001','01/10/2026','339030','Fixture crédito',100,0,100,'Prazo a confirmar',25,'','160111','nc-1']])],distribution:[options.legacyHeaders?headers.distribution:[...headers.distribution,'UG','ID de controle'],...(options.distributions||[])],history:[headers.history],credit:[['Painel','Data'],['Fonte SIAFI','21/10/2026']]};
 const sheets={nc:{id:11,title:'NC'},distribution:{id:12,title:'Distrib'},history:{id:13,title:'Hist'},credit:{id:14,title:'Crédito'},source:{id:14,title:'Crédito',cell:'N1'},report:{id:14,title:'Crédito',cell:'$N$1'}};
 const data={};for(const k of ['nc','distribution','history','credit'])data[k]=tables[k].map(row=>row.map(cell));
 data.credit[0][13]=cell('21/10/2026');for(let row=2;row<=100;row++)data.credit[row-1]=require('../../lib/credit-formulas').creditFormulas(row,sheets).map(f=>({userEnteredValue:{formulaValue:f}}));
 const calls=[];const context={spreadsheetId:'fixture',sheets,request:async(path,opts={})=>{calls.push({path,opts});const url=new URL('https://fixture.invalid/'+path.replace(/^\//,''));if(opts.method){
 if(path!==':batchUpdate'||opts.method!=='POST')throw Error('Unexpected fixture write');
 const next=clone(data),body=JSON.parse(opts.body);for(const request of body.requests){
  const operation=request.updateCells||request.appendCells;if(!operation||!['userEnteredValue','userEnteredValue,userEnteredFormat,dataValidation'].includes(operation.fields))throw Error('Unsupported field mutation');
  const id=operation.start?.sheetId??operation.sheetId;const kind=Object.keys(sheets).find(k=>k!=='source'&&sheets[k].id===id);if(!kind)throw Error('Unknown sheet');
  const start=request.appendCells?next[kind].length:operation.start.rowIndex,col=operation.start?.columnIndex||0;
  for(const[i,row]of operation.rows.entries()){next[kind][start+i]||=[];for(const[j,c]of row.values.entries())next[kind][start+i][col+j]=clone(c);}
 }
 for(const k of Object.keys(next))data[k]=next[k];if(options.afterWrite)options.afterWrite(data);if(options.loseResponse){options.loseResponse=false;throw Error('Network response lost after commit');}return {replies:body.requests.map(()=>({}))};
 }const requested=url.searchParams.getAll('ranges');return {sheets:['nc','distribution','history','credit'].filter(k=>!requested.length||requested.some(r=>r.startsWith("'"+sheets[k].title+"'!"))).map(k=>({properties:{sheetId:sheets[k].id,title:sheets[k].title,gridProperties:{rowCount:k==='history'?1000:100,columnCount:12}},...(requested.length?{data:[{startRow:0,startColumn:0,rowData:data[k].map(values=>({values:clone(values)}))}]}:{})}))}}};
 return {context,data,calls,headers,cell};
}
module.exports={fixture,headers,cell,clone};
