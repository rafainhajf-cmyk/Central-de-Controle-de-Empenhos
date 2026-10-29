'use strict';
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict');
const {fixture}=require('./fixtures/management'),cache=require('../lib/management-cache');
const actor={userId:'admin',name:'Gestor de teste',role:'admin',active:true,sectors:[]};
(async()=>{
 const db=new PGlite();await require('../lib/day-db').prepare(db);await cache.commitSnapshot(db,fixture(),{actorId:actor.userId,runId:'browser-fixture'});
 const browser=await chromium.launch({channel:'chrome',headless:true});let writes=0,lost=false;const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(4000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://central.test/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname.startsWith('/api/')){
    const handler=url.pathname==='/api/gerencial'?require('../api/gerencial'):url.pathname==='/api/financeiro'?require('../api/financeiro'):null;
    if(!handler)return route.abort();
    let status=200;const response={setHeader(){},status(s){status=s;return this;},json(body){this.body=body;return this;}};
    if(request.method()==='POST')writes++;
    await handler.createHandler({getDB:()=>db,getIdentity:async()=>actor})({method:request.method(),query:Object.fromEntries(url.searchParams),headers:{...request.headers(),host:'central.test',origin:'https://central.test'},body:request.postData()?request.postDataJSON():undefined},response);
    if(lost&&request.method()==='POST'){lost=false;return route.abort('connectionfailed');}
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(response.body)});
   }
   const file=url.pathname==='/gerencial'?'gerencial.html':url.pathname.slice(1);if(!/^[a-z0-9-]+\.(html|css|js)$/.test(file)||!fs.existsSync(file))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
  });
  await page.goto('https://central.test/gerencial');await page.getByRole('button',{name:'Empenhos e Liquidação',exact:true}).click();
  await page.getByText('Movimentos e reservas',{exact:true}).click();
  await page.getByText('Conferir fonte e conciliar',{exact:true}).click();
  await page.getByLabel('Justificativa da conciliação',{exact:true}).fill('Fonte conferida para teste isolado');
  await page.getByLabel('Conferi a fonte e os movimentos incorporados',{exact:true}).check();
  await page.getByRole('button',{name:'Confirmar conciliação',exact:true}).click();
  await page.getByText('Saldo operacional informado',{exact:true}).waitFor();
  let form=page.locator('form[data-financial-action="liquidation"]');await page.getByText('Registrar liquidação informada',{exact:true}).click();
  await form.getByLabel('Valor (R$)',{exact:true}).fill('25,00');await form.getByLabel('Data',{exact:true}).fill('2026-10-28');await form.getByLabel('Documento',{exact:true}).fill('NL-TESTE-1');await form.getByLabel('Justificativa',{exact:true}).fill('Liquidação em teste isolado');
  lost=true;await form.getByRole('button',{name:'Confirmar registro',exact:true}).click();await page.getByRole('button',{name:'Consultar confirmação',exact:true}).waitFor();
  assert.equal(writes,2);await page.getByRole('button',{name:'Consultar confirmação',exact:true}).click();
  await page.getByText('NL-TESTE-1',{exact:true}).waitFor();assert.equal(writes,2);
  const v=await require('../lib/financial-store').readFinancialBook(db,actor,'ne|160111|2026|2026NE000001');assert.equal(v.position.availableCents,77500);assert.equal(v.book.movements.length,1);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Excel',exact:true}).click();const file=await (await download).path();assert.match(fs.readFileSync(file,'utf8'),/<v>775<\/v>/,'Export must reflect the confirmed operational balance, including after lost response');
  await page.reload();await page.getByRole('button',{name:'Empenhos e Liquidação',exact:true}).click();await page.getByText('Movimentos e reservas',{exact:true}).click();await page.getByText('NL-TESTE-1',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Preparar estorno',exact:true}).click();form=page.locator('form[data-financial-action="reversal"]');await form.getByLabel('Data',{exact:true}).fill('2026-10-28');await form.getByLabel('Documento',{exact:true}).fill('EST-TESTE-1');await form.getByLabel('Justificativa',{exact:true}).fill('Correção do teste');await form.getByRole('button',{name:'Confirmar registro',exact:true}).click();
  await page.getByText('EST-TESTE-1',{exact:true}).waitFor();assert.equal((await require('../lib/financial-store').readFinancialBook(db,actor,'ne|160111|2026|2026NE000001')).position.availableCents,80000);
  await page.getByText('Criar reserva interna',{exact:true}).click();form=page.locator('form[data-financial-action="reserve"]');await form.getByLabel('Valor (R$)',{exact:true}).fill('30,00');await form.getByLabel('Finalidade',{exact:true}).fill('Material de teste');await form.getByLabel('Data',{exact:true}).fill('2026-10-28');await form.getByLabel('Documento',{exact:true}).fill('RES-TESTE-1');await form.getByLabel('Justificativa',{exact:true}).fill('Reserva de teste');await form.getByRole('button',{name:'Confirmar registro',exact:true}).click();await page.getByText('RES-TESTE-1 · Material de teste',{exact:true}).waitFor();
  assert.equal((await require('../lib/financial-store').readFinancialBook(db,actor,'ne|160111|2026|2026NE000001')).position.freeInternalCents,77000);
  await page.getByText('Cancelar reserva',{exact:true}).click();form=page.getByRole('button',{name:'Confirmar encerramento',exact:true}).first().locator('..');await form.getByLabel('Motivo do encerramento',{exact:true}).fill('Cancelamento do teste');await form.getByRole('button',{name:'Confirmar encerramento',exact:true}).click();await page.getByText(/Cancelada · Gestor de teste/).waitFor();
  assert.equal((await require('../lib/financial-store').readFinancialBook(db,actor,'ne|160111|2026|2026NE000001')).position.freeInternalCents,80000);
  assert.equal(await page.evaluate(()=>localStorage.length),0);await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByText('Cópia opcional e recuperação de comando financeiro',{exact:true}).click();await page.getByLabel('Guardar comando pendente criptografado neste navegador',{exact:true}).check();await page.getByLabel('Senha exclusiva da cópia',{exact:true}).fill('senha-exclusiva-de-teste');
  await page.getByText('Criar reserva interna',{exact:true}).click();form=page.locator('form[data-financial-action="reserve"]');await form.getByLabel('Valor (R$)',{exact:true}).fill('10,00');await form.getByLabel('Finalidade',{exact:true}).fill('Reserva recuperada');await form.getByLabel('Data',{exact:true}).fill('2026-10-28');await form.getByLabel('Documento',{exact:true}).fill('RES-RECUPERADA');await form.getByLabel('Justificativa',{exact:true}).fill('Texto privado de teste');
  lost=true;await form.getByRole('button',{name:'Confirmar registro',exact:true}).click();await page.getByRole('button',{name:'Consultar confirmação',exact:true}).waitFor();
  const ciphertext=await page.evaluate(()=>localStorage.getItem('central-financial-pending-v1'));assert.ok(ciphertext);assert.doesNotMatch(ciphertext,/Texto privado|2026NE000001|RES-RECUPERADA/);const savedWrites=writes;
  await page.reload();await page.getByText('Cópia opcional e recuperação de comando financeiro',{exact:true}).click();await page.getByLabel('Senha exclusiva da cópia',{exact:true}).fill('senha-errada');await page.getByRole('button',{name:'Recuperar comando salvo',exact:true}).click();await page.getByText(/Não foi possível recuperar/).waitFor();assert.equal(writes,savedWrites);
  await page.getByLabel('Senha exclusiva da cópia',{exact:true}).fill('senha-exclusiva-de-teste');await page.getByRole('button',{name:'Recuperar comando salvo',exact:true}).click();await page.getByRole('button',{name:'Consultar confirmação',exact:true}).click();await page.getByText(/Operação confirmada no servidor/).waitFor();assert.equal(writes,savedWrites);assert.equal(await page.evaluate(()=>localStorage.length),0);
  await page.getByRole('button',{name:'Empenhos e Liquidação',exact:true}).click();await page.getByText('Movimentos e reservas',{exact:true}).click();await page.getByText('RES-RECUPERADA · Reserva recuperada',{exact:true}).waitFor();
  fs.mkdirSync('docs/verification',{recursive:true});await page.screenshot({path:'docs/verification/financial-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'docs/verification/financial-desktop.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('PASS financial browser: real API + PGlite, reconciliation, lost response, UUID confirmation, persistence after reload, reversal, mobile, no plaintext cache');
 }finally{await browser.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
