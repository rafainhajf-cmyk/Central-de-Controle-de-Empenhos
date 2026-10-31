'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./fixtures/management');
const {HEADERS,projectManagement}=require('../lib/budget/source-adapter');
const actor={active:true,userId:'test-admin',role:'admin',sectors:[]};
const cell=x=>({userEnteredValue:typeof x==='number'?{numberValue:x}:{stringValue:String(x??'')},effectiveValue:typeof x==='number'?{numberValue:x}:{stringValue:String(x??'')}});
function stateWithDistribution(ug){
 const state=fixture(),nc=Array(HEADERS['NCs e prazos'].length).fill('');
 nc[0]='2026NC000001';nc[2]='339030';nc[3]='Material de teste';nc[4]=1000;nc[5]=0;nc[6]=1000;nc[10]='160111';nc[11]='nc|160111|2026|2026NC000001';
 state.tables['NCs e prazos'].push(nc.map(cell));
 const dist=Array(HEADERS['Distribuições detalhadas'].length).fill('');
 dist[0]='2026-10-01';dist[1]='2026NC000001';dist[2]='ALMOX';dist[3]='Responsável teste';dist[4]=300;dist[5]='Material';dist[6]='Aguardando';dist[10]=ug;
 state.tables['Distribuições detalhadas'].push(dist.map(cell));
 return state;
}
test('NC distribution accounting requires matching UG, without changing SIAFI balance',()=>{
 const s=stateWithDistribution('160111');
 const result=projectManagement(s,actor,'2026-10-31');
 const nc=result.credits.received[0];
 assert.equal(nc.distributedPendingCents,30000);
 assert.equal(nc.availableCents,100000);
 assert.equal(result.distributions[0].ug,'160111');
});
test('NC distribution with missing UG is marked uncertain, never presented as a proven amount',()=>{
 const s=stateWithDistribution('');
 const result=projectManagement(s,actor,'2026-10-31');
 const nc=result.credits.received[0];
 assert.equal(nc.distributedPendingCents,null);
 assert.match(nc.distributionReconciliation,/pendente de conferência/);
});
