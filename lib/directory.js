'use strict';
const crypto=require('node:crypto');
const CONFIG='Configuração';
const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
const key=v=>clean(v).toLocaleLowerCase('pt-BR');
function fail(message,status=400){const e=Error(message);e.status=status;throw e;}
function directory(datasets){
 const saved=datasets[CONFIG]?.directory;if(saved)return structuredClone(saved);
 const names=new Map();for(const [tab,c]of [['Distribuições detalhadas',2],['Setores recalculados',1],['Pendências',3]])for(const row of datasets[tab]?.rows||[]){const name=clean(row[c]);if(name&&name.length<=100&&!names.has(key(name)))names.set(key(name),name);}
 return {sectors:[...names.values()].map(name=>({id:'legacy-'+crypto.createHash('sha256').update(key(name)).digest('hex').slice(0,24),name,active:true})),responsibles:[]};
}
function saveDirectory(input,current){
 if(input.revision!==current.revision)fail('Os cadastros mudaram. Atualize antes de salvar.',409);
 const allowed=new Set(['id','action','revision','kind','recordId','name','sectorId','active','actor']);for(const name of Object.keys(input))if(!allowed.has(name))fail('Campo inválido no cadastro.');
 if(!['sector','responsible'].includes(input.kind))fail('Tipo de cadastro inválido.');
 if(typeof input.name!=='string'||!clean(input.name)||input.name.length>100)fail('Informe o nome com até 100 caracteres.');
 if(input.active!==undefined&&typeof input.active!=='boolean')fail('Situação inválida.');
 if(input.actor!==undefined&&(typeof input.actor!=='string'||input.actor.length>100))fail('Responsável pelo registro inválido.');
 const dir=directory(current.datasets),list=input.kind==='sector'?dir.sectors:dir.responsibles;
 const before=input.recordId?list.find(r=>r.id===input.recordId):null;if(input.recordId&&!before)fail('Cadastro não localizado.',409);
 if(list.some(r=>r.id!==before?.id&&key(r.name)===key(input.name)))fail('Esse nome já está cadastrado. Edite o cadastro existente.');
 const record={id:before?.id||crypto.randomUUID(),name:clean(input.name),active:input.active!==false};
 if(input.kind==='responsible'){
  if(input.sectorId!==null&&input.sectorId!==undefined&&typeof input.sectorId!=='string')fail('Setor inválido.');
  const sectorId=input.sectorId||null;if(sectorId&&!dir.sectors.some(s=>s.id===sectorId&&s.active))fail('Escolha um setor ativo ou a opção responsável isolado.');record.sectorId=sectorId;
 }else if(!record.active&&dir.responsibles.some(p=>p.active&&p.sectorId===record.id))fail('Realoque ou desvincule os responsáveis ativos antes de desativar o setor.');
 if(before)list[list.findIndex(r=>r.id===before.id)]=record;else list.push(record);
 const datasets=structuredClone(current.datasets);if(!datasets[CONFIG])fail('Configuração indisponível.',503);datasets[CONFIG].directory=dir;
 return {datasets,before:{tab:CONFIG,row:null,values:[],directoryRecord:before},after:{tab:CONFIG,row:null,values:[],directoryRecord:record},actor:clean(input.actor)||'Operador do painel',reason:(before?'Atualização':'Cadastro')+' de '+(input.kind==='sector'?'setor':'responsável')+' — '+record.name};
}
function resolveResponsible(datasets,id,sectorName){
 if(!id)return null;const dir=directory(datasets),person=dir.responsibles.find(p=>p.id===id&&p.active);if(!person)fail('Escolha um responsável ativo.');
 if(person.sectorId){const sector=dir.sectors.find(s=>s.id===person.sectorId&&s.active);if(!sector||key(sector.name)!==key(sectorName))fail('O responsável escolhido pertence a outro setor.');}
 return person;
}
module.exports={directory,saveDirectory,resolveResponsible,CONFIG};
