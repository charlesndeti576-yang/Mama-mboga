import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { sql, send, onlyMethods, setSession, clearSession, getUser, ownerEmail, EMAIL_RE } from '../lib/util.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export default async function handler(req, res) {
  const action = req.query.action;
  try {
    if (action === 'me') {
      return send(res, 200, { user: getUser(req) });
    }
    if (!onlyMethods(req, res, ['POST'])) return;
    const { email: rawEmail, password, token } = req.body || {};
    const email = String(rawEmail || '').trim().toLowerCase();

    if (action === 'logout') {
      clearSession(res);
      return send(res, 200, { ok: true });
    }

    if (action === 'register') {
      if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'That email address is not valid.' });
      if (String(password || '').length < 6) return send(res, 400, { error: 'Password must be at least 6 characters.' });
      if (email !== ownerEmail()) return send(res, 403, { error: 'Registration is closed. Only the owner email can create an account.' });
      const hash = await bcrypt.hash(password, 10);
      const rows = await sql`INSERT INTO users (email, password_hash) VALUES (${email}, ${hash})
                             ON CONFLICT (email) DO NOTHING RETURNING id, email`;
      if (!rows.length) return send(res, 409, { error: 'An account with this email already exists. Try signing in.' });
      setSession(res, rows[0]);
      return send(res, 200, { user: { id: rows[0].id, email } });
    }

    if (action === 'login') {
      if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'That email address is not valid.' });
      if (!password) return send(res, 400, { error: 'Enter your password.' });
      const rows = await sql`SELECT id, email, password_hash FROM users WHERE email = ${email}`;
      const ok = rows.length && email === ownerEmail() && (await bcrypt.compare(password, rows[0].password_hash));
      if (!ok) return send(res, 401, { error: 'Wrong email or password.' });
      setSession(res, rows[0]);
      return send(res, 200, { user: { id: rows[0].id, email } });
    }

    if (action === 'forgot') {
      if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'That email address is not valid.' });
      if (!process.env.RESEND_API_KEY) return send(res, 503, { error: 'Password reset email is not set up yet.' });
      const rows = await sql`SELECT id FROM users WHERE email = ${email}`;
      if (rows.length && email === ownerEmail()) {
        const raw = crypto.randomBytes(32).toString('hex');
        await sql`DELETE FROM reset_tokens WHERE user_id = ${rows[0].id}`;
        await sql`INSERT INTO reset_tokens (user_id, token_hash, expires_at)
                  VALUES (${rows[0].id}, ${sha(raw)}, now() + interval '1 hour')`;
        const base = process.env.SITE_URL || `https://${req.headers.host}`;
        const link = `${base}/?reset=${raw}`;
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.MAIL_FROM || 'Mama Mboga <onboarding@resend.dev>',
            to: [email],
            subject: 'Reset your Mama Mboga password',
            html: `<p>Tap the link below to choose a new password. It expires in 1 hour.</p><p><a href="${link}">Reset password</a></p>`
          })
        });
        if (!r.ok) return send(res, 502, { error: 'Could not send the reset email. Please try again.' });
      }
      return send(res, 200, { ok: true });
    }

    if (action === 'reset') {
      if (String(password || '').length < 6) return send(res, 400, { error: 'Password must be at least 6 characters.' });
      if (!token) return send(res, 400, { error: 'This reset link is not valid.' });
      const rows = await sql`SELECT user_id FROM reset_tokens WHERE token_hash = ${sha(String(token))} AND expires_at > now()`;
      if (!rows.length) return send(res, 400, { error: 'This reset link is invalid or has expired. Request a new one.' });
      const hash = await bcrypt.hash(password, 10);
      await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${rows[0].user_id}`;
      await sql`DELETE FROM reset_tokens WHERE user_id = ${rows[0].user_id}`;
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'Unknown action.' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error. Please try again.' });
  }
}
