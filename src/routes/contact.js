/* Messages from the storefront's contact form, for the admin side.

   The public form writes them; this is where the shop reads them. Until an SMTP provider
   is configured nothing is emailed out, so this list is the only place they surface. */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { notFound, wrap } from '../lib/errors.js';
import { parseQuery } from '../middleware/validate.js';

export const router = Router();

router.get('/', parseQuery(z.object({
  handled: z.enum(['', 'yes', 'no']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})), wrap(async (req, res) => {
  const { handled, limit } = req.valid;
  const where = handled === 'yes' ? 'WHERE handled_at IS NOT NULL'
    : handled === 'no' ? 'WHERE handled_at IS NULL' : '';
  const { rows } = await query(
    `SELECT id, name, email, phone, order_no, subject, message, handled_at, created_at
       FROM contact_message ${where} ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  res.json(rows.map((m) => ({
    id: m.id, name: m.name, email: m.email, phone: m.phone,
    orderNo: m.order_no, subject: m.subject, message: m.message,
    handledAt: m.handled_at ? new Date(m.handled_at).toISOString() : null,
    createdAt: new Date(m.created_at).toISOString(),
  })));
}));

/** Count of messages still waiting, for a nav badge. */
router.get('/unhandled-count', wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM contact_message WHERE handled_at IS NULL`);
  res.json({ count: rows[0].n });
}));

router.post('/:id/handled', wrap(async (req, res) => {
  const { rowCount } = await query(
    `UPDATE contact_message SET handled_at = now() WHERE id = $1`, [Number(req.params.id)]);
  if (!rowCount) throw notFound('That message no longer exists');
  res.json({ ok: true });
}));
