'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const {credits,sectors,distribute,requestCreditAction,NC,DIST}=require('../lib/credit-distribution');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PROGRAM_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});try{
 const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let posts=0,state={revision:1,datasets:Object.fromEntries(require('../sheet-catalog').map(s=>[s.title,{headers:['Campo'],rows:[]}]))};
 state.datasets[NC]={headers:['NC','Data','ND','Finalidade','Recebido','Empenhado','Disponível','Prazo','Dias','Observação'],rows:[['2026NC000001','','339030','Material','1.000,00','0,00','1.000,00']]};
 state.datasets[DIST]={headers:['Data','NC','Setor','Responsável','Valor','Finalidade','Situação','Disponível','Empenhado','Observação'],rows:[]};
 state.datasets['Setores recalculados'].rows=[['','Rancho']];
 await page.route('https://central.test/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/programa'){
   if(req.method()==='POST'){posts++;const body=req.postDataJSON();const change=body.action==='credit-request'?requestCreditAction(body,state):distribute(body,state);state={revision:state.revision+1,datasets:change.datasets};return route.fulfill({json:{revision:state.revision}});}
   return route.fulfill({json:{...state,credits:credits(state.datasets),sectors:sectors(state.datasets),calculation:{cells:{},formulas:0,errors:[]},importedAt:new Date().toISOString()}});
  }
  const file=path==='/'?'index.html':path.slice(1);if(!fs.existsSync(file))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
 });
 await page.goto('https://central.test/');await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Revisão 1'));
 await page.locator('.nav[data-id="creditos"]').click();
 assert.match(await page.locator('#table').innerText(),/Distribuído por nós/);
 await page.getByRole('button',{name:'Distribuir',exact:true}).click();
 assert.equal(await page.locator('dialog select[name="ncRow"]').inputValue(),'0');
 await page.locator('dialog input[name="sector"]').fill('Rancho');
 await page.locator('dialog input[name="amount"]').fill('1.000,01');await page.getByRole('button',{name:'Confirmar distribuição'}).click();assert.equal(posts,0);assert.match(await page.locator('#creditResult').innerText(),/saldo livre/);
 await page.locator('dialog input[name="amount"]').fill('250,50');await page.getByRole('button',{name:'Confirmar distribuição'}).click();await page.waitForFunction(()=>!document.querySelector('dialog').open);assert.equal(posts,1);await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Revisão 2'));
 assert.match(await page.locator('#table').innerText(),/250,50/);assert.match(await page.locator('#table').innerText(),/749,50/);assert.match(await page.locator('#table').innerText(),/Rancho/);
 await page.reload();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Revisão 2'));await page.locator('.nav[data-id="creditos"]').click();assert.match(await page.locator('#table').innerText(),/250,50/);assert.match(await page.locator('#table').innerText(),/Pendência do fiscal/);
 await page.getByRole('button',{name:'Providência',exact:true}).click();
 await page.locator('dialog select[name="kind"]').selectOption('nd-change');
 await page.locator('dialog input[name="amount"]').fill('100,00');
 await page.locator('dialog input[name="diex"]').fill('456/2026');
 await page.locator('dialog input[name="targetNd"]').fill('339039');
 await page.locator('dialog input[name="note"]').fill('Aguardando mudança');
 await page.getByRole('button',{name:'Registrar solicitação'}).click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
 assert.equal(state.datasets[NC].rows[0][2],'339030');
 await page.reload();await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Revisão 3'));await page.locator('.nav[data-id="creditos"]').click();
 assert.match(await page.locator('#table').innerText(),/DIEx 456\/2026/);assert.match(await page.locator('#table').innerText(),/Aguardando mudança/);
 await page.locator('.nav[data-id="pendencias"]').click();assert.match(await page.locator('#data').innerText(),/Pendências do fiscal/);assert.match(await page.locator('#data').innerText(),/456\/2026/);assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/credit-distribution.png',fullPage:true});
 console.log('PASS: credit column, preselected NC, sector/value form, excess blocked, distribution persisted after reload, available balance updated, no browser errors.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
