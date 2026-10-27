'use strict';
const crypto = require('node:crypto');
const { authorized } = require('../lib/google-sheets');
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!authorized(req)) return res.status(401).json({ error: 'Chave não reconhecida' });
  const expires = Math.floor(Date.now() / 1000) + 30 * 86400;
  const signature = crypto.createHmac('sha256', process.env.APP_ACCESS_TOKEN).update('program-session:' + expires).digest('base64url');
  res.setHeader('Set-Cookie', 'central_session=' + expires + '.' + signature + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000');
  return res.status(200).json({ authenticated: true });
};
