'use strict';
const crypto = require('node:crypto');
// Apenas o hash do token deve ser persistido no banco; o token fica no cookie.
function createSessionToken() { const token = crypto.randomBytes(32).toString('base64url'); return { token, tokenHash: hashSessionToken(token) }; }
function hashSessionToken(token) { if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw Error('Sessão inválida'); return crypto.createHash('sha256').update(token).digest('hex'); }
function sessionCookie(token, seconds) { hashSessionToken(token); if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 2592000) throw Error('Duração inválida'); return 'user_session='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age='+seconds; }
module.exports = { createSessionToken, hashSessionToken, sessionCookie };
