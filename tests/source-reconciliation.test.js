'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compare}=require('../lib/budget/source-reconciliation');
test('NE financial reconciliation matches by UG and NE and does not mistake Almox stage for liquidation',()=>{
 const official=[['', '2026NE000249','160111','','','','','','','','2502.60',0,0,21.16]];
 const central=[['2026NE000249','','','','2502.60',0,0,21.16,'','','','','','8. Liquidado','','160111']];
 assert.deepEqual(compare({official,central,kind:'ne'}).differences,[]);
 central[0][7]=0;
 assert.equal(compare({official,central,kind:'ne'}).differences[0].code,'AMOUNT_MISMATCH');
});
test('unverified identities and numeric fields never silently become zero',()=>{
 const official=[['','2026NE000001','','','','','','','','','10',0,0,10],['','2026NE000002','160111','','','','','','','','#NAME?',0,0,10]];
 const central=[['2026NE000002','','','',10,0,0,10,'','','','','','','','160111']];
 const result=compare({official,central,kind:'ne'});
 assert.ok(result.issues.some(x=>x.code==='UG_MISSING'));
 assert.ok(result.differences.some(x=>x.code==='UNVERIFIED_AMOUNT'));
});
test('NC reconciliation checks received committed and available by NC and UG',()=>{
 const official=[['','2026NC400013','','160111','','','','',3700,3700,0]];
 const central=[['2026NC400013','','','',3700,3700,0,'','','','160111']];
 assert.equal(compare({official,central,kind:'nc'}).differences.length,0);
});
