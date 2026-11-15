'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));
test('every response carries the baseline security headers',()=>{
 const rule=config.headers.find(h=>h.source==='/(.*)');assert.ok(rule,'regra global de cabeçalhos');
 const get=k=>rule.headers.find(h=>h.key===k)?.value;
 assert.equal(get('X-Frame-Options'),'DENY');assert.equal(get('X-Content-Type-Options'),'nosniff');
 assert.equal(get('Referrer-Policy'),'strict-origin-when-cross-origin');assert.match(get('Strict-Transport-Security'),/max-age=\d{7,}/);
 assert.match(get('Permissions-Policy'),/camera=\(\)/);
 const csp=get('Content-Security-Policy');assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/object-src 'none'/);assert.match(csp,/form-action 'self'/);
});
test('existing deployment settings are preserved',()=>{
 assert.equal(config.buildCommand,'npm test && npm run build');assert.equal(config.outputDirectory,'public');
 assert.equal(config.crons[0].path,'/api/sincronizacao');assert.equal(config.functions['api/sincronizacao.js'].maxDuration,300);
});
