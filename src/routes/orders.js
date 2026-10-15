/* Orders and offline sales.

   Rules enforced here, each one the authority rather than a mirror of the UI:
   order numbers are sequential per channel (AJ… online, OS… offline); an order cannot
   advance while payment is pending; it cannot be marked shipped without a courier and
   AWB; cancelling restores stock and marks a paid order refunded; an offline sale
   re-checks live stock per line before it writes. Every stock movement is one ledger
   row written inside the same transaction. */
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { loadOrder, loadOrders } from '../lib/repo.js';
import { applyStock } from '../lib/stock.js';
import { DAY, num, sod, ymd } from '../lib/format.js';
import { sendCsv } from '../lib/csv.js';
import { notFound, ruleError, wrap } from '../lib/errors.js';
import { parseBody, parseQuery } from '../middleware/validate.js';
import { NEXT_STEP } from '../lib/reference.js';

export const router = Router();

/** status → the status that follows it, from the shared flow definition. */
const nextOf = (status) => NEXT_STEP[status]?.[0];

const listQuery = z.object({
  ch: z.enum(['all', 'online', 'offline']).optional(),
  status: z.enum(['', 'new', 'packed', 'shipped', 'out', 'delivered', 'cancelled', 'completed']).optional(),
  pay: z.enum(['', 'paid', 'pending', 'refunded', 'partial']).optional(),
  range: z.enum(['today', '7', '30', '90', 'all', 'custom']).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  q: z.string().max(200).optional(),
});

/** Builds the SQL window for the date filter. */
function rangeWhere(q, params) {
  const range = q.range ?? '30';
  if (range === 'all') return null;
  if (range === 'custom') {
    const bits = [];
    if (q.from) { params.push(`${q.from}T00:00:00`); bits.push(`o.created_at >= $${params.length}`); }
    if (q.to) { params.push(`${q.to}T23:59:59`); bits.push(`o.created_at <= $${params.length}`); }
    return bits.length ? bits.join(' AND ') : null;
  }
  const start = range === 'today' ? new Date(sod()) : new Date(Date.now() - Number(range) * DAY);
  params.push(start.toISOString());
  return `o.created_at >= $${params.length}`;
}

/** Everything except the channel filter, so the segment counts stay comparable. */
function baseWhere(q) {
  const params = [];
  const where = [];
  const r = rangeWhere(q, params);
  if (r) where.push(r);
  if (q.status) { params.push(q.status); where.push(`o.status = $${params.length}`); }
  if (q.pay) { params.push(q.pay); where.push(`o.pay_status = $${params.length}`); }
  if (q.q) {
    params.push(`%${q.q.trim()}%`);
    const i = params.length;
    where.push(`(o.id ILIKE $${i} OR o.cust_name ILIKE $${i} OR o.cust_phone ILIKE $${i}
                 OR o.city ILIKE $${i}
                 OR EXISTS (SELECT 1 FROM order_item t WHERE t.order_id = o.id AND t.name ILIKE $${i}))`);
  }
  return { sql: where.join(' AND '), params };
}

router.get('/', parseQuery(listQuery), wrap(async (req, res) => {
  const q = req.valid;
  const base = baseWhere(q);
  const all = await loadOrders(base.sql ? base : null);

  const rows = q.ch && q.ch !== 'all' ? all.filter((o) => o.channel === q.ch) : all;
  const live = rows.filter((o) => o.status !== 'cancelled');
  const sum = (a) => a.reduce((t, o) => t + o.total, 0);
  const online = live.filter((o) => o.channel === 'online');
  const offline = live.filter((o) => o.channel === 'offline');
  const sales = sum(live);

  res.json({
    rows,
    counts: {
      all: all.length,
      online: all.filter((o) => o.channel === 'online').length,
      offline: all.filter((o) => o.channel === 'offline').length,
    },
    summary: {
      sales,
      orders: live.length,
      online: sum(online),
      onlineCount: online.length,
      offline: sum(offline),
      offlineCount: offline.length,
      units: live.reduce((t, o) => t + o.items.reduce((u, l) => u + l.qty, 0), 0),
      average: live.length ? sales / live.length : 0,
    },
  });
}));

router.get('/export.csv', parseQuery(listQuery), wrap(async (req, res) => {
  const q = req.valid;
  const base = baseWhere(q);
  const all = await loadOrders(base.sql ? base : null);
  const rows = q.ch && q.ch !== 'all' ? all.filter((o) => o.channel === q.ch) : all;
  sendCsv(res, 'aarunya-orders.csv',
    ['Order', 'Date', 'Customer', 'Phone', 'City', 'Channel', 'Items', 'Total', 'Payment', 'Status'],
    rows.map((o) => [o.id, o.createdAt.slice(0, 10), o.customer.name, o.customer.phone,
      o.customer.city, o.channel, o.items.reduce((t, l) => t + l.qty, 0), o.total,
      o.payment.status, o.status]));
}));

/** Recent offline sales, for the POS sidebar. */
router.get('/recent-offline', wrap(async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 5);
  res.json(await loadOrders({ sql: `o.channel = 'offline'`, params: [] }, limit));
}));

/** Online orders that can take a return request. */
router.get('/returnable', wrap(async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 60);
  res.json(await loadOrders(
    { sql: `o.channel = 'online' AND o.status <> 'cancelled'`, params: [] }, limit));
}));

router.get('/:orderNo', wrap(async (req, res) => {
  const o = await loadOrder(req.params.orderNo);
  if (!o) throw notFound('That order no longer exists');
  res.json(o);
}));

/* ---------------------------------------------------------------- transitions */

const shipmentIn = z.object({
  courier: z.string().max(100).default(''),
  awb: z.string().max(100).default(''),
});

router.post('/:orderNo/advance', parseBody(shipmentIn), wrap(async (req, res) => {
  const id = req.params.orderNo;

  await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT o.*, s.awb AS ship_awb FROM "order" o
         LEFT JOIN shipment s ON s.order_id = o.id
        WHERE o.id = $1 FOR UPDATE OF o`, [id]);
    const o = rows[0];
    const next = o && nextOf(o.status);
    if (!o || !next) throw ruleError('This order has no next step');
    if (o.pay_status === 'pending') {
      throw ruleError('Payment is still pending. Mark it as paid first.');
    }

    const awb = (o.ship_awb || req.body.awb).trim();
    if (next === 'shipped' && !awb) {
      throw ruleError('Add the courier and tracking number first');
    }

    await c.query(`UPDATE "order" SET status = $2, updated_at = now() WHERE id = $1`, [id, next]);
    if (next === 'shipped' && !o.ship_awb) {
      await c.query(
        `INSERT INTO shipment (order_id, courier, awb, shipped_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (order_id) DO UPDATE SET courier = EXCLUDED.courier, awb = EXCLUDED.awb,
           shipped_at = COALESCE(shipment.shipped_at, now())`,
        [id, req.body.courier, req.body.awb.trim()],
      );
    }
    await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,$2,'')`,
      [id, next]);
  });

  res.json(await loadOrder(id));
}));

router.put('/:orderNo/shipment', parseBody(shipmentIn), wrap(async (req, res) => {
  const id = req.params.orderNo;
  const awb = req.body.awb.trim();
  if (!awb) throw ruleError('Enter the tracking number (AWB)');

  await tx(async (c) => {
    const { rows } = await c.query(`SELECT status FROM "order" WHERE id = $1`, [id]);
    if (!rows.length) throw notFound('That order no longer exists');
    await c.query(
      `INSERT INTO shipment (order_id, courier, awb, shipped_at) VALUES ($1,$2,$3,now())
       ON CONFLICT (order_id) DO UPDATE SET courier = EXCLUDED.courier, awb = EXCLUDED.awb,
         shipped_at = COALESCE(shipment.shipped_at, now())`,
      [id, req.body.courier, awb],
    );
    await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,$2,$3)`,
      [id, rows[0].status, `Tracking saved: ${awb}`]);
  });

  res.json(await loadOrder(id));
}));

router.post('/:orderNo/payment/mark-paid', wrap(async (req, res) => {
  const id = req.params.orderNo;
  await tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE "order" SET pay_status = 'paid', updated_at = now()
        WHERE id = $1 RETURNING status`, [id]);
    if (!rows.length) throw notFound('That order no longer exists');
    await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,$2,$3)`,
      [id, rows[0].status, 'Payment marked as received']);
  });
  res.json(await loadOrder(id));
}));

router.patch('/:orderNo/note', parseBody(z.object({ note: z.string().max(2000).default('') })),
  wrap(async (req, res) => {
    const { rowCount } = await query(`UPDATE "order" SET note = $2 WHERE id = $1`,
      [req.params.orderNo, req.body.note.trim()]);
    if (!rowCount) throw notFound('That order no longer exists');
    res.json({ ok: true });
  }));

/** Puts every item back into stock and marks a paid order refunded. */
router.post('/:orderNo/cancel', wrap(async (req, res) => {
  const id = req.params.orderNo;

  await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT * FROM "order" WHERE id = $1 FOR UPDATE`, [id]);
    const o = rows[0];
    if (!o) throw notFound('That order no longer exists');
    if (o.status === 'cancelled') return;
    /* Online orders can only be cancelled before they ship; an offline sale voids any time. */
    if (o.channel === 'online' && !['new', 'packed'].includes(o.status)) {
      throw ruleError('This order has already shipped and can no longer be cancelled');
    }

    const { rows: items } = await c.query(
      `SELECT variant_id, qty FROM order_item WHERE order_id = $1`, [id]);
    for (const l of items) {
      if (l.variant_id) await applyStock(c, l.variant_id, l.qty, 'cancel', id);
    }

    await c.query(
      `UPDATE "order" SET status = 'cancelled',
         pay_status = CASE WHEN pay_status = 'paid' THEN 'refunded'::payment_status ELSE pay_status END,
         updated_at = now()
       WHERE id = $1`, [id]);
    await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,'cancelled',$2)`,
      [id, 'Cancelled by admin. Items added back to stock.']);
  });

  res.json({ ok: true });
}));

/* ---------------------------------------------------------------- offline sale */

const saleIn = z.object({
  lines: z.array(z.object({
    pid: z.string().max(120),
    vid: z.string().min(1).max(120),
    name: z.string().max(200),
    color: z.string().max(60).default(''),
    sku: z.string().max(60).default(''),
    img: z.string().max(2_000_000).default(''),
    qty: z.coerce.number().int().min(1).max(10000),
    price: z.coerce.number().min(0),
  })).default([]),
  discount: z.coerce.number().min(0).default(0),
  method: z.string().max(40).default('Cash'),
  location: z.string().max(200).default(''),
  date: z.string().max(40).default(''),
  name: z.string().max(200).default(''),
  phone: z.string().max(40).default(''),
  note: z.string().max(2000).default(''),
});

/** Next number in the channel's sequence: AJ1001… online, OS201… offline. */
async function nextOrderNo(c, channel) {
  const prefix = channel === 'online' ? 'AJ' : 'OS';
  const base = channel === 'online' ? 1000 : 200;
  const { rows } = await c.query(
    `SELECT COALESCE(max(NULLIF(regexp_replace(id, '\\D', '', 'g'), '')::bigint), $2) AS m
       FROM "order" WHERE channel = $1`,
    [channel, base],
  );
  return prefix + (Number(rows[0].m) + 1);
}

router.post('/offline-sales', parseBody(saleIn), wrap(async (req, res) => {
  const input = req.body;
  if (!input.lines.length) throw ruleError('Add pieces to the bill');

  const phone = input.phone.replace(/\D/g, '');
  if (phone && phone.length < 10) throw ruleError('Check the phone number (10 digits)');

  for (const l of input.lines) {
    if (!(num(l.price) > 0)) throw ruleError(`Enter a price for ${l.name}`);
  }

  const id = await tx(async (c) => {
    /* Re-check live stock per line inside the transaction, so two tills can't oversell. */
    for (const l of input.lines) {
      const { rows } = await c.query(
        `SELECT stock FROM variant WHERE id = $1 FOR UPDATE`, [l.vid]);
      const stock = rows[0]?.stock ?? 0;
      if (stock < l.qty) throw ruleError(`Only ${stock} left of ${l.name}`);
    }

    const subtotal = input.lines.reduce((t, l) => t + l.price * l.qty, 0);
    const discount = Math.min(subtotal, input.discount);
    const orderNo = await nextOrderNo(c, 'offline');
    const at = !input.date || input.date === ymd()
      ? new Date().toISOString()
      : new Date(input.date + 'T12:00:00').toISOString();

    await c.query(
      `INSERT INTO "order" (id, channel, status, created_at, cust_name, cust_phone, subtotal,
         shipping, gift_wrap, gift_fee, discount, total, pay_status, pay_method, location, note)
       VALUES ($1,'offline','completed',$2,$3,$4,$5,0,FALSE,0,$6,$7,'paid',$8,$9,$10)`,
      [orderNo, at, input.name.trim(), phone, subtotal, discount, subtotal - discount,
       input.method, input.location, input.note.trim()],
    );

    let i = 0;
    for (const l of input.lines) {
      await c.query(
        `INSERT INTO order_item (order_id, product_id, variant_id, name, color_key, sku, qty, price, img, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [orderNo, l.pid, l.vid, l.name, l.color, l.sku, l.qty, l.price, l.img, i++],
      );
      await applyStock(c, l.vid, -l.qty, 'offline', orderNo);
    }

    await c.query(
      `INSERT INTO order_history (order_id, status, note, at) VALUES ($1,'completed',$2,$3)`,
      [orderNo, `Offline sale · ${input.location}`, at],
    );
    return orderNo;
  });

  res.status(201).json(await loadOrder(id));
}));
