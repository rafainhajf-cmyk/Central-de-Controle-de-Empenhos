const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function load(){const ctx={};vm.createContext(ctx);if(fs.existsSync('sync-state.js'))vm.runInContext(fs.readFileSync('sync-state.js','utf8'),ctx);return ctx.SyncState||{};}
test('failed second page never replaces last complete data',async()=>{const s=load();const old={headers:['ID'],rows:[['old']]};const stores={NC:old};await assert.rejects(async()=>{stores.NC=await s.readAll(async page=>{if(page===1)throw Error('offline');return {headers:['ID'],rows:[['new']],hasMore:true}},3)},/offline/);assert.equal(stores.NC,old)});
test('refuses silently truncated pagination',async()=>{const s=load();await assert.rejects(()=>s.readAll(async()=>({headers:['ID'],rows:[['x']],hasMore:true}),2),/incompleta/)});
test('collects all pages with stable column headers',async()=>{const s=load();const d=await s.readAll(async page=>({headers:['ID'],rows:[[String(page)]],hasMore:page===0}),3);assert.equal(JSON.stringify(d.rows),'[["0"],["1"]]')});
test('rejects changing schema and malformed rows',async()=>{const s=load();await assert.rejects(()=>s.readAll(async page=>({headers:page?['Other']:['ID'],rows:[['x']],hasMore:!page}),3),/colunas/);await assert.rejects(()=>s.readAll(async()=>({headers:['ID'],rows:'invalid',hasMore:false}),3),/inválida/)});
