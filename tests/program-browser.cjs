'use strict';
const { chromium } = require('playwright'), fs = require('node:fs'), assert = require('node:assert/strict');
const { validateCommand } = require('../lib/program-store');
const {calculate}=require('../lib/calculation-engine');
const rules={formulas:{'NEs e liquidação':{B2:{formula:"='Almox • Situação e prazo'!B2"}}},inputs:{}};
(async () => {
 const browser = await chromium.launch({headless:true,...(process.env.PROGRAM_CHROMIUM ? {executablePath:process.env.PROGRAM_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--disable-gpu']} : {})});
 try {
  const page = await browser.newPage({viewport:{width:1200,height:900}}), errors = [], calls = [];
  page.on('pageerror', e => errors.push(e.message));
  let state = {revision:1,datasets:Object.fromEntries(require('../sheet-catalog').map(s => [s.title,{headers:['Referência','Observação'],rows:[['TEST01','Conferido'],['TEST02','Preservar']],origin:'Importação'}]))}, authenticated = false, keyPrompts = 0;
  page.on('dialog', d => {keyPrompts++; return d.accept('test-only-secret-key-very-long');});
  await page.route('https://central.test/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname; calls.push(path);
   if (path === '/api/sessao') { authenticated = true; return route.fulfill({json:{authenticated:true}}); }
   if (path === '/api/programa') {
    if (!authenticated) return route.fulfill({status:401,json:{error:'Não autorizado'}});
    if (req.method() === 'POST') { const body = req.postDataJSON(); const change = validateCommand(body,state); state = {...state,datasets:change.datasets,revision:state.revision+1}; return route.fulfill({json:{revision:state.revision}}); }
    const result=calculate(state.datasets,rules);return route.fulfill({json:{...state,datasets:result.datasets,calculation:{formulas:result.count,errors:result.errors,cells:result.cells},importedAt:new Date().toISOString()}});
   }
   const file = path === '/' ? 'index.html' : path.slice(1);
   if (!fs.existsSync(file)) return route.abort();
   return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
  });
  await page.goto('https://central.test/'); await page.locator('#sync').click(); await page.waitForFunction(() => document.getElementById('notice').textContent.includes('Revisão 1'));
  await page.locator('.nav[data-id="almox"]').click();
  await page.getByRole('button',{name:'Editar',exact:true}).first().click();
  await page.locator('dialog textarea[name="field-1"]').fill('Corrigido manualmente');
  await page.locator('dialog input[name="actor"]').fill('Rafael');
  await page.locator('dialog textarea[name="reason"]').fill('Conferência do lançamento');
  await page.getByRole('button',{name:'Salvar no programa',exact:true}).click();
  await page.waitForFunction(() => !document.querySelector('dialog').open);
  await page.reload(); await page.waitForFunction(() => document.getElementById('notice').textContent.includes('Revisão 2'));
  await page.locator('.nav[data-id="almox"]').click();
  assert.match(await page.locator('#table').innerText(),/Corrigido manualmente/);
  assert.match(await page.locator('#table').innerText(),/Preservar/);
  await page.locator('.nav[data-id="empenhos"]').click();
  assert.match(await page.locator('#table').innerText(),/Corrigido manualmente/);
  await page.getByRole('button',{name:'Editar',exact:true}).first().click();
  assert.equal(await page.locator('dialog textarea[name="field-1"]').getAttribute('readonly'),'');
  await page.locator('#programCancel').click();
  assert.equal(keyPrompts,1); assert.equal(calls.includes('/api/central'),false); assert.equal(calls.includes('/api/operacoes'),false);
  assert.deepEqual(errors,[]);
  await page.setViewportSize({width:800,height:1100}); await page.screenshot({path:'/tmp/program-browser.png',fullPage:true});
  console.log('PASS: one login, 31 tables, edit saved, page reload preserves edit, unrelated row preserved, dependent indicator recalculated, calculated field protected, no Sheets calls, no browser errors.');
 } finally {await browser.close();}
})().catch(e => {console.error(e);process.exitCode=1;});
