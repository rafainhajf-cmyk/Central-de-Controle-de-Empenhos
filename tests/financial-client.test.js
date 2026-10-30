'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../financial-client');
const command={operationId:'c4e76132-9700-4d93-bd0b-ed1512702671',key:'ne|160111|2026|2026NE000001',action:'reconcile',expectedVersion:0,sourceVersion:'a'.repeat(64),includedMovementIds:[],note:'Conferência'};
test('a lost response keeps the original command and confirmation clears it without another write',async()=>{
 let writes=0;const saved=[],client=create({persist:async p=>saved.push(p),transport:async(method)=>{if(method==='POST'){writes++;throw Error('Conexão perdida');}return{state:'confirmed',operationId:command.operationId};}});
 await assert.rejects(()=>client.submit(command));assert.equal(client.pending().command.operationId,command.operationId);assert.equal(saved[0].command.note,'Conferência');
 await client.confirm();assert.equal(writes,1);assert.equal(client.pending(),null);assert.equal(saved.at(-1),null);
});
test('persistence failure prevents POST; duplicate clicks and unrelated commands cannot replace an uncertain command',async()=>{
 let writes=0;const broken=create({persist:async()=>{throw Error('Sem armazenamento');},transport:async()=>{writes++;}});
 await assert.rejects(()=>broken.submit(command));assert.equal(writes,0);
 const client=create({transport:async()=>{writes++;throw Error('Resposta perdida');}});await assert.rejects(()=>client.submit(command));
 await assert.rejects(()=>client.submit({...command,operationId:'bece81b6-fb53-48e2-b9ba-03f033bd0198'}));assert.equal(writes,1);
});
test('manual retry requires a fresh not-found query and five minutes and reuses the same UUID',async()=>{
 let clock=1000,writes=0;const sent=[],client=create({now:()=>clock,transport:async(method,body)=>{if(method==='POST'){writes++;sent.push(body);throw Error('Perdida');}return{state:'not-found-yet'};}});
 await assert.rejects(()=>client.submit(command));clock+=301000;await assert.rejects(()=>client.retry());assert.equal(writes,1);
 await client.confirm();await assert.rejects(()=>client.retry(),/Perdida/);assert.equal(writes,2);assert.deepEqual(sent[0],sent[1]);
 await assert.rejects(()=>client.retry());assert.equal(writes,2);
});
test('restore never writes automatically; a cache error after server confirmation cannot erase confirmation',async()=>{
 let writes=0;const client=create({transport:async()=>{writes++;return {state:'confirmed',operationId:command.operationId};},persist:async p=>{if(p===null)throw Error('Quota');}});
 client.restore({app:'central-financial-v1',command,submittedAt:0});assert.equal(writes,0);assert.ok(client.pending());
 const confirmed=await client.confirm();assert.equal(confirmed.state,'confirmed');assert.equal(client.pending(),null);assert.match(client.warning(),/cópia/i);
});
