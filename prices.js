import { sql, send, onlyMethods, requireOwner } from '../lib/util.js';

export default async function handler(req, res) {
  try {
    if (!onlyMethods(req, res, ['GET', 'PUT'])) return;

    if (req.method === 'GET') {
      const rows = await sql`SELECT name, price FROM prices`;
      return send(res, 200, { prices: Object.fromEntries(rows.map((r) => [r.name, Number(r.price)])) });
    }

    if (!requireOwner(req, res)) return;
    const entries = Object.entries((req.body && req.body.prices) || {})
      .map(([n, p]) => [String(n).slice(0, 80), Number(p)])
      .filter(([n, p]) => n && Number.isFinite(p) && p >= 0);
    if (!entries.length) return send(res, 400, { error: 'No valid prices to save.' });
    await sql`INSERT INTO prices (name, price)
              SELECT * FROM unnest(${entries.map((e) => e[0])}::text[], ${entries.map((e) => e[1])}::numeric[])
              ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price`;
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error. Please try again.' });
  }
}
