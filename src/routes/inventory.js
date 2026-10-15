/* Inventory: stock levels, the stock-history ledger, quick ±1 and the adjust modal.

   Every write goes through applyStock, so an adjustment can never push stock below zero
   and always lands as exactly one ledger row. */
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { ledgerDto } from '../lib/repo.js';
import { getConfig, lowStockOf } from '../lib/settings.js';
import { applyStock } from '../lib/stock.js';
import { sendCsv } from '../lib/csv.js';
import { badRequest, notFound, wrap } from '../lib/errors.js';
import { parseBody, parseQuery } from '../middleware/validate.js';
import { ADJUST_REASONS } from '../lib/reference.js';

export const router = Router();

const REASONS = ADJUST_REASONS.map(([key]) => key);
/** The label written into the ledger note for each reason. */
const REASON_LABEL = Object.fromEntries(ADJUST_REASONS);

const stockQuery = z.object({
  q: z.string().max(200).optional(),
  cat: z.string().max(100).optional(),
  stock: z.enum(['', 'in', 'low', 'out']).optional(),
});

router.get('/summary', wrap(async (_req, res) => {
  const low = lowStockOf(await getConfig());
  const { rows } = await query(
    `SELECT COALESCE(sum(v.stock), 0)::int              AS units,
            count(*)::int                               AS variants,
            COALESCE(sum(v.stock * p.price), 0)::int    AS value,
            count(*) FILTER (WHERE v.stock > 0 AND v.stock <= $1)::int AS low,
            count(*) FILTER (WHERE v.stock = 0)::int    AS out
       FROM variant v JOIN product p ON p.id = v.product_id`,
    [low],
  );
  res.json({ ...rows[0], lowThreshold: low });
}));

/** One row per variant, lowest stock first, with its most recent ledger entry. */
async function stockRows(q) {
  const low = lowStockOf(await getConfig());
  const where = [];
  const params = [];
  if (q.cat) { params.push(q.cat); where.push(`p.category_slug = $${params.length}`); }
  if (q.q) {
    params.push(`%${q.q.trim()}%`);
    where.push(`(p.name ILIKE $${params.length} OR v.sku ILIKE $${params.length})`);
  }
  if (q.stock === 'out') where.push(`v.stock = 0`);
  if (q.stock === 'in') where.push(`v.stock > 0`);
  if (q.stock === 'low') {
    params.push(low);
    where.push(`(v.stock > 0 AND v.stock <= $${params.length})`);
  }

  const { rows } = await query(
    `SELECT p.id AS pid, v.id AS vid, p.name, v.color_key, v.sku, v.stock,
            (SELECT i.url FROM variant_image i WHERE i.variant_id = v.id ORDER BY i.slot LIMIT 1) AS img,
            l.reason AS last_reason, l.at AS last_at
       FROM variant v
       JOIN product p ON p.id = v.product_id
       LEFT JOIN LATERAL (
         SELECT reason, at FROM stock_ledger s
          WHERE s.variant_id = v.id ORDER BY s.at DESC, s.id DESC LIMIT 1
       ) l ON TRUE
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY v.stock ASC, p.name ASC`,
    params,
  );

  return rows.map((r) => ({
    pid: r.pid, vid: r.vid, name: r.name, color: r.color_key, sku: r.sku,
    stock: r.stock, img: r.img ?? '',
    lastReason: r.last_reason ?? null,
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : '',
  }));
}

router.get('/stock', parseQuery(stockQuery), wrap(async (req, res) => {
  res.json(await stockRows(req.valid));
}));

router.get('/ledger', parseQuery(z.object({
  q: z.string().max(200).optional(),
  reason: z.enum(['', 'online', 'offline', 'cancel', 'return', 'replacement', 'adjust']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
})), wrap(async (req, res) => {
  const { q, reason, limit } = req.valid;
  const where = [];
  const params = [];
  if (reason) { params.push(reason); where.push(`reason = $${params.length}`); }
  if (q) {
    params.push(`%${q.trim()}%`);
    const i = params.length;
    where.push(`(name ILIKE $${i} OR sku ILIKE $${i} OR ref ILIKE $${i})`);
  }
  params.push(limit);
  const { rows } = await query(
    `SELECT * FROM stock_ledger
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  res.json(rows.map(ledgerDto));
}));

router.get('/export.csv', parseQuery(stockQuery), wrap(async (req, res) => {
  const rows = await stockRows(req.valid);
  sendCsv(res, 'aarunya-inventory.csv',
    ['Product', 'Colour', 'SKU', 'Stock', 'Last change', 'Changed at'],
    rows.map((r) => [r.name, r.color, r.sku, r.stock, r.lastReason ?? '', r.lastAt.slice(0, 10)]));
}));

/** ±1 from the stock table. */
router.post('/quick', parseBody(z.object({
  vid: z.string().min(1).max(120),
  delta: z.coerce.number().int().refine((n) => n === 1 || n === -1, 'Use +1 or −1'),
})), wrap(async (req, res) => {
  const { vid, delta } = req.body;
  await tx((c) => applyStock(c, vid, delta, 'adjust', '',
    delta > 0 ? 'Quick add' : 'Quick remove'));
  res.json({ ok: true });
}));

router.post('/adjust', parseBody(z.object({
  vid: z.string().min(1).max(120),
  mode: z.enum(['add', 'remove', 'set']),
  qty: z.coerce.number().int().min(0).max(1_000_000),
  reason: z.enum(REASONS).default('other'),
  note: z.string().max(500).default(''),
})), wrap(async (req, res) => {
  const { vid, mode, qty, reason, note } = req.body;

  const { rows } = await query(`SELECT stock FROM variant WHERE id = $1`, [vid]);
  if (!rows.length) throw notFound('That colour no longer exists');
  if (mode !== 'set' && !qty) throw badRequest('Enter a quantity');

  const stock = rows[0].stock;
  const delta = mode === 'add' ? qty
    : mode === 'remove' ? -Math.min(qty, stock)
      : qty - stock;

  if (delta) {
    const label = REASON_LABEL[reason] ?? REASON_LABEL.other;
    await tx((c) => applyStock(c, vid, delta, 'adjust', '',
      [label, note.trim()].filter(Boolean).join(' · ')));
  }
  res.json({ ok: true });
}));
