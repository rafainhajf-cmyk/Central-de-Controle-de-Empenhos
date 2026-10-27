const {test}=require('node:test');const assert=require('node:assert/strict');const {distributionPending}=require('../lib/pending-sources');
test('preserva vínculo com distribuição e não inventa prazo ou responsável',()=>{const [r]=distributionPending({rows:[{row:7,nc:'2026NC000001',sector:'ALMOX',days:null}]});assert.equal(r.sourceRow,7);assert.equal(r.responsible,'');assert.equal(r.daysPending,null);assert.equal(r.sector,'ALMOX')});
test('recusa fonte sem referência',()=>assert.deepEqual(distributionPending({rows:[{row:0}]}),[]));
