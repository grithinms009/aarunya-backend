/* Payments: create a Razorpay order for the amount the SERVER computed, verify the checkout
   signature, and reconcile webhooks. Nothing the browser sends can set or change an amount,
   and an order is marked paid only after the gateway itself confirms the payment's order id,
   amount, currency and captured status. */
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query, tx } from '../db/pool.js';
import { getConfig } from '../lib/settings.js';
import { badRequest, notFound, ruleError, forbidden, wrap } from '../lib/errors.js';
import { parseBody } from '../middleware/validate.js';
import { LIMITS } from '../lib/limits.js';
import {
  razorpayConfigured, razorpayKeyId, createGatewayOrder, fetchPayment,
  verifyCheckoutSignature, verifyWebhookSignature,
} from '../lib/razorpay.js';

export const router = Router();

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: LIMITS.checkout * 3, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Please try again shortly.' },
});

function tokenOk(given, stored) {
  if (!given || !stored) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(String(stored));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Marks the order paid from a gateway payment entity, after checking it against the order. */
export async function settlePayment(c, orderId, payment) {
  const { rows } = await c.query(`SELECT * FROM "order" WHERE id = $1 FOR UPDATE`, [orderId]);
  const o = rows[0];
  if (!o) throw notFound('That order no longer exists');
  if (o.pay_status === 'paid' && o.gateway_payment_id === payment.id) return { order: o, already: true };

  if (!o.gateway_order_id || payment.order_id !== o.gateway_order_id) throw ruleError('Payment does not belong to this order');
  if (payment.currency !== 'INR') throw ruleError('Unexpected payment currency');
  if (Number(payment.amount) !== o.total * 100) {
    await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,$2,$3)`,
      [o.id, o.status, `Payment ${payment.id} amount ${payment.amount} paise does not match the order — not marked paid`]);
    throw ruleError('The paid amount does not match the order total');
  }
  if (payment.status !== 'captured') return { order: o, pending: true };

  if (o.status === 'cancelled') {
    await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,$2,$3)`,
      [o.id, o.status, `Payment ${payment.id} captured after cancellation — refund it in Razorpay`]);
    return { order: o, cancelled: true };
  }
  if (o.pay_status === 'paid') return { order: o, already: true };

  await c.query(
    `UPDATE "order" SET pay_status = 'paid', paid_paise = $2, paid_at = now(), gateway_payment_id = $3,
            pay_ref = $3, pay_method = $4, provider = 'razorpay', updated_at = now() WHERE id = $1`,
    [o.id, Number(payment.amount), payment.id, payment.method || '']);
  await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,$2,$3)`,
    [o.id, o.status, `Payment received via Razorpay (${payment.id})`]);
  return { order: { ...o, pay_status: 'paid' }, paid: true };
}

/** POST /payments/create — the amount is read from the order row, never from the request. */
router.post('/payments/create', limiter, parseBody(z.object({
  orderId: z.string().max(60),
  token: z.string().max(200).optional(),
  amount: z.any().optional(),          // accepted for old clients, deliberately ignored
})), wrap(async (req, res) => {
  const { rows } = await query(`SELECT * FROM "order" WHERE id = $1`, [req.body.orderId]);
  const o = rows[0];
  if (!o) throw notFound('That order no longer exists');
  const config = await getConfig();

  if (!razorpayConfigured()) {
    return res.json({ status: 'GATEWAY_NOT_CONFIGURED', provider: config.PAYMENT_PROVIDER ?? 'razorpay',
      orderId: o.id, amount: o.total });
  }
  if (!tokenOk(req.body.token, o.access_token)) throw notFound('That order no longer exists');
  if (o.channel !== 'online') throw badRequest('Not an online order');
  if (o.pay_status !== 'pending' || o.status === 'cancelled') throw ruleError('This order cannot take a payment');

  let gatewayOrderId = o.gateway_order_id;
  if (!gatewayOrderId) {
    const g = await createGatewayOrder({ amountPaise: o.total * 100, receipt: o.id, notes: { order: o.id } });
    if (g.amount !== o.total * 100) throw ruleError('Gateway amount mismatch');
    const upd = await query(
      `UPDATE "order" SET gateway_order_id = $2, provider = 'razorpay' WHERE id = $1 AND gateway_order_id IS NULL
       RETURNING gateway_order_id`, [o.id, g.id]);
    gatewayOrderId = upd.rows[0]?.gateway_order_id
      ?? (await query(`SELECT gateway_order_id FROM "order" WHERE id = $1`, [o.id])).rows[0].gateway_order_id;
  }
  res.json({
    status: 'CREATED', provider: 'razorpay', orderId: o.id, keyId: razorpayKeyId(),
    gatewayOrderId, amountPaise: o.total * 100, amount: o.total, currency: 'INR',
  });
}));

/** POST /payments/verify — checkout callback. Signature first, then the gateway's own record. */
router.post('/payments/verify', limiter, parseBody(z.object({
  orderId: z.string().max(60),
  token: z.string().max(200),
  razorpay_order_id: z.string().max(100),
  razorpay_payment_id: z.string().max(100),
  razorpay_signature: z.string().max(200),
})), wrap(async (req, res) => {
  const b = req.body;
  const { rows } = await query(`SELECT * FROM "order" WHERE id = $1`, [b.orderId]);
  const o = rows[0];
  if (!o || !tokenOk(b.token, o.access_token)) throw notFound('That order no longer exists');
  if (!o.gateway_order_id || b.razorpay_order_id !== o.gateway_order_id) throw forbidden('Payment does not match this order');
  if (!verifyCheckoutSignature({ gatewayOrderId: o.gateway_order_id, paymentId: b.razorpay_payment_id,
    signature: b.razorpay_signature })) throw forbidden('Payment signature check failed');

  const payment = await fetchPayment(b.razorpay_payment_id);
  const out = await tx((c) => settlePayment(c, o.id, payment));
  res.json({ ok: true, paid: Boolean(out.paid || out.already), pending: Boolean(out.pending), orderId: o.id });
}));

/** POST /payments/webhook — signed by Razorpay over the raw body. Idempotent on event id. */
router.post('/payments/webhook', wrap(async (req, res) => {
  if (!verifyWebhookSignature(req.rawBody, req.get('x-razorpay-signature'))) {
    return res.status(400).json({ error: 'bad_signature' });
  }
  const evt = req.body ?? {};
  const eventId = req.get('x-razorpay-event-id') || `${evt.event}:${evt.payload?.payment?.entity?.id ?? evt.payload?.refund?.entity?.id ?? ''}:${evt.created_at}`;
  const pay = evt.payload?.payment?.entity;
  const refund = evt.payload?.refund?.entity;

  await tx(async (c) => {
    const ins = await c.query(
      `INSERT INTO payment_event (event_id, event, order_id, payload) VALUES ($1,$2,$3,$4)
       ON CONFLICT (event_id) DO NOTHING RETURNING id`,
      [eventId, String(evt.event ?? ''), pay?.notes?.order ?? null,
       JSON.stringify({ event: evt.event, payment: pay && { id: pay.id, order_id: pay.order_id, amount: pay.amount, status: pay.status },
         refund: refund && { id: refund.id, payment_id: refund.payment_id, amount: refund.amount } })]);
    if (!ins.rows.length) return; // already processed

    if (['payment.captured', 'order.paid'].includes(evt.event) && pay) {
      const { rows } = await c.query(`SELECT id FROM "order" WHERE gateway_order_id = $1`, [pay.order_id]);
      if (rows[0]) await settlePayment(c, rows[0].id, pay);
    } else if (evt.event === 'payment.failed' && pay) {
      const { rows } = await c.query(`SELECT id, status FROM "order" WHERE gateway_order_id = $1`, [pay.order_id]);
      if (rows[0]) await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,$2,$3)`,
        [rows[0].id, rows[0].status, `Payment attempt failed (${pay.error_code || 'declined'}) — order stays unpaid`]);
    } else if (evt.event === 'refund.processed' && refund) {
      const { rows } = await c.query(`SELECT * FROM "order" WHERE gateway_payment_id = $1 FOR UPDATE`, [refund.payment_id]);
      const o = rows[0];
      if (o) {
        const total = Math.min(Number(o.paid_paise), Number(o.refunded_paise) + Number(refund.amount));
        await c.query(
          `UPDATE "order" SET refunded_paise = $2,
             pay_status = CASE WHEN $2 >= paid_paise THEN 'refunded'::payment_status ELSE 'partial'::payment_status END
           WHERE id = $1`, [o.id, total]);
        await c.query(`INSERT INTO order_history (order_id, status, note) VALUES ($1,$2,$3)`,
          [o.id, o.status, `Refund of ₹${(refund.amount / 100).toFixed(2)} processed by Razorpay`]);
      }
    }
  });
  res.json({ ok: true });
}));
