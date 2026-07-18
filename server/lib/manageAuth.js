// lib/manageAuth.js
// Gates the elder/admin availability-manager endpoints behind a single
// shared PIN - not per-user authentication, just a security boundary so
// the manage page isn't wide open to anyone with the URL.
//
// Deliberately no new dependencies (no cookie-parser, no jsonwebtoken):
// a signed token is trivial to do with Node's built-in crypto, and a
// hand-rolled Cookie header parser is a few lines. Keeps this consistent
// with the rest of the project's "hand-roll simple things" philosophy.

const crypto = require('crypto');
const config = require('../config');

const COOKIE_NAME = 'manage_session';
const SESSION_HOURS = 12;

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', config.manage.sessionSecret).update(data).digest('base64url');
  return `${data}.${hmac}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [data, hmac] = token.split('.');
  const expectedHmac = crypto.createHmac('sha256', config.manage.sessionSecret).update(data).digest('base64url');

  // Timing-safe comparison to avoid leaking info via response-time differences.
  const a = Buffer.from(hmac);
  const b = Buffer.from(expectedHmac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const [key, ...rest] = pair.trim().split('=');
      return [key, decodeURIComponent(rest.join('='))];
    })
  );
}

/** Checks the PIN and, if correct, sets a signed session cookie. */
function checkPin(req, res) {
  const { pin } = req.body || {};
  if (!pin || pin !== config.manage.pin) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }

  const token = sign({ expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000 });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  });
  res.json({ success: true });
}

/** Express middleware - blocks the request unless a valid session cookie is present. */
function requireManageAuth(req, res, next) {
  const cookies = parseCookies(req);
  const session = verify(cookies[COOKIE_NAME]);
  if (!session) {
    return res.status(401).json({ error: 'Not authorized. Enter the PIN first.' });
  }
  next();
}

module.exports = { checkPin, requireManageAuth };
