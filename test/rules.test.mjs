/* Business-rule checks against the real API and database.

   Ported from aarunya-admin/scripts/rules.check.ts, which ran them against the browser
   mock before this API existed. These are the rules the brief requires server-side, so
   this is where they belong now.

   The database is reset and reseeded first, so the run is deterministic.
   Usage: npm test   (with the API running, or let it start one: npm run test:serve) */
import { execFileSync } from 'node:child_process';

const BASE = process.env.API_BASE || 'http://localhost:4000';
const ADMIN = { email: 'veena@aarunyajewels.in', password: 'aarunya123' };

const fails = [];
const ok = (name, cond, extra = '') => {
  if (!cond) fails.push(`${name} ${extra}`);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
};

/* ---- a tiny client that keeps the session cookie and echoes the CSRF token ---- */

let cookies = {};
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

function remember(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i)] = pair.slice(i + 1);
  }
}

async function call(path, { method = 'GET', body } = {}) {
  const headers = { Cookie: cookieHeader() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = cookies.aj_csrf ?? '';

  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  remember(res);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = new Error(data?.message ?? res.statusText);
    e.status = res.status;
    e.code = data?.error;
    e.fields = data?.fields;
    throw e;
  }
  return data;
}

/** Expects the call to be refused, and returns the error for inspection. */
const refuses = async (p) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
};

const variantOf = async (vid) =>
  (await call('/api/admin/inventory/stock')).find((r) => r.vid === vid);

/* ------------------------------------------------------------------ run */

console.log('resetting database…');
execFileSync('npm', ['run', 'db:reset'], { stdio: 'pipe' });

try {
  await call('/health');
} catch {
  console.error(`\nNo API at ${BASE}. Start it with: npm run dev\n`);
  process.exit(2);
}

await call('/api/auth/login', { method: 'POST', body: ADMIN });

/* ---- seed shape ---- */
const list = await call('/api/admin/products');
const cats = await call('/api/admin/categories');
const allOrders = await call('/api/admin/orders?range=all');
const allReturns = await call('/api/admin/returns?tab=all');
const ledger0 = await call('/api/admin/inventory/ledger?limit=1000');

ok('seed products', list.rows.length === 16, `(${list.rows.length})`);
ok('seed categories', cats.length === 8, `(${cats.length})`);
ok('seed orders', allOrders.rows.length === 31, `(${allOrders.rows.length})`);
ok('seed returns', allReturns.rows.length === 6, `(${allReturns.rows.length})`);
ok('seed ledger', ledger0.length > 30, `(${ledger0.length})`);
ok('every variant has a SKU',
  list.rows.every((p) => p.variants.every((v) => /^AJ-[A-Z]{2}\d{3}-[A-Z]{3}$/.test(v.sku))));
ok('online ids sequential from AJ1041',
  allOrders.rows.some((o) => o.id === 'AJ1041'));
ok('offline ids start at OS212',
  allOrders.rows.some((o) => o.id === 'OS212'));
ok('shipping free at 499+',
  allOrders.rows.filter((o) => o.channel === 'online')
    .every((o) => (o.subtotal >= 499 ? o.shipping === 0 : o.shipping === 60)));

/* ---- offline sale reduces stock and writes exactly one ledger row per line ---- */
const p = list.rows.find((x) => x.variants[0].stock > 2);
const v = p.variants[0];
const before = v.stock;
const ledgerBefore = ledger0.length;

const sale = await call('/api/admin/orders/offline-sales', {
  method: 'POST',
  body: {
    lines: [{ pid: p.id, vid: v.id, name: p.name, color: v.color, sku: v.sku, img: '', qty: 2, price: p.price }],
    discount: 50, method: 'Cash', location: 'Walk-in', date: '', name: 'Test', phone: '', note: '',
  },
});
ok('offline sale number', /^OS\d+$/.test(sale.id), sale.id);
ok('offline sale reduces stock', (await variantOf(v.id)).stock === before - 2,
  `${before} -> ${(await variantOf(v.id)).stock}`);
ok('offline sale totals', sale.total === p.price * 2 - 50, String(sale.total));

const ledger1 = await call('/api/admin/inventory/ledger?limit=1000');
ok('one ledger row per line', ledger1.length === ledgerBefore + 1,
  `${ledgerBefore} -> ${ledger1.length}`);
ok('ledger row is the sale', ledger1[0].ref === sale.id && ledger1[0].change === -2);

/* ---- cancelling restores stock and refunds a paid order ---- */
await call(`/api/admin/orders/${sale.id}/cancel`, { method: 'POST' });
ok('cancel restores stock', (await variantOf(v.id)).stock === before,
  String((await variantOf(v.id)).stock));
ok('cancel refunds payment',
  (await call(`/api/admin/orders/${sale.id}`)).payment.status === 'refunded');

/* ---- advance is blocked while payment is pending; shipped needs an AWB ---- */
const pending = allOrders.rows.find((o) => o.payment.status === 'pending' && o.status === 'new');
if (pending) {
  const e = await refuses(call(`/api/admin/orders/${pending.id}/advance`,
    { method: 'POST', body: { courier: 'shiprocket', awb: '' } }));
  ok('advance blocked while pending', !!e && /pending/i.test(e.message), e?.message ?? 'allowed');
}

const packed = allOrders.rows.find((o) => o.status === 'packed' && o.payment.status === 'paid');
if (packed) {
  const e = await refuses(call(`/api/admin/orders/${packed.id}/advance`,
    { method: 'POST', body: { courier: 'shiprocket', awb: '' } }));
  ok('shipped needs an AWB', !!e && /tracking/i.test(e.message), e?.message ?? 'allowed');

  const shipped = await call(`/api/admin/orders/${packed.id}/advance`,
    { method: 'POST', body: { courier: 'shiprocket', awb: '123456789012' } });
  ok('advance with AWB works',
    shipped.status === 'shipped' && shipped.shipment?.awb === '123456789012');
}

/* ---- online order cannot be cancelled once it has shipped ---- */
const shippedOrder = (await call('/api/admin/orders?range=all')).rows
  .find((o) => o.channel === 'online' && ['shipped', 'out', 'delivered'].includes(o.status));
if (shippedOrder) {
  const e = await refuses(call(`/api/admin/orders/${shippedOrder.id}/cancel`, { method: 'POST' }));
  ok('shipped order cannot be cancelled', !!e, e?.message ?? 'allowed');
}

/* ---- stock never goes below zero ---- */
const low = await variantOf(v.id);
await call('/api/admin/inventory/adjust', {
  method: 'POST',
  body: { vid: v.id, mode: 'remove', qty: low.stock + 50, reason: 'damaged', note: '' },
});
ok('stock clamps at zero', (await variantOf(v.id)).stock === 0,
  String((await variantOf(v.id)).stock));

/* ---- set-exact adjustment and the ledger note ---- */
await call('/api/admin/inventory/adjust', {
  method: 'POST',
  body: { vid: v.id, mode: 'set', qty: 7, reason: 'correction', note: 'audit' },
});
ok('set exact stock', (await variantOf(v.id)).stock === 7, String((await variantOf(v.id)).stock));
const ledger2 = await call('/api/admin/inventory/ledger?limit=5');
ok('adjust ledger note', ledger2[0].note === 'Stock count correction · audit', ledger2[0].note ?? '');

/* ---- product validation ---- */
const badSave = await refuses(call(`/api/admin/products/${p.id}`, {
  method: 'PUT', body: { ...p, name: '', price: 0 },
}));
ok('product validation', !!badSave?.fields?.name && !!badSave?.fields?.price,
  JSON.stringify(badSave?.fields ?? {}));

const dup = await call(`/api/admin/products/${p.id}/duplicate`, { method: 'POST' });
ok('duplicate is a draft', dup.status === 'draft');
ok('duplicate has zero stock', dup.variants.every((x) => x.stock === 0));
ok('duplicate SKUs suffixed', dup.variants.every((x) => x.sku.endsWith('-C')));
await call(`/api/admin/products/${dup.id}`, { method: 'DELETE' });

/* ---- category delete is refused while it holds products ---- */
const held = await refuses(call(`/api/admin/categories/${p.category}`, { method: 'DELETE' }));
ok('category delete blocked', !!held && /Move or delete/.test(held.message), held?.message ?? '');

/* ---- returns: restock adds back, replacement takes one, refund marks the order ---- */
const pickup = allReturns.rows.find((r) => r.status === 'pickup');
if (pickup) {
  const rv0 = await variantOf(pickup.item.vid);
  await call(`/api/admin/returns/${pickup.id}/receive`, { method: 'POST', body: { restock: true } });
  const rv1 = await variantOf(pickup.item.vid);
  ok('restocked return adds stock', rv1.stock === rv0.stock + (pickup.item.qty || 1),
    `${rv0.stock} -> ${rv1.stock}`);

  const ledger3 = await call('/api/admin/inventory/ledger?limit=5');
  ok('return ledger reason', ledger3[0].reason === 'return', ledger3[0].reason);

  const refunded = await call(`/api/admin/returns/${pickup.id}/refund`,
    { method: 'POST', body: { amount: 10, method: 'UPI' } });
  const order = await call(`/api/admin/orders/${refunded.orderId}`);
  ok('part refund marks order', order.payment.status === 'partial', order.payment.status);
}

/* ---- replacement is refused when that colour is out of stock ---- */
const anyReturn = (await call('/api/admin/returns?tab=all')).rows[0];
const outVid = (await call('/api/admin/inventory/stock?stock=out'))[0]?.vid;
if (anyReturn && outVid) {
  const e = await refuses(call(`/api/admin/returns/${anyReturn.id}/replacement`,
    { method: 'POST', body: { vid: outVid, awb: '' } }));
  ok('replacement needs stock', !!e && /out of stock/i.test(e.message), e?.message ?? 'allowed');
}

/* ---- eligibility: change of mind fails the category rule ---- */
const mind = (await call('/api/admin/returns?tab=all')).rows
  .find((r) => r.reason === 'Changed my mind');
if (mind) ok('change of mind fails policy', !mind.eligibility.ok, JSON.stringify(mind.eligibility));

/* ---- inventory summary ---- */
const summary = await call('/api/admin/inventory/summary');
const variantCount = (await call('/api/admin/products')).rows
  .reduce((t, x) => t + x.variants.length, 0);
ok('inventory summary', summary.units > 0 && summary.variants === variantCount,
  `${summary.variants} vs ${variantCount}`);

/* ---- security: the admin area rejects an ordinary user and a missing CSRF token ---- */
cookies = {};
await call('/api/auth/login', {
  method: 'POST',
  body: { email: 'user@aarunyajewels.in', password: 'user12345' },
});
const asUser = await refuses(call('/api/admin/products'));
ok('user role blocked from admin', asUser?.status === 403, String(asUser?.status));

const savedCsrf = cookies.aj_csrf;
cookies.aj_csrf = '';
const noCsrf = await refuses(call('/api/admin/inventory/quick',
  { method: 'POST', body: { vid: v.id, delta: 1 } }));
ok('missing CSRF token refused', noCsrf?.status === 403, String(noCsrf?.status));
cookies.aj_csrf = savedCsrf;

cookies = {};
const anon = await refuses(call('/api/admin/products'));
ok('signed-out request refused', anon?.status === 401, String(anon?.status));

const wrongPass = await refuses(call('/api/auth/login',
  { method: 'POST', body: { email: ADMIN.email, password: 'wrong' } }));
ok('wrong password refused', wrongPass?.status === 401, String(wrongPass?.status));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
