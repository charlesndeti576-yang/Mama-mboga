import { sql, send, onlyMethods, requireOwner, clean } from '../lib/util.js';

// Owner-only: dashboard data (GET) and adding sales / expenses / customers (POST).
export default async function handler(req, res) {
  try {
    if (!onlyMethods(req, res, ['GET', 'POST'])) return;
    if (!requireOwner(req, res)) return;

    if (req.method === 'GET') {
      const [sales, expenses, customers, orders] = await Promise.all([
        sql`SELECT id, amount, note, method, created_at FROM sales ORDER BY created_at DESC LIMIT 2000`,
        sql`SELECT id, amount, note, created_at FROM expenses ORDER BY created_at DESC LIMIT 2000`,
        sql`SELECT id, name, phone, created_at FROM customers ORDER BY created_at DESC LIMIT 2000`,
        sql`SELECT id, name, phone, delivery, payment, note, items, created_at FROM orders ORDER BY created_at DESC LIMIT 30`
      ]);
      return send(res, 200, { sales, expenses, customers, orders });
    }

    const b = req.body || {};
    const amount = Number(b.amount);
    if (b.col === 'sales') {
      if (!(amount > 0)) return send(res, 400, { error: 'Enter an amount.' });
      await sql`INSERT INTO sales (amount, note, method) VALUES (${amount}, ${clean(b.note, 200)}, ${clean(b.method, 60)})`;
    } else if (b.col === 'expenses') {
      if (!(amount > 0)) return send(res, 400, { error: 'Enter an amount.' });
      await sql`INSERT INTO expenses (amount, note) VALUES (${amount}, ${clean(b.note, 200)})`;
    } else if (b.col === 'customers') {
      const name = clean(b.name, 100);
      if (!name) return send(res, 400, { error: 'Enter a name.' });
      await sql`INSERT INTO customers (name, phone) VALUES (${name}, ${clean(b.phone, 30)})`;
    } else {
      return send(res, 400, { error: 'Unknown record type.' });
    }
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error. Please try again.' });
  }
}
