'use strict';const test=require('node:test'),assert=require('node:assert/strict');const {build,table}=require('../pending-report');
test('agrupa pendências por setor e pessoa com prioridade de crédito a outras NEs',()=>{const source={credits:{available:[{number:'2026NC000001',availableCents:10000}]},commitments:[{number:'2026NE000001',sector:'ALMOX',owner:'Sgt A',remainingCents:3000,holdingCredit:true},{number:'2026NE000002',sector:'Fiscalização',owner:'Sgt B',remainingCents:2500,flow:'fiscal'}],processes:[{subject:'Licitação',sector:'ALMOX',owner:'Sgt A',estimatedCents:5000}]};const rows=build(source);assert.equal(rows.length,4);assert.equal(rows.find(x=>x.reference==='2026NE000001').priority,2);assert.equal(rows.find(x=>x.reference==='2026NE000002').priority,4);assert.equal(table(rows)[0].length,7);});
test('unknown sector flow remains explicitly unclassified and missing process reference cannot crash sorting',()=>{
 const rows=build({credits:{available:[]},commitments:[{number:'2026NE000003',remainingCents:1000,flow:null,sector:'ALMOX',owner:'Sgt A'}],processes:[{subject:'Processo sem PRO',sector:'ALMOX',owner:'Sgt A',reportedState:'Em andamento',estimatedCents:2000},{subject:'Sem referência',sector:'ALMOX',owner:'Sgt A',reportedState:'Aberto',estimatedCents:1000}]});
 assert.equal(rows.length,3);
 assert.equal(rows.find(r=>r.reference==='2026NE000003').type,'Empenho — classificação a conferir');
 assert.equal(rows.filter(r=>r.type==='Licitação em andamento').length,2);
});
