'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { validateCommand } = require('../lib/program-store');
const current = () => ({ revision: 4, datasets: { NC: { headers: ['Número', 'Observação'], rows: [['2026NC01', 'Original'], ['2026NC02', 'Manter']] } } });
const command = () => ({ id: crypto.randomUUID(), revision: 4, action: 'edit-row', tab: 'NC', row: 0, values: ['2026NC01', 'Corrigido'], actor: 'Rafael', reason: 'Conferência manual' });
test('edition preserves all other rows and the prior in-memory snapshot', () => {
  const source = current(), before = structuredClone(source);
  const result = validateCommand(command(), source);
  assert.deepEqual(source, before);
  assert.deepEqual(result.datasets.NC.rows, [['2026NC01', 'Corrigido'], ['2026NC02', 'Manter']]);
  assert.deepEqual(result.before.values, ['2026NC01', 'Original']);
});
test('stale revisions cannot overwrite a newer edition', () => assert.throws(() => validateCommand({ ...command(), revision: 3 }, current()), { status: 409 }));
test('append preserves existing rows including gaps', () => {
 const state = current(); state.datasets.NC.rows.push([]);
 const result = validateCommand({ ...command(), action: 'add-row', row: null }, state);
 assert.deepEqual(result.datasets.NC.rows.slice(0,3), state.datasets.NC.rows);
 assert.deepEqual(result.datasets.NC.rows[3], command().values);
});
test('requires valid row, complete fields, actor and reason', () => {
 for (const patch of [{ row: -1 }, { row: 200 }, { actor: '' }, { reason: '' }, { values: [123] }, { values: ['missing'] }, { tab: '__proto__' }]) assert.throws(() => validateCommand({ ...command(), ...patch }, current()));
});
test('original history cannot be edited', () => {
 const state = current(); state.datasets['Lançamentos do aplicativo'] = state.datasets.NC;
 assert.throws(() => validateCommand({ ...command(), tab: 'Lançamentos do aplicativo' }, state), /Histórico/);
});
