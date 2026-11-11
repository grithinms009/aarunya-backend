/* Razorpay REST + signature helpers (no SDK; plain fetch and HMAC).

   Credentials come from the environment only and are never logged or stored in the database:
     RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
   RAZORPAY_API_BASE exists so the tests can point at a local fake gateway. */
import { createHmac, timingSafeEqual } from 'node:crypto';

const cfg = () => ({
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  base: (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/$/, ''),
});

export const razorpayConfigured = () => {
  const c = cfg();
  return Boolean(c.keyId && c.keySecret);
};
export const razorpayKeyId = () => cfg().keyId;

async function call(path, { method = 'GET', body } = {}) {
  const c = cfg();
  const res = await fetch(c.base + path, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${c.keyId}:${c.keySecret}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.description || `Razorpay ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

/** amountPaise is always the server's figure. */
export const createGatewayOrder = ({ amountPaise, receipt, notes }) =>
  call('/orders', { method: 'POST', body: { amount: amountPaise, currency: 'INR', receipt, notes } });

export const fetchPayment = (paymentId) => call(`/payments/${encodeURIComponent(paymentId)}`);

const safeEqualHex = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Checkout callback: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature({ gatewayOrderId, paymentId, signature }) {
  const { keySecret } = cfg();
  if (!keySecret) return false;
  const expected = createHmac('sha256', keySecret).update(`${gatewayOrderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook: HMAC_SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody, signature) {
  const { webhookSecret } = cfg();
  if (!webhookSecret || !rawBody) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
