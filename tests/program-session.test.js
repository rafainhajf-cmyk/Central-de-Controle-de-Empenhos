'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { authorized } = require('../lib/google-sheets');
const handler = require('../api/sessao');
test('exchanges authenticated access for HttpOnly session without exposing key', async () => {
 process.env.APP_ACCESS_TOKEN = crypto.randomBytes(32).toString('hex');
 const headers = {}; let status, result;
 const res = { setHeader(k,v) { headers[k] = v; }, status(v) {status = v;return this;}, json(v){result = v;} };
 await handler({method:'POST',headers:{authorization:'Bearer '+process.env.APP_ACCESS_TOKEN}},res);
 assert.equal(status,200);assert.equal(result.authenticated,true);
 assert.match(headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
 assert.ok(!headers['Set-Cookie'].includes(process.env.APP_ACCESS_TOKEN));
 assert.equal(authorized({headers:{cookie:headers['Set-Cookie'].split(';')[0]}}),true);
 assert.equal(authorized({headers:{cookie:headers['Set-Cookie'].split(';')[0]+'tampered'}}),false);
 process.env.APP_ACCESS_TOKEN = crypto.randomBytes(32).toString('hex');
 assert.equal(authorized({headers:{cookie:headers['Set-Cookie'].split(';')[0]}}),false);
 delete process.env.APP_ACCESS_TOKEN;
});
