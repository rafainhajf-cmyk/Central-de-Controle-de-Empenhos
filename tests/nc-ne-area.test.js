'use strict';
// Área "1. NC e NE": nome em todos os pontos de entrada e aba de NEs segurando crédito (dados fictícios).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=f=>fs.readFileSync(require('node:path').join(__dirname,'..',f),'utf8');
const ui=read('gerencial-ui.js');
function helper(name){const m=new RegExp('function '+name+'\\([^)]*\\)\\{[^\\n]*\\}').exec(ui);assert.ok(m,'função '+name+' não encontrada');return m[0];}
const holdingNEs=new Function('state',helper('holdingNEs')+';return holdingNEs();'),ncOfNE=new Function('r',helper('ncOfNE')+';return ncOfNE(r);');

test('the credits area is named "1. NC e NE" in the menu, the Central de Fontes navigation and the priority-queue link',()=>{
 assert.match(ui,/\['credits','1\. NC e NE'\]/);assert.doesNotMatch(ui,/\['credits','Créditos e NCs'\]/);
 assert.match(read('central.html'),/<a href="\/gerencial\?area=credits">1\. NC e NE<\/a>/);
 assert.doesNotMatch(read('central.html'),/>Créditos e NCs</);
 assert.match(read('priority-queue-ui.js'),/Abrir NC e NE para distribuir/);assert.doesNotMatch(read('priority-queue-ui.js'),/Abrir Créditos e NCs/);
});
test('the credits area offers the "NEs segurando crédito" tab next to Disponíveis and Recebidos',()=>{assert.match(ui,/\['available','Disponíveis'\],\['received','Recebidos'\],\['holding','NEs segurando crédito'\]/);});
test('only open NEs marked as holding credit are listed; liquidated and unmarked NEs are left out',()=>{
 const state={commitments:[{number:'2026NE000001',holdingCredit:true,remainingCents:5000},{number:'2026NE000002',holdingCredit:true,remainingCents:0},{number:'2026NE000003',holdingCredit:false,remainingCents:9000},{number:'2026NE000004',holdingCredit:true,remainingCents:null}]};
 assert.deepEqual(holdingNEs(state).map(r=>r.number),['2026NE000001','2026NE000004']);
});
test('origin NC is shown only when the NE subject names exactly one NC; otherwise it is flagged for review',()=>{
 assert.equal(ncOfNE({subject:'Material - crédito 2026nc000123'}),'2026NC000123');
 assert.equal(ncOfNE({subject:'2026NC000123 e 2026NC000124'}),'NC a conferir');
 assert.equal(ncOfNE({subject:'Sem referência'}),'NC a conferir');assert.equal(ncOfNE({}),'NC a conferir');
});
