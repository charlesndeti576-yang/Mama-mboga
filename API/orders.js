import { sql, send, onlyMethods, clean } from '../lib/util.js';

// Public: lets customers on the website save their order. Reading orders is in records.js (owner only).
export default async function handler(req, res) {
  try {
    if (!onlyMethods(req, res, ['POST'])) return;
    const b = req.body || {};
    const name = clean(b.name, 100), phone = clean(b.phone, 30);
    if (!name || !phone) return send(res, 400, { error: 'Name and phone are required.' });
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 50)
      .map((i) => ({ name: clean(i && i.name, 80), qty: Number(i && i.qty) || 0 }))
      .filter((i) => i.name && i.qty > 0);
    if (!items.length) return send(res, 400, { error: 'Order has no items.' });
    await sql`INSERT INTO orders (name, phone, delivery, payment, note, items, estimated_total)
              VALUES (${name}, ${phone}, ${clean(b.delivery, 60)}, ${clean(b.payment, 60)}, ${clean(b.note, 500)},
                      ${JSON.stringify(items)}::jsonb, ${Number(b.estimatedTotal) || 0})`;
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error. Please try again.' });
  }
}
