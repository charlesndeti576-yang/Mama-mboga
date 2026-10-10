import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export const sql = neon(process.env.DATABASE_URL);
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ownerEmail = () => (process.env.OWNER_EMAIL || '').trim().toLowerCase();

export const send = (res, status, body) => res.status(status).json(body);

export function onlyMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  send(res, 405, { error: 'Method not allowed.' });
  return false;
}

const cookie = (value, maxAge) =>
  `session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

export function setSession(res, user) {
  const token = jwt.sign({ uid: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.setHeader('Set-Cookie', cookie(token, 60 * 60 * 24 * 30));
}

export const clearSession = (res) => res.setHeader('Set-Cookie', cookie('', 0));

// Returns the signed-in owner, or null. Only OWNER_EMAIL is ever accepted.
export function getUser(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return null;
  try {
    const p = jwt.verify(m[1], process.env.JWT_SECRET);
    return p.email === ownerEmail() ? { id: p.uid, email: p.email } : null;
  } catch {
    return null;
  }
}

export function requireOwner(req, res) {
  const u = getUser(req);
  if (!u) send(res, 401, { error: 'Please sign in first.' });
  return u;
}

export const clean = (v, max) => String(v ?? '').trim().slice(0, max);
