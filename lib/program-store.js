'use strict';
const crypto = require('node:crypto');
let client;
const MUTATION_SQL = `WITH saved AS (
    UPDATE budget_program SET datasets = $1::jsonb, revision = revision + 1, updated_at = now()
    WHERE id = 1 AND revision = $2 RETURNING revision
  ) INSERT INTO budget_program_audit (id, revision, request_hash, action, actor, reason, before_data, after_data)
    SELECT $3::uuid, revision, $4, $5, $6, $7, $8::jsonb, $9::jsonb FROM saved RETURNING revision`;
function sql() {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL_MISSING');
  return client ||= require('@neondatabase/serverless').neon(process.env.DATABASE_URL);
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
async function schema() {
  await sql().query(`CREATE TABLE IF NOT EXISTS budget_program (
    id integer PRIMARY KEY CHECK (id = 1), revision integer NOT NULL DEFAULT 1,
    datasets jsonb NOT NULL, imported_datasets jsonb NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await sql().query(`CREATE TABLE IF NOT EXISTS budget_program_audit (
    id uuid PRIMARY KEY, revision integer NOT NULL, request_hash text NOT NULL,
    action text NOT NULL, actor text NOT NULL, reason text NOT NULL,
    before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
  )`);
}
async function read() {
  const [r] = await sql().query('SELECT revision, datasets, imported_at, updated_at FROM budget_program WHERE id = 1');
  if (!r) throw Error('MIGRATION_REQUIRED');
  return r;
}
function validateCommand(input, current) {
  if (!input || typeof input !== 'object' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id || '')) throw Error('Identificador inválido');
  if (!Number.isSafeInteger(input.revision) || input.revision !== current.revision) { const e = Error('Os dados mudaram. Atualize a consulta antes de salvar.'); e.status = 409; throw e; }
  if (typeof input.actor !== 'string' || !input.actor.trim() || input.actor.length > 100 || typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.length > 1200) throw Error('Informe responsável e motivo (mínimo 5 caracteres).');
  const tab = input.tab, data = current.datasets[tab];
  if (!Object.hasOwn(current.datasets, tab) || !data || !['edit-row', 'add-row'].includes(input.action)) throw Error('Tabela ou ação inválida');
  if (!Array.isArray(input.values) || input.values.length < data.headers.length || input.values.length > Math.max(data.headers.length, ...data.rows.map(r => r.length), 1) || !input.values.every(v => typeof v === 'string' && v.length <= 10000)) throw Error('Campos inválidos ou texto muito extenso.');
  if (input.action === 'edit-row' && (!Number.isSafeInteger(input.row) || input.row < 0 || input.row >= data.rows.length)) throw Error('Registro não localizado');
  if (tab === 'Lançamentos do aplicativo' && input.action === 'edit-row') throw Error('Histórico é permanente. Acrescente uma correção em novo registro.');
  const datasets = structuredClone(current.datasets), target = datasets[tab];
  const row = input.action === 'add-row' ? target.rows.length : input.row;
  const before = input.action === 'add-row' ? null : target.rows[row];
  target.rows[row] = input.values;
  target.updatedAt = new Date().toISOString(); target.origin = 'Banco do programa';
  if (Buffer.byteLength(JSON.stringify(datasets)) > 3500000) throw Error('A base excede o tamanho suportado.');
  return { datasets, before: { tab, row, values: before }, after: { tab, row, values: input.values } };
}
async function write(input) {
  if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id || '')) { const e = Error('Identificador inválido'); e.status = 400; throw e; }
  const hash = digest(input);
  const [prior] = await sql().query('SELECT revision, request_hash FROM budget_program_audit WHERE id = $1', [input.id]);
  if (prior) {
    if (prior.request_hash !== hash) { const e = Error('Identificador já usado com outros dados.'); e.status = 409; throw e; }
    return { revision: prior.revision, duplicate: true };
  }
  const current = await read();
  let change; try { change = validateCommand(input, current); } catch (e) { e.status ||= 400; throw e; }
  const result = await sql().query(MUTATION_SQL,
    [JSON.stringify(change.datasets), input.revision, input.id, hash, input.action, input.actor.trim(), input.reason.trim(), JSON.stringify(change.before), JSON.stringify(change.after)]);
  if (!result.length) { const e = Error('Outra edição foi salva. Atualize antes de tentar novamente.'); e.status = 409; throw e; }
  return result[0];
}
module.exports = { sql, schema, read, write, digest, validateCommand, MUTATION_SQL };
