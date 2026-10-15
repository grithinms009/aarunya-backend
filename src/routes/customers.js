/* Customers, derived from every order and keyed by phone, falling back to the name for
   walk-ins with no phone — the same grouping the admin's customers.list did. */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { iso } from '../lib/format.js';
import { sendCsv } from '../lib/csv.js';
import { wrap } from '../lib/errors.js';
import { parseQuery } from '../middleware/validate.js';

export const router = Router();

const listQuery = z.object({
  q: z.string().max(200).optional(),
  channel: z.enum(['online', 'offline', '']).optional(),
});

async function build(filters) {
  const { rows } = await query(
    `SELECT id, channel, status, total, created_at, cust_name, cust_phone, cust_email, city
       FROM "order" ORDER BY created_at DESC`,
  );

  const map = new Map();
  for (const o of rows) {
    const key = (o.cust_phone || '').replace(/\D/g, '') || o.cust_name.trim().toLowerCase();
    if (!key) continue;

    const row = map.get(key) ?? {
      key, name: o.cust_name, phone: o.cust_phone, email: o.cust_email, city: o.city,
      orders: 0, spent: 0, lastOrderAt: iso(o.created_at), channelSet: new Set(),
    };
    if (!row.name && o.cust_name) row.name = o.cust_name;
    if (!row.city && o.city) row.city = o.city;
    if (!row.email && o.cust_email) row.email = o.cust_email;
    /* Cancelled orders don't count towards orders or spend. */
    if (o.status !== 'cancelled') { row.orders += 1; row.spent += o.total; }
    row.channelSet.add(o.channel);
    const at = iso(o.created_at);
    if (at > row.lastOrderAt) row.lastOrderAt = at;
    map.set(key, row);
  }

  const q = (filters.q ?? '').trim().toLowerCase();
  return [...map.values()]
    .map(({ channelSet, ...r }) => ({ ...r, channels: [...channelSet] }))
    .filter((m) =>
      (!filters.channel || m.channels.includes(filters.channel)) &&
      (!q || `${m.name} ${m.phone} ${m.email} ${m.city}`.toLowerCase().includes(q)))
    .sort((a, b) => (a.lastOrderAt < b.lastOrderAt ? 1 : -1));
}

router.get('/', parseQuery(listQuery), wrap(async (req, res) => {
  res.json(await build(req.valid));
}));

router.get('/export.csv', parseQuery(listQuery), wrap(async (req, res) => {
  const rows = await build(req.valid);
  sendCsv(res, 'aarunya-customers.csv',
    ['Customer', 'Phone', 'Email', 'City', 'Orders', 'Spent', 'Last order', 'Bought'],
    rows.map((r) => [r.name, r.phone, r.email, r.city, r.orders, r.spent,
      r.lastOrderAt.slice(0, 10), r.channels.join(' / ')]));
}));
