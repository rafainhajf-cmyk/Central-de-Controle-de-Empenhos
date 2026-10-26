const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const handler = require('../api/lancamentos');
const HEAD = ['ID','Data/hora UTC','Tipo','Referência','Responsável','Situação','Observação'];
const {privateKey} = crypto.generateKeyPairSync('rsa',{modulusLength:2048});
process.env.APP_ACCESS_TOKEN='test-only-access-token-000000000';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL='test@example.invalid';
process.env.GOOGLE_PRIVATE_KEY=privateKey.export({type:'pkcs8',format:'pem'});
async function invoke(body, options={}) {
 const calls=[];const original=global.fetch;
 global.fetch=async(url,opts={})=>{
  calls.push({url,opts});
  const data=url.includes('oauth2')?{access_token:'fake'}:url.includes('?fields=')?{sheets:[{properties:{title:'Lançamentos do aplicativo',gridProperties:{rowCount:201}}}]}:url.includes(':append')?{updates:{updatedRows:1}}:{values:[options.headers||HEAD]};
  return {ok:true,json:async()=>data};
 };
 const res={setHeader(){},status(n){this.code=n;return this},json(data){this.data=data;return this}};
 try {await handler({method:options.method||'POST',headers:{authorization:'Bearer '+process.env.APP_ACCESS_TOKEN},body,query:{}},res);return {res,calls}}finally{global.fetch=original}
}
const payload={type:'NE',reference:'TEST',owner:'Teste',note:'=not-a-formula'};
test('refuses append when official journal headers do not match',async()=>{
 const {res,calls}=await invoke(payload,{headers:['Wrong']});
 assert.equal(res.code,409);assert.equal(calls.filter(c=>c.url.includes(':append')).length,0);
});
test('appends RAW data without update or clear operations',async()=>{
 const {res,calls}=await invoke(payload);assert.equal(res.code,201);
 const writes=calls.filter(c=>c.opts.method==='POST'&&!c.url.includes('oauth2'));
 assert.equal(writes.length,1);assert.match(writes[0].url,/:append\?valueInputOption=RAW&insertDataOption=INSERT_ROWS/);
 assert.equal(JSON.parse(writes[0].opts.body).values[0].length,7);
});
test('invalid JSON is a client error and never obtains Google credentials',async()=>{
 const {res,calls}=await invoke('{bad');assert.equal(res.code,400);assert.equal(calls.length,0);
});
test('reads beyond the old thousand-row limit using pagination',async()=>{
 const {res,calls}=await invoke(null,{method:'GET'});assert.equal(res.code,200);
 assert.equal(res.data.page,0);assert.equal(res.data.hasMore,false);assert.match(decodeURIComponent(calls.at(-1).url),/A2:G201/);
});
test('isolated write probe never appends to official journal and always cleans up',async()=>{
 const calls=[];const original=global.fetch;let rows=[];
 global.fetch=async(url,opts={})=>{calls.push({url,opts});let data={};
 if(url.includes('oauth2'))data={access_token:'fake'};
 else if(url.endsWith(':batchUpdate')){const request=JSON.parse(opts.body).requests[0];if(request.addSheet)data={replies:[{addSheet:{properties:{sheetId:900123,title:request.addSheet.properties.title}}}]};}
 else if(url.includes(':append'))rows.push(...JSON.parse(opts.body).values);
 else data={values:rows};
 return {ok:true,json:async()=>data};};
 const res={setHeader(){},status(n){this.code=n;return this},json(data){this.data=data;return this}};
 try{await handler({method:'POST',headers:{authorization:'Bearer '+process.env.APP_ACCESS_TOKEN},body:{action:'test-write'},query:{}},res);assert.equal(res.code,200);assert.equal(res.data.verified,true);const appends=calls.filter(c=>c.url.includes(':append'));assert.equal(appends.length,2);assert.ok(appends.every(c=>!decodeURIComponent(c.url).includes('Lançamentos do aplicativo')));const last=JSON.parse(calls.at(-1).opts.body).requests[0];assert.equal(last.deleteSheet.sheetId,900123)}finally{global.fetch=original}
});
test('denies unauthenticated requests without any Google call',async()=>{const original=global.fetch;global.fetch=async()=>{throw Error('must not call')};const res={setHeader(){},status(n){this.code=n;return this},json(d){this.data=d;return this}};try{await handler({method:'POST',headers:{},body:payload},res);assert.equal(res.code,401)}finally{global.fetch=original}});
test('rejects oversize notes instead of silently losing characters',async()=>{const{res,calls}=await invoke({...payload,note:'x'.repeat(1201)});assert.equal(res.code,400);assert.equal(calls.filter(c=>c.url.includes(':append')).length,0)});
test('preserves literal observation text with RAW input',async()=>{const{res,calls}=await invoke({...payload,note:'= Texto literal\nObservação completa'});assert.equal(res.code,201);const call=calls.find(c=>c.url.includes(':append'));assert.equal(JSON.parse(call.opts.body).values[0][6],'= Texto literal\nObservação completa')});
test('expired temporary access cannot reach Google',async()=>{process.env.APP_ACCESS_EXPIRES_AT='1';try{const{res,calls}=await invoke(payload);assert.equal(res.code,401);assert.equal(calls.length,0)}finally{delete process.env.APP_ACCESS_EXPIRES_AT}});
