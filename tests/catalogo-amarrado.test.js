'use strict';
// Escolhas amarradas (setor → responsáveis → fases), responsável obrigatório e tipos de processo vindos do painel.
// Dados fictícios e sem banco: usa um banco falso para o carregador do diretório e um DOM mínimo para a interface.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const dir=require('../lib/management-directory'),model=require('../lib/distribution-model');
class Element{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.value='';this.hidden=false;}append(...nodes){for(const n of nodes){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);n.parent=this;this.children.push(n);}}replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.append(...nodes);}setAttribute(k,v){this.attributes[k]=v;}removeAttribute(k){delete this.attributes[k];}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return (this.text||'')+this.children.map(n=>n.textContent).join(' ');}}
function ui(){const context={document:{createElement:tag=>new Element(tag)},Intl,Date,URLSearchParams,AbortSignal,crypto:require('node:crypto').webcrypto,sessionStorage:{getItem:()=>null},window:{addEventListener(){}},CentralFinancialClient:{create:()=>({pending:()=>null,submit:async()=>({state:'confirmed'})})}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../distribution-ui.js'),'utf8'),context);return context.CentralDistributionUI;}
const options=s=>s.children.map(o=>o.value).filter(Boolean);
const directory={sectors:['ALMOX','APRV','Fiscalização','Compras'],owners:['Ana','Bruno','Carlos','Sem setor'],ownerAssignments:[{name:'Ana',sector:'ALMOX'},{name:'Bruno',sector:'ALMOX'},{name:'Carlos',sector:'Compras'}],phases:['Fase geral'],phasesByFlow:{almox:['Almox 1','Almox 2'],aprv:['APRV 1'],fiscal:['Fiscal 1']}};
function selects(){const mk=values=>{const s=new Element('select');for(const v of ['',...values]){const o=new Element('option');o.value=v;s.append(o);}return s;};return {sector:mk(directory.sectors),owner:mk(directory.owners),phase:mk(directory.phases)};}

test('choosing a sector lists only its responsible people and the phases of its flow; sectors without links keep the full lists',()=>{
 const {sector,owner,phase}=selects();ui().linkChoices(sector,owner,phase,directory);
 sector.value='ALMOX';sector.onchange();assert.deepEqual(options(owner),['Ana','Bruno']);assert.deepEqual(options(phase),['Almox 1','Almox 2']);
 sector.value='APRV';sector.onchange();assert.deepEqual(options(owner),directory.owners);assert.deepEqual(options(phase),['APRV 1']);
 sector.value='Compras';sector.onchange();assert.deepEqual(options(owner),['Carlos']);assert.deepEqual(options(phase),['Fase geral']);
});
test('choosing a responsible person fills in the linked sector and keeps the person selected; a person without a sector leaves it as it is',()=>{
 const {sector,owner,phase}=selects();ui().linkChoices(sector,owner,phase,directory);
 owner.value='Carlos';owner.onchange();assert.equal(sector.value,'Compras');assert.equal(owner.value,'Carlos');assert.deepEqual(options(owner),['Carlos']);
 const second=selects();ui().linkChoices(second.sector,second.owner,second.phase,directory);second.owner.value='Sem setor';second.owner.onchange();assert.equal(second.sector.value,'');
 const third=selects();ui().linkChoices(third.sector,third.owner,third.phase,directory);third.sector.value='ALMOX';third.sector.onchange();third.owner.value='Ana';third.sector.value='Compras';third.sector.onchange();assert.equal(third.owner.value,'','responsável de outro setor não permanece selecionado');
});
test('a responsible person is mandatory when creating a distribution; the sector may be empty',()=>{
 const base={action:'distribution-create',key:'distribution|local:'+'a'.repeat(8)+'-aaaa-4aaa-8aaa-'+'a'.repeat(12),operationId:'a'.repeat(8)+'-aaaa-4aaa-8aaa-'+'a'.repeat(12),expectedVersion:0,sourceVersion:'a'.repeat(64),ncKey:'nc|160111|2026|2026NC000001',amountCents:100,processType:'Pregão',phase:'',note:'t'};
 assert.throws(()=>model.validate({...base,sector:'ALMOX',owner:''}),/responsável/);
 assert.throws(()=>model.validate({...base,sector:'',owner:''}),/responsável/);
 assert.equal(model.validate({...base,sector:'',owner:'Sem setor'}).owner,'Sem setor');assert.equal(model.validate({...base,sector:'ALMOX',owner:'Ana'}).sector,'ALMOX');
});
test('checkAssignment requires the responsible person and the sector linked to that person',()=>{
 assert.throws(()=>dir.checkAssignment(directory,{sector:'ALMOX',owner:''}),/Escolha o responsável/);
 assert.throws(()=>dir.checkAssignment(directory,{sector:'',owner:'Ana'}),/pertence ao setor ALMOX/);
 assert.doesNotThrow(()=>dir.checkAssignment(directory,{sector:'ALMOX',owner:'Ana'}));assert.doesNotThrow(()=>dir.checkAssignment(directory,{sector:'',owner:'Sem setor'}));
});
test('process types are the defaults plus those registered in the panel, without duplicates',async()=>{
 const db={query:async sql=>({rows:/central_day\.profiles/.test(sql)?[]:/central_day\.activities/.test(sql)?[]:/management_catalog/.test(sql)?[]:/central_day\.settings/.test(sql)?[{value:['Credenciamento','Pregão',' ',7]}]:[]})};
 const d=await dir.load(db,{state:{tables:{}},manualFields:{}},{role:'admin',active:true});
 for(const t of ['Pregão','Dispensa','Inexigibilidade','Adesão','Requisição','Contrata Mais Brasil','Contrato','Outro','Credenciamento'])assert.ok(d.processTypes.includes(t),t);
 assert.equal(d.processTypes.filter(t=>t==='Pregão').length,1);assert.equal(d.processTypes.length,9);
});
