'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const areaOrder=require('../lib/area-order');
const attach=require('../lib/credit-allocation').attach;

test('área de controle: ordem padrão inclui todas as áreas e aceita só chaves conhecidas',async()=>{
 const db={query:async()=>({rows:[{value:['contracts','nao-existe','panel'],version:3}]})};
 const r=await areaOrder.read(db);
 assert.equal(r.version,3);
 assert.equal(r.order[0],'contracts');
 assert.equal(new Set(r.order).size,areaOrder.KEYS.length);
 assert.ok(!r.order.includes('nao-existe'));
});

test('área de controle: quem não é gestor ou administrador não altera a ordem',async()=>{
 await assert.rejects(()=>areaOrder.save({},{active:true,role:'operator',userId:'u'},{order:areaOrder.KEYS,expectedVersion:0}),e=>e.status===403);
});

test('área de controle: ordem inválida é recusada antes de gravar',async()=>{
 const actor={active:true,role:'manager',userId:'u'};
 await assert.rejects(()=>areaOrder.save({},actor,{order:['panel','panel'],expectedVersion:0}),/Sequência inválida/);
 await assert.rejects(()=>areaOrder.save({},actor,{order:[...areaOrder.KEYS.slice(1),'inexistente'],expectedVersion:0}),/Sequência inválida/);
});

test('NE segurando crédito vira crédito distribuível e distribuição órfã é sinalizada',()=>{
 const ne={id:'ne|1',number:'2026NE000010',ug:'160111',year:2026,nd:'339030',subject:'Material',remainingCents:50000,holdingCredit:true};
 const credits={received:[{creditKey:'hold|ne|1',number:'2026NE000010',ug:'160111',receivedCents:50000,committedCents:0,availableCents:50000}],unresolved:[]};
 const dist=[{id:'d1',number:'2026NE000010',ug:'160111',creditKey:'hold|ne|1',sector:'ALMOX',progress:{valid:true,uncommittedCents:20000,commitments:[]}}];
 attach(credits,dist,[ne]);
 assert.equal(credits.received[0].distributedCents,20000);
 assert.equal(credits.received[0].freeToDistributeCents,30000);
 assert.equal(credits.received[0].canDistribute,true);
 assert.notEqual(dist[0].holdingMissing,true);

 const orphan={credits:{received:[],unresolved:[]},distributions:[{id:'d2',number:'2026NE000099',creditKey:'hold|ne|99',sector:'ALMOX',progress:{valid:true,uncommittedCents:1,commitments:[]}}]};
 attach(orphan.credits,orphan.distributions,[]);
 assert.equal(orphan.distributions[0].holdingMissing,true);
 assert.match(orphan.distributions[0].reportedState,/não encontrada na fonte/);
});
