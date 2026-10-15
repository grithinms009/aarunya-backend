/* Returns and exchanges: the list, the detail drawer's state machine and the policy
   block that writes straight back to settings.

   Eligibility is decided here — within the return window, the category allowed unless
   the piece arrived damaged, and an unboxing video when the policy requires one. Stock
   effects: a restocked return adds the quantity back with reason `return`, a replacement
   takes one unit with reason `replacement`, and a refund sets the order's payment to
   refunded or partial depending on the amount. */
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { loadReturn, loadReturns } from '../lib/repo.js';
import { applyStock } from '../lib/stock.js';
import { getConfig, saveConfig } from '../lib/settings.js';
import { DAY, inr, num } from '../lib/format.js';
import { notFound, ruleError, wrap } from '../lib/errors.js';
import { parseBody, parseQuery } from '../middleware/validate.js';

export const router = Router();

const GROUPS = {
  review: ['requested'],
  progress: ['approved', 'pickup', 'received'],
  closed: ['completed', 'rejected'],
};

/** Policy check shown in the drawer and used to flag rows in the list. */
export function eligibilityOf(r, config, categoryBySlug) {
  const days = Math.max(0, (+new Date(r.createdAt) - +new Date(r.deliveredAt)) / DAY);
  const category = categoryBySlug.get(r.item.pid) ?? '';
  const inWindow = days <= num(config.returnWindow) + 0.01;
  /* A damaged or broken piece overrides the category rule. */
  const categoryOk =
    !(config.nonEligible ?? []).includes(category) || /damag|broken|missing/i.test(r.reason);
  const videoOk = !config.requireVideo || r.video;
  return {
    inWindow, categoryOk, videoOk,
    ok: inWindow && categoryOk && videoOk,
    days: Math.round(days),
    category,
  };
}

/** product id → category slug, so eligibility can read the piece's category. */
async function categoryMap() {
  const { rows } = await query(`SELECT id, category_slug FROM product`);
  return new Map(rows.map((r) => [r.id, r.category_slug]));
}

router.get('/', parseQuery(z.object({
  tab: z.enum(['review', 'progress', 'closed', 'all']).optional(),
  type: z.enum(['', 'replacement', 'refund']).optional(),
  q: z.string().max(200).optional(),
})), wrap(async (req, res) => {
  const { tab = 'review', type, q } = req.valid;

  const where = [];
  const params = [];
  if (type) { params.push(type); where.push(`r.type = $${params.length}`); }
  if (q) {
    params.push(`%${q.trim()}%`);
    const i = params.length;
    where.push(`(r.id ILIKE $${i} OR r.order_id ILIKE $${i}
                 OR r.cust_name ILIKE $${i} OR r.item_name ILIKE $${i})`);
  }
  const raw = await loadReturns(where.length ? { sql: where.join(' AND '), params } : null);
  const [config, cats] = await Promise.all([getConfig(), categoryMap()]);
  /* Each row carries its own policy check, so the list can flag "Check policy" and the
     drawer can render the three-row panel without a second call. */
  const base = raw.map((r) => ({ ...r, eligibility: eligibilityOf(r, config, cats) }));

  res.json({
    rows: tab === 'all' ? base : base.filter((r) => GROUPS[tab].includes(r.status)),
    counts: {
      review: base.filter((r) => GROUPS.review.includes(r.status)).length,
      progress: base.filter((r) => GROUPS.progress.includes(r.status)).length,
      closed: base.filter((r) => GROUPS.closed.includes(r.status)).length,
      all: base.length,
    },
  });
}));

/** Eligibility for every open request, so the list can flag "Check policy" rows. */
router.get('/eligibility', wrap(async (_req, res) => {
  const [rows, config, cats] = await Promise.all([loadReturns(), getConfig(), categoryMap()]);
  res.json(Object.fromEntries(rows.map((r) => [r.id, eligibilityOf(r, config, cats)])));
}));

router.get('/:returnNo', wrap(async (req, res) => {
  const r = await loadReturn(req.params.returnNo);
  if (!r) throw notFound('That request no longer exists');
  const [config, cats] = await Promise.all([getConfig(), categoryMap()]);
  res.json({ ...r, eligibility: eligibilityOf(r, config, cats) });
}));

/* ---------------------------------------------------------------- transitions */

/** Moves a request to the next state and records the history line the drawer shows. */
async function step(id, status, patch, note) {
  await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT 1 FROM return_request WHERE id = $1 FOR UPDATE`, [id]);
    if (!rows.length) throw notFound('That request no longer exists');

    const sets = ['status = $2'];
    const params = [id, status];
    for (const [col, val] of Object.entries(patch)) {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    }
    if (status === 'rejected') {
      params.push('Rejected: ' + note);
      sets.push(`resolution = $${params.length}`);
    }
    await c.query(`UPDATE return_request SET ${sets.join(', ')} WHERE id = $1`, params);
    await c.query(`INSERT INTO return_history (return_id, status, note) VALUES ($1,$2,$3)`,
      [id, status, note]);
  });
  return loadReturn(id);
}

router.post('/:returnNo/approve',
  parseBody(z.object({ type: z.enum(['replacement', 'refund']) })),
  wrap(async (req, res) => {
    res.json(await step(req.params.returnNo, 'approved',
      { type: req.body.type }, `Approved as ${req.body.type}`));
  }));

router.post('/:returnNo/reject',
  parseBody(z.object({ reason: z.string().max(1000).default('') })),
  wrap(async (req, res) => {
    const reason = req.body.reason.trim();
    if (!reason) throw ruleError('Add a short reason for the customer');
    res.json(await step(req.params.returnNo, 'rejected', {}, reason));
  }));

router.post('/:returnNo/pickup',
  parseBody(z.object({
    courier: z.string().max(100).default(''),
    date: z.string().max(40).default(''),
    courierName: z.string().max(100).default(''),
    dateLabel: z.string().max(100).default(''),
  })),
  wrap(async (req, res) => {
    const { courier, date, courierName, dateLabel } = req.body;
    res.json(await step(req.params.returnNo, 'pickup',
      { pickup_courier: courier, pickup_date: date },
      `Pickup on ${dateLabel} via ${courierName}`));
  }));

/** Restocking is optional: only an unused, undamaged piece goes back on the shelf. */
router.post('/:returnNo/receive',
  parseBody(z.object({ restock: z.boolean().default(false) })),
  wrap(async (req, res) => {
    const id = req.params.returnNo;
    const restock = req.body.restock;

    await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM return_request WHERE id = $1 FOR UPDATE`, [id]);
      const r = rows[0];
      if (!r) throw notFound('That request no longer exists');

      if (restock && r.item_vid) {
        await applyStock(c, r.item_vid, r.item_qty || 1, 'return', id);
      }
      await c.query(
        `UPDATE return_request SET status = 'received', restocked = $2 WHERE id = $1`,
        [id, restock]);
      await c.query(`INSERT INTO return_history (return_id, status, note) VALUES ($1,'received',$2)`,
        [id, restock ? 'Item received and added back to stock' : 'Item received (not restocked)']);
    });

    res.json(await loadReturn(id));
  }));

router.post('/:returnNo/replacement',
  parseBody(z.object({
    vid: z.string().min(1).max(120),
    awb: z.string().max(100).default(''),
  })),
  wrap(async (req, res) => {
    const id = req.params.returnNo;
    const { vid, awb } = req.body;

    await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT v.stock, v.color_key, p.name FROM variant v
           JOIN product p ON p.id = v.product_id
          WHERE v.id = $1 FOR UPDATE OF v`, [vid]);
      const v = rows[0];
      if (!v || v.stock < 1) {
        throw ruleError('That colour is out of stock. Pick another or offer a refund.');
      }

      const { rows: cr } = await c.query(`SELECT label FROM color WHERE key = $1`, [v.color_key]);
      const colorLabel = cr[0]?.label ?? v.color_key;
      const resolution = `Replacement sent: ${v.name} (${colorLabel})` +
        (awb.trim() ? ' · AWB ' + awb.trim() : '');

      await applyStock(c, vid, -1, 'replacement', id);
      const { rowCount } = await c.query(
        `UPDATE return_request SET status = 'completed', resolution = $2 WHERE id = $1`,
        [id, resolution]);
      if (!rowCount) throw notFound('That request no longer exists');
      await c.query(
        `INSERT INTO return_history (return_id, status, note) VALUES ($1,'completed',$2)`,
        [id, resolution]);
    });

    res.json(await loadReturn(id));
  }));

router.post('/:returnNo/refund',
  parseBody(z.object({
    amount: z.coerce.number().min(0),
    method: z.string().max(60).default('UPI'),
  })),
  wrap(async (req, res) => {
    const id = req.params.returnNo;
    const { amount, method } = req.body;
    if (!(amount > 0)) throw ruleError('Enter the refund amount');

    await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT order_id FROM return_request WHERE id = $1 FOR UPDATE`, [id]);
      if (!rows.length) throw notFound('That request no longer exists');

      const resolution = `Refunded ${inr(amount)} via ${method.toLowerCase()}`;
      await c.query(
        `UPDATE return_request SET status = 'completed', resolution = $2,
           refund_amount = $3, refund_method = $4 WHERE id = $1`,
        [id, resolution, Math.round(amount), method]);
      await c.query(
        `INSERT INTO return_history (return_id, status, note) VALUES ($1,'completed',$2)`,
        [id, resolution]);

      /* A full refund marks the order refunded; anything less is a part refund. */
      await c.query(
        `UPDATE "order" SET pay_status =
           CASE WHEN $2 >= total THEN 'refunded'::payment_status ELSE 'partial'::payment_status END
         WHERE id = $1`,
        [rows[0].order_id, Math.round(amount)]);
    });

    res.json(await loadReturn(id));
  }));

/** Logged by hand for customers who message on WhatsApp or by phone. */
router.post('/', parseBody(z.object({
  orderId: z.string().min(1).max(60),
  vid: z.string().max(120).default(''),
  type: z.enum(['replacement', 'refund']),
  reason: z.string().max(300).default(''),
  note: z.string().max(2000).default(''),
  video: z.boolean().default(false),
})), wrap(async (req, res) => {
  const input = req.body;

  const id = await tx(async (c) => {
    const { rows: oRows } = await c.query(
      `SELECT * FROM "order" WHERE id = $1 FOR UPDATE`, [input.orderId]);
    const o = oRows[0];
    if (!o) throw ruleError('Choose the order');

    const { rows: items } = await c.query(
      `SELECT * FROM order_item WHERE order_id = $1 ORDER BY sort_order, id`, [o.id]);
    const item = items.find((l) => l.variant_id === input.vid) ?? items[0];
    if (!item) throw ruleError('That order has no items to return');

    const { rows: maxRows } = await c.query(
      `SELECT COALESCE(max(NULLIF(regexp_replace(id, '\\D', '', 'g'), '')::bigint), 300) AS m
         FROM return_request`);
    const rid = 'RX' + (Number(maxRows[0].m) + 1);

    const { rows: dRows } = await c.query(
      `SELECT at FROM order_history WHERE order_id = $1 AND status = 'delivered'
        ORDER BY at DESC LIMIT 1`, [o.id]);
    const deliveredAt = dRows[0]?.at ?? o.created_at;

    await c.query(
      `INSERT INTO return_request (id, order_id, cust_name, cust_phone, item_pid, item_vid,
         item_name, item_color, item_sku, item_qty, item_price, item_img, type, reason, note,
         video, photos, delivered_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12,$13,$14,$15,0,$16,'requested')`,
      [rid, o.id, o.cust_name, o.cust_phone, item.product_id ?? '', item.variant_id ?? '',
       item.name, item.color_key, item.sku, item.price, item.img, input.type,
       input.reason, input.note.trim(), input.video, deliveredAt],
    );
    await c.query(
      `INSERT INTO return_history (return_id, status, note) VALUES ($1,'requested','Logged by admin')`,
      [rid]);
    await c.query(`UPDATE "order" SET return_id = $2 WHERE id = $1`, [o.id, rid]);
    return rid;
  });

  res.status(201).json(await loadReturn(id));
}));

/** The policy block in the sidebar writes straight back to settings. */
router.put('/policy', parseBody(z.object({
  returnWindow: z.coerce.number().int().min(0).max(365).optional(),
  nonEligible: z.array(z.string().max(100)).optional(),
  requireVideo: z.boolean().optional(),
  allowRefund: z.boolean().optional(),
})), wrap(async (req, res) => {
  await saveConfig(req.body);
  res.json({ ok: true });
}));
