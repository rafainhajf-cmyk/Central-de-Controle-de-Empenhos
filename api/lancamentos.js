const crypto=require('node:crypto');
const ID='1KKeA5lKttywZp-AvILAhsmfc6XjQ86nYs3OirjE0zco';
const TAB='Lançamentos do aplicativo';
const HEAD=['ID','Data/hora UTC','Tipo','Referência','Responsável','Situação','Observação'];
function auth(req){if(process.env.APP_ACCESS_EXPIRES_AT&&!(Date.now()<Number(process.env.APP_ACCESS_EXPIRES_AT)))return false;const secret=process.env.APP_ACCESS_TOKEN||'';const sent=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');return secret.length>=24&&Buffer.byteLength(sent)===Buffer.byteLength(secret)&&crypto.timingSafeEqual(Buffer.from(sent),Buffer.from(secret))}
function jwt(email,key){const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const now=Math.floor(Date.now()/1000);const base=b({alg:'RS256',typ:'JWT'})+'.'+b({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});return base+'.'+crypto.sign('RSA-SHA256',Buffer.from(base),key).toString('base64url')}
async function access(){const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;const key=(process.env.GOOGLE_PRIVATE_KEY||'').replace(/\\n/g,'\n');if(!email||!key)throw Error('CONFIG');const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt(email,key)})});if(!r.ok)throw Error('OAUTH');return (await r.json()).access_token}
const clean=v=>String(v??'').trim();
async function google(url,token,options={}){const r=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});if(!r.ok){const e=new Error('GOOGLE_'+r.status);e.status=r.status;throw e}return r.json()}
// The only deletion allowed here is the ID returned when creating this temporary probe tab.
async function testWrite(base,token){
 const title='__TESTE_API_'+crypto.randomUUID(),marker=crypto.randomUUID();let sheetId;let failure;
 try{
  const created=await google(base+':batchUpdate',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{addSheet:{properties:{title,hidden:true,gridProperties:{rowCount:10,columnCount:7}}}}]})});
  sheetId=created.replies?.[0]?.addSheet?.properties?.sheetId;
  if(!Number.isInteger(sheetId))throw Error('PROBE_CREATE');
  const range=encodeURIComponent("'"+title+"'!A:G");
  for(const label of ['primeiro','segundo'])await google(base+'/values/'+range+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[marker,label]],majorDimension:'ROWS'})});
  const read=await google(base+'/values/'+encodeURIComponent("'"+title+"'!A1:B2"),token);
  if(JSON.stringify(read.values)!==JSON.stringify([[marker,'primeiro'],[marker,'segundo']]))throw Error('PROBE_READBACK');
 }catch(e){failure=e}
 finally{if(Number.isInteger(sheetId)){try{await google(base+':batchUpdate',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{deleteSheet:{sheetId}}]})})}catch{const e=Error('PROBE_CLEANUP');e.cleanupRequired=title;throw e}}}
 if(failure)throw failure;
 return {verified:true,cleanedUp:true,officialDataChanged:false,at:new Date().toISOString()};
}
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');if(!auth(req))return res.status(401).json({error:'Não autorizado'});if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido'});
let input={};if(req.method==='POST'){try{input=typeof req.body==='string'?JSON.parse(req.body):req.body||{};if(!input||typeof input!=='object'||Array.isArray(input))throw Error();}catch{return res.status(400).json({error:'JSON inválido'});}}
try{const token=await access();const base='https://sheets.googleapis.com/v4/spreadsheets/'+ID;
if(req.method==='GET'){const meta=await google(base+'?fields=sheets(properties(title,gridProperties(rowCount)))',token);const grid=meta.sheets?.find(s=>s.properties.title===TAB)?.properties.gridProperties;if(!grid||!Number.isInteger(grid.rowCount))return res.status(409).json({error:'Aba de lançamentos indisponível'});const page=Number(req.query?.page||0);if(!Number.isSafeInteger(page)||page<0||page>10000)return res.status(400).json({error:'Página inválida'});const start=page*200+2;if(start>grid.rowCount)return res.status(200).json({headers:HEAD,rows:[],page,hasMore:false});const u=base+'/values/'+encodeURIComponent("'"+TAB+"'!A"+start+":G"+Math.min(start+199,grid.rowCount));try{const data=await google(u,token);const rows=data.values||[];return res.status(200).json({headers:HEAD,rows,page,hasMore:start+199<grid.rowCount})}catch(e){if(e.status===400)return res.status(409).json({error:'Aba de lançamentos indisponível; confira a configuração'});throw e}}
if(input.action==='correct-entry'){
 const target=clean(input.targetId),reason=clean(input.reason);
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(target)||reason.length<10||reason.length>1200)return res.status(400).json({error:'Informe ID válido e justificativa com 10 a 1200 caracteres'});
 const newStatus=clean(input.status),newNote=clean(input.note);
 if(newStatus.length>80||newNote.length>1200||!newNote)return res.status(400).json({error:'Informe situação (até 80 caracteres) e observação corrigida (até 1200 caracteres)'});
 const range=encodeURIComponent("'"+TAB+"'!A:G");
 const original=await google(base+'/values/'+range,token);
 if(JSON.stringify(original.values?.[0])!==JSON.stringify(HEAD))return res.status(409).json({error:'Cabeçalhos divergentes'});
 const matches=(original.values||[]).slice(1).filter(row=>row[0]===target);
 if(matches.length!==1)return res.status(409).json({error:'Registro não localizado ou ID duplicado. Nada foi alterado.'});
 const previous=matches[0];
 const record=[crypto.randomUUID(),new Date().toISOString(),'Outros',target,clean(input.owner)||previous[4],'Correção registrada',JSON.stringify({kind:'correction',targetId:target,previousStatus:previous[5]||'',previousNote:previous[6]||'',newStatus,newNote,reason})];
 if(record[6].length>4000)return res.status(400).json({error:'Correção extensa demais'});
 await google(base+'/values/'+range+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[record]})});
 return res.status(201).json({success:true,id:record[0],at:record[1],targetId:target,mode:'append-only'});
}
if(input.action==='test-write')return res.status(200).json(await testWrite(base,token));
for(const [field,max] of Object.entries({type:40,reference:80,owner:100,status:80,note:1200})){if(input[field]!==undefined&&(typeof input[field]!=='string'||input[field].length>max))return res.status(400).json({error:'Campo inválido ou acima do limite: '+field+'. Nenhum texto foi truncado.'});}
const type=clean(input.type,40),reference=clean(input.reference,80),owner=clean(input.owner,100),status=clean(input.status,80),note=String(input.note??'');
if(!['NC','NE','Contrato','Pendência','Processo','Outros'].includes(type)||!reference||!note.trim()||!owner)return res.status(400).json({error:'Preencha tipo, referência, responsável e observação'});
const meta=await google(base+'?fields=sheets.properties.title',token);if(!(meta.sheets||[]).some(s=>s.properties.title===TAB))return res.status(409).json({error:'Crie a aba "Lançamentos do aplicativo" no Google Sheets com os cabeçalhos indicados antes de gravar. Nenhum dado foi alterado.'});
const header=await google(base+'/values/'+encodeURIComponent("'"+TAB+"'!A1:G1"),token);if(JSON.stringify(header.values?.[0])!==JSON.stringify(HEAD))return res.status(409).json({error:'Cabeçalhos da aba de lançamentos divergentes. Nenhum dado foi gravado.'});
const id=crypto.randomUUID(),at=new Date().toISOString(),row=[id,at,type,reference,owner,status,note];const url=base+'/values/'+encodeURIComponent("'"+TAB+"'!A:G")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
await google(url,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[row]})});return res.status(201).json({id,at,success:true});
}catch(e){if(e.cleanupRequired)return res.status(503).json({error:'Teste interrompido: remova somente a aba temporária '+e.cleanupRequired+'. Dados oficiais não foram alterados.',cleanupRequired:e.cleanupRequired});console.error('Audit append error',e.message);return res.status(e.status===403?403:503).json({error:e.status===403?'A conta de serviço precisa de permissão de Editor para salvar lançamentos.':'Não foi possível salvar ou consultar os lançamentos. Nenhum registro existente foi apagado.'})}};