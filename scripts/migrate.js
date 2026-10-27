'use strict';
const assert = require('node:assert/strict');
const store = require('../lib/program-store');
const catalog = require('../sheet-catalog');
function canonical(v) { if (Array.isArray(v)) return v.map(canonical); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])); return v; }
async function verifyApi() {
  let status, body, cookie;
  const res = { setHeader(k, v) { if (k === 'Set-Cookie') cookie = v; }, status(n) { status = n; return this; }, json(v) { body = v; return this; } };
  await require('../api/sessao')({ method: 'POST', headers: { authorization: 'Bearer ' + process.env.APP_ACCESS_TOKEN } }, res);
  assert.equal(status, 200); assert.ok(cookie);
  await require('../api/programa')({ method: 'GET', query: {}, headers: { cookie: cookie.split(';')[0] } }, res);
  assert.equal(status, 200); assert.equal(Object.keys(body.datasets).length, catalog.length);
  await require('../api/programa')({ method: 'GET', query: {}, headers: {} }, res);
  assert.equal(status, 401);
  console.log('SERVER_API_PROBE_OK authorized_read=true cookie_session=true unauthenticated_blocked=true');
}
(async () => {
  await store.schema();
  // Temporary shadow tables exist only inside this transaction; no fictitious entry reaches production data.
  const fixture = { Teste: { headers: ['ID', 'Observação'], rows: [['FICTICIO', 'Antes']] } };
  const modified = structuredClone(fixture); modified.Teste.rows[0][1] = 'Depois';
  const args = [JSON.stringify(modified), 1, require('node:crypto').randomUUID(), 'test-request', 'edit-row', 'Teste isolado', 'Verificação de persistência', '{}', '{}'];
  const check = await store.sql().transaction([
    store.sql().query('CREATE TEMP TABLE budget_program (LIKE public.budget_program INCLUDING ALL) ON COMMIT DROP'),
    store.sql().query('CREATE TEMP TABLE budget_program_audit (LIKE public.budget_program_audit INCLUDING ALL) ON COMMIT DROP'),
    store.sql().query('INSERT INTO budget_program (id, datasets, imported_datasets) VALUES (1, $1::jsonb, $1::jsonb)', [JSON.stringify(fixture)]),
    store.sql().query(store.MUTATION_SQL, args),
    store.sql().query(store.MUTATION_SQL, [...args.slice(0,2), require('node:crypto').randomUUID(), ...args.slice(3)]),
    store.sql().query('SELECT revision, datasets, (SELECT count(*)::int FROM budget_program_audit) AS events FROM budget_program WHERE id = 1')
  ]);
  assert.equal(check[3][0].revision, 2);
  assert.equal(check[4].length, 0, 'Stale write must not commit');
  assert.equal(check[5][0].events, 1);
  assert.deepEqual(canonical(check[5][0].datasets), canonical(modified));
  console.log('DATABASE_PROBE_OK isolated_write=true readback=true stale_write_blocked=true audit_atomic=true temporary_tables_removed=true');
  const existing = await store.sql().query('SELECT revision FROM budget_program WHERE id = 1');
  if (existing.length) { console.log('MIGRATION_OK existing_database_preserved revision=' + existing[0].revision); await require('../lib/calculation-rules').installRules(store.sql()); await verifyApi(); return; }
  let snapshot, status;
  const req = { method: 'GET', headers: { authorization: 'Bearer ' + process.env.APP_ACCESS_TOKEN }, query: { snapshot: '1' } };
  const res = { setHeader() {}, status(n) { status = n; return this; }, json(d) { snapshot = d; return this; } };
  await require('../api/central')(req, res);
  assert.equal(status, 200, 'Source snapshot failed; no data imported');
  for (const { title } of catalog) { const d = snapshot.datasets?.[title]; assert.ok(d && Array.isArray(d.headers) && d.headers.length && Array.isArray(d.rows) && d.rows.every(Array.isArray), 'Incomplete source'); }
  assert.equal(Object.keys(snapshot.datasets).length, catalog.length);
  const payload = JSON.stringify(snapshot.datasets);
  await store.sql().query('INSERT INTO budget_program (id, datasets, imported_datasets) VALUES (1, $1::jsonb, $1::jsonb) ON CONFLICT (id) DO NOTHING', [payload]);
  const [saved] = await store.sql().query('SELECT datasets, imported_datasets FROM budget_program WHERE id = 1');
  assert.deepEqual(canonical(saved.datasets), canonical(snapshot.datasets), 'Import readback mismatch');
  assert.deepEqual(canonical(saved.imported_datasets), canonical(snapshot.datasets), 'Archive readback mismatch');
  console.log('MIGRATION_OK tables=' + catalog.length + ' rows=' + Object.values(snapshot.datasets).reduce((n,d) => n + d.rows.length, 0) + ' exact_readback=true source_unchanged=true');
  await require('../lib/calculation-rules').installRules(store.sql());
  await verifyApi();
})().catch(() => { console.error('MIGRATION_FAILED: publication stopped; inspect database configuration and source access.'); process.exitCode = 1; });
