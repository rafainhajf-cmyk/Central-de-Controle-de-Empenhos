'use strict';
const { authorized } = require('../lib/google-sheets');
const store = require('../lib/program-store');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!authorized(req)) return res.status(401).json({ error: 'Não autorizado. Abra a sessão do painel.' });
  try {
    if (req.method === 'GET') {
      if (req.query?.history === '1') {
        const events = await store.sql().query('SELECT id, revision, action, actor, reason, before_data, after_data, created_at FROM budget_program_audit ORDER BY revision DESC LIMIT 200');
        return res.status(200).json({ events });
      }
      const d = await store.read();
      return res.status(200).json({ datasets: d.datasets, revision: d.revision, importedAt: d.imported_at, updatedAt: d.updated_at, source: 'Banco do programa', credits: d.credits, sectors: d.sectors, calculation: d.calculation });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'JSON inválido' }); }
    if (!body || Buffer.byteLength(JSON.stringify(body)) > 200000) return res.status(400).json({ error: 'Comando inválido' });
    return res.status(200).json(await store.write(body));
  } catch (e) {
    const infrastructure = !e.status;
    if (infrastructure) console.error('Program database unavailable');
    return res.status(e.status || (infrastructure ? 503 : 400)).json({ error: infrastructure ? 'Banco indisponível. Nenhuma edição foi confirmada; mantenha o formulário aberto.' : e.message });
  }
};
